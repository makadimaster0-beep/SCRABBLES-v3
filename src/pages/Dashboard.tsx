import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Bell, Bot, ChevronRight, LogOut, MessageSquare, RefreshCw, Search, Swords, Trophy, WalletCards } from 'lucide-react';
import { api, rpc, watchTables } from '../lib/api';
import { errorMessage } from '../lib/supabase';
import type { Challenge, Difficulty, Match, Player } from '../lib/types';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import ScrabbleLogo from '../components/ScrabbleLogo';
import WalletPanel from '../components/WalletPanel';
import ChallengeChat from '../components/ChallengeChat';
import { Empty, formatDate, formatNumber, Loading, Modal, Notice, statusLabels } from '../components/UI';

export default function Dashboard() {
  const { user, wallet, settings, notifications, dataError, refreshAccount, markNotificationRead, signOut, isAdmin } = useAuthStore();
  const [params, setParams] = useSearchParams(); const navigate = useNavigate();
  const tab = params.get('tab') || 'play';
  const [players, setPlayers] = useState<Player[]>([]); const [challenges, setChallenges] = useState<Challenge[]>([]); const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [search, setSearch] = useState(''); const [opponent, setOpponent] = useState<Player | null>(null); const [bet, setBet] = useState('0');
  const [aiOpen, setAiOpen] = useState(false); const [difficulty, setDifficulty] = useState<Difficulty>('normal'); const [busy, setBusy] = useState(false); const [chatId, setChatId] = useState<string | null>(null);
  const userId = user?.id;
  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [people, invites, games] = await Promise.all([api.players(), api.challenges(), api.matches()]);
      setPlayers(people); setChallenges(invites); setMatches(games); setError('');
    } catch (issue) { setError(errorMessage(issue)); } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => {
    void load();
    const heartbeat = () => { void rpc('scrabble_heartbeat', { p_online: true }).catch(issue => setError(errorMessage(issue))); };
    heartbeat(); const timer = setInterval(heartbeat, 40000);
    const unwatch = watchTables(['scrabble_challenges', 'scrabble_matches', 'scrabble_profiles'], () => void load());
    return () => { clearInterval(timer); unwatch(); };
  }, [load]);
  if (!user || !settings) return null;
  const run = async (operation: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await operation(); } catch (issue) { setError(errorMessage(issue)); } finally { setBusy(false); }
  };
  const sendChallenge = (event: FormEvent) => {
    event.preventDefault(); if (!opponent) return;
    void run(async () => {
      await api.challenge(opponent.id, Number(bet)); setOpponent(null); setBet('0'); setMessage('Defi envoye. Votre adversaire recevra une notification.'); await load();
    });
  };
  const startAI = () => void run(async () => {
    const match = await api.startAI(difficulty); useGameStore.getState().acceptMatch(match); navigate(`/game/${match.id}`);
  });
  const respond = (c: Challenge, action: 'accept' | 'decline' | 'cancel') => void run(async () => {
    const updated = await api.respond(c.id, action); await load(); if (updated.status === 'accepted') setChatId(updated.id);
  });
  const people = players.filter(player => player.id !== user.id && player.username.toLowerCase().includes(search.toLowerCase()));
  const activeChallenges = challenges.filter(c => !['finished', 'declined', 'cancelled', 'expired'].includes(c.status));
  const chat = challenges.find(c => c.id === chatId);
  const tabs = [{ id: 'play', title: 'Salon de jeu', icon: Swords }, { id: 'wallet', title: 'Portefeuille', icon: WalletCards }, { id: 'rank', title: 'Classement', icon: Trophy }, { id: 'notif', title: 'Notifications', icon: Bell }];
  return <div className="app-page"><header className="app-header"><div className="page-container flex items-center justify-between gap-4"><ScrabbleLogo /><div className="flex items-center gap-3 sm:gap-6"><button className="header-balance" onClick={() => setParams({ tab: 'wallet' })}><WalletCards size={17} /><strong>{wallet ? formatNumber(wallet.coins) : 'Indisponible'}</strong><span className="hidden sm:inline">jetons</span></button><button aria-label="Se deconnecter" className="icon-button" onClick={() => void run(async () => { await signOut(); navigate('/'); })}><LogOut size={19} /></button></div></div></header>
    <main className="page-container py-8 sm:py-12"><div className="dashboard-greeting"><div><p className="section-eyebrow">VOTRE ESPACE JOUEUR</p><h1>Bonjour, {user.username}.</h1><p>{user.total_games} partie{user.total_games !== 1 ? 's' : ''} enregistree{user.total_games !== 1 ? 's' : ''} / {user.wins} victoire{user.wins !== 1 ? 's' : ''}</p></div>{isAdmin && <Link to="/admin" className="quiet-link">Administration<ChevronRight size={16} /></Link>}</div>
      <nav className="app-tabs" aria-label="Votre espace">{tabs.map(item => <button key={item.id} onClick={() => setParams({ tab: item.id })} className={tab === item.id ? 'active' : ''}><item.icon size={17} />{item.title}{item.id === 'notif' && notifications.some(n => !n.is_read) && <span className="unread-count">{notifications.filter(n => !n.is_read).length}</span>}</button>)}</nav>
      {(error || dataError) && <Notice>{error || dataError}<button className="underline ml-3" onClick={() => { void load(); void refreshAccount(); }}>Reessayer</button></Notice>}
      {message && <Notice success>{message}</Notice>}
      {tab === 'play' && <>
        <div className="play-modes"><button onClick={() => setAiOpen(true)} disabled={!settings.ia_enabled}><Bot size={30} /><div><h2>S'entrainer contre l'IA</h2><p>Cinq niveaux, sans mise. Une vraie partie enregistree.</p></div><ArrowRight size={20} /></button><button onClick={() => document.getElementById('players-search')?.focus()}><Swords size={30} /><div><h2>Defier un joueur</h2><p>Invitez un compte du salon et discutez avant la partie.</p></div><ArrowRight size={20} /></button></div>
        <div className="lobby-columns"><section><div className="section-heading"><h2>Joueurs du salon</h2><button className="icon-button" aria-label="Actualiser les joueurs" onClick={() => void load()}><RefreshCw size={16} /></button></div>
          <label className="search-field"><Search size={17} /><input id="players-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un joueur" /></label>
          {loading ? <Loading /> : !people.length ? <Empty title={search ? 'Aucun joueur correspondant' : 'Aucun adversaire pour le moment'}>Les nouveaux comptes apparaitront ici. Aucun adversaire automatique n'est ajoute.</Empty> : <div className="player-list">{people.map(player => <div key={player.id} className="player-row"><span className="player-avatar">{player.username[0]?.toUpperCase()}</span><div className="flex-1 min-w-0"><h3>{player.username}</h3><p><span className={`presence-dot ${player.is_online ? 'online' : ''}`} />{player.is_online ? 'En ligne' : 'Hors ligne'} / {player.wins} victoire{player.wins !== 1 ? 's' : ''}</p></div><button className="secondary-button compact" onClick={() => { setOpponent(player); setError(''); }}>Defier</button></div>)}</div>}
        </section><section><div className="section-heading"><h2>Vos defis</h2><span className="text-xs text-white/40">{activeChallenges.length} actif{activeChallenges.length !== 1 ? 's' : ''}</span></div>
          {loading ? <Loading /> : !challenges.length ? <Empty title="Aucun defi">Les defis envoyes et recus sont conserves dans votre base.</Empty> : <div className="challenge-list">{challenges.map(c => {
            const incoming = c.to_user_id === user.id; const name = players.find(p => p.id === (incoming ? c.from_user_id : c.to_user_id))?.username || 'Joueur';
            const pending = c.status === 'pending' && Date.parse(c.expires_at) > Date.now();
            return <div className="challenge-row" key={c.id}><div className="flex justify-between gap-3"><h3>{incoming ? 'Recu de' : 'Envoye a'} {name}</h3><span className={`status-label ${c.status}`}>{c.status === 'pending' && !pending ? 'Expire' : statusLabels[c.status]}</span></div><p>{c.bet_amount ? `${formatNumber(c.bet_amount)} jetons par joueur` : 'Partie gratuite'} / {formatDate(c.created_at)}</p><div className="flex gap-2 mt-3 flex-wrap">
              {pending && incoming && <><button className="primary-button compact" disabled={busy} onClick={() => respond(c, 'accept')}>Accepter</button><button className="quiet-link" disabled={busy} onClick={() => respond(c, 'decline')}>Refuser</button></>}
              {pending && !incoming && <button className="quiet-link" disabled={busy} onClick={() => respond(c, 'cancel')}>Annuler l'invitation</button>}
              {c.status === 'accepted' && <button className="secondary-button compact" onClick={() => setChatId(c.id)}><MessageSquare size={15} />Ouvrir la conversation</button>}
              {c.match_id && <Link className="primary-button compact" to={`/game/${c.match_id}`}>{c.status === 'playing' ? 'Rejoindre la partie' : 'Voir la partie'}</Link>}
            </div></div>;
          })}</div>}
        </section></div>
        <section className="mt-12"><div className="section-heading"><h2>Vos parties</h2></div>{!matches.length ? <Empty title="Vous n'avez pas encore joue">Demarrez une partie contre l'IA ou invitez un joueur.</Empty> : matches.slice(0, 15).map(match => <Link key={match.id} className="match-row" to={`/game/${match.id}`}><div><strong>{match.player1_name} <span className="text-white/35 font-normal">contre</span> {match.player2_name}</strong><p>{formatDate(match.created_at)} / {statusLabels[match.status]}</p></div><span>{match.state.scores[0]} : {match.state.scores[1]}</span><ChevronRight size={17} /></Link>)}</section>
      </>}
      {tab === 'wallet' && <WalletPanel />}
      {tab === 'rank' && <section><div className="section-heading"><h2>Classement des joueurs</h2><p className="text-xs text-white/45">Victoires enregistrees dans Supabase</p></div>{loading ? <Loading /> : !players.length ? <Empty title="Aucun joueur classe" /> : <div>{[...players].sort((a, b) => b.wins - a.wins || b.best_score - a.best_score).map((p, index) => <div className="ranking-row" key={p.id}><span className="ranking-position">{index + 1}</span><div className="flex-1"><strong>{p.username}{p.id === user.id ? ' (vous)' : ''}</strong><p>{p.total_games} parties / meilleur score : {p.best_score}</p></div><strong className="text-gold">{p.wins} V</strong></div>)}</div>}</section>}
      {tab === 'notif' && <section><div className="section-heading"><h2>Vos notifications</h2><button className="quiet-link" onClick={() => void refreshAccount()}>Actualiser</button></div>{!notifications.length ? <Empty title="Aucune notification">Les vrais defis, resultats et operations du portefeuille apparaitront ici.</Empty> : notifications.map(n => <div className={`notification-row ${!n.is_read ? 'unread' : ''}`} key={n.id}><Bell size={18} /><div className="flex-1"><h3>{n.title}</h3><p>{n.message}</p><small>{formatDate(n.created_at)}</small><div className="flex gap-4 mt-3">{!n.is_read && <button className="quiet-link" onClick={() => void run(async () => { await markNotificationRead(n.id); })}>Marquer comme lu</button>}{n.type === 'challenge' && challenges.some(c => c.id === n.related_id && ['accepted', 'playing'].includes(c.status)) && <button className="quiet-link text-gold" onClick={() => setChatId(n.related_id)}>Ouvrir le defi</button>}{n.type === 'match' && n.related_id && <Link className="quiet-link text-gold" to={`/game/${n.related_id}`}>Voir la partie</Link>}</div></div></div>)}</section>}
    </main>
    <Modal open={!!opponent} title={`Defier ${opponent?.username || ''}`} onClose={() => setOpponent(null)}><form className="space-y-5" onSubmit={sendChallenge}><p className="text-white/60 text-sm">Votre invitation sera envoyee a ce joueur. Rien ne commence sans son accord.</p>{error && <Notice>{error}</Notice>}<label className="field">Mise par joueur (jetons)<input type="number" min={0} max={settings.max_bet} step={1} value={bet} onChange={e => setBet(e.target.value)} required disabled={!settings.paid_matches_enabled} /></label>{!settings.paid_matches_enabled ? <p className="form-help">Les parties avec mise sont desactivees dans la configuration serveur. Le defi est gratuit.</p> : <p className="form-help">Mise minimum {settings.min_bet}. Commission de {settings.commission_percent}% sur le pot total, prelevee au demarrage, pas a l'invitation.</p>}<button className="primary-button w-full" disabled={busy}>{busy ? 'Envoi...' : 'Envoyer le defi'}</button></form></Modal>
    <Modal open={aiOpen} title="Entrainement contre l'IA" onClose={() => setAiOpen(false)}><div className="space-y-5"><p className="text-white/60 text-sm">Sans mise ni faux gain. Le plateau, les coups et le resultat sont enregistres dans votre compte.</p>{error && <Notice>{error}</Notice>}<label className="field">Niveau<select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)}>{(['simple', 'normal', 'difficile', 'dur', 'expert'] as const).map(level => <option key={level} value={level}>{level[0].toUpperCase() + level.slice(1)}</option>)}</select></label><button className="primary-button w-full" disabled={busy || !settings.ia_enabled} onClick={startAI}>{busy ? 'Creation de la partie...' : 'Commencer la partie'}<ArrowRight size={17} /></button></div></Modal>
    {chat && <ChallengeChat challenge={chat} players={players} onClose={() => setChatId(null)} onUpdate={() => void load()} />}
  </div>;
}