import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Box, Clock3, Flag, Layers2, RefreshCw, RotateCcw, Shuffle, Star } from 'lucide-react';
import { api, watchTables } from '../lib/api';
import { ALL_LETTERS, evaluateMove, findAIMove, getBagLetterCounts, getBonusType, LETTER_DISTRIBUTION, LETTER_VALUES, rackAfterDraft } from '../lib/scrabble';
import { useAuthStore } from '../store/authStore';
import { useGameStore } from '../store/gameStore';
import ScrabbleLogo from '../components/ScrabbleLogo';
import { Empty, formatNumber, Loading, Modal, Notice } from '../components/UI';

const bonusLabels: Record<string, string> = { TW: 'MOT\n3', DW: 'MOT\n2', TL: 'LETTRE\n3', DL: 'LETTRE\n2' };

export default function GameRoom() {
  const { matchId } = useParams();
  const { match, draft, busy, error, loadMatch, acceptMatch, placeTile, removeTile, recall, submit, abandon } = useGameStore();
  const { user, isAdmin, lexiconCount, refreshAccount } = useAuthStore();
  const [selected, setSelected] = useState<number | null>(null); const [is3D, setIs3D] = useState(true);
  const [showBag, setShowBag] = useState(true); const [showAbandon, setShowAbandon] = useState(false);
  const [blank, setBlank] = useState<{ row: number; col: number; index: number } | null>(null);
  const [now, setNow] = useState(Date.now()); const [thinking, setThinking] = useState(false);
  const timeoutSent = useRef('');

  useEffect(() => {
    if (!matchId) return;
    let active = true;
    void loadMatch(matchId);
    const reload = () => { void api.match(matchId).then(data => { if (active) acceptMatch(data); }).catch(() => { if (active) void loadMatch(matchId); }); };
    const unwatch = watchTables(['scrabble_matches'], reload, `id=eq.${matchId}`);
    return () => { active = false; unwatch(); };
  }, [matchId, loadMatch, acceptMatch]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { setSelected(null); }, [match?.version]);
  useEffect(() => { if (match?.status && match.status !== 'playing') void refreshAccount(); }, [match?.status, refreshAccount]);
  const isOwner = match?.player1_id === user?.id;
  const seat = isOwner ? 0 : 1;
  const aiTurn = match?.game_mode === 'ai' && isOwner && match.state.turn === 1 && match.status === 'playing';

  useEffect(() => {
    if (!aiTurn || !match || busy) { setThinking(false); return; }
    setThinking(true);
    const version = match.version; const id = match.id;
    const timer = setTimeout(() => {
      const current = useGameStore.getState().match;
      if (!current || current.id !== id || current.version !== version) return;
      const tiles = findAIMove(current.state, current.ai_difficulty || 'normal');
      void submit(tiles ? 'word' : 'pass', undefined, tiles || undefined).finally(() => setThinking(false));
    }, { simple: 800, normal: 1100, difficile: 1400, dur: 1700, expert: 2000 }[match.ai_difficulty || 'normal']);
    return () => clearTimeout(timer);
  }, [aiTurn, match?.id, match?.version, busy, submit]);

  useEffect(() => {
    if (!match || match.status !== 'playing' || busy || Date.parse(match.deadline) > now || timeoutSent.current === match.id) return;
    timeoutSent.current = match.id;
    void submit('pass');
  }, [match?.id, match?.status, match?.deadline, busy, now, submit]);

  if (!match || match.id !== matchId) return <div className="page-container py-12">{error ? <><Notice>{error}</Notice><button className="secondary-button mt-5" onClick={() => matchId && void loadMatch(matchId)}>Reessayer</button><Link className="quiet-link ml-5" to="/dashboard">Retour au salon</Link></> : <Loading label="Chargement du plateau depuis Supabase..." />}</div>;
  const participant = match.player1_id === user?.id || match.player2_id === user?.id;
  if (!participant && !isAdmin) return <div className="page-container py-12"><Notice>Cette partie appartient a un autre compte.</Notice><Link to="/dashboard" className="primary-button">Retour au salon</Link></div>;
  const canPlay = participant && match.status === 'playing' && match.state.turn === seat && !busy;
  const remaining = Math.max(0, Math.ceil((Date.parse(match.deadline) - now) / 1000));
  const myRack = rackAfterDraft(match.state.racks[seat], canPlay || draft.length ? draft : []);
  const opponentRack = match.state.racks[1 - seat];
  const ownName = seat === 0 ? match.player1_name : match.player2_name;
  const otherName = seat === 0 ? match.player2_name : match.player1_name;
  const counts = getBagLetterCounts(match.state.bag);
  let preview = ''; try { if (draft.length) { const result = evaluateMove(match.state, draft); preview = `${result.word} / ${result.score} points a valider`; } } catch { preview = 'Placement en cours'; }
  const click = (row: number, col: number) => {
    if (!canPlay) return;
    if (draft.some(t => t.row === row && t.col === col)) { removeTile(row, col); setSelected(null); return; }
    if (selected === null || match.state.board[row][col]) return;
    if (myRack[selected] === '?') setBlank({ row, col, index: selected });
    else { placeTile(selected, row, col); setSelected(null); }
  };
  const finished = match.status !== 'playing';
  const won = match.winner_seat === seat;
  return <div className="game-page"><header className="game-header"><div className="flex items-center gap-3"><ScrabbleLogo size="sm" /><Link className="icon-button" aria-label="Retour au salon" to="/dashboard"><ArrowLeft size={18} /></Link></div><div className="game-mode"><span>{match.game_mode === 'ai' ? 'ENTRAINEMENT IA' : 'MATCH EN LIGNE'}</span><strong>{match.bet_amount ? `${formatNumber(match.bet_amount)} jetons par joueur` : 'Partie sans mise'}</strong></div><div className="game-clock"><Clock3 size={18} /><span>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span></div></header>
    <main className="game-container">
      {error && <Notice>{error}<button className="underline ml-3" onClick={() => void loadMatch(match.id)}>Actualiser</button></Notice>}
      {finished && <div className="game-result" role="status"><div><p className="section-eyebrow">PARTIE ENREGISTREE</p><h1>{match.status === 'abandoned' ? 'Fin par abandon' : match.winner_seat === null ? 'Match nul' : won ? 'Vous avez gagne' : 'Votre adversaire a gagne'}</h1><p>{match.state.scores[seat]} : {match.state.scores[1 - seat]} points{match.bet_amount && won ? ` / Gain net : ${formatNumber(match.winner_prize)} jetons` : ''}</p></div><Link className="primary-button" to="/dashboard">Retour au salon<ArrowLeft size={16} /></Link></div>}
      <div className="game-layout"><section className="game-board-section">
        <div className={`opponent-area ${match.state.turn !== seat && !finished ? 'turn-active' : ''}`}><div className="game-player-info"><strong>{otherName}</strong><span>{thinking ? 'Recherche d\'un coup...' : match.state.turn !== seat && !finished ? 'A son tour' : 'Adversaire'}</span><b>{match.state.scores[1 - seat]}<small>PTS</small></b></div><div className="opponent-rack">{opponentRack.map((letter, index) => <div className="opponent-tile-3d" key={`${index}-${letter}-${match.version}`}>{letter === '?' ? <Star size={15} /> : letter}<sub>{LETTER_VALUES[letter]}</sub></div>)}</div></div>
        <div className="board-controls"><div className="segmented-control"><button aria-pressed={is3D} className={is3D ? 'selected' : ''} onClick={() => setIs3D(true)}><Box size={15} />3D</button><button aria-pressed={!is3D} className={!is3D ? 'selected' : ''} onClick={() => setIs3D(false)}><Layers2 size={15} />2D</button></div><button className="quiet-link" onClick={() => setShowBag(!showBag)}>Sac : {match.state.bag.length} lettres</button><button className="icon-button" aria-label="Actualiser le plateau" onClick={() => void loadMatch(match.id)}><RefreshCw size={16} /></button></div>
        <div className={`board-stage ${is3D ? 'perspective-container' : ''}`}><div className={`board-wood-frame game-board-frame ${is3D ? 'board-3d' : 'board-3d-flat'}`}><div className="board-felt game-board-felt"><div className="scrabble-grid" aria-label="Plateau Scrabble 15 par 15">
          {match.state.board.map((row, r) => row.map((letter, c) => {
            const tile = draft.find(t => t.row === r && t.col === c); const value = tile?.letter || letter;
            const isNew = !!tile; const latest = match.state.last_tiles.some(t => t.row === r && t.col === c);
            const isBlank = tile?.blank || match.state.blanks.includes(`${r}:${c}`);
            const bonus = getBonusType(r, c); const center = r === 7 && c === 7;
            return <button key={`${r}-${c}`} type="button" aria-label={`Case ${String.fromCharCode(65 + c)}${r + 1}${value ? `, ${value}${isNew ? ', non validee' : ''}` : bonus ? `, ${bonus}` : ''}`} onClick={() => click(r, c)} disabled={!canPlay || (!!letter && !isNew)}
              className={`game-cell cell-3d ${value ? `letter-cell ${isNew ? 'draft-cell cell-3d-tile-placed' : latest ? 'latest-cell cell-3d-tile-ai' : 'cell-3d-tile'}` : `cell-3d-empty ${center ? 'cell-3d-center' : bonus ? `cell-3d-bonus-${bonus.toLowerCase()}` : 'normal-cell'}`} ${!value && selected !== null && canPlay ? 'place-target' : ''}`}>
              {value ? <><span>{value}</span><sub>{isBlank ? 0 : LETTER_VALUES[value]}</sub></> : center ? <Star className="center-star" size={16} /> : bonus ? <span className="bonus-text">{bonusLabels[bonus]}</span> : null}
            </button>;
          }))}
        </div></div></div></div>
        <div className={`own-player-area ${canPlay ? 'turn-active' : ''}`}><div className="game-player-info"><strong>{ownName}{participant ? ' (vous)' : ''}</strong><span>{busy ? 'Enregistrement...' : canPlay ? 'A vous de jouer' : finished ? 'Partie terminee' : 'En attente de l\'adversaire'}</span><b>{match.state.scores[seat]}<small>PTS</small></b></div>
          <div className="rack-3d own-rack">{myRack.map((letter, index) => <button key={`${index}-${letter}-${match.version}`} className={`rack-tile-3d ${selected === index ? 'rack-tile-3d-selected' : ''}`} onClick={() => setSelected(selected === index ? null : index)} aria-label={`Selectionner ${letter === '?' ? 'le joker' : letter}`} aria-pressed={selected === index} disabled={!canPlay}>{letter === '?' ? <Star size={23} /> : letter}<sub>{LETTER_VALUES[letter]}</sub></button>)}</div>
          <p className="rack-help" aria-live="polite">{preview || 'Selectionnez une lettre puis une case du plateau.'}</p>
          <div className="game-actions"><button className="primary-button" disabled={!canPlay || !draft.length} onClick={() => void submit('word')}>Valider le mot</button><button className="secondary-button" disabled={!canPlay} onClick={() => void submit('pass')}><RefreshCw size={15} />Passer et renouveler</button><button className="secondary-button compact" disabled={!canPlay || !draft.length} onClick={recall} aria-label="Rappeler les lettres"><RotateCcw size={17} /></button>{selected !== null && <button className="secondary-button compact" disabled={!canPlay || draft.length > 0 || !match.state.bag.length} onClick={() => void submit('exchange', selected)}><Shuffle size={15} />Echanger (-1 pt)</button>}</div>
          <p className="form-help text-center mt-4">Les points sont verifies par Supabase. Lexique integre : {lexiconCount} mots, sans certification ODS.</p>
        </div>
      </section><aside className="game-sidebar">
        {showBag && <section className="letter-bag"><div className="section-heading"><h2>Sac de lettres</h2><strong className="text-gold">{match.state.bag.length}</strong></div><p className="form-help mb-5">Nombre de lettres restantes dans le sac / distribution initiale.</p><div className="bag-letter-grid">{ALL_LETTERS.map(l => <div key={l} className={!counts[l] ? 'exhausted' : ''}><strong>{l === '?' ? 'Joker' : l}</strong><span>{counts[l] || 0}<small> / {LETTER_DISTRIBUTION[l]}</small></span></div>)}</div></section>}
        <section className="move-history"><div className="section-heading"><h2>Coups joues</h2><span className="text-xs text-white/40">{match.state.history.length}</span></div>{!match.state.history.length ? <Empty title="Le plateau est vierge">Le premier mot doit couvrir l'etoile centrale.</Empty> : <ol>{[...match.state.history].reverse().map((entry, index) => <li key={`${match.state.history.length - index}-${entry}`}><span>{match.state.history.length - index}</span>{entry}</li>)}</ol>}</section>
        <p className="form-help">Chevalets visibles pour les deux joueurs. Vous voyez uniquement les donnees enregistrees pour cette partie.</p>
        {participant && !finished && <button className="danger-button w-full" onClick={() => setShowAbandon(true)}><Flag size={16} />Abandonner la partie</button>}
      </aside></div>
    </main>
    <Modal open={showAbandon} title="Abandonner cette partie ?" onClose={() => setShowAbandon(false)}><p className="text-white/60 mb-6">Votre adversaire sera declare gagnant. {match.bet_amount ? 'Votre mise ne sera pas remboursee.' : 'Cette partie est sans mise.'}</p><div className="flex gap-3"><button className="secondary-button flex-1" onClick={() => setShowAbandon(false)}>Continuer a jouer</button><button className="danger-button flex-1" disabled={busy} onClick={() => void abandon().then(ok => { if (ok) setShowAbandon(false); })}>{busy ? 'Enregistrement...' : 'Confirmer l\'abandon'}</button></div></Modal>
    <Modal open={blank !== null} title="Quelle lettre pour le joker ?" onClose={() => setBlank(null)}><div className="joker-grid">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => <button key={l} className="secondary-button" onClick={() => { if (blank) placeTile(blank.index, blank.row, blank.col, l); setBlank(null); setSelected(null); }}>{l}</button>)}</div><p className="form-help mt-4">Le joker conserve une valeur de zero point.</p></Modal>
  </div>;
}