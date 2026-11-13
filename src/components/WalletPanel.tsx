import { useRef, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, Clock3 } from 'lucide-react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import type { Currency, Transaction } from '../lib/types';
import { Empty, formatDate, formatNumber, Notice, statusLabels, transactionLabels } from './UI';

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  return transactions.length ? <div className="transaction-list">{transactions.map(tx => <div key={tx.id} className="transaction-row">
    <span className="transaction-icon">{['deposit', 'win', 'refund', 'commission'].includes(tx.type) ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}</span>
    <div className="min-w-0 flex-1"><h4>{transactionLabels[tx.type]} <span className={`status-label ${tx.status}`}>{statusLabels[tx.status]}</span></h4><p>{tx.description}</p><small>{formatDate(tx.created_at)}{tx.method ? ` / ${tx.method}` : ''}</small></div>
    <div className="transaction-amount"><strong>{formatNumber(tx.amount)} {tx.currency === 'USD' ? '$' : tx.currency === 'CDF' ? 'CDF' : 'jetons'}</strong>{tx.currency !== 'coins' && <small>{formatNumber(tx.amount_coins)} jetons</small>}</div>
  </div>)}</div> : <Empty title="Aucune transaction">Vos operations apparaitront ici apres leur enregistrement dans Supabase.</Empty>;
}

export default function WalletPanel() {
  const { user, wallet, settings, transactions, refreshAccount } = useAuthStore();
  const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');
  const [currency, setCurrency] = useState<Currency>('USD'); const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('M-Pesa'); const [phone, setPhone] = useState(user?.phone || '');
  const [step, setStep] = useState<'form' | 'confirm' | 'sent'>('form');
  const [error, setError] = useState(''); const [result, setResult] = useState<Transaction | null>(null); const [busy, setBusy] = useState(false);
  const requestId = useRef(crypto.randomUUID()); const submitting = useRef(false);
  if (!wallet || !settings || !user) return <Notice>Le portefeuille ne peut pas etre charge. Aucune valeur de remplacement n'est affichee.</Notice>;
  const ratio = settings.coins_per_usd / (currency === 'CDF' ? settings.usd_to_cdf : 1);
  const value = Number(amount); const coins = action === 'deposit' ? Math.floor(value * ratio) : Math.ceil(value * ratio);
  const validate = () => {
    if (!Number.isFinite(value) || value <= 0 || value > 100000000 || !Number.isInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001 || coins < 1) return 'Montant invalide. Utilisez au maximum deux decimales.';
    if (!/^\+[1-9][0-9]{8,14}$/.test(phone.replace(/[\s()-]/g, ''))) return 'Un telephone international valide est requis.';
    if (action === 'withdraw' && coins > wallet.coins) return 'Votre solde disponible est insuffisant.';
    return '';
  };
  const send = async () => {
    if (submitting.current) return;
    const invalid = validate(); if (invalid) { setError(invalid); return; }
    submitting.current = true; setBusy(true); setError('');
    try {
      const tx = await api.payment(action, value, currency, method, phone.replace(/[\s()-]/g, ''), requestId.current);
      setResult(tx); setStep('sent'); await refreshAccount();
    } catch (issue) { setError(errorMessage(issue)); }
    finally { submitting.current = false; setBusy(false); }
  };
  const next = (event: FormEvent) => {
    event.preventDefault(); const invalid = validate(); setError(invalid);
    if (!invalid) { requestId.current = crypto.randomUUID(); setStep('confirm'); }
  };
  return <div className="wallet-layout">
    <div><p className="section-eyebrow">VOTRE PORTEFEUILLE</p><h2 className="balance-figure">{formatNumber(wallet.coins)}<span>jetons disponibles</span></h2>
      <div className="balance-currencies"><span>{formatNumber(wallet.coins / settings.coins_per_usd)} $ USD</span><span>{formatNumber(wallet.coins / settings.coins_per_usd * settings.usd_to_cdf)} CDF</span></div>
      <p className="text-sm text-white/45 mt-4">Fonds reserves pour les retraits : {formatNumber(wallet.reserved_coins)} jetons.</p>
      <dl className="wallet-totals"><div><dt>Depots confirmes</dt><dd>{formatNumber(wallet.total_deposit_usd)} $ / {formatNumber(wallet.total_deposit_cdf)} CDF</dd></div><div><dt>Retraits confirmes</dt><dd>{formatNumber(wallet.total_withdraw_usd)} $ / {formatNumber(wallet.total_withdraw_cdf)} CDF</dd></div></dl>
      <p className="text-xs text-white/40 mt-5">Taux configure : 1 $ = {formatNumber(settings.usd_to_cdf)} CDF = {formatNumber(settings.coins_per_usd)} jetons. Il ne s'agit pas d'un cours de change en temps reel.</p>
    </div>
    <section className="interaction-panel"><div className="segmented-control mb-6"><button className={action === 'deposit' ? 'selected' : ''} onClick={() => { setAction('deposit'); setStep('form'); setError(''); }}>Deposer</button><button className={action === 'withdraw' ? 'selected' : ''} onClick={() => { setAction('withdraw'); setStep('form'); setError(''); }}>Retirer</button></div>
      {error && <Notice>{error}</Notice>}
      {step === 'form' && <form className="space-y-5" onSubmit={next}>
        <div className="grid grid-cols-2 gap-4"><label className="field">Devise<select value={currency} onChange={e => setCurrency(e.target.value as Currency)}><option value="USD">USD ($)</option><option value="CDF">CDF (Franc congolais)</option></select></label><label className="field">Montant<input type="number" step="0.01" min="0.01" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></label></div>
        <label className="field">Methode souhaitee<select value={method} onChange={e => setMethod(e.target.value)}>{['M-Pesa', 'Airtel Money', 'Orange Money', 'Virement bancaire'].map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="field">Telephone du titulaire<input type="tel" autoComplete="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+243..." /></label>
        {value > 0 && Number.isFinite(coins) && <p className="text-sm text-gold">{formatNumber(coins)} jetons {action === 'deposit' ? 'apres validation du depot' : 'seront reserves'}</p>}
        <p className="form-help">Cette demande sera enregistree dans Supabase. Elle n'effectue pas de transfert Mobile Money ou bancaire et n'est pas une confirmation de paiement.</p>
        <button className="primary-button w-full">Verifier ma demande</button>
      </form>}
      {step === 'confirm' && <div className="space-y-5"><h3 className="text-lg font-semibold">Confirmer la demande</h3><dl className="confirmation-details"><div><dt>Operation</dt><dd>{action === 'deposit' ? 'Depot' : 'Retrait'}</dd></div><div><dt>Montant</dt><dd>{formatNumber(value)} {currency}</dd></div><div><dt>Equivalent</dt><dd>{formatNumber(coins)} jetons</dd></div><div><dt>Methode</dt><dd>{method}</dd></div><div><dt>Telephone</dt><dd>{phone}</dd></div></dl>
        <p className="form-help">{action === 'deposit' ? 'Votre solde ne sera credite qu\'apres verification du paiement par le serveur.' : 'Ces jetons seront reserves. Le versement doit etre traite par le prestataire.'}</p>
        <div className="flex gap-3"><button className="secondary-button flex-1" onClick={() => setStep('form')} disabled={busy}>Modifier</button><button className="primary-button flex-1" disabled={busy} onClick={() => void send()}>{busy ? 'Enregistrement...' : 'Envoyer la demande'}</button></div>
      </div>}
      {step === 'sent' && result && <div className="space-y-5"><Clock3 size={36} className="text-gold" /><h3 className="text-xl font-semibold">Demande enregistree</h3><p className="text-sm text-white/60">Statut : {statusLabels[result.status]}. Aucun versement externe n'est confirme. Retrouvez le suivi dans votre historique.</p><p className="text-xs text-white/40 break-all">Reference : {result.id}</p><button className="secondary-button w-full" onClick={() => { setStep('form'); setAmount(''); setResult(null); requestId.current = crypto.randomUUID(); }}>Nouvelle demande</button></div>}
    </section>
    <section className="wallet-history"><div className="section-heading"><h3>Historique des operations</h3><button className="quiet-link" onClick={() => void refreshAccount()}>Actualiser</button></div><TransactionList transactions={transactions} /></section>
  </div>;
}