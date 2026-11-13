import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Download, RefreshCw } from 'lucide-react';
import schema from '../../supabase-schema.sql?raw';
import { useAuthStore } from '../store/authStore';
import { supabaseUrl } from '../lib/supabase';
import ScrabbleLogo from '../components/ScrabbleLogo';
import { Notice } from '../components/UI';

const sqlLines = schema.trimEnd().split('\n').length;
const sqlTables = Array.from(schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+\.[a-z_]+)/g), match => match[1]);

export default function Configuration() {
  const { dbStatus, dbError, checkDatabase } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(schema); setCopied(true); setCopyError(''); }
    catch { setCopyError('Copie non autorisee par le navigateur. Telechargez le fichier SQL.'); }
  };
  return <div className="public-page"><header className="site-header"><ScrabbleLogo /><Link className="quiet-link" to="/">Retour a l'accueil</Link></header>
    <main className="page-container max-w-3xl py-12"><p className="section-eyebrow">INSTALLATION SUPABASE</p><h1 className="page-title">Tous les codes SQL du jeu</h1>
      <p className="text-white/60 mt-4 mb-8 break-all">Projet : {supabaseUrl || 'Configuration manquante'}</p>
      <Notice success={dbStatus === 'ready'}>{dbStatus === 'ready' ? 'Les tables du jeu et le lexique sont accessibles.' : dbStatus === 'checking' ? 'Verification en cours...' : dbError}</Notice>
      <p className="text-sm text-white/65 leading-7 mb-7">Un seul fichier complet : tables des joueurs, wallets USD et CDF, transactions, defis, conversations privees, notifications, parties, lexique et administration. Il inclut aussi les fonctions serveur, les triggers, les politiques RLS et la configuration Realtime.</p>
      <ol className="setup-steps">
        <li><h2>1. Installer les tables</h2><p>Ouvrez le SQL Editor de ce projet Supabase, copiez le script complet puis cliquez sur Run. Le script cree les tables scrabble_* sans supprimer vos autres donnees. Il ne contient aucun faux compte ni solde.</p>
          <div className="flex gap-3 flex-wrap mt-4"><a className="primary-button" href="/supabase-schema.sql" download="supabase-schema.sql"><Download size={17} />Telecharger tout le SQL</a><button className="secondary-button" onClick={() => void copy()}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'Script complet copie' : 'Copier tout le SQL'}</button><a className="quiet-link" href="#sql-complet">Lire le code integral</a></div>
          {copyError && <p role="alert">{copyError}</p>}{copied && <p role="status">Les {sqlLines} lignes du fichier complet ont ete copiees.</p>}
        </li>
        <li><h2>2. Configurer Auth</h2><p>Dans Authentication &gt; URL Configuration, ajoutez l'adresse de ce site et les redirections /login et /reset-password. Les nouveaux utilisateurs doivent confirmer leur email si cette option est activee.</p></li>
        <li><h2>3. Autoriser votre compte administrateur</h2><p>Creez un compte, puis ajoutez son identifiant Auth dans scrabble_private.admins depuis le SQL Editor. La commande est fournie a la fin du script. Les cinq clics sur le logo ouvrent l'acces, mais seul ce role accorde les droits.</p></li>
        <li><h2>4. Relier les paiements</h2><p>Un depot cree une demande, pas un credit. Un webhook serveur doit verifier le paiement aupres du prestataire avant d'appeler scrabble_settle_payment. Aucune cle secrete ne doit etre ajoutee au navigateur.</p></li>
      </ol>
      <button className="secondary-button" onClick={() => void checkDatabase()} disabled={dbStatus === 'checking'}><RefreshCw size={16} />Verifier l'installation</button>
      <section id="sql-complet" className="sql-document" aria-labelledby="sql-title">
        <div className="section-heading"><div><p className="section-eyebrow">SCRIPT INTEGRAL</p><h2 id="sql-title">supabase-schema.sql</h2></div><span className="text-xs text-white/45">{sqlLines} lignes / {sqlTables.length} tables</span></div>
        <p className="form-help mb-4">Executez le fichier entier, de BEGIN a COMMIT. La commande optionnelle pour autoriser votre compte administrateur est indiquee a la fin. Aucun script supplementaire n'est requis pour les tables du jeu.</p>
        <pre className="sql-source" tabIndex={0} aria-label="Code SQL integral a copier dans Supabase"><code>{schema}</code></pre>
        <p className="form-help mt-4">Les mots de passe des comptes sont geres par Supabase Auth, jamais stockes en clair dans ces tables. Les transferts bancaires ou Mobile Money exigent un backend de paiement connecte.</p>
      </section>
    </main></div>;
}