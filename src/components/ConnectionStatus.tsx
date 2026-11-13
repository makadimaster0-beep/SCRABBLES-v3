import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export default function ConnectionStatus() {
  const { dbStatus, dbError, checkDatabase } = useAuthStore();
  if (dbStatus === 'ready') return null;
  return <div className="connection-status" role="status">
    <span className={`connection-dot ${dbStatus === 'checking' ? 'checking' : ''}`} />
    <span>{dbStatus === 'checking' ? 'Verification de la base Supabase...' : dbStatus === 'setup' ? 'Projet Supabase configure. Les tables du jeu restent a initialiser.' : dbError}</span>
    {dbStatus !== 'checking' && <><Link to="/configuration">Configurer la base</Link><button aria-label="Verifier a nouveau la connexion" onClick={() => void checkDatabase()}><RefreshCw size={14} /></button></>}
  </div>;
}