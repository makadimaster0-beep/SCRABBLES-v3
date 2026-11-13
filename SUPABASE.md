# Supabase ScrabbleBet

## Projet Configure

Le client utilise uniquement les variables de `.env` :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

La nouvelle cle `sb_publishable_` est une cle publique de navigateur. Aucun ancien projet, JWT anon de secours, compte de demonstration ou mot de passe admin partage n'est utilise.

## Installation A Effectuer Dans Supabase

Le fichier SQL integral est telechargeable directement sur `/supabase-schema.sql`. La page `/configuration#sql-complet` affiche aussi tout le code et permet de copier le fichier entier, sans le decouper en fragments.

1. Ouvrir le SQL Editor du projet configure.
2. Executer **tout** le fichier `supabase-schema.sql`.
3. Ajouter l'URL du site et les redirections `/login` et `/reset-password` dans Authentication > URL Configuration.
4. Creer un vrai compte. Avec la confirmation email activee, ouvrir le lien recu avant de se connecter.
5. Attribuer le role administrateur au compte voulu depuis le SQL Editor. La commande et l'emplacement de l'UUID Auth sont indiques a la fin du script.

Le schema utilise des tables `scrabble_*`. Il n'efface ni les tables `profiles` ou `notifications` deja presentes dans votre projet, ni leurs donnees. Les vrais utilisateurs Auth existants sont repris dans les nouveaux profils. Chaque nouveau wallet commence a zero. Les anciennes donnees de wallet d'autres applications ne sont pas importees ou converties automatiquement.

Le script peut etre relance sans supprimer les donnees du jeu. Il cree les politiques RLS, les droits limites par colonne, les fonctions serveur et les publications Realtime. La page `/configuration` permet de le telecharger, de le copier et de verifier l'installation.

**Etat verifie depuis cet environnement :** Auth repond avec la nouvelle cle publique. Les tables propres au jeu n'etaient pas installees au moment de l'integration. Le script n'a pas ete execute sur le projet distant : une cle publique n'a pas les privileges DDL necessaires.

## Donnees Et Regles

- Profils, annuaire, notifications, defis, messages, wallets et parties proviennent de Supabase. Aucune liste de joueurs ou statistique marketing n'est inventee.
- Les noms et statistiques utiles sont accessibles dans l'annuaire des joueurs connectes. Email, telephone et portefeuille restent accessibles uniquement au proprietaire et aux administrateurs autorises.
- Les messages sont reserves aux participants du defi. Aucun faux message d'adversaire n'est genere.
- Le delai de conversation, au moins 20 minutes, et la confirmation des deux joueurs sont verifies par le serveur.
- Les etats du plateau et les scores sont verifies par les fonctions SQL. Une version optimiste bloque les coups repetes. Les clients n'ont pas le droit de remplacer les scores ou de modifier un solde directement.
- Le lexique integre contient 180 mots francais. Il ne constitue pas un dictionnaire ODS sous licence. L'IA recherche des coups dans ce lexique, puis soumet ses coups au meme validateur serveur.
- Les parties IA sont sans mise. Les adversaires en ligne sont de vrais comptes; les chevalets sont visibles pour les deux joueurs selon le fonctionnement choisi pour cette application.
- Un passage renouvelle les lettres disponibles et passe la main. Un echange d'une lettre coute un point. Les jokers valent zero. Les six passes consecutives ou l'echeance mettent fin a la partie.
- Les mises sont desactivees par defaut. Si elles sont activees par un administrateur, les deux mises sont debitees atomiquement au demarrage, la commission est prelevee une seule fois sur le pot, puis le gain net est credite a la fin. Un defi annule avant le demarrage n'engage aucun fonds.
- Les taux de conversion sont des parametres de la plateforme, pas des cours de change en temps reel. USD et CDF utilisent une seule relation de conversion coherente.

## Paiements Externes

La creation d'une demande de depot ou retrait **n'envoie pas d'argent** et ne suffit pas a confirmer un paiement. Aucun prestataire Mobile Money ou bancaire n'est configure par ces seuls fichiers.

Le navigateur appelle `scrabble_request_payment`, qui cree une demande `pending`. Un retrait reserve les fonds disponibles dans une transaction SQL. Un depot ne credite rien avant confirmation externe.

Un backend ou une Edge Function doit verifier la signature et la reference du prestataire, rapprocher le montant et la devise avec la demande, puis appeler `scrabble_settle_payment` avec le role serveur. Une confirmation credite le depot une seule fois; un retrait refuse libere les fonds reserves. Les cles secretes et `service_role` ne doivent jamais etre placees dans une variable `VITE_*` ou envoyees au navigateur.

Les demandes de retrait administrateur sont aussi en attente. Le backend peut appeler `scrabble_settle_admin_withdrawal` apres verification du versement. Cette fonction est reservee au role serveur et traite chaque demande une seule fois.

Avant d'activer des mises reelles, verifier la conformite legale, les obligations liees a l'age, les paiements, l'anti-fraude, la taille du dictionnaire et les regles de competition souhaitees. Le plateau implemente les regles de placement et de points du lexique fourni, pas une certification de tournoi professionnel.

## Verification Locale

`npx tsc --noEmit`

`npm run build`

`node scripts/export-sql.mjs --check`

`node scripts/test-database.mjs`

`node scripts/test-browser.mjs` (avec Vite demarre sur le port 5173 et Chromium installe via Playwright)

Les tests SQL executent le schema dans une base PostgreSQL PGlite jetable, avec un schema Auth de test. Ils verifient les droits, les demandes de paiement, l'idempotence, la confidentialite du chat, le delai avant confirmation, les coups, les scores, l'abandon et les commissions. Aucun utilisateur ni argent de test n'est ajoute au projet distant.

Les tests navigateur utilisent une API de test branchee sur cette meme base jetable. Ils ne remplacent pas l'installation du schema et les essais de connexion sur votre projet Supabase reel.

## Fichier SQL Distribue

`supabase-schema.sql` a la racine est le script source complet. `public/supabase-schema.sql` est sa copie exacte, distribuee par le site et copiee dans `dist` par Vite. Apres une modification du SQL, executer `node scripts/export-sql.mjs` pour actualiser le fichier telechargeable. Le test SQL verifie que les deux fichiers sont identiques.