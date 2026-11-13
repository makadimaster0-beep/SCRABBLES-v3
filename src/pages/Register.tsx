import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import ScrabbleLogo from '../components/ScrabbleLogo';
import ConnectionStatus from '../components/ConnectionStatus';
import { Notice } from '../components/UI';

export default function Register() {
  const navigate = useNavigate();
  const { signUp, dbStatus } = useAuthStore();
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [success, setSuccess] = useState(false); const [visible, setVisible] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    let normalized = phone.replace(/[\s().-]/g, '');
    if (/^0[0-9]{9}$/.test(normalized)) normalized = '+243' + normalized.slice(1);
    else if (/^[0-9]{9}$/.test(normalized)) normalized = '+243' + normalized;
    if (!/^\+[1-9][0-9]{8,14}$/.test(normalized)) { setError('Entrez un telephone international valide, par exemple +243 suivi de 9 chiffres.'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    const result = await signUp(email, password, name, normalized);
    setBusy(false);
    if (result.error) setError(result.error);
    else if (result.confirmationRequired) setSuccess(true);
    else navigate('/dashboard', { replace: true });
  };
  return <div className="public-page"><header className="site-header"><ScrabbleLogo /><Link to="/" className="quiet-link">Accueil</Link></header><ConnectionStatus />
    <main className="auth-layout"><div className="auth-intro"><p className="section-eyebrow">PRENEZ PLACE</p><h1>Votre prochain<br />mot commence ici.</h1><p>Un seul compte pour retrouver vos parties, vos adversaires et vos echanges.</p></div>
      <section className="auth-form"><h2>Creer un compte</h2><p className="text-white/50 mb-7 text-sm">Toutes les informations sont enregistrees dans Supabase.</p>
        {success ? <div className="space-y-5"><CheckCircle2 size={36} className="text-emerald-400" /><h3 className="text-xl font-semibold">Confirmez votre email</h3><p className="text-white/65">Un lien a ete envoye a {email}. Cliquez dessus avant de vous connecter.</p><Link className="primary-button" to="/login">Aller a la connexion<ArrowRight size={17} /></Link></div>
        : <form onSubmit={submit} className="space-y-4">
          {error && <Notice>{error}</Notice>}
          <label className="field">Nom<input autoComplete="name" minLength={2} maxLength={80} required value={name} onChange={e => setName(e.target.value)} placeholder="Votre nom" /></label>
          <label className="field">Telephone<input type="tel" autoComplete="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+243 8XX XXX XXX" /><small>Votre numero reste prive. Format local RDC accepte.</small></label>
          <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" /></label>
          <label className="field">Mot de passe<div className="password-field"><input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /><button type="button" aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><small>Au moins 8 caracteres.</small></label>
          <label className="field">Confirmer le mot de passe<input type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
          <button className="primary-button w-full" disabled={busy || dbStatus !== 'ready'}>{busy ? 'Creation du compte...' : 'Creer mon compte'}<ArrowRight size={18} /></button>
          {dbStatus !== 'ready' && <p className="text-xs text-amber-200/80">Initialisez la base pour activer l'inscription. <Link to="/configuration" className="underline">Voir les instructions</Link></p>}
          <p className="text-sm text-white/50 text-center pt-2">Deja inscrit ? <Link className="text-gold" to="/login">Se connecter</Link></p>
        </form>}
      </section>
    </main></div>;
}