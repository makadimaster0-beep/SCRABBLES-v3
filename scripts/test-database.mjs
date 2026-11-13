import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// All accounts and balances in this test exist only inside this disposable database.
const db = new PGlite();
const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const outsider = '10000000-0000-4000-8000-000000000003';
const requestA = '20000000-0000-4000-8000-000000000001';
const requestB = '20000000-0000-4000-8000-000000000002';
let checks = 0;
const check = (value, expected, label) => { assert.deepEqual(value, expected, label); checks++; console.log('PASS', label); };
const queryOne = async (sql, args = []) => (await db.query(sql, args)).rows[0];
async function asUser(id, sql, args = []) {
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${id}'; SET request.jwt.claim.role = 'authenticated';`);
  const jsonSql = sql.replace(/^SELECT (public\.scrabble_[a-z_]+\([\s\S]*\)) (tx|c|m)$/, 'SELECT to_jsonb($1) $2');
  try { return await db.query(jsonSql, args); }
  finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.role;'); }
}
async function rejects(action, pattern, label) {
  await assert.rejects(action, pattern, label); checks++; console.log('PASS', label);
}
const credit = async (id, reference) => {
  await db.exec(`SET request.jwt.claim.role='service_role';`);
  try { await db.query('SELECT public.scrabble_settle_payment($1,true,$2)', [id, reference]); }
  finally { await db.exec('RESET request.jwt.claim.role;'); }
};

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
    CREATE TABLE public.profiles(id integer PRIMARY KEY, unrelated_data text);
    INSERT INTO public.profiles VALUES(1,'keep me');
  `);
  const schema = fs.readFileSync('supabase-schema.sql', 'utf8');
  check(fs.readFileSync('public/supabase-schema.sql', 'utf8'), schema, 'downloadable SQL matches the complete canonical script');
  await db.exec(schema);
  await db.exec(schema);
  check((await queryOne('SELECT unrelated_data FROM public.profiles')).unrelated_data, 'keep me', 'schema is re-runnable and preserves unrelated tables');
  const health = (await queryOne('SELECT public.scrabble_health() h')).h;
  check(health.lexicon_words, 180, 'server lexicon installed');

  for (const [id, name] of [[first, 'Premier joueur'], [second, 'Deuxieme joueur'], [outsider, 'Troisieme joueur']]) {
    await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)', [id, `${id}@example.test`, { full_name: name, phone: '+243812345678' }]);
  }
  check((await queryOne('SELECT coins::integer FROM public.scrabble_wallets WHERE user_id=$1', [first])).coins, 0, 'signup never grants fake coins');
  check((await queryOne('SELECT phone FROM public.scrabble_profiles WHERE id=$1', [first])).phone, '+243812345678', 'signup phone is stored');
  check((await asUser(first, 'SELECT id FROM public.scrabble_profiles')).rows.length, 1, 'private profiles limited to owner');
  check((await asUser(first, 'SELECT * FROM public.scrabble_list_players()')).rows.length, 3, 'directory returns actual profiles');
  await rejects(() => asUser(first, 'UPDATE public.scrabble_wallets SET coins=999999 WHERE user_id=$1', [first]), /permission denied/, 'client cannot modify wallet balances');
  await rejects(() => asUser(first, 'UPDATE public.scrabble_profiles SET wins=999 WHERE id=$1', [first]), /permission denied/, 'client cannot fabricate scores');
  await rejects(() => asUser(first, "INSERT INTO scrabble_private.admins VALUES($1)", [first]), /permission denied/, 'client cannot grant itself admin');

  const payment = (await asUser(first, "SELECT public.scrabble_request_payment('deposit',10,'USD','M-Pesa','+243812345678',$1) tx", [requestA])).rows[0].tx;
  check(payment.status, 'pending', 'deposit is a real pending request');
  check((await queryOne('SELECT coins::integer FROM public.scrabble_wallets WHERE user_id=$1', [first])).coins, 0, 'pending deposit never credits funds');
  const duplicate = (await asUser(first, "SELECT public.scrabble_request_payment('deposit',10,'USD','M-Pesa','+243812345678',$1) tx", [requestA])).rows[0].tx;
  check(duplicate.id, payment.id, 'payment request idempotency');
  await rejects(() => asUser(first, 'SELECT public.scrabble_settle_payment($1,true,\'forged\')', [payment.id]), /permission denied/, 'browser cannot confirm payments');
  await credit(payment.id, 'verified-provider-1');
  await credit(payment.id, 'verified-provider-1');
  check((await queryOne('SELECT coins::integer FROM public.scrabble_wallets WHERE user_id=$1', [first])).coins, 10000, 'verified deposit credited exactly once');
  const withdrawId = crypto.randomUUID();
  const withdrawal = (await asUser(first, "SELECT public.scrabble_request_payment('withdraw',1,'USD','M-Pesa','+243812345678',$1) tx", [withdrawId])).rows[0].tx;
  const balance = await queryOne('SELECT coins::integer,reserved_coins::integer FROM public.scrabble_wallets WHERE user_id=$1', [first]);
  check(balance, { coins: 9000, reserved_coins: 1000 }, 'withdrawal reserves funds atomically');
  await db.exec("SET request.jwt.claim.role='service_role'");
  await db.query("SELECT public.scrabble_settle_payment($1,false,'rejected-provider-1')", [withdrawal.id]);
  await db.exec('RESET request.jwt.claim.role');
  check((await queryOne('SELECT coins::integer FROM public.scrabble_wallets WHERE user_id=$1', [first])).coins, 10000, 'rejected withdrawal releases reserved funds');
  await rejects(() => asUser(first, "SELECT public.scrabble_request_payment('withdraw',999,'USD','M-Pesa','+243812345678',$1)", [crypto.randomUUID()]), /insuffisant/, 'overspending is rejected');

  const challenge = (await asUser(first, 'SELECT public.scrabble_create_challenge($1,0) c', [second])).rows[0].c;
  check((await asUser(second, 'SELECT * FROM public.scrabble_notifications')).rows.length, 1, 'real challenge generates recipient notification');
  await rejects(() => asUser(outsider, "SELECT public.scrabble_respond_challenge($1,'accept')", [challenge.id]), /Acces refuse/, 'outsider cannot accept another player challenge');
  await asUser(second, "SELECT public.scrabble_respond_challenge($1,'accept')", [challenge.id]);
  await rejects(() => asUser(first, 'SELECT public.scrabble_ready_challenge($1)', [challenge.id]), /20 minutes/, 'twenty-minute conversation enforced server-side');
  await asUser(first, 'INSERT INTO public.scrabble_chat_messages(challenge_id,user_id,message) VALUES($1,$2,$3)', [challenge.id, first, 'Un vrai message']);
  check((await asUser(outsider, 'SELECT * FROM public.scrabble_chat_messages')).rows.length, 0, 'chat is private to participants');
  await rejects(() => asUser(outsider, 'INSERT INTO public.scrabble_chat_messages(challenge_id,user_id,message) VALUES($1,$2,$3)', [challenge.id, outsider, 'Intrusion']), /row-level security/, 'outsider cannot send chat messages');
  await db.query("UPDATE public.scrabble_challenges SET ready_after=now()-interval '1 second' WHERE id=$1", [challenge.id]);
  await asUser(first, 'SELECT public.scrabble_ready_challenge($1)', [challenge.id]);
  const ready = (await asUser(second, 'SELECT public.scrabble_ready_challenge($1) c', [challenge.id])).rows[0].c;
  check(ready.status, 'playing', 'both confirmations create a real match');
  const match = await queryOne('SELECT * FROM public.scrabble_matches WHERE id=$1', [ready.match_id]);
  check(match.state.board.flat().filter(Boolean).length, 0, 'new match has no pre-placed words');
  check(match.state.bag.length + match.state.racks.flat().length, 102, 'all 102 Scrabble tiles accounted for');
  await rejects(() => asUser(first, "UPDATE public.scrabble_matches SET state='{}'::jsonb WHERE id=$1", [match.id]), /permission denied/, 'clients cannot replace the authoritative board');

  // Controlled racks only in this isolated test database.
  await db.query(`UPDATE public.scrabble_matches SET state=jsonb_set(state,'{racks,0}','["L","E","A","T","I","R","S"]') WHERE id=$1`, [match.id]);
  const move = [{ row: 7, col: 7, letter: 'L', blank: false }, { row: 7, col: 8, letter: 'E', blank: false }];
  const played = (await asUser(first, "SELECT public.scrabble_submit_turn($1,0,'word',$2) m", [match.id, JSON.stringify(move)])).rows[0].m;
  check(played.state.scores[0], 4, 'server scores word through double-word center');
  check(played.state.racks[0].length, 7, 'server refills player rack');
  await rejects(() => asUser(first, "SELECT public.scrabble_submit_turn($1,0,'word',$2)", [match.id, JSON.stringify(move)]), /plateau a change/, 'stale or repeated moves rejected');
  await rejects(() => asUser(second, "SELECT public.scrabble_submit_turn($1,NULL,'pass')", [match.id]), /plateau a change/, 'null version cannot bypass concurrency guard');
  await rejects(() => asUser(first, "SELECT public.scrabble_submit_turn($1,1,'pass')", [match.id]), /votre tour/, 'turn ownership enforced');
  const passed = (await asUser(second, "SELECT public.scrabble_submit_turn($1,1,'pass') m", [match.id])).rows[0].m;
  check(passed.state.turn, 0, 'pass hands turn to opponent');
  check(passed.state.bag.length + passed.state.racks.flat().length + passed.state.board.flat().filter(Boolean).length, 102, 'pass preserves all tiles');
  const done = (await asUser(second, 'SELECT public.scrabble_abandon_match($1) m', [match.id])).rows[0].m;
  check(done.winner_seat, 0, 'abandon awards win to non-abandoning player');
  await asUser(second, 'SELECT public.scrabble_abandon_match($1)', [match.id]);
  check((await queryOne('SELECT wins,total_games FROM public.scrabble_profiles WHERE id=$1', [first])), { wins: 1, total_games: 1 }, 'finished stats recorded only once');

  // Paid match: funded by verified payment, commission and prize are server-side.
  await db.query('INSERT INTO scrabble_private.admins VALUES($1)', [first]);
  await asUser(first, 'UPDATE public.scrabble_settings SET paid_matches_enabled=true');
  const depositB = (await asUser(second, "SELECT public.scrabble_request_payment('deposit',10,'USD','M-Pesa','+243812345678',$1) tx", [requestB])).rows[0].tx;
  await credit(depositB.id, 'verified-provider-2');
  const paid = (await asUser(first, 'SELECT public.scrabble_create_challenge($1,100) c', [second])).rows[0].c;
  await asUser(second, "SELECT public.scrabble_respond_challenge($1,'accept')", [paid.id]);
  await db.query("UPDATE public.scrabble_challenges SET ready_after=now()-interval '1 second' WHERE id=$1", [paid.id]);
  await asUser(first, 'SELECT public.scrabble_ready_challenge($1)', [paid.id]);
  const paidReady = (await asUser(second, 'SELECT public.scrabble_ready_challenge($1) c', [paid.id])).rows[0].c;
  check((await queryOne('SELECT coins::integer FROM public.scrabble_admin_wallet')).coins, 6, '3 percent commission on actual 200-coin pot');
  await asUser(second, 'SELECT public.scrabble_ready_challenge($1)', [paid.id]);
  check((await queryOne('SELECT coins::integer FROM public.scrabble_admin_wallet')).coins, 6, 'commission cannot be collected twice');
  await asUser(second, 'SELECT public.scrabble_abandon_match($1)', [paidReady.match_id]);
  check((await queryOne('SELECT coins::integer FROM public.scrabble_wallets WHERE user_id=$1', [first])).coins, 10094, 'winner receives actual pot minus commission');
  const adminRequest = crypto.randomUUID();
  await rejects(() => asUser(first, "SELECT public.scrabble_request_admin_withdrawal(0.001,'USD','+243812345678',$1)", [adminRequest]), /Demande invalide/, 'admin withdrawals reject excessive decimal precision');
  const adminWithdrawal = (await asUser(first, "SELECT public.scrabble_request_admin_withdrawal(14,'CDF','+243812345678',$1) id", [adminRequest])).rows[0].id;
  const retryAdmin = (await asUser(first, "SELECT public.scrabble_request_admin_withdrawal(14,'CDF','+243812345678',$1) id", [adminRequest])).rows[0].id;
  check(retryAdmin, adminWithdrawal, 'admin withdrawal idempotency');
  check((await queryOne('SELECT coins::integer,reserved_coins::integer FROM public.scrabble_admin_wallet')), { coins: 1, reserved_coins: 5 }, 'admin withdrawal reserves actual commissions only');
  await rejects(() => asUser(first, "SELECT public.scrabble_settle_admin_withdrawal($1,true,'forged-admin')", [adminWithdrawal]), /permission denied/, 'even administrators cannot fabricate payout confirmations');
  await db.exec("SET request.jwt.claim.role='service_role'");
  await db.query("SELECT public.scrabble_settle_admin_withdrawal($1,false,'verified-admin-rejection')", [adminWithdrawal]);
  await db.exec('RESET request.jwt.claim.role');
  check((await queryOne('SELECT coins::integer,reserved_coins::integer FROM public.scrabble_admin_wallet')), { coins: 6, reserved_coins: 0 }, 'verified failed admin payout releases funds');
  console.log(`\n${checks} database checks passed. No remote project was modified.`);
} finally { await db.close(); }