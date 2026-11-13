import { VALID_WORDS, WORDS } from './dictionary';
import type { BoardState, Difficulty, TilePlacement } from './types';

export const LETTER_VALUES: Record<string, number> = { A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 10, L: 1, M: 2, N: 1, O: 1, P: 3, Q: 8, R: 1, S: 1, T: 1, U: 1, V: 4, W: 10, X: 10, Y: 10, Z: 10, '?': 0 };
export const LETTER_DISTRIBUTION: Record<string, number> = { A: 9, B: 2, C: 2, D: 3, E: 15, F: 2, G: 2, H: 2, I: 8, J: 1, K: 1, L: 5, M: 3, N: 6, O: 6, P: 2, Q: 1, R: 6, S: 6, T: 6, U: 6, V: 2, W: 1, X: 1, Y: 1, Z: 1, '?': 2 };
export const ALL_LETTERS = Object.keys(LETTER_DISTRIBUTION);
export const getBagLetterCounts = (bag: string[]) => bag.reduce<Record<string, number>>((counts, letter) => { counts[letter] = (counts[letter] || 0) + 1; return counts; }, {});

export function getBonusType(r: number, c: number) {
  if (([0, 14].includes(r) && [0, 7, 14].includes(c)) || (r === 7 && [0, 14].includes(c))) return 'TW';
  if ((r === c || r === 14 - c) && ((r >= 1 && r <= 4) || (r >= 10 && r <= 13) || r === 7)) return 'DW';
  if (([1, 13].includes(r) && [5, 9].includes(c)) || ([5, 9].includes(r) && [1, 5, 9, 13].includes(c))) return 'TL';
  if (([0, 14].includes(r) && [3, 11].includes(c)) || ([2, 12].includes(r) && [6, 8].includes(c)) ||
    ([3, 11].includes(r) && [0, 7, 14].includes(c)) || ([6, 8].includes(r) && [2, 6, 8, 12].includes(c)) || (r === 7 && [3, 11].includes(c))) return 'DL';
  return '';
}

export function rackAfterDraft(rack: string[], tiles: TilePlacement[]) {
  const remaining = [...rack];
  for (const tile of tiles) {
    const index = remaining.indexOf(tile.blank ? '?' : tile.letter);
    if (index < 0) throw new Error('Lettre absente du chevalet.');
    remaining.splice(index, 1);
  }
  return remaining;
}

// Used for previews and AI search only. Supabase validates and scores every submitted move again.
export function evaluateMove(state: BoardState, tiles: TilePlacement[]) {
  if (!tiles.length || tiles.length > 7) throw new Error('Posez de 1 a 7 lettres.');
  if (new Set(tiles.map(t => `${t.row}:${t.col}`)).size !== tiles.length) throw new Error('Case dupliquee.');
  const rows = new Set(tiles.map(t => t.row)); const cols = new Set(tiles.map(t => t.col));
  if (rows.size > 1 && cols.size > 1) throw new Error('Les lettres doivent etre alignees.');
  rackAfterDraft(state.racks[state.turn], tiles);
  const board = state.board.map(row => [...row]);
  const blanks = new Set(state.blanks);
  const fresh = new Set(tiles.map(t => `${t.row}:${t.col}`));
  const cell = (r: number, c: number) => board[r]?.[c] || '';
  const empty = state.board.every(row => row.every(l => !l));
  let connected = false;
  for (const tile of tiles) {
    const { row, col, letter } = tile;
    if (row < 0 || row > 14 || col < 0 || col > 14 || !/^[A-Z]$/.test(letter) || cell(row, col)) throw new Error('Case ou lettre invalide.');
    board[row][col] = letter;
    if (tile.blank) blanks.add(`${row}:${col}`);
    if (empty && row === 7 && col === 7) connected = true;
    if ([[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].some(([r, c]) => state.board[r]?.[c])) connected = true;
  }
  if (!connected) throw new Error(empty ? 'Le premier mot doit couvrir l\'etoile centrale.' : 'Votre mot doit etre relie aux lettres du plateau.');
  const first = tiles[0];
  const horizontal = rows.size === 1 && (tiles.length > 1 || cell(first.row, first.col - 1) || cell(first.row, first.col + 1));
  const dr = horizontal ? 0 : 1; const dc = 1 - dr;
  const wordAt = (startRow: number, startCol: number, rowStep: number, colStep: number) => {
    let r = startRow; let c = startCol;
    while (cell(r - rowStep, c - colStep)) { r -= rowStep; c -= colStep; }
    let word = ''; let score = 0; let multiplier = 1; let freshCount = 0;
    while (cell(r, c)) {
      const key = `${r}:${c}`; const letter = cell(r, c); word += letter;
      let points = blanks.has(key) ? 0 : LETTER_VALUES[letter];
      if (fresh.has(key)) {
        freshCount += 1;
        const bonus = getBonusType(r, c);
        if (bonus === 'DL') points *= 2;
        if (bonus === 'TL') points *= 3;
        if (bonus === 'DW') multiplier *= 2;
        if (bonus === 'TW') multiplier *= 3;
      }
      score += points; r += rowStep; c += colStep;
    }
    if (word.length > 1 && !VALID_WORDS.has(word)) throw new Error(`Mot absent du lexique integre : ${word}`);
    return { word, score: word.length > 1 ? score * multiplier : 0, freshCount };
  };
  const main = wordAt(first.row, first.col, dr, dc);
  if (main.freshCount !== tiles.length) throw new Error('Le mot ne peut pas contenir de case vide.');
  if (main.word.length < 2) throw new Error('Un mot doit contenir au moins deux lettres.');
  let score = main.score;
  for (const tile of tiles) score += wordAt(tile.row, tile.col, dc, dr).score;
  if (tiles.length === 7) score += 50;
  return { word: main.word, score };
}

export function findAIMove(state: BoardState, difficulty: Difficulty): TilePlacement[] | null {
  const max = { simple: 3, normal: 4, difficile: 5, dur: 6, expert: 15 }[difficulty];
  let best: TilePlacement[] | null = null; let bestScore = -1;
  for (const word of WORDS.filter(word => word.length <= max)) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      for (let row = 0; row < 15; row++) for (let col = 0; col < 15; col++) {
        if (row + dr * (word.length - 1) > 14 || col + dc * (word.length - 1) > 14 || state.board[row - dr]?.[col - dc] || state.board[row + dr * word.length]?.[col + dc * word.length]) continue;
        const rack = [...state.racks[state.turn]]; const tiles: TilePlacement[] = []; let fits = true;
        for (let index = 0; index < word.length; index++) {
          const r = row + dr * index; const c = col + dc * index; const letter = word[index];
          const existing = state.board[r][c];
          if (existing) { if (existing !== letter) { fits = false; break; } continue; }
          let ri = rack.indexOf(letter); let blank = false;
          if (ri < 0) { ri = rack.indexOf('?'); blank = true; }
          if (ri < 0) { fits = false; break; }
          rack.splice(ri, 1); tiles.push({ row: r, col: c, letter, blank });
        }
        if (!fits || !tiles.length) continue;
        try {
          const result = evaluateMove(state, tiles);
          if (difficulty === 'simple') return tiles;
          if (result.score > bestScore) { best = tiles; bestScore = result.score; }
        } catch { /* An invalid cross-word makes this placement unavailable. */ }
      }
    }
  }
  return best;
}