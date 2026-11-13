import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { PGlite } from '@electric-sql/pglite';

// Disposable API adapter for browser tests only. Never writes to the remote project.
const db = new PGlite();
const origin = 'http://localhost:5173';
const host = 'https://mjuihmjylghkbzgvbpqx.supabase.co';
const uid = '30000000-0000-4000-8000-000000000001';
const other = '30000000-0000-4000-8000-000000000002';
const errors = []; const seen = [];
let activeMatchId;
let apiQueue = Promise.resolve();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
  GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;`);
await db.exec(fs.readFileSync('supabase-schema.sql', 'utf8'));
await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3),($4,$5,$6)',
  [uid, 'browser@example.test', { full_name: 'Compte de test local', phone: '+243812345678' }, other, 'other@example.test', { full_name: 'Autre compte local', phone: '+243822345678' }]);
const authUser = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'browser@example.test', created_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: 'Compte de test local', phone: '+243812345678' }, identities: [] };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: uid, role: 'authenticated', aud: 'authenticated', email: authUser.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
const session = { access_token: token, refresh_token: 'local-test-refresh-token', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: authUser };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', issue => errors.push(issue.message));
await page.routeWebSocket('**/realtime/v1/**', socket => socket.close());
await page.route(`${host}/**`, async route => {
  const request = route.request(); const url = new URL(request.url());
  seen.push({ url: request.url(), key: request.headers().apikey });
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
  const respond = (value, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(value) });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (url.pathname === '/auth/v1/token') return respond(session);
  if (url.pathname === '/auth/v1/user') return respond(authUser);
  if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
  const signedIn = request.headers().authorization === `Bearer ${token}`;
  const previous = apiQueue;
  let release;
  apiQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    await db.exec(`SET ROLE ${signedIn ? 'authenticated' : 'anon'}; SET request.jwt.claim.sub='${signedIn ? uid : ''}'; SET request.jwt.claim.role='${signedIn ? 'authenticated' : 'anon'}';`);
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const name = url.pathname.split('/').pop();
      assert.match(name, /^scrabble_[a-z_]+$/);
      const body = request.postDataJSON() || {};
      const values = Object.values(body).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
      const args = Object.keys(body).map((key, index) => { assert.match(key, /^p_[a-z_]+$/); return `${key} => $${index + 1}`; }).join(',');
      let result;
      if (name === 'scrabble_list_players') result = (await db.query(`SELECT to_jsonb(r) value FROM public.${name}() r`)).rows.map(r => r.value);
      else result = (await db.query(`SELECT to_jsonb(public.${name}(${args})) value`, values)).rows[0].value;
      if (name === 'scrabble_start_ai') activeMatchId = result.id;
      return await respond(result);
    }
    const table = url.pathname.split('/').pop(); assert.match(table, /^scrabble_[a-z_]+$/);
    const values = []; const clauses = [];
    for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) { assert.match(key, /^[a-z_]+$/); values.push(value.slice(3)); clauses.push(`t.${key}=$${values.length}`); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    if (request.method() === 'PATCH') {
      const body = request.postDataJSON(); const sets = Object.keys(body).map(key => { assert.match(key, /^[a-z_]+$/); values.push(body[key]); return `${key}=$${values.length}`; });
      const rows = (await db.query(`UPDATE public.${table} t SET ${sets.join(',')}${where} RETURNING to_jsonb(t) value`, values)).rows;
      return await respond(request.headers().accept?.includes('object') ? rows[0]?.value : rows.map(r => r.value));
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); const columns = Object.keys(body);
      columns.forEach(key => assert.match(key, /^[a-z_]+$/));
      const rows = (await db.query(`INSERT INTO public.${table}(${columns.join(',')}) VALUES(${columns.map((_, i) => `$${i + 1}`).join(',')}) RETURNING to_jsonb(${table}) value`, Object.values(body))).rows;
      return await respond(request.headers().accept?.includes('object') ? rows[0]?.value : rows.map(r => r.value));
    }
    const order = url.searchParams.get('order'); let orderBy = '';
    if (order) { const [column, direction] = order.split('.'); assert.match(column, /^[a-z_]+$/); orderBy = ` ORDER BY t.${column} ${direction === 'desc' ? 'DESC' : 'ASC'}`; }
    const rows = (await db.query(`SELECT to_jsonb(t) value FROM public.${table} t${where}${orderBy}`, values)).rows.map(r => r.value);
    return await respond(request.headers().accept?.includes('object') ? rows[0] : rows);
  } catch (issue) { return await respond({ code: issue.code || 'P0001', message: issue.message }, 400); }
  finally { await db.exec('RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.role;'); release(); }
});

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Connexion', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(authUser.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('local-test-password');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('heading', { name: 'Bonjour, Compte de test local.' }).waitFor();
  console.log('PASS real-data dashboard renders authenticated database rows');
  await page.getByRole('button', { name: 'Portefeuille', exact: true }).click();
  await page.getByLabel('Montant', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Verifier ma demande', exact: true }).click();
  await page.getByRole('button', { name: 'Envoyer la demande', exact: true }).click();
  await page.getByRole('heading', { name: 'Demande enregistree', exact: true }).waitFor();
  const wallet = (await db.query('SELECT coins::integer FROM public.scrabble_wallets WHERE user_id=$1', [uid])).rows[0];
  assert.equal(wallet.coins, 0);
  console.log('PASS wallet request is persisted without fabricating money');
  await page.getByRole('button', { name: 'Salon de jeu', exact: true }).click();
  await page.getByRole('button', { name: 'Defier', exact: true }).click();
  await page.getByRole('button', { name: 'Envoyer le defi', exact: true }).click();
  await page.getByText('Defi envoye. Votre adversaire recevra une notification.', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT count(*)::integer n FROM public.scrabble_challenges')).rows[0].n, 1);
  console.log('PASS challenge persists without automatic opponent acceptance');
  const challengeId = (await db.query('SELECT id FROM public.scrabble_challenges')).rows[0].id;
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${other}'; SET request.jwt.claim.role='authenticated';`);
  await db.query("SELECT public.scrabble_respond_challenge($1,'accept')", [challengeId]);
  await db.exec('RESET ROLE; RESET request.jwt.claim.sub; RESET request.jwt.claim.role;');
  await page.getByRole('button', { name: 'Actualiser les joueurs', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir la conversation', exact: true }).click();
  await page.getByLabel('Votre message', { exact: true }).fill('Message de verification local');
  await page.getByRole('button', { name: 'Envoyer le message', exact: true }).click();
  await page.getByText('Message de verification local', { exact: true }).waitFor();
  assert.equal((await db.query('SELECT count(*)::integer n FROM public.scrabble_chat_messages')).rows[0].n, 1);
  assert.equal(await page.getByRole('button', { name: 'Oui, je suis pret a jouer', exact: true }).isDisabled(), true);
  console.log('PASS private chat persists real messages and preserves confirmation countdown');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /S.entrainer contre l.IA/ }).click();
  await page.getByRole('button', { name: 'Commencer la partie', exact: true }).click();
  await page.waitForURL('**/game/**');
  await page.locator('.scrabble-grid').waitFor();
  assert.equal(await page.locator('.game-cell').count(), 225);
  assert.equal(await page.locator('.letter-cell').count(), 0);
  assert.equal(await page.locator('.own-rack > button').count(), 7);
  assert.equal(await page.locator('.opponent-rack > div').count(), 7);
  await page.screenshot({ path: 'test-results/game-desktop.png', fullPage: true });
  console.log('PASS game loads empty authoritative 3D board and both racks');
  await page.getByRole('button', { name: '2D', exact: true }).click();
  assert.equal(await page.locator('.board-3d-flat').count(), 1);
  await page.getByRole('button', { name: 'Passer et renouveler', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.move-history li').length >= 2);
  const played = (await db.query('SELECT state,version FROM public.scrabble_matches WHERE id=$1', [activeMatchId])).rows[0];
  assert.equal(played.version, 2);
  assert.equal(played.state.turn, 0);
  console.log('PASS passing and AI turns are saved by server RPC');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  console.log('Mobile width diagnostics:', await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, wide: Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 15).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right })) })));
  await page.screenshot({ path: 'test-results/game-mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log('PASS mobile game has no horizontal overflow');
  await page.getByRole('button', { name: 'Abandonner la partie', exact: true }).click();
  await page.getByRole('button', { name: "Confirmer l'abandon", exact: true }).click();
  await page.getByRole('heading', { name: 'Fin par abandon', exact: true }).waitFor();
  assert.equal((await db.query('SELECT total_games FROM public.scrabble_profiles WHERE id=$1', [uid])).rows[0].total_games, 1);
  console.log('PASS abandon is real and counted once');
  await page.getByRole('link', { name: 'Retour au salon', exact: true }).first().click();
  await page.goto(`${origin}/admin`, { waitUntil: 'networkidle' });
  await page.getByText("Ce compte n'a pas les droits administrateur dans Supabase.", { exact: true }).waitFor();
  console.log('PASS non-admin is denied even with a valid login');
  await db.query('INSERT INTO scrabble_private.admins VALUES($1)', [uid]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Parametres', exact: true }).click();
  await page.getByLabel('Commission sur le pot (%)', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Sauvegarder dans Supabase', exact: true }).click();
  await page.getByText('Parametres enregistres dans Supabase.', { exact: true }).waitFor();
  assert.equal(Number((await db.query('SELECT commission_percent FROM public.scrabble_settings')).rows[0].commission_percent), 4);
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await page.getByRole('heading', { name: 'ScrabbleBet', exact: true }).waitFor();
  console.log('PASS admin settings persist and returning home does not crash');
  assert.deepEqual(errors, []);
  assert.ok(seen.filter(r => r.url.includes('/rest/v1/')).every(r => r.key === 'sb_publishable_DvzadezMariJxEelTqIZrg_hNznIWAi'));
  console.log('PASS no React errors; only the new project/key are requested');
  console.log('\nBrowser integration checks passed against isolated PostgreSQL. No remote data modified.');
} finally { await browser.close(); await db.close(); }