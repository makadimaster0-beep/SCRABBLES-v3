import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, MoveUpRight } from 'lucide-react';
import ScrabbleLogo from '../components/ScrabbleLogo';
import ConnectionStatus from '../components/ConnectionStatus';
import { useAuthStore } from '../store/authStore';

const letters = 'SCRABBLEBET'.split('');
const values: Record<string, number> = { S: 1, C: 3, R: 1, A: 1, B: 3, L: 1, E: 1, T: 1 };

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  return <div className="public-page">
    <header className="site-header"><ScrabbleLogo /><nav className="flex gap-3 items-center" aria-label="Navigation principale">
      <Link className="quiet-link hidden sm:inline-flex" to={isAuthenticated ? '/dashboard' : '/login'}>{isAuthenticated ? 'Mon espace' : 'Connexion'}</Link>
      <Link className="primary-button compact" to={isAuthenticated ? '/dashboard' : '/register'}>{isAuthenticated ? 'Rejoindre le salon' : 'Creer un compte'}<ArrowRight size={16} /></Link>
    </nav></header>
    <ConnectionStatus />
    <main>
      <section className="home-hero">
        <div className="hero-table-surface" aria-hidden="true" />
        <div className="relative z-10 text-center w-full">
          <h1 className="hero-brand" aria-label="ScrabbleBet">{letters.map((letter, index) => <motion.span key={index} className="hero-letter"
            initial={{ opacity: 0, y: 25, rotateX: -20 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: index * 0.055, duration: 0.5 }} aria-hidden="true">{letter}<sub>{values[letter]}</sub></motion.span>)}</h1>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.6 }}>
            <p className="hero-kicker">LE PLAISIR DU MOT JUSTE</p>
            <h2>Chaque lettre compte.</h2>
            <p className="hero-description">Retrouvez vos adversaires, lancez un defi et jouez sur un plateau en relief. Vos comptes et vos echanges sont relies a Supabase.</p>
            <div className="flex justify-center gap-4 flex-wrap mt-8">
              <Link className="primary-button" to={isAuthenticated ? '/dashboard' : '/register'}>Entrer dans le jeu<ArrowRight size={18} /></Link>
              <a className="secondary-button" href="#comment-jouer">Decouvrir le fonctionnement</a>
            </div>
          </motion.div>
        </div>
      </section>
      <section className="home-explainer" id="comment-jouer">
        <div><p className="section-eyebrow">VOTRE PROCHAINE PARTIE</p><h2>Un compte.<br />De vraies rencontres.</h2><p className="text-white/55 mt-5 max-w-sm">Aucun joueur invente, aucun score pre-rempli. Le salon affiche uniquement les comptes et les parties de votre base.</p></div>
        <div className="home-steps">{[
          ['01', 'Creez votre compte', 'Nom, telephone et email. Votre portefeuille est cree a zero, sans credit fictif.'],
          ['02', 'Invitez un adversaire', 'Un vrai defi, une notification et une conversation privee avant la confirmation des deux joueurs.'],
          ['03', 'Jouez a votre rythme', 'Plateau 3D, points calcules et lexique integre. L\'entrainement contre l\'IA ne comporte pas de mise.'],
        ].map(([number, title, description], index) => <motion.div key={number} initial={{ opacity: 0.8, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1 }}><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></motion.div>)}</div>
      </section>
      <div className="home-footer-cta"><p>Le prochain mot est a vous.</p><Link to={isAuthenticated ? '/dashboard' : '/register'}>Rejoindre le salon<MoveUpRight size={21} /></Link></div>
    </main>
    <footer className="site-footer"><span>ScrabbleBet Pro &copy; {new Date().getFullYear()}</span><Link to="/configuration">Configuration Supabase</Link><span>Les paiements externes necessitent un prestataire connecte.</span></footer>
  </div>;
}