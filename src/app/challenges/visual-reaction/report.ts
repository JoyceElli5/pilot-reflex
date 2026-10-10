import { BEST_KEY, attemptScore, median, readBest, saveBest, type Attempt, type GameState } from './game';

export type Comparison = 'first' | 'new' | 'matched' | 'not-beaten' | 'unavailable';
export type FlightReport = Readonly<{
  attempts: readonly Attempt[];
  successfulReactions: number;
  score: number;
  fastest: number | null;
  falseStarts: number;
  timeouts: number;
  previousBest: number | null | undefined;
  comparison: Comparison;
  saved: boolean;
}>;

type BestStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Retain full precision for comparisons and scaling; round only the displayed text.
export const formatMilliseconds = (value: number) => String(Number(value.toFixed(1)));

export function createReport(state: GameState, previousBest: number | null | undefined): FlightReport {
  if (state.phase !== 'complete') throw new Error('A report requires a completed session.');
  validateAttempts(state.attempts);
  const score = median(state.attempts.map(attemptScore))!;
  const valid = state.attempts.filter(attempt => attempt.kind === 'valid');
  const comparison: Comparison = previousBest === undefined ? 'unavailable'
    : previousBest === null ? 'first'
    : score < previousBest ? 'new'
    : score === previousBest ? 'matched' : 'not-beaten';
  return {
    attempts: state.attempts.map(attempt => ({ ...attempt })), score,
    fastest: valid.length ? Math.min(...valid.map(attempt => attempt.reactionMs)) : null,
    successfulReactions: valid.length,
    falseStarts: state.attempts.filter(attempt => attempt.kind === 'false-start').length,
    timeouts: state.attempts.filter(attempt => attempt.kind === 'timeout').length,
    previousBest, comparison, saved: false,
  };
}

/** Capture the comparison before persistence; later storage updates cannot change it. */
export function completeReport(state: GameState, storage: BestStorage | null): FlightReport {
  let previousBest: number | null | undefined;
  try {
    if (storage) {
      const raw = storage.getItem(BEST_KEY);
      previousBest = readBest({ getItem: () => raw });
    }
  } catch { /* An unavailable best is different from a first session. */ }
  const report = createReport(state, previousBest);
  const saved = storage !== null && saveBest(storage, state) !== null;
  return { ...report, saved };
}

function validateAttempts(attempts: readonly Attempt[]) {
  if (attempts.length !== 5 || attempts.some(attempt =>
    attempt.kind === 'valid' ? !Number.isFinite(attempt.reactionMs) || attempt.reactionMs < 0 || attempt.reactionMs >= 3000
      : attempt.kind !== 'false-start' && (attempt.kind !== 'timeout' || !['deadline', 'interrupted'].includes(attempt.reason)))) {
    throw new Error('Five valid attempt outcomes are required.');
  }
}

export function outcomeLabel(attempt: Attempt): string {
  if (attempt.kind === 'valid') return 'Valid reaction';
  if (attempt.kind === 'false-start') return 'False start · penalty';
  return attempt.reason === 'interrupted' ? 'Interrupted · timeout penalty' : 'Timeout · penalty';
}

export function chartData(attempts: readonly Attempt[]) {
  validateAttempts(attempts);
  const maximum = Math.max(100, Math.ceil(Math.max(...attempts.map(attemptScore)) / 100) * 100);
  return {
    maximum,
    ticks: [0, maximum / 2, maximum],
    trials: attempts.map((attempt, index) => ({
      trial: index + 1, value: attemptScore(attempt), fraction: attemptScore(attempt) / maximum,
      penalty: attempt.kind !== 'valid', label: outcomeLabel(attempt),
    })),
  };
}
