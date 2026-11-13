import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react';

export function Notice({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div role={success ? 'status' : 'alert'} className={`notice ${success ? 'notice-success' : ''}`}>
    {success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<div>{children}</div>
  </div>;
}

export function Loading({ label = 'Chargement des donnees...' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-3 py-12 text-sm text-white/60" role="status"><LoaderCircle className="animate-spin" size={20} />{label}</div>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('input,button,textarea,select')?.focus(), 0);
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
      if (event.key !== 'Tab') return;
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]') || []);
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { window.clearTimeout(timer); document.body.style.overflow = oldOverflow; window.removeEventListener('keydown', handler); previous?.focus(); };
  }, [open]);
  return createPortal(<AnimatePresence>{open && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <motion.div ref={panel} role="dialog" aria-modal="true" aria-label={title} className="modal-panel" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>
      <div className="flex items-center justify-between gap-4 mb-6"><h2 className="text-xl font-semibold">{title}</h2><button className="icon-button" aria-label="Fermer" onClick={onClose}><X size={20} /></button></div>{children}
    </motion.div>
  </motion.div>}</AnimatePresence>, document.body);
}

export const formatNumber = (value: number) => new Intl.NumberFormat('fr-CD', { maximumFractionDigits: 2 }).format(value);
export const formatDate = (date: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
export const transactionLabels: Record<string, string> = { deposit: 'Depot', withdraw: 'Retrait', bet: 'Mise', win: 'Gain', refund: 'Remboursement', commission: 'Commission' };
export const statusLabels: Record<string, string> = { pending: 'En attente', completed: 'Confirme', rejected: 'Refuse', cancelled: 'Annule', accepted: 'Accepte', declined: 'Refuse', expired: 'Expire', playing: 'En cours', finished: 'Termine', abandoned: 'Abandonne' };