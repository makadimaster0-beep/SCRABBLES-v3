import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock3, Send } from 'lucide-react';
import { api, watchTables } from '../lib/api';
import { errorMessage } from '../lib/supabase';
import type { Challenge, ChatMessage, Player } from '../lib/types';
import { useAuthStore } from '../store/authStore';
import { Empty, formatDate, Loading, Modal, Notice } from './UI';

export default function ChallengeChat({ challenge, players, onClose, onUpdate }: { challenge: Challenge; players: Player[]; onClose: () => void; onUpdate: () => void }) {
  const user = useAuthStore(s => s.user)!;
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [text, setText] = useState(''); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [sending, setSending] = useState(false); const [loading, setLoading] = useState(true); const [now, setNow] = useState(Date.now());
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const load = () => { void api.messages(challenge.id).then(data => { if (active) { setMessages(data); setError(''); } }).catch(issue => { if (active) setError(errorMessage(issue)); }).finally(() => { if (active) setLoading(false); }); };
    load(); const unwatch = watchTables(['scrabble_chat_messages'], load, `challenge_id=eq.${challenge.id}`);
    return () => { active = false; unwatch(); };
  }, [challenge.id]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages.length]);
  useEffect(() => { if (challenge.status === 'playing' && challenge.match_id) navigate(`/game/${challenge.match_id}`); }, [challenge.status, challenge.match_id, navigate]);
  const remaining = challenge.ready_after ? Math.max(0, Math.ceil((Date.parse(challenge.ready_after) - now) / 1000)) : 0;
  const ready = challenge.from_user_id === user.id ? challenge.player1_ready : challenge.player2_ready;
  const active = ['accepted', 'playing'].includes(challenge.status);
  const otherId = challenge.from_user_id === user.id ? challenge.to_user_id : challenge.from_user_id;
  const otherName = players.find(p => p.id === otherId)?.username || 'Adversaire';
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (!text.trim() || sending || !active) return; setSending(true); setError('');
    try { const message = await api.sendMessage(challenge.id, user.id, text); setText(''); setMessages(previous => previous.some(m => m.id === message.id) ? previous : [...previous, message]); }
    catch (issue) { setError(errorMessage(issue)); } finally { setSending(false); }
  };
  const confirm = async () => {
    if (busy) return; setBusy(true); setError('');
    try { const result = await api.ready(challenge.id); onUpdate(); if (result.match_id) navigate(`/game/${result.match_id}`); }
    catch (issue) { setError(errorMessage(issue)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await api.respond(challenge.id, 'cancel'); onUpdate(); onClose(); }
    catch (issue) { setError(errorMessage(issue)); } finally { setBusy(false); }
  };
  return <Modal open title={`Conversation avec ${otherName}`} onClose={onClose}>
    <div className="chat-info"><Clock3 size={17} /><span>{remaining ? `Confirmation disponible dans ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'La phase de conversation est terminee.'}</span></div>
    <p className="form-help mb-4">Messages prives enregistres dans Supabase. La partie commence seulement apres confirmation des deux joueurs.</p>
    {error && <Notice>{error}</Notice>}
    <div className="chat-messages" aria-live="polite">{loading ? <Loading /> : !messages.length ? <Empty title="La conversation est ouverte">Envoyez le premier message a votre adversaire.</Empty> : messages.map(message => <div key={message.id} className={`chat-message ${message.user_id === user.id ? 'mine' : ''}`}><strong>{message.user_id === user.id ? 'Vous' : otherName}</strong><p>{message.message}</p><small>{formatDate(message.created_at)}</small></div>)}<div ref={end} /></div>
    {active ? <form onSubmit={send} className="chat-compose"><label className="sr-only" htmlFor="chat-message">Votre message</label><input id="chat-message" maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder="Ecrivez votre message..." /><button className="primary-button compact" disabled={sending || !text.trim()} aria-label="Envoyer le message"><Send size={17} /></button></form> : <Notice>Ce defi n'est plus actif. La conversation est en lecture seule.</Notice>}
    {challenge.status === 'accepted' && <div className="chat-confirm"><button className="primary-button w-full" disabled={remaining > 0 || busy || ready} onClick={() => void confirm()}>{ready ? 'Vous etes pret. En attente de l\'adversaire.' : busy ? 'Confirmation...' : 'Oui, je suis pret a jouer'}</button><button className="quiet-link text-red-300" disabled={busy} onClick={() => void cancel()}>Non, annuler le defi</button></div>}
  </Modal>;
}