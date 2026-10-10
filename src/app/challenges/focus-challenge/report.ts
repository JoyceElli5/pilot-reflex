import type { State } from './game';

export type Best = Readonly<{ correct: number; averageCorrectMs: number | null }>;
export type Comparison = 'new' | 'matched' | 'not-beaten';
export const BEST_KEY = 'pilot-reflex.focus-challenge.accuracy-time.v1';
type BestStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function summarize(state: State) {
  if (state.phase !== 'complete' || state.rounds.length !== 5) throw new Error('Five completed rounds are required.');
  const correct = state.rounds.filter(outcome => outcome.kind === 'correct');
  return {
    rounds: [...state.rounds],
    correct: correct.length,
    accuracy: correct.length / 5 * 100,
    incorrect: state.rounds.filter(outcome => outcome.kind === 'incorrect').length,
    timeouts: state.rounds.filter(outcome => outcome.kind === 'timeout').length,
    averageCorrectMs: correct.length ? correct.reduce((sum, outcome) => sum + outcome.decisionMs, 0) / correct.length : null,
  };
}

export function compareBest(current: Best, previous: Best): Comparison {
  if (current.correct !== previous.correct) return current.correct > previous.correct ? 'new' : 'not-beaten';
  if (current.correct > 0 && previous.correct > 0 && current.averageCorrectMs !== null && previous.averageCorrectMs !== null) {
    if (current.averageCorrectMs !== previous.averageCorrectMs) return current.averageCorrectMs < previous.averageCorrectMs ? 'new' : 'not-beaten';
  }
  return 'matched';
}

export function parseBest(raw: string | null): Best | null {
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('correct' in value) || !('averageCorrectMs' in value)) return null;
    const { correct, averageCorrectMs } = value;
    if (typeof correct !== 'number' || !Number.isInteger(correct) || correct < 0 || correct > 5) return null;
    if (correct === 0) return averageCorrectMs === null ? { correct, averageCorrectMs: null } : null;
    return typeof averageCorrectMs === 'number' && Number.isFinite(averageCorrectMs) && averageCorrectMs >= 0 && averageCorrectMs < 5000
      ? { correct, averageCorrectMs } : null;
  } catch { return null; }
}
export function readBest(storage: Pick<Storage, 'getItem'>): Best | null {
  try { return parseBest(storage.getItem(BEST_KEY)); } catch { return null; }
}

export function completeReport(state: State, storage: BestStorage | null) {
  const summary = summarize(state);
  let previousBest: Best | null | undefined;
  try { if (storage) previousBest = parseBest(storage.getItem(BEST_KEY)); } catch { /* Unavailable is not a first session. */ }
  const comparison: Comparison | 'first' | 'unavailable' = previousBest === undefined ? 'unavailable'
    : previousBest === null ? 'first' : compareBest(summary, previousBest);
  let saved = false;
  try {
    if (storage && previousBest !== undefined) {
      const best: Best = previousBest === null || comparison === 'new'
        ? { correct: summary.correct, averageCorrectMs: summary.averageCorrectMs } : previousBest;
      storage.setItem(BEST_KEY, JSON.stringify(best));
      saved = true;
    }
  } catch { /* The report remains usable when storage is blocked or full. */ }
  return { ...summary, previousBest, comparison, saved };
}
export type CompletedReport = ReturnType<typeof completeReport>;
