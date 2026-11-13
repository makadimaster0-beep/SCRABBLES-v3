import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import ScrabbleLogo from '../components/ScrabbleLogo';
import ConnectionStatus from '../components/ConnectionStatus';
import { Notice } from '../components/UI';

export default function Login({ reset = false }: { reset?: boolean }) {
  const navigate = useNavigate(); const [params] = useSearchParams();
  const { signIn, resetPassword, updatePassword, session, loading } = useAuthStore();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [forgot, setForgot] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    if (reset && password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    const result = reset ? await updatePassword(password) : forgot ? await resetPassword(email) : await signIn(email, password);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (forgot) setMessage('Si un compte correspond a cet email, un lien de recuperation a ete envoye.');
    else if (reset) { setMessage('Votre mot de passe a ete modifie.'); }
    else navigate(params.get('next') === 'admin' ? '/admin' : '/dashboard', { replace: true });
  };
  return <div className="public-page"><header className="site-header"><ScrabbleLogo /><Link className="quiet-link" to="/">Accueil</Link></header><ConnectionStatus />
    <main className="auth-layout"><div className="auth-intro"><p className="section-eyebrow">REPRENEZ LA PARTIE</p><h1>Les bons mots<br />vous attendent.</h1><p>Connectez-vous a votre compte. Aucun compte de demonstration n'est utilise.</p></div>
      <section className="auth-form"><h2>{reset ? 'Nouveau mot de passe' : forgot ? 'Recuperer mon compte' : 'Heureux de vous revoir'}</h2>
        <p className="text-sm text-white/50 mb-7">{reset ? 'Choisissez un nouveau mot de passe securise.' : forgot ? 'Recevez un lien de recuperation par email.' : 'Connexion securisee avec Supabase Auth.'}</p>
        {reset && !session && !loading ? <Notice>Ouvrez cette page depuis le lien de recuperation recu par email. <Link className="underline" to="/login">Demander un nouveau lien</Link></Notice>
          : <form onSubmit={submit} className="space-y-5">
            {error && <Notice>{error}</Notice>}{message && <Notice success>{message}</Notice>}
            {!reset && <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" /></label>}
            {(!forgot || reset) && <label className="field">Mot de passe<input type="password" autoComplete={reset ? 'new-password' : 'current-password'} required minLength={reset ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} /></label>}
            {reset && <label className="field">Confirmer le mot de passe<input type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}
            <button className="primary-button w-full" disabled={busy || (reset && !session)}>{busy ? 'Veuillez patienter...' : reset ? 'Enregistrer le mot de passe' : forgot ? 'Envoyer le lien' : 'Se connecter'}<ArrowRight size={18} /></button>
            {!reset && <div className="flex justify-between gap-3 text-sm"><button type="button" className="quiet-link" onClick={() => { setForgot(!forgot); setError(''); setMessage(''); }}>{forgot ? 'Retour a la connexion' : 'Mot de passe oublie ?'}</button><Link className="text-gold" to="/register">S'inscrire</Link></div>}
            {reset && message && <Link className="secondary-button w-full" to="/dashboard">Revenir au salon</Link>}
          </form>}
      </section>
    </main></div>;
}