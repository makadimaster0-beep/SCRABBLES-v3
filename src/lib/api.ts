import { database } from './supabase';
import type { AdminWallet, Challenge, ChatMessage, Currency, Difficulty, Match, Player, Profile, Settings, TilePlacement, Transaction, Wallet } from './types';

export async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await database().rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const api = {
  async profile(id: string) {
    const { data, error } = await database().from('scrabble_profiles').select('*').eq('id', id).single();
    if (error) throw error;
    return data as Profile;
  },
  async wallet(id: string) {
    const { data, error } = await database().from('scrabble_wallets').select('*').eq('user_id', id).single();
    if (error) throw error;
    return data as Wallet;
  },
  async settings() {
    const { data, error } = await database().from('scrabble_settings').select('*').eq('id', 1).single();
    if (error) throw error;
    return data as Settings;
  },
  players: () => rpc<Player[]>('scrabble_list_players'),
  async challenges() {
    const { data, error } = await database().from('scrabble_challenges').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data as Challenge[];
  },
  challenge: (opponent: string, bet: number) => rpc<Challenge>('scrabble_create_challenge', { p_opponent: opponent, p_bet: bet }),
  respond: (id: string, action: 'accept' | 'decline' | 'cancel') => rpc<Challenge>('scrabble_respond_challenge', { p_id: id, p_action: action }),
  ready: (id: string) => rpc<Challenge>('scrabble_ready_challenge', { p_id: id }),
  async messages(challengeId: string) {
    const { data, error } = await database().from('scrabble_chat_messages').select('*').eq('challenge_id', challengeId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return (data as ChatMessage[]).reverse();
  },
  async sendMessage(challengeId: string, userId: string, message: string) {
    const { data, error } = await database().from('scrabble_chat_messages').insert({ challenge_id: challengeId, user_id: userId, message: message.trim() }).select().single();
    if (error) throw error;
    return data as ChatMessage;
  },
  async transactions(id?: string) {
    let query = database().from('scrabble_transactions').select('*').order('created_at', { ascending: false }).limit(100);
    if (id) query = query.eq('user_id', id);
    const { data, error } = await query;
    if (error) throw error;
    return data as Transaction[];
  },
  payment: (type: 'deposit' | 'withdraw', amount: number, currency: Currency, method: string, phone: string, requestId: string) =>
    rpc<Transaction>('scrabble_request_payment', { p_type: type, p_amount: amount, p_currency: currency, p_method: method, p_phone: phone, p_request_id: requestId }),
  startAI: (difficulty: Difficulty) => rpc<Match>('scrabble_start_ai', { p_difficulty: difficulty }),
  async match(id: string) {
    const { data, error } = await database().from('scrabble_matches').select('*').eq('id', id).single();
    if (error) throw error;
    return data as Match;
  },
  async matches() {
    const { data, error } = await database().from('scrabble_matches').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data as Match[];
  },
  turn: (id: string, version: number, action: string, tiles: TilePlacement[] | { index: number }[] = []) =>
    rpc<Match>('scrabble_submit_turn', { p_id: id, p_version: version, p_action: action, p_tiles: tiles }),
  abandon: (id: string) => rpc<Match>('scrabble_abandon_match', { p_id: id }),
  async adminData() {
    const [profiles, wallets, wallet, transactions, payments, matches, challenges] = await Promise.all([
      database().from('scrabble_profiles').select('*').order('created_at', { ascending: false }),
      database().from('scrabble_wallets').select('*'),
      database().from('scrabble_admin_wallet').select('*').eq('id', 1).single(),
      database().from('scrabble_admin_transactions').select('*').order('created_at', { ascending: false }).limit(100),
      api.transactions(), api.matches(), api.challenges(),
    ]);
    for (const result of [profiles, wallets, wallet, transactions]) if (result.error) throw result.error;
    return { profiles: profiles.data as Profile[], wallets: wallets.data as Wallet[], wallet: wallet.data as AdminWallet,
      transactions: transactions.data as Transaction[], payments, matches, challenges };
  },
  async saveSettings(settings: Omit<Settings, 'id'>) {
    const { data, error } = await database().from('scrabble_settings').update(settings).eq('id', 1).select().single();
    if (error) throw error;
    return data as Settings;
  },
};

// Postgres Changes is authoritative; polling also covers reconnects and missed events.
export function watchTables(tables: string[], onChange: () => void, filter?: string) {
  const client = database();
  const channel = client.channel(`scrabble-${crypto.randomUUID()}`);
  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, onChange);
  }
  channel.subscribe();
  const timer = window.setInterval(onChange, 15000);
  return () => { window.clearInterval(timer); void client.removeChannel(channel); };
}