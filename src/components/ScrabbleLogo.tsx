import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { Modal, Notice } from './UI';

export default function ScrabbleLogo({ size = 'md', showText = true, className = '' }: { size?: 'sm' | 'md' | 'lg'; showText?: boolean; className?: string }) {
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const { user, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const click = () => {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { clicks.current = 0; }, 4000);
    if (clicks.current === 5) { clicks.current = 0; setOpen(true); }
  };
  return <>
    <motion.button type="button" aria-label="Logo ScrabbleBet" onClick={click} whileTap={{ scale: 0.96 }} className={`brand-logo ${className}`}>
      <span className={`brand-tile ${size}`} aria-hidden="true">S<sub>1</sub></span>
      {showText && <span className="brand-name">Scrabble<span>Bet</span><small>PRO</small></span>}
    </motion.button>
    <Modal open={open} title="Espace administrateur" onClose={() => setOpen(false)}>
      <ShieldCheck size={38} className="text-gold mb-4" />
      {isAdmin ? <><p className="text-white/60 mb-6">Votre compte Supabase dispose du role administrateur.</p><button className="primary-button w-full" onClick={() => { setOpen(false); navigate('/admin'); }}>Ouvrir l'administration</button></>
        : user ? <Notice>Ce compte ne dispose pas du role administrateur. Ce droit doit etre attribue depuis le SQL Editor Supabase.</Notice>
          : <><p className="text-white/60 mb-6">Connectez-vous avec un compte autorise dans Supabase. Aucun mot de passe de demonstration ne donne acces aux donnees.</p><button className="primary-button w-full" onClick={() => { setOpen(false); navigate('/login?next=admin'); }}>Connexion administrateur</button></>}
    </Modal>
  </>;
}