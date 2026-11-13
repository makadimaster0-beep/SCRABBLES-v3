import { create } from 'zustand';
import { api } from '../lib/api';
import { errorMessage } from '../lib/supabase';
import { evaluateMove, rackAfterDraft } from '../lib/scrabble';
import type { Match, TilePlacement } from '../lib/types';

interface GameState {
  match: Match | null;
  draft: TilePlacement[];
  busy: boolean;
  error: string | null;
  loadMatch: (id: string) => Promise<void>;
  acceptMatch: (match: Match) => void;
  placeTile: (rackIndex: number, row: number, col: number, blankLetter?: string) => void;
  removeTile: (row: number, col: number) => void;
  recall: () => void;
  submit: (action: 'word' | 'pass' | 'exchange', index?: number, aiTiles?: TilePlacement[]) => Promise<boolean>;
  abandon: () => Promise<boolean>;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  match: null, draft: [], busy: false, error: null,
  loadMatch: async id => {
    try { get().acceptMatch(await api.match(id)); set({ error: null }); }
    catch (error) { set({ error: errorMessage(error) }); }
  },
  acceptMatch: match => {
    const current = get().match;
    if (current?.id === match.id && current.version > match.version) return;
    set({ match, ...(current?.id !== match.id || current.version !== match.version ? { draft: [] } : {}) });
  },
  placeTile: (rackIndex, row, col, blankLetter) => {
    const { match, draft, busy } = get();
    if (!match || match.status !== 'playing' || busy || match.state.board[row]?.[col] || draft.some(t => t.row === row && t.col === col)) return;
    const rack = rackAfterDraft(match.state.racks[match.state.turn], draft);
    const tile = rack[rackIndex];
    if (!tile) return;
    const letter = tile === '?' ? blankLetter?.toUpperCase() : tile;
    if (!letter || !/^[A-Z]$/.test(letter)) return;
    set({ draft: [...draft, { row, col, letter, blank: tile === '?' }], error: null });
  },
  removeTile: (row, col) => set({ draft: get().draft.filter(t => t.row !== row || t.col !== col) }),
  recall: () => set({ draft: [], error: null }),
  submit: async (action, index, aiTiles) => {
    const { match, draft, busy } = get();
    if (!match || busy || match.status !== 'playing') return false;
    set({ busy: true, error: null });
    try {
      const tiles = aiTiles || draft;
      if (action === 'word') evaluateMove(match.state, tiles);
      const updated = await api.turn(match.id, match.version, action, action === 'word' ? tiles : action === 'exchange' ? [{ index: index ?? -1 }] : []);
      get().acceptMatch(updated); set({ draft: [] });
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      try { get().acceptMatch(await api.match(match.id)); } catch { /* Keep the last confirmed state when disconnected. */ }
      return false;
    } finally { set({ busy: false }); }
  },
  abandon: async () => {
    const { match, busy } = get(); if (!match || busy) return false;
    set({ busy: true, error: null });
    try { get().acceptMatch(await api.abandon(match.id)); return true; }
    catch (error) { set({ error: errorMessage(error) }); return false; }
    finally { set({ busy: false }); }
  },
  resetGame: () => set({ match: null, draft: [], error: null, busy: false }),
}));