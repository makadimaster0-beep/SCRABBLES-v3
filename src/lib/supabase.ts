import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const validUrl = (() => {
  try { return ['https:', 'http:'].includes(new URL(supabaseUrl).protocol); }
  catch { return false; }
})();

export const configurationError = !supabaseUrl || !publishableKey
  ? 'Configuration Supabase manquante. Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.'
  : !validUrl
    ? 'L\'URL Supabase configuree est invalide.'
  : !publishableKey.startsWith('sb_publishable_')
    ? 'Une cle publique Supabase sb_publishable_ est requise dans le navigateur.'
    : null;

export const supabase = configurationError ? null : createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: `scrabble-${new URL(supabaseUrl).hostname.split('.')[0]}-auth`,
  },
});

export function database() {
  if (!supabase) throw new Error(configurationError || 'Supabase indisponible.');
  return supabase;
}

export function errorMessage(error: unknown): string {
  const issue = error as { code?: string; message?: string };
  if (['PGRST202', 'PGRST205', '42P01', '42703'].includes(issue?.code || '')) {
    return 'La base du jeu doit etre initialisee. Executez supabase-schema.sql dans le SQL Editor de ce projet.';
  }
  if (issue?.code === '42501') return 'Acces refuse par Supabase. Verifiez votre compte et vos droits.';
  if (issue?.message === 'Invalid login credentials') return 'Email ou mot de passe incorrect.';
  if (issue?.message === 'Email not confirmed') return 'Confirmez votre adresse email avant de vous connecter.';
  if (/fetch|network|timeout/i.test(issue?.message || '')) return 'Connexion a Supabase impossible. Verifiez votre connexion puis reessayez.';
  return issue?.message || 'Une erreur est survenue. Reessayez.';
}
