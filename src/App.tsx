import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import { supabase } from './lib/supabase';
import { watchTables } from './lib/api';
import { Loading, Notice } from './components/UI';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GameRoom from './pages/GameRoom';
import AdminPanel from './pages/AdminPanel';
import Configuration from './pages/Configuration';

function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { loading, session, user, isAdmin, profileError, dbStatus, syncSession, signOut } = useAuthStore();
  if (loading) return <Loading label="Verification de votre session..." />;
  if (!session) return <Navigate to={admin ? '/login?next=admin' : '/login'} replace />;
  if (!user || dbStatus !== 'ready' || user.is_blocked) return <div className="page-container py-12 max-w-xl"><Notice>{profileError || (user?.is_blocked ? 'Ce compte est bloque.' : 'La base de donnees du jeu est indisponible.')}</Notice><div className="flex flex-wrap gap-3 mt-6"><Link className="primary-button" to="/configuration">Configurer la base</Link><button className="secondary-button" onClick={() => void syncSession(session)}>Recharger mon compte</button><button className="quiet-link" onClick={() => void signOut().catch(() => undefined)}>Deconnexion</button><Link to="/" className="quiet-link">Accueil</Link></div></div>;
  if (admin && !isAdmin) return <div className="page-container py-12 max-w-xl"><Notice>Ce compte n'a pas les droits administrateur dans Supabase.</Notice><Link className="primary-button mt-6" to="/dashboard">Retour a mon espace</Link></div>;
  return <>{children}</>;
}

function Application() {
  const { session, dbStatus, initSession, refreshAccount, recovery } = useAuthStore();
  const location = useLocation(); const navigate = useNavigate();
  useEffect(() => {
    void initSession();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const subscription = supabase?.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') useAuthStore.setState({ recovery: true });
      // Supabase auth callbacks must not await another auth request while the auth lock is held.
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || (event === 'SIGNED_IN' && useAuthStore.getState().session?.user.id !== next?.user.id)) {
        const timer = setTimeout(() => { timers.delete(timer); void useAuthStore.getState().syncSession(next); }, 0);
        timers.add(timer);
      } else if (event === 'TOKEN_REFRESHED') useAuthStore.setState({ session: next });
    }).data.subscription;
    return () => { subscription?.unsubscribe(); timers.forEach(timer => clearTimeout(timer)); };
  }, [initSession]);
  useEffect(() => {
    if (!session || dbStatus !== 'ready') return;
    return watchTables(['scrabble_wallets', 'scrabble_transactions', 'scrabble_notifications', 'scrabble_profiles'], () => void refreshAccount());
  }, [session?.user.id, dbStatus, refreshAccount]);
  useEffect(() => { if (recovery && location.pathname !== '/reset-password') navigate('/reset-password', { replace: true }); }, [recovery, location.pathname, navigate]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);
  return <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<Login reset />} />
        <Route path="/configuration" element={<Configuration />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/game/:matchId" element={<Protected><GameRoom /></Protected>} />
        <Route path="/game" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin" element={<Protected admin><AdminPanel /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  </>;
}

export function App() {
  return <MotionConfig reducedMotion="user"><BrowserRouter><Application /></BrowserRouter></MotionConfig>;
}
