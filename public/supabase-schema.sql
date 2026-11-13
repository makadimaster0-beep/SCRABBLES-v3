-- SCRABBLEBET - Installation non destructive, sans joueurs ni soldes fictifs.
-- Projet: https://mjuihmjylghkbzgvbpqx.supabase.co
-- Executer dans Supabase > SQL Editor avec le role postgres.
-- Les tables scrabble_* n'alterent pas vos tables profiles/notifications existantes.
-- La cle publique du navigateur ne permet PAS d'executer ce script.
BEGIN;

CREATE SCHEMA IF NOT EXISTS scrabble_private;
REVOKE ALL ON SCHEMA scrabble_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS scrabble_private.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.scrabble_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_percent numeric(5,2) NOT NULL DEFAULT 3 CHECK (commission_percent BETWEEN 0 AND 20),
  game_timer_minutes integer NOT NULL DEFAULT 20 CHECK (game_timer_minutes BETWEEN 5 AND 120),
  chat_timer_minutes integer NOT NULL DEFAULT 20 CHECK (chat_timer_minutes BETWEEN 20 AND 120),
  min_bet integer NOT NULL DEFAULT 50 CHECK (min_bet >= 1),
  max_bet integer NOT NULL DEFAULT 10000 CHECK (max_bet >= min_bet),
  coins_per_usd numeric NOT NULL DEFAULT 1000 CHECK (coins_per_usd > 0),
  usd_to_cdf numeric NOT NULL DEFAULT 2800 CHECK (usd_to_cdf > 0),
  paid_matches_enabled boolean NOT NULL DEFAULT false,
  ia_enabled boolean NOT NULL DEFAULT true
);
INSERT INTO public.scrabble_settings(id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.scrabble_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL CHECK (char_length(username) BETWEEN 2 AND 80),
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  total_games integer NOT NULL DEFAULT 0,
  best_score integer NOT NULL DEFAULT 0,
  total_points_scored integer NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  is_online boolean NOT NULL DEFAULT false,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scrabble_wallets (
  user_id uuid PRIMARY KEY REFERENCES public.scrabble_profiles(id) ON DELETE CASCADE,
  coins bigint NOT NULL DEFAULT 0 CHECK (coins >= 0),
  reserved_coins bigint NOT NULL DEFAULT 0 CHECK (reserved_coins >= 0),
  total_deposit_usd numeric(18,2) NOT NULL DEFAULT 0,
  total_deposit_cdf numeric(18,2) NOT NULL DEFAULT 0,
  total_withdraw_usd numeric(18,2) NOT NULL DEFAULT 0,
  total_withdraw_cdf numeric(18,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.scrabble_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid NOT NULL REFERENCES public.scrabble_profiles(id),
  player2_id uuid REFERENCES public.scrabble_profiles(id),
  player1_name text NOT NULL,
  player2_name text NOT NULL,
  game_mode text NOT NULL CHECK (game_mode IN ('ai','online')),
  ai_difficulty text CHECK (ai_difficulty IN ('simple','normal','difficile','dur','expert')),
  status text NOT NULL DEFAULT 'playing' CHECK (status IN ('playing','finished','abandoned','cancelled')),
  bet_amount integer NOT NULL DEFAULT 0 CHECK (bet_amount >= 0),
  commission_amount integer NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  winner_prize integer NOT NULL DEFAULT 0 CHECK (winner_prize >= 0),
  winner_seat integer CHECK (winner_seat IN (0,1)),
  state jsonb NOT NULL,
  version integer NOT NULL DEFAULT 0,
  deadline timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK (player2_id IS NULL OR player1_id <> player2_id),
  CHECK ((game_mode = 'ai' AND player2_id IS NULL AND bet_amount = 0) OR
         (game_mode = 'online' AND player2_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.scrabble_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES public.scrabble_profiles(id),
  to_user_id uuid NOT NULL REFERENCES public.scrabble_profiles(id),
  bet_amount integer NOT NULL DEFAULT 0 CHECK (bet_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired','playing','finished')),
  match_id uuid REFERENCES public.scrabble_matches(id),
  chat_started_at timestamptz,
  ready_after timestamptz,
  player1_ready boolean NOT NULL DEFAULT false,
  player2_ready boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS scrabble_one_active_challenge
  ON public.scrabble_challenges(least(from_user_id,to_user_id),greatest(from_user_id,to_user_id))
  WHERE status IN ('pending','accepted','playing');

CREATE TABLE IF NOT EXISTS public.scrabble_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.scrabble_challenges(id),
  user_id uuid NOT NULL REFERENCES public.scrabble_profiles(id),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scrabble_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.scrabble_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL CHECK (type IN ('challenge','match','wallet','system')),
  is_read boolean NOT NULL DEFAULT false,
  related_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scrabble_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.scrabble_profiles(id),
  type text NOT NULL CHECK (type IN ('deposit','withdraw','bet','win','refund','commission')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('USD','CDF','coins')),
  amount_coins bigint NOT NULL CHECK (amount_coins > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','rejected','cancelled')),
  method text,
  phone text,
  description text NOT NULL,
  match_id uuid REFERENCES public.scrabble_matches(id),
  client_request_id uuid,
  provider_reference text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, client_request_id)
);

CREATE TABLE IF NOT EXISTS public.scrabble_admin_wallet (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  coins bigint NOT NULL DEFAULT 0 CHECK (coins >= 0),
  reserved_coins bigint NOT NULL DEFAULT 0 CHECK (reserved_coins >= 0),
  total_commissions bigint NOT NULL DEFAULT 0
);
INSERT INTO public.scrabble_admin_wallet(id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.scrabble_admin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('commission','withdraw')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('USD','CDF','coins')),
  amount_coins bigint NOT NULL CHECK (amount_coins > 0),
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','completed','rejected')),
  match_id uuid UNIQUE REFERENCES public.scrabble_matches(id),
  actor_id uuid REFERENCES auth.users(id),
  client_request_id uuid UNIQUE,
  provider_reference text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scrabble_admin_transactions ADD COLUMN IF NOT EXISTS provider_reference text UNIQUE;

CREATE TABLE IF NOT EXISTS public.scrabble_dictionary (
  word text PRIMARY KEY CHECK (word ~ '^[A-Z]{2,15}$')
);
INSERT INTO public.scrabble_dictionary(word) VALUES
  ('ACTE'),
  ('ADORE'),
  ('AGE'),
  ('AI'),
  ('AIDE'),
  ('AIME'),
  ('AIR'),
  ('AMI'),
  ('AMITIE'),
  ('AN'),
  ('ANGE'),
  ('ARBRE'),
  ('AS'),
  ('AU'),
  ('AVENIR'),
  ('AVOIR'),
  ('BAS'),
  ('BATEAU'),
  ('BEAU'),
  ('BEAUTE'),
  ('BEL'),
  ('BIEN'),
  ('BLE'),
  ('BLEU'),
  ('BOIS'),
  ('BON'),
  ('BONHEUR'),
  ('BORD'),
  ('CALME'),
  ('CE'),
  ('CHANCE'),
  ('CHAT'),
  ('CHER'),
  ('CIEL'),
  ('CLE'),
  ('COEUR'),
  ('COURAGE'),
  ('CULTURE'),
  ('DAME'),
  ('DE'),
  ('DES'),
  ('DESTIN'),
  ('DEUX'),
  ('DIRE'),
  ('DOUX'),
  ('DU'),
  ('EAU'),
  ('EN'),
  ('ENFANT'),
  ('ESPRIT'),
  ('EST'),
  ('ET'),
  ('ETOILE'),
  ('EXACT'),
  ('FAIRE'),
  ('FAMILLE'),
  ('FEMME'),
  ('FETE'),
  ('FEU'),
  ('FILLE'),
  ('FIN'),
  ('FLAMME'),
  ('FLEUR'),
  ('FOND'),
  ('GAGNER'),
  ('GOUT'),
  ('GRAND'),
  ('GRIS'),
  ('HAUT'),
  ('HISTOIRE'),
  ('HOMME'),
  ('HONNEUR'),
  ('IDEE'),
  ('IL'),
  ('ILE'),
  ('JARDIN'),
  ('JE'),
  ('JEU'),
  ('JEUNE'),
  ('JOIE'),
  ('JOUR'),
  ('JUSTE'),
  ('JUSTICE'),
  ('LA'),
  ('LARGE'),
  ('LE'),
  ('LES'),
  ('LETTRE'),
  ('LIBERTE'),
  ('LIBRE'),
  ('LUMIERE'),
  ('LUNE'),
  ('LUXE'),
  ('MA'),
  ('MAIN'),
  ('MAISON'),
  ('MAL'),
  ('ME'),
  ('MEMOIRE'),
  ('MERCI'),
  ('MIEL'),
  ('MIRACLE'),
  ('MONDE'),
  ('MORAL'),
  ('MOT'),
  ('NATURE'),
  ('NE'),
  ('NI'),
  ('NOIR'),
  ('NON'),
  ('NOS'),
  ('NUIT'),
  ('ON'),
  ('OR'),
  ('OS'),
  ('OU'),
  ('OUI'),
  ('PAIN'),
  ('PAIX'),
  ('PAR'),
  ('PAROLE'),
  ('PARTIE'),
  ('PAS'),
  ('PASSION'),
  ('PERDRE'),
  ('PEU'),
  ('PEUR'),
  ('PLACE'),
  ('PLAGE'),
  ('PLEIN'),
  ('PLUME'),
  ('POINT'),
  ('POINTS'),
  ('PONT'),
  ('PORTE'),
  ('PRE'),
  ('PRIME'),
  ('QUE'),
  ('RAISON'),
  ('REGARD'),
  ('REGLE'),
  ('REPOS'),
  ('RESPECT'),
  ('RESTE'),
  ('RIRE'),
  ('ROBE'),
  ('ROSE'),
  ('ROUGE'),
  ('ROUTE'),
  ('ROYAL'),
  ('RUE'),
  ('SA'),
  ('SAGE'),
  ('SAGESSE'),
  ('SANG'),
  ('SCENE'),
  ('SE'),
  ('SI'),
  ('SILENCE'),
  ('SOIR'),
  ('SOLEIL'),
  ('SUR'),
  ('TA'),
  ('TABLE'),
  ('TE'),
  ('TEMPS'),
  ('TERRE'),
  ('THE'),
  ('TITRE'),
  ('TU'),
  ('UN'),
  ('UNE'),
  ('VENT'),
  ('VICTOIRE'),
  ('VIE'),
  ('VOS'),
  ('VOYAGE'),
  ('VRAI'),
  ('ZERO'),
  ('ZONE')
ON CONFLICT (word) DO NOTHING;

CREATE INDEX IF NOT EXISTS scrabble_challenges_from ON public.scrabble_challenges(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scrabble_challenges_to ON public.scrabble_challenges(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scrabble_messages_context ON public.scrabble_chat_messages(challenge_id, created_at);
CREATE INDEX IF NOT EXISTS scrabble_notifications_owner ON public.scrabble_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scrabble_transactions_owner ON public.scrabble_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scrabble_matches_p1 ON public.scrabble_matches(player1_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scrabble_matches_p2 ON public.scrabble_matches(player2_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.scrabble_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM scrabble_private.admins a JOIN public.scrabble_profiles p ON p.id=a.user_id
    WHERE a.user_id = (SELECT auth.uid()) AND NOT p.is_blocked);
$$;

CREATE OR REPLACE FUNCTION scrabble_private.active_user()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scrabble_profiles WHERE id = uid AND NOT is_blocked) THEN
    RAISE EXCEPTION 'Profil absent ou compte bloque.';
  END IF;
  RETURN uid;
END; $$;

-- Aucun compte de demonstration, bonus, mot de passe admin ou fonds factices.
CREATE OR REPLACE FUNCTION scrabble_private.on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.scrabble_profiles(id,username,email,phone)
  VALUES (NEW.id,
    left(coalesce(nullif(btrim(NEW.raw_user_meta_data->>'full_name'),''),
      nullif(btrim(NEW.raw_user_meta_data->>'username'),''),'Joueur-' || left(NEW.id::text,8)),80),
    coalesce(NEW.email,''), coalesce(NEW.raw_user_meta_data->>'phone',''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.scrabble_wallets(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS scrabble_on_signup ON auth.users;
CREATE TRIGGER scrabble_on_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION scrabble_private.on_signup();

-- Reprendre uniquement les vrais utilisateurs Auth existants, sans toucher a leurs autres donnees.
INSERT INTO public.scrabble_profiles(id,username,email,phone)
SELECT id,left(coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(raw_user_meta_data->>'username',''),
  'Joueur-' || left(id::text,8)),80),coalesce(email,''),coalesce(raw_user_meta_data->>'phone','')
FROM auth.users ON CONFLICT (id) DO NOTHING;
INSERT INTO public.scrabble_wallets(user_id) SELECT id FROM public.scrabble_profiles ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.scrabble_health()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('version',1,'lexicon_words',(SELECT count(*) FROM public.scrabble_dictionary));
$$;

CREATE OR REPLACE FUNCTION public.scrabble_list_players()
RETURNS TABLE(id uuid,username text,wins integer,losses integer,total_games integer,best_score integer,is_online boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM scrabble_private.active_user();
  RETURN QUERY SELECT p.id,p.username,p.wins,p.losses,p.total_games,p.best_score,
    p.is_online AND p.last_seen > now() - interval '90 seconds'
    FROM public.scrabble_profiles p WHERE NOT p.is_blocked ORDER BY p.wins DESC,p.created_at;
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_heartbeat(p_online boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.scrabble_profiles SET is_online = p_online,last_seen = now()
  WHERE id = auth.uid() AND NOT is_blocked;
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_request_payment(
  p_type text,p_amount numeric,p_currency text,p_method text,p_phone text,p_request_id uuid)
RETURNS public.scrabble_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := scrabble_private.active_user(); cfg public.scrabble_settings; tx public.scrabble_transactions; n bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text || p_request_id::text,0));
  SELECT * INTO tx FROM public.scrabble_transactions WHERE user_id = uid AND client_request_id = p_request_id;
  IF FOUND THEN RETURN tx; END IF;
  IF p_type NOT IN ('deposit','withdraw') OR p_currency NOT IN ('USD','CDF') OR
     p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 OR p_amount::text IN ('NaN','Infinity','-Infinity') OR
     p_amount <> round(p_amount,2) OR p_request_id IS NULL THEN RAISE EXCEPTION 'Montant ou devise invalide.'; END IF;
  IF p_method IS NULL OR p_method NOT IN ('M-Pesa','Airtel Money','Orange Money','Virement bancaire') OR
     p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{8,14}$' THEN RAISE EXCEPTION 'Methode ou telephone invalide.'; END IF;
  SELECT * INTO STRICT cfg FROM public.scrabble_settings WHERE id = 1;
  n := CASE WHEN p_type = 'deposit' THEN floor(p_amount * cfg.coins_per_usd / CASE WHEN p_currency = 'CDF' THEN cfg.usd_to_cdf ELSE 1 END)
            ELSE ceil(p_amount * cfg.coins_per_usd / CASE WHEN p_currency = 'CDF' THEN cfg.usd_to_cdf ELSE 1 END) END;
  IF n < 1 THEN RAISE EXCEPTION 'Montant trop faible pour un jeton.'; END IF;
  IF p_type = 'withdraw' THEN
    UPDATE public.scrabble_wallets SET coins = coins - n,reserved_coins = reserved_coins + n WHERE user_id = uid AND coins >= n;
    IF NOT FOUND THEN RAISE EXCEPTION 'Solde disponible insuffisant.'; END IF;
  END IF;
  INSERT INTO public.scrabble_transactions(user_id,type,amount,currency,amount_coins,status,method,phone,description,client_request_id)
  VALUES (uid,p_type,p_amount,p_currency,n,'pending',p_method,p_phone,
    CASE WHEN p_type = 'deposit' THEN 'Depot en attente de verification du paiement' ELSE 'Retrait en attente de traitement' END,p_request_id)
  RETURNING * INTO tx;
  INSERT INTO public.scrabble_notifications(user_id,title,message,type,related_id)
  VALUES(uid,'Demande enregistree','Votre demande est en attente de verification. Aucun versement externe n''est confirme.','wallet',tx.id);
  RETURN tx;
END; $$;

-- Exclusivement pour un backend qui a verifie la signature du prestataire.
-- Ne JAMAIS appeler avec une cle service_role depuis le navigateur.
CREATE OR REPLACE FUNCTION public.scrabble_settle_payment(p_id uuid,p_success boolean,p_provider_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tx public.scrabble_transactions;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Backend de paiement requis.'; END IF;
  IF nullif(btrim(p_provider_reference),'') IS NULL THEN RAISE EXCEPTION 'Reference prestataire requise.'; END IF;
  SELECT * INTO STRICT tx FROM public.scrabble_transactions WHERE id = p_id FOR UPDATE;
  IF tx.status <> 'pending' THEN RETURN; END IF;
  IF tx.type = 'deposit' AND p_success THEN
    UPDATE public.scrabble_wallets SET coins = coins + tx.amount_coins,
      total_deposit_usd = total_deposit_usd + CASE WHEN tx.currency = 'USD' THEN tx.amount ELSE 0 END,
      total_deposit_cdf = total_deposit_cdf + CASE WHEN tx.currency = 'CDF' THEN tx.amount ELSE 0 END WHERE user_id = tx.user_id;
  ELSIF tx.type = 'withdraw' THEN
    UPDATE public.scrabble_wallets SET reserved_coins = reserved_coins - tx.amount_coins,
      coins = coins + CASE WHEN p_success THEN 0 ELSE tx.amount_coins END,
      total_withdraw_usd = total_withdraw_usd + CASE WHEN p_success AND tx.currency = 'USD' THEN tx.amount ELSE 0 END,
      total_withdraw_cdf = total_withdraw_cdf + CASE WHEN p_success AND tx.currency = 'CDF' THEN tx.amount ELSE 0 END WHERE user_id = tx.user_id;
  ELSIF tx.type <> 'deposit' THEN RAISE EXCEPTION 'Type non traitable.';
  END IF;
  UPDATE public.scrabble_transactions SET status = CASE WHEN p_success THEN 'completed' ELSE 'rejected' END,
    provider_reference = p_provider_reference WHERE id = p_id;
  INSERT INTO public.scrabble_notifications(user_id,title,message,type,related_id)
  VALUES(tx.user_id,'Paiement mis a jour',CASE WHEN p_success THEN 'Paiement confirme par le prestataire.' ELSE 'Paiement refuse. Les fonds reserves sont liberes.' END,'wallet',p_id);
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_create_challenge(p_opponent uuid,p_bet integer DEFAULT 0)
RETURNS public.scrabble_challenges LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := scrabble_private.active_user(); cfg public.scrabble_settings; c public.scrabble_challenges;
BEGIN
  SELECT * INTO STRICT cfg FROM public.scrabble_settings WHERE id = 1;
  IF p_opponent = uid OR NOT EXISTS (SELECT 1 FROM public.scrabble_profiles WHERE id = p_opponent AND NOT is_blocked) THEN
    RAISE EXCEPTION 'Adversaire invalide.'; END IF;
  IF p_bet IS NULL OR p_bet < 0 OR (p_bet > 0 AND (NOT cfg.paid_matches_enabled OR p_bet < cfg.min_bet OR p_bet > cfg.max_bet)) THEN
    RAISE EXCEPTION 'Mise non autorisee. Choisissez une partie gratuite ou verifiez les limites.'; END IF;
  UPDATE public.scrabble_challenges SET status = 'expired' WHERE status = 'pending' AND expires_at <= now()
    AND (from_user_id = uid OR to_user_id = uid);
  INSERT INTO public.scrabble_challenges(from_user_id,to_user_id,bet_amount) VALUES(uid,p_opponent,p_bet) RETURNING * INTO c;
  INSERT INTO public.scrabble_notifications(user_id,title,message,type,related_id)
  SELECT p_opponent,'Nouveau defi',username || ' vous invite a une partie.','challenge',c.id FROM public.scrabble_profiles WHERE id = uid;
  RETURN c;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Un defi actif existe deja entre ces joueurs.';
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_respond_challenge(p_id uuid,p_action text)
RETURNS public.scrabble_challenges LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := scrabble_private.active_user(); c public.scrabble_challenges; mins integer;
BEGIN
  SELECT * INTO STRICT c FROM public.scrabble_challenges WHERE id = p_id FOR UPDATE;
  IF uid NOT IN (c.from_user_id,c.to_user_id) THEN RAISE EXCEPTION 'Acces refuse.'; END IF;
  IF p_action = 'cancel' AND c.status IN ('pending','accepted') THEN
    c.status := 'cancelled';
  ELSIF c.status = 'pending' AND uid = c.to_user_id AND c.expires_at > now() AND p_action IN ('accept','decline') THEN
    IF p_action = 'accept' THEN
      SELECT chat_timer_minutes INTO mins FROM public.scrabble_settings WHERE id = 1;
      c.status := 'accepted'; c.chat_started_at := now(); c.ready_after := now() + make_interval(mins => greatest(20,mins));
    ELSE c.status := 'declined'; END IF;
  ELSE RAISE EXCEPTION 'Action impossible ou defi expire.'; END IF;
  UPDATE public.scrabble_challenges SET status = c.status,chat_started_at = c.chat_started_at,ready_after = c.ready_after WHERE id = p_id;
  INSERT INTO public.scrabble_notifications(user_id,title,message,type,related_id)
  VALUES(CASE WHEN uid = c.from_user_id THEN c.to_user_id ELSE c.from_user_id END,'Defi mis a jour',
    CASE c.status WHEN 'accepted' THEN 'Defi accepte. La conversation pre-match est ouverte.'
      WHEN 'declined' THEN 'Votre defi a ete refuse.' ELSE 'Le defi a ete annule.' END,'challenge',p_id);
  RETURN c;
END; $$;

CREATE OR REPLACE FUNCTION scrabble_private.new_board()
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE bag text[]; letters text[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','?'];
counts integer[] := ARRAY[9,2,2,3,15,2,2,2,8,1,1,5,3,6,6,2,1,6,6,6,6,2,1,1,1,1,2]; board jsonb;
BEGIN
  SELECT array_agg(letters[i] ORDER BY random()) INTO bag FROM generate_series(1,27) i CROSS JOIN LATERAL generate_series(1,counts[i]) n;
  SELECT jsonb_agg(row_value) INTO board FROM (SELECT (SELECT jsonb_agg(''::text) FROM generate_series(1,15)) AS row_value FROM generate_series(1,15)) r;
  RETURN jsonb_build_object('board',board,'blanks','[]'::jsonb,'racks',jsonb_build_array(to_jsonb(bag[1:7]),to_jsonb(bag[8:14])),
    'bag',to_jsonb(bag[15:]),'scores',jsonb_build_array(0,0),'turn',0,'passes',0,'history','[]'::jsonb,'last_tiles','[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_start_ai(p_difficulty text)
RETURNS public.scrabble_matches LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := scrabble_private.active_user(); m public.scrabble_matches; cfg public.scrabble_settings;
BEGIN
  SELECT * INTO STRICT cfg FROM public.scrabble_settings WHERE id = 1;
  IF NOT cfg.ia_enabled OR p_difficulty NOT IN ('simple','normal','difficile','dur','expert') THEN RAISE EXCEPTION 'Niveau IA indisponible.'; END IF;
  INSERT INTO public.scrabble_matches(player1_id,player1_name,player2_name,game_mode,ai_difficulty,state,deadline)
  SELECT uid,username,'IA (' || p_difficulty || ')','ai',p_difficulty,scrabble_private.new_board(),now()+make_interval(mins => cfg.game_timer_minutes)
  FROM public.scrabble_profiles WHERE id = uid RETURNING * INTO m;
  RETURN m;
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_ready_challenge(p_id uuid)
RETURNS public.scrabble_challenges LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := scrabble_private.active_user(); c public.scrabble_challenges; cfg public.scrabble_settings; mid uuid; fee integer; pot integer;
BEGIN
  SELECT * INTO STRICT c FROM public.scrabble_challenges WHERE id = p_id FOR UPDATE;
  IF uid NOT IN (c.from_user_id,c.to_user_id) THEN RAISE EXCEPTION 'Acces refuse.'; END IF;
  IF c.status = 'playing' THEN RETURN c; END IF;
  IF c.status <> 'accepted' OR c.ready_after IS NULL OR now() < c.ready_after THEN RAISE EXCEPTION 'La conversation doit durer au moins 20 minutes.'; END IF;
  IF EXISTS(SELECT 1 FROM public.scrabble_profiles WHERE id IN(c.from_user_id,c.to_user_id) AND is_blocked) THEN RAISE EXCEPTION 'Un compte est bloque.'; END IF;
  IF uid = c.from_user_id THEN c.player1_ready := true; ELSE c.player2_ready := true; END IF;
  UPDATE public.scrabble_challenges SET player1_ready = c.player1_ready,player2_ready = c.player2_ready WHERE id = p_id;
  IF c.player1_ready AND c.player2_ready THEN
    SELECT * INTO STRICT cfg FROM public.scrabble_settings WHERE id = 1;
    IF c.bet_amount > 0 AND NOT cfg.paid_matches_enabled THEN RAISE EXCEPTION 'Les matchs avec mise sont desactives.'; END IF;
    PERFORM user_id FROM public.scrabble_wallets WHERE user_id IN(c.from_user_id,c.to_user_id) ORDER BY user_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.scrabble_wallets WHERE user_id IN(c.from_user_id,c.to_user_id) AND coins < c.bet_amount) THEN RAISE EXCEPTION 'Solde insuffisant pour un des joueurs.'; END IF;
    pot := c.bet_amount * 2; fee := floor(pot * cfg.commission_percent / 100);
    INSERT INTO public.scrabble_matches(player1_id,player2_id,player1_name,player2_name,game_mode,bet_amount,commission_amount,winner_prize,state,deadline)
    SELECT c.from_user_id,c.to_user_id,p1.username,p2.username,'online',c.bet_amount,fee,pot-fee,
      scrabble_private.new_board(),now()+make_interval(mins => cfg.game_timer_minutes)
    FROM public.scrabble_profiles p1,public.scrabble_profiles p2 WHERE p1.id = c.from_user_id AND p2.id = c.to_user_id RETURNING id INTO mid;
    IF c.bet_amount > 0 THEN
      UPDATE public.scrabble_wallets SET coins = coins - c.bet_amount WHERE user_id IN(c.from_user_id,c.to_user_id);
      INSERT INTO public.scrabble_transactions(user_id,type,amount,currency,amount_coins,status,description,match_id)
      SELECT p,'bet',c.bet_amount,'coins',c.bet_amount,'completed','Mise reservee pour la partie',mid FROM unnest(ARRAY[c.from_user_id,c.to_user_id]) p;
      IF fee > 0 THEN
        UPDATE public.scrabble_admin_wallet SET coins = coins + fee,total_commissions = total_commissions + fee WHERE id = 1;
        INSERT INTO public.scrabble_admin_transactions(type,amount,currency,amount_coins,description,status,match_id)
        VALUES('commission',fee,'coins',fee,'Commission sur le pot: ' || cfg.commission_percent || '%','completed',mid);
      END IF;
    END IF;
    c.match_id := mid; c.status := 'playing';
    UPDATE public.scrabble_challenges SET match_id = mid,status = 'playing' WHERE id = p_id;
    INSERT INTO public.scrabble_notifications(user_id,title,message,type,related_id)
    SELECT p,'La partie commence','Les deux joueurs ont confirme. Rejoignez le plateau.','match',mid FROM unnest(ARRAY[c.from_user_id,c.to_user_id]) p;
  END IF;
  RETURN c;
END; $$;

CREATE OR REPLACE FUNCTION scrabble_private.letter_points(l text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN l IN ('A','E','I','L','N','O','R','S','T','U') THEN 1 WHEN l IN ('D','G','M') THEN 2
    WHEN l IN ('B','C','P') THEN 3 WHEN l IN ('F','H','V') THEN 4 WHEN l IN ('J','Q') THEN 8
    WHEN l IN ('K','W','X','Y','Z') THEN 10 ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION scrabble_private.bonus(r integer,c integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN (r IN (0,14) AND c IN (0,7,14)) OR (r=7 AND c IN (0,14)) THEN 'TW'
    WHEN (r=c OR r=14-c) AND (r BETWEEN 1 AND 4 OR r BETWEEN 10 AND 13 OR r=7) THEN 'DW'
    WHEN (r IN (1,13) AND c IN (5,9)) OR (r IN (5,9) AND c IN (1,5,9,13)) THEN 'TL'
    WHEN (r IN (0,14) AND c IN (3,11)) OR (r IN (2,12) AND c IN (6,8)) OR (r IN (3,11) AND c IN (0,7,14))
      OR (r IN (6,8) AND c IN (2,6,8,12)) OR (r=7 AND c IN (3,11)) THEN 'DL' ELSE '' END;
$$;

CREATE OR REPLACE FUNCTION scrabble_private.word_info(b jsonb,bl jsonb,ts jsonb,r integer,c integer,dr integer,dc integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE w text := ''; score integer := 0; mult integer := 1; l text; val integer; bonus text;
BEGIN
  WHILE r-dr BETWEEN 0 AND 14 AND c-dc BETWEEN 0 AND 14 AND coalesce(b #>> ARRAY[(r-dr)::text,(c-dc)::text],'') <> '' LOOP r:=r-dr;c:=c-dc; END LOOP;
  WHILE r BETWEEN 0 AND 14 AND c BETWEEN 0 AND 14 LOOP
    l := b #>> ARRAY[r::text,c::text]; EXIT WHEN coalesce(l,'') = '';
    w := w || l; val := CASE WHEN bl ? (r::text || ':' || c::text) THEN 0 ELSE scrabble_private.letter_points(l) END;
    IF ts @> jsonb_build_array(jsonb_build_object('row',r,'col',c)) THEN
      bonus := scrabble_private.bonus(r,c);
      IF bonus='DL' THEN val:=val*2; ELSIF bonus='TL' THEN val:=val*3;
      ELSIF bonus='DW' THEN mult:=mult*2; ELSIF bonus='TW' THEN mult:=mult*3; END IF;
    END IF;
    score:=score+val; r:=r+dr;c:=c+dc;
  END LOOP;
  IF char_length(w) < 2 THEN RETURN jsonb_build_object('word',w,'score',0); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.scrabble_dictionary WHERE word=w) THEN RAISE EXCEPTION 'Mot absent du lexique: %',w; END IF;
  RETURN jsonb_build_object('word',w,'score',score*mult);
END; $$;

CREATE OR REPLACE FUNCTION scrabble_private.evaluate_move(s jsonb,ts jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE b jsonb := s->'board'; original jsonb := s->'board'; bl jsonb := s->'blanks'; rack jsonb := s->'racks'->((s->>'turn')::integer);
  t jsonb; r integer; c integer; l text; used text; idx integer; n integer; nr integer; nc integer;
  connected boolean := false; empty_board boolean; horizontal boolean; dr integer; dc integer; rr integer; cc integer;
  score integer := 0; info jsonb; main_word text; row_count integer; col_count integer;
BEGIN
  IF jsonb_typeof(ts) <> 'array' OR jsonb_array_length(ts) NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Posez de 1 a 7 lettres.'; END IF;
  n:=jsonb_array_length(ts);
  IF (SELECT count(DISTINCT (value->>'row',value->>'col')) FROM jsonb_array_elements(ts)) <> n THEN RAISE EXCEPTION 'Case dupliquee.'; END IF;
  SELECT count(DISTINCT value->>'row'),count(DISTINCT value->>'col') INTO row_count,col_count FROM jsonb_array_elements(ts);
  IF row_count>1 AND col_count>1 THEN RAISE EXCEPTION 'Les lettres doivent etre alignees.'; END IF;
  SELECT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b) row_val CROSS JOIN LATERAL jsonb_array_elements_text(row_val) cell WHERE cell <> '') INTO empty_board;
  FOR t IN SELECT value FROM jsonb_array_elements(ts) LOOP
    r:=(t->>'row')::integer;c:=(t->>'col')::integer;l:=t->>'letter';
    IF r IS NULL OR c IS NULL OR r NOT BETWEEN 0 AND 14 OR c NOT BETWEEN 0 AND 14 OR l IS NULL OR l !~ '^[A-Z]$' OR
      coalesce(b #>> ARRAY[r::text,c::text],'') <> '' THEN RAISE EXCEPTION 'Case ou lettre invalide.'; END IF;
    used:=CASE WHEN coalesce((t->>'blank')::boolean,false) THEN '?' ELSE l END;
    SELECT ord::integer-1 INTO idx FROM jsonb_array_elements_text(rack) WITH ORDINALITY el(value,ord) WHERE value=used LIMIT 1;
    IF idx IS NULL THEN RAISE EXCEPTION 'Lettre absente du chevalet.'; END IF;
    rack:=rack-idx; b:=jsonb_set(b,ARRAY[r::text,c::text],to_jsonb(l));
    IF used='?' THEN bl:=bl || jsonb_build_array(r::text || ':' || c::text); END IF;
    IF empty_board AND r=7 AND c=7 THEN connected:=true; END IF;
    FOR nr,nc IN SELECT * FROM (VALUES(r-1,c),(r+1,c),(r,c-1),(r,c+1)) v(a,z) LOOP
      IF nr BETWEEN 0 AND 14 AND nc BETWEEN 0 AND 14 AND coalesce(original #>> ARRAY[nr::text,nc::text],'')<>'' THEN connected:=true; END IF;
    END LOOP;
  END LOOP;
  IF NOT connected THEN RAISE EXCEPTION 'Le premier mot doit couvrir le centre; les suivants doivent toucher un mot.'; END IF;
  r:=(ts->0->>'row')::integer;c:=(ts->0->>'col')::integer;
  horizontal:=row_count=1;
  IF n=1 AND (c=0 OR coalesce(b #>> ARRAY[r::text,(c-1)::text],'')='') AND
    (c=14 OR coalesce(b #>> ARRAY[r::text,(c+1)::text],'')='') THEN horizontal:=false; END IF;
  dr:=CASE WHEN horizontal THEN 0 ELSE 1 END;dc:=1-dr;
  rr:=r;cc:=c;
  WHILE rr-dr BETWEEN 0 AND 14 AND cc-dc BETWEEN 0 AND 14 AND coalesce(b #>> ARRAY[(rr-dr)::text,(cc-dc)::text],'')<>'' LOOP rr:=rr-dr;cc:=cc-dc; END LOOP;
  -- Every new tile must be reachable along the same uninterrupted word.
  idx:=0;
  WHILE rr BETWEEN 0 AND 14 AND cc BETWEEN 0 AND 14 AND coalesce(b #>> ARRAY[rr::text,cc::text],'')<>'' LOOP
    IF ts @> jsonb_build_array(jsonb_build_object('row',rr,'col',cc)) THEN idx:=idx+1; END IF;
    rr:=rr+dr;cc:=cc+dc;
  END LOOP;
  IF idx<>n THEN RAISE EXCEPTION 'Le mot ne peut pas contenir de case vide.'; END IF;
  info:=scrabble_private.word_info(b,bl,ts,r,c,dr,dc);main_word:=info->>'word';score:=(info->>'score')::integer;
  FOR t IN SELECT value FROM jsonb_array_elements(ts) LOOP
    info:=scrabble_private.word_info(b,bl,ts,(t->>'row')::integer,(t->>'col')::integer,dc,dr);
    score:=score+(info->>'score')::integer;
  END LOOP;
  IF char_length(main_word)<2 THEN RAISE EXCEPTION 'Le mot doit contenir au moins deux lettres.'; END IF;
  IF n=7 THEN score:=score+50; END IF;
  RETURN jsonb_build_object('board',b,'blanks',bl,'rack',rack,'score',score,'word',main_word);
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_submit_turn(p_id uuid,p_version integer,p_action text,p_tiles jsonb DEFAULT '[]'::jsonb)
RETURNS public.scrabble_matches LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := scrabble_private.active_user(); m public.scrabble_matches; s jsonb; rack jsonb; bag jsonb; result jsonb;
 seat integer; my_seat integer; n integer; idx integer; removed jsonb; label text; score integer:=0; drawn jsonb; left_bag jsonb;
BEGIN
 SELECT * INTO STRICT m FROM public.scrabble_matches WHERE id=p_id FOR UPDATE;
 IF uid<>m.player1_id AND uid IS DISTINCT FROM m.player2_id THEN RAISE EXCEPTION 'Acces refuse.'; END IF;
 IF m.status<>'playing' THEN RETURN m; END IF;
 IF now()>=m.deadline THEN
   UPDATE public.scrabble_matches SET status='finished',winner_seat=CASE WHEN (state->'scores'->>0)::integer>(state->'scores'->>1)::integer THEN 0 WHEN (state->'scores'->>0)::integer<(state->'scores'->>1)::integer THEN 1 ELSE NULL END,finished_at=now(),version=version+1 WHERE id=p_id RETURNING * INTO m;
   RETURN m;
 END IF;
 IF p_version IS NULL OR m.version<>p_version THEN RAISE EXCEPTION 'Le plateau a change. Actualisez la partie.'; END IF;
 s:=m.state;seat:=(s->>'turn')::integer;my_seat:=CASE WHEN uid=m.player1_id THEN 0 ELSE 1 END;
 IF seat<>my_seat AND NOT(m.game_mode='ai' AND my_seat=0 AND seat=1) THEN RAISE EXCEPTION 'Ce n''est pas votre tour.'; END IF;
 rack:=s->'racks'->seat;bag:=s->'bag';
 IF p_action='word' THEN
   result:=scrabble_private.evaluate_move(s,p_tiles);rack:=result->'rack';score:=(result->>'score')::integer;
   s:=jsonb_set(jsonb_set(s,'{board}',result->'board'),'{blanks}',result->'blanks');
   n:=least(7-jsonb_array_length(rack),jsonb_array_length(bag));
   SELECT coalesce(jsonb_agg(value ORDER BY ord) FILTER(WHERE ord<=n),'[]'),coalesce(jsonb_agg(value ORDER BY ord) FILTER(WHERE ord>n),'[]') INTO drawn,left_bag FROM jsonb_array_elements(bag) WITH ORDINALITY a(value,ord);
   rack:=rack||drawn;bag:=left_bag;
   s:=jsonb_set(s,'{passes}','0');label:=(result->>'word') || ' +' || score || ' pts';
   s:=jsonb_set(s,'{last_tiles}',p_tiles);
 ELSIF p_action IN ('pass','exchange') THEN
   IF p_action='exchange' THEN
     idx:=(p_tiles->0->>'index')::integer;
     IF idx IS NULL OR idx<0 OR idx>=jsonb_array_length(rack) OR jsonb_array_length(bag)=0 THEN RAISE EXCEPTION 'Echange impossible.'; END IF;
     removed:=rack->idx;rack:=jsonb_set(rack,ARRAY[idx::text],bag->0);bag:=(bag-0)||jsonb_build_array(removed);score:=-1;label:='Echange (-1 pt)';
   ELSE
     n:=least(jsonb_array_length(rack),jsonb_array_length(bag));
     SELECT coalesce(jsonb_agg(value ORDER BY ord) FILTER(WHERE ord<=n),'[]'),coalesce(jsonb_agg(value ORDER BY ord) FILTER(WHERE ord>n),'[]') INTO drawn,left_bag FROM jsonb_array_elements(bag) WITH ORDINALITY a(value,ord);
     SELECT coalesce(jsonb_agg(value ORDER BY ord) FILTER(WHERE ord<=n),'[]'),coalesce(jsonb_agg(value ORDER BY ord) FILTER(WHERE ord>n),'[]') INTO removed,rack FROM jsonb_array_elements(rack) WITH ORDINALITY a(value,ord);
     rack:=rack||drawn;bag:=left_bag||removed;label:='Tour passe, ' || n || ' lettres renouvelees';
   END IF;
   SELECT coalesce(jsonb_agg(value ORDER BY random()),'[]') INTO bag FROM jsonb_array_elements(bag);
   s:=jsonb_set(s,'{passes}',to_jsonb((s->>'passes')::integer+1));s:=jsonb_set(s,'{last_tiles}','[]');
 ELSE RAISE EXCEPTION 'Action invalide.'; END IF;
 s:=jsonb_set(s,ARRAY['scores',seat::text],to_jsonb((s->'scores'->>seat)::integer+score));
 s:=jsonb_set(s,ARRAY['racks',seat::text],rack);s:=jsonb_set(s,'{bag}',bag);
 s:=jsonb_set(s,'{turn}',to_jsonb(1-seat));
 s:=jsonb_set(s,'{history}',(s->'history')||jsonb_build_array(CASE WHEN seat=0 THEN m.player1_name ELSE m.player2_name END || ': ' || label));
 m.state:=s;m.version:=m.version+1;
 IF (s->>'passes')::integer>=6 OR (jsonb_array_length(bag)=0 AND jsonb_array_length(rack)=0) THEN
   m.status:='finished';m.finished_at:=now();m.winner_seat:=CASE WHEN (s->'scores'->>0)::integer>(s->'scores'->>1)::integer THEN 0 WHEN (s->'scores'->>0)::integer<(s->'scores'->>1)::integer THEN 1 ELSE NULL END;
 END IF;
 UPDATE public.scrabble_matches SET state=m.state,version=m.version,status=m.status,finished_at=m.finished_at,winner_seat=m.winner_seat WHERE id=p_id RETURNING * INTO m;
 RETURN m;
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_abandon_match(p_id uuid)
RETURNS public.scrabble_matches LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := scrabble_private.active_user(); m public.scrabble_matches;
BEGIN
 SELECT * INTO STRICT m FROM public.scrabble_matches WHERE id=p_id FOR UPDATE;
 IF uid<>m.player1_id AND uid IS DISTINCT FROM m.player2_id THEN RAISE EXCEPTION 'Acces refuse.'; END IF;
 IF m.status<>'playing' THEN RETURN m; END IF;
 UPDATE public.scrabble_matches SET status='abandoned',winner_seat=CASE WHEN uid=player1_id THEN 1 ELSE 0 END,
   finished_at=now(),version=version+1 WHERE id=p_id RETURNING * INTO m;
 RETURN m;
END; $$;

CREATE OR REPLACE FUNCTION scrabble_private.on_match_finished()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid; seat integer; amount bigint; won boolean; score integer;
BEGIN
 IF OLD.status<>'playing' OR NEW.status NOT IN ('finished','abandoned') THEN RETURN NEW; END IF;
 FOR seat IN 0..1 LOOP
   uid:=CASE WHEN seat=0 THEN NEW.player1_id ELSE NEW.player2_id END;CONTINUE WHEN uid IS NULL;
   won:=NEW.winner_seat=seat;score:=(NEW.state->'scores'->>seat)::integer;
   UPDATE public.scrabble_profiles SET wins=wins+CASE WHEN won THEN 1 ELSE 0 END,
     losses=losses+CASE WHEN NEW.winner_seat IS NOT NULL AND NOT won THEN 1 ELSE 0 END,
     draws=draws+CASE WHEN NEW.winner_seat IS NULL THEN 1 ELSE 0 END,
     total_games=total_games+1,best_score=greatest(best_score,score),total_points_scored=total_points_scored+score WHERE id=uid;
   amount:=CASE WHEN won THEN NEW.winner_prize WHEN NEW.winner_seat IS NULL THEN NEW.winner_prize/2 + CASE WHEN seat=0 THEN NEW.winner_prize%2 ELSE 0 END ELSE 0 END;
   IF amount>0 THEN
     UPDATE public.scrabble_wallets SET coins=coins+amount WHERE user_id=uid;
     INSERT INTO public.scrabble_transactions(user_id,type,amount,currency,amount_coins,status,description,match_id)
     VALUES(uid,CASE WHEN won THEN 'win' ELSE 'refund' END,amount,'coins',amount,'completed','Reglement de la partie',NEW.id);
   END IF;
   INSERT INTO public.scrabble_notifications(user_id,title,message,type,related_id)
   VALUES(uid,'Partie terminee',CASE WHEN NEW.winner_seat IS NULL THEN 'Match nul.' WHEN won THEN 'Vous avez gagne la partie.' ELSE 'Votre adversaire a gagne la partie.' END,'match',NEW.id);
 END LOOP;
 UPDATE public.scrabble_challenges SET status='finished' WHERE match_id=NEW.id;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS scrabble_match_finished ON public.scrabble_matches;
CREATE TRIGGER scrabble_match_finished AFTER UPDATE ON public.scrabble_matches FOR EACH ROW EXECUTE FUNCTION scrabble_private.on_match_finished();

CREATE OR REPLACE FUNCTION public.scrabble_block_player(p_id uuid,p_blocked boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT public.scrabble_is_admin() THEN RAISE EXCEPTION 'Administrateur requis.'; END IF;
 IF p_id=auth.uid() THEN RAISE EXCEPTION 'Vous ne pouvez pas bloquer votre propre compte.'; END IF;
 UPDATE public.scrabble_profiles SET is_blocked=p_blocked,is_online=false WHERE id=p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_request_admin_withdrawal(p_amount numeric,p_currency text,p_phone text,p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n bigint; tx uuid; cfg public.scrabble_settings;
BEGIN
 PERFORM scrabble_private.active_user();
 IF NOT public.scrabble_is_admin() THEN RAISE EXCEPTION 'Administrateur requis.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 SELECT id INTO tx FROM public.scrabble_admin_transactions WHERE client_request_id=p_request_id;
 IF FOUND THEN RETURN tx; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount>100000000 OR p_amount::text IN('NaN','Infinity','-Infinity') OR p_amount<>round(p_amount,2) OR
   p_currency IS NULL OR p_currency NOT IN('USD','CDF') OR p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{8,14}$' OR p_request_id IS NULL THEN RAISE EXCEPTION 'Demande invalide.'; END IF;
 SELECT * INTO STRICT cfg FROM public.scrabble_settings WHERE id=1;
 n:=ceil(p_amount*cfg.coins_per_usd/CASE WHEN p_currency='CDF' THEN cfg.usd_to_cdf ELSE 1 END);
 UPDATE public.scrabble_admin_wallet SET coins=coins-n,reserved_coins=reserved_coins+n WHERE id=1 AND coins>=n AND n>0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solde administrateur insuffisant.'; END IF;
 INSERT INTO public.scrabble_admin_transactions(type,amount,currency,amount_coins,description,status,actor_id,client_request_id)
 VALUES('withdraw',p_amount,p_currency,n,'Retrait a traiter vers ' || p_phone,'pending',auth.uid(),p_request_id) RETURNING id INTO tx;
 RETURN tx;
END; $$;

CREATE OR REPLACE FUNCTION public.scrabble_settle_admin_withdrawal(p_id uuid,p_success boolean,p_provider_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tx public.scrabble_admin_transactions;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Backend de paiement requis.'; END IF;
 IF nullif(btrim(p_provider_reference),'') IS NULL THEN RAISE EXCEPTION 'Reference prestataire requise.'; END IF;
 SELECT * INTO STRICT tx FROM public.scrabble_admin_transactions WHERE id=p_id AND type='withdraw' FOR UPDATE;
 IF tx.status<>'pending' THEN RETURN; END IF;
 UPDATE public.scrabble_admin_wallet SET reserved_coins=reserved_coins-tx.amount_coins,
   coins=coins+CASE WHEN p_success THEN 0 ELSE tx.amount_coins END WHERE id=1;
 UPDATE public.scrabble_admin_transactions SET status=CASE WHEN p_success THEN 'completed' ELSE 'rejected' END,
   provider_reference=p_provider_reference WHERE id=p_id;
END; $$;

-- Droits: les soldes, scores, roles et notifications ne sont jamais ecrits directement par le client.
DO $$ DECLARE t text; p record;
BEGIN
 FOREACH t IN ARRAY ARRAY['scrabble_settings','scrabble_profiles','scrabble_wallets','scrabble_matches','scrabble_challenges',
  'scrabble_chat_messages','scrabble_notifications','scrabble_transactions','scrabble_admin_wallet','scrabble_admin_transactions','scrabble_dictionary'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t);
  END LOOP;
 END LOOP;
END; $$;

GRANT SELECT ON public.scrabble_settings,public.scrabble_dictionary TO anon,authenticated;
GRANT SELECT ON public.scrabble_profiles,public.scrabble_wallets,public.scrabble_matches,public.scrabble_challenges,
 public.scrabble_chat_messages,public.scrabble_notifications,public.scrabble_transactions,
 public.scrabble_admin_wallet,public.scrabble_admin_transactions TO authenticated;
GRANT UPDATE(username,phone) ON public.scrabble_profiles TO authenticated;
GRANT UPDATE(is_read) ON public.scrabble_notifications TO authenticated;
GRANT UPDATE(commission_percent,game_timer_minutes,chat_timer_minutes,min_bet,max_bet,coins_per_usd,usd_to_cdf,paid_matches_enabled,ia_enabled) ON public.scrabble_settings TO authenticated;
GRANT INSERT(challenge_id,user_id,message) ON public.scrabble_chat_messages TO authenticated;

CREATE POLICY settings_read ON public.scrabble_settings FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY settings_admin ON public.scrabble_settings FOR UPDATE TO authenticated USING((SELECT public.scrabble_is_admin())) WITH CHECK((SELECT public.scrabble_is_admin()));
CREATE POLICY dictionary_read ON public.scrabble_dictionary FOR SELECT TO anon,authenticated USING(true);
CREATE POLICY profile_read ON public.scrabble_profiles FOR SELECT TO authenticated USING(id=(SELECT auth.uid()) OR (SELECT public.scrabble_is_admin()));
CREATE POLICY profile_edit ON public.scrabble_profiles FOR UPDATE TO authenticated USING(id=(SELECT auth.uid()) AND NOT is_blocked) WITH CHECK(id=(SELECT auth.uid()) AND NOT is_blocked);
CREATE POLICY wallet_read ON public.scrabble_wallets FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR (SELECT public.scrabble_is_admin()));
CREATE POLICY tx_read ON public.scrabble_transactions FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR (SELECT public.scrabble_is_admin()));
CREATE POLICY match_read ON public.scrabble_matches FOR SELECT TO authenticated USING((SELECT auth.uid()) IN(player1_id,player2_id) OR (SELECT public.scrabble_is_admin()));
CREATE POLICY challenge_read ON public.scrabble_challenges FOR SELECT TO authenticated USING((SELECT auth.uid()) IN(from_user_id,to_user_id) OR (SELECT public.scrabble_is_admin()));
CREATE POLICY notification_read ON public.scrabble_notifications FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY notification_edit ON public.scrabble_notifications FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY chat_read ON public.scrabble_chat_messages FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.scrabble_challenges c WHERE c.id=challenge_id AND (SELECT auth.uid()) IN(c.from_user_id,c.to_user_id)));
CREATE POLICY chat_send ON public.scrabble_chat_messages FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid())
 AND EXISTS(SELECT 1 FROM public.scrabble_profiles p WHERE p.id=(SELECT auth.uid()) AND NOT p.is_blocked)
 AND EXISTS(SELECT 1 FROM public.scrabble_challenges c WHERE c.id=challenge_id AND (SELECT auth.uid()) IN(c.from_user_id,c.to_user_id) AND c.status IN('accepted','playing')));
CREATE POLICY admin_wallet_read ON public.scrabble_admin_wallet FOR SELECT TO authenticated USING((SELECT public.scrabble_is_admin()));
CREATE POLICY admin_tx_read ON public.scrabble_admin_transactions FOR SELECT TO authenticated USING((SELECT public.scrabble_is_admin()));

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA scrabble_private FROM PUBLIC,anon,authenticated;
DO $$ DECLARE f record;
BEGIN
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'scrabble_%' LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
   IF f.proname IN('scrabble_settle_payment','scrabble_settle_admin_withdrawal') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
   ELSE EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.scrabble_health() TO anon;

-- Realtime re-executable, sans masquer les autres erreurs SQL.
DO $$ DECLARE t text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
  FOREACH t IN ARRAY ARRAY['scrabble_profiles','scrabble_wallets','scrabble_matches','scrabble_challenges','scrabble_chat_messages','scrabble_notifications','scrabble_transactions','scrabble_settings'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
     EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
   END IF;
  END LOOP;
 END IF;
END; $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- PREMIER ADMINISTRATEUR: apres avoir cree un vrai compte Auth,
-- executer dans le SQL Editor (remplacer l'UUID):
-- INSERT INTO scrabble_private.admins(user_id) VALUES ('UUID_DU_COMPTE_AUTH') ON CONFLICT DO NOTHING;
-- Aucun acces admin via le mot de passe 123 ou le localStorage.
-- Les versements externes exigent un prestataire + un webhook serveur verifie.