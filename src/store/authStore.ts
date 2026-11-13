import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { api, rpc } from '../lib/api';
import { configurationError, database, errorMessage } from '../lib/supabase';
import type { GameNotification, Profile, Settings, Transaction, Wallet } from '../lib/types';

type AuthResult = { error: string | null; confirmationRequired?: boolean };
interface AuthState {
  session: Session | null;
  user: Profile | null;
  wallet: Wallet | null;
  settings: Settings | null;
  transactions: Transaction[];
  notifications: GameNotification[];
  isAdmin: boolean;
  isAuthenticated: boolean;
  loading: boolean;
  profileError: string | null;
  dataError: string | null;
  dbStatus: 'checking' | 'ready' | 'setup' | 'error';
  dbError: string | null;
  lexiconCount: number | null;
  recovery: boolean;
  initSession: () => Promise<void>;
  syncSession: (session: Session | null) => Promise<void>;
  checkDatabase: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  signUp: (email: string, password: string, name: string, phone: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
}

let initialising: Promise<void> | null = null;
let sessionRevision = 0;

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null, user: null, wallet: null, settings: null, transactions: [], notifications: [],
  isAdmin: false, isAuthenticated: false, loading: true, profileError: null, dataError: null,
  dbStatus: 'checking', dbError: null, lexiconCount: null, recovery: false,

  checkDatabase: async () => {
    set({ dbStatus: 'checking', dbError: null });
    try {
      if (configurationError) throw new Error(configurationError);
      const health = await rpc<{ version: number; lexicon_words: number }>('scrabble_health');
      if (health.version !== 1 || health.lexicon_words < 1) throw new Error('Schema ou lexique incomplet. Executez le script SQL fourni.');
      const settings = await api.settings();
      set({ dbStatus: 'ready', dbError: null, settings, lexiconCount: health.lexicon_words });
    } catch (error) {
      const code = (error as { code?: string }).code;
      set({ dbStatus: ['PGRST202', 'PGRST205', '42P01', '42703'].includes(code || '') ? 'setup' : 'error',
        dbError: errorMessage(error), settings: null, lexiconCount: null });
    }
  },

  initSession: async () => {
    if (initialising) return initialising;
    initialising = (async () => {
      const databaseCheck = get().checkDatabase();
      try {
        const { data, error } = await database().auth.getSession();
        if (error) throw error;
        await get().syncSession(data.session);
      } catch (error) { set({ profileError: errorMessage(error) }); }
      finally { await databaseCheck; set({ loading: false }); }
    })();
    return initialising;
  },

  syncSession: async (session) => {
    const revision = ++sessionRevision;
    if (!session) {
      set({ session: null, user: null, wallet: null, transactions: [], notifications: [], isAdmin: false,
        isAuthenticated: false, loading: false, profileError: null, dataError: null, recovery: false });
      return;
    }
    set({ session, isAuthenticated: true, loading: true });
    try {
      const [user, wallet, isAdmin] = await Promise.all([api.profile(session.user.id), api.wallet(session.user.id), rpc<boolean>('scrabble_is_admin')]);
      if (revision !== sessionRevision) return;
      if (user.is_blocked) throw new Error('Ce compte est bloque. Contactez un administrateur.');
      set({ user, wallet, isAdmin, profileError: null });
      await get().refreshAccount();
    } catch (error) {
      if (revision === sessionRevision) set({ user: null, wallet: null, isAdmin: false, profileError: errorMessage(error) });
    } finally { if (revision === sessionRevision) set({ loading: false }); }
  },

  refreshAccount: async () => {
    const id = get().session?.user.id;
    if (!id) return;
    try {
      const [user, wallet, transactions] = await Promise.all([api.profile(id), api.wallet(id), api.transactions(id)]);
      if (get().session?.user.id !== id) return;
      set({ user, wallet, transactions, dataError: null });
      await get().fetchNotifications();
    } catch (error) { set({ dataError: errorMessage(error) }); }
  },

  fetchNotifications: async () => {
    const id = get().session?.user.id;
    if (!id) return;
    const { data, error } = await database().from('scrabble_notifications').select('*').eq('user_id', id).order('created_at', { ascending: false }).limit(100);
    if (error) { set({ dataError: errorMessage(error) }); return; }
    if (get().session?.user.id === id) set({ notifications: data as GameNotification[] });
  },

  markNotificationRead: async (id) => {
    const { error } = await database().from('scrabble_notifications').update({ is_read: true }).eq('id', id).eq('user_id', get().session!.user.id);
    if (error) throw error;
    set({ notifications: get().notifications.map(item => item.id === id ? { ...item, is_read: true } : item) });
  },

  signUp: async (email, password, name, phone) => {
    try {
      const { data, error } = await database().auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { username: name.trim(), full_name: name.trim(), phone }, emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      if (!data.session) return { error: null, confirmationRequired: true };
      await get().syncSession(data.session);
      return { error: get().profileError };
    } catch (error) { return { error: errorMessage(error) }; }
  },

  signIn: async (email, password) => {
    try {
      const { data, error } = await database().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) throw error;
      await get().syncSession(data.session);
      return { error: get().profileError };
    } catch (error) { return { error: errorMessage(error) }; }
  },

  signOut: async () => {
    try {
      await rpc('scrabble_heartbeat', { p_online: false }).catch(() => undefined);
      const { error } = await database().auth.signOut({ scope: 'local' });
      if (error) throw error;
      await get().syncSession(null);
    } catch (error) { set({ dataError: errorMessage(error) }); throw error; }
  },

  resetPassword: async (email) => {
    try {
      const { error } = await database().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      return { error: null };
    } catch (error) { return { error: errorMessage(error) }; }
  },

  updatePassword: async (password) => {
    try {
      const { error } = await database().auth.updateUser({ password });
      if (error) throw error;
      set({ recovery: false });
      return { error: null };
    } catch (error) { return { error: errorMessage(error) }; }
  },
}));