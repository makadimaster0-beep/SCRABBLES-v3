export type Currency = 'USD' | 'CDF';
export type Difficulty = 'simple' | 'normal' | 'difficile' | 'dur' | 'expert';

export interface Profile {
  id: string;
  username: string;
  email: string;
  phone: string;
  wins: number;
  losses: number;
  draws: number;
  total_games: number;
  best_score: number;
  total_points_scored: number;
  is_blocked: boolean;
  is_online: boolean;
  last_seen: string;
  created_at: string;
}

export interface Player {
  id: string;
  username: string;
  wins: number;
  losses: number;
  total_games: number;
  best_score: number;
  is_online: boolean;
}

export interface Wallet {
  user_id: string;
  coins: number;
  reserved_coins: number;
  total_deposit_usd: number;
  total_deposit_cdf: number;
  total_withdraw_usd: number;
  total_withdraw_cdf: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'deposit' | 'withdraw' | 'bet' | 'win' | 'refund' | 'commission';
  amount: number;
  currency: Currency | 'coins';
  amount_coins: number;
  description: string;
  method: string | null;
  phone: string | null;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled';
  created_at: string;
}

export interface Settings {
  id: number;
  commission_percent: number;
  game_timer_minutes: number;
  chat_timer_minutes: number;
  min_bet: number;
  max_bet: number;
  coins_per_usd: number;
  usd_to_cdf: number;
  paid_matches_enabled: boolean;
  ia_enabled: boolean;
}

export interface GameNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'challenge' | 'match' | 'wallet' | 'system';
  is_read: boolean;
  related_id: string | null;
  created_at: string;
}

export interface Challenge {
  id: string;
  from_user_id: string;
  to_user_id: string;
  bet_amount: number;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'playing' | 'finished';
  match_id: string | null;
  chat_started_at: string | null;
  ready_after: string | null;
  player1_ready: boolean;
  player2_ready: boolean;
  expires_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  challenge_id: string;
  user_id: string;
  message: string;
  created_at: string;
}

export interface TilePlacement {
  row: number;
  col: number;
  letter: string;
  blank: boolean;
}

export interface BoardState {
  board: string[][];
  blanks: string[];
  racks: string[][];
  bag: string[];
  scores: number[];
  turn: number;
  passes: number;
  history: string[];
  last_tiles: TilePlacement[];
}

export interface Match {
  id: string;
  player1_id: string;
  player2_id: string | null;
  player1_name: string;
  player2_name: string;
  game_mode: 'ai' | 'online';
  ai_difficulty: Difficulty | null;
  status: 'playing' | 'finished' | 'abandoned' | 'cancelled';
  bet_amount: number;
  commission_amount: number;
  winner_prize: number;
  winner_seat: number | null;
  state: BoardState;
  version: number;
  deadline: string;
  created_at: string;
  finished_at: string | null;
}

export interface AdminWallet {
  coins: number;
  reserved_coins: number;
  total_commissions: number;
}