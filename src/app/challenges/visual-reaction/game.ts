export type Phase = 'instructions' | 'waiting' | 'active' | 'false-start' | 'timeout' | 'result' | 'complete';
export type Attempt = Readonly<
  { kind: 'valid'; reactionMs: number } |
  { kind: 'false-start' } |
  { kind: 'timeout'; reason: 'deadline' | 'interrupted' }
>;
export const PENALTY_MS = 3000;
export const attemptScore = (attempt: Attempt) => attempt.kind === 'valid' ? attempt.reactionMs : PENALTY_MS;

export type GameState = Readonly<{
  phase: Phase;
  times: readonly number[];
  attempts: readonly Attempt[];
  falseStarts: number;
  timeouts: number;
  activatedAt: number | null;
}>;

type Clock = {
  isAvailable?: () => boolean;
  now: () => number;
  random: () => number;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (token: number) => void;
};

const RESPONSE_WINDOW_MS = 3000;

const initialState = (): GameState => ({ phase: 'instructions', attempts: [], times: [], falseStarts: 0, timeouts: 0, activatedAt: null });

/** Synchronous transitions are authoritative; React only renders snapshots. */
export class ReactionGame {
  private state = initialState();
  private timer: number | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();

  constructor(private clock: Clock) {}

  getSnapshot = (): GameState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(state: GameState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  private clearTimer() {
    this.generation++;
    if (this.timer !== null) this.clock.cancel(this.timer);
    this.timer = null;
  }

  beginAttempt = () => {
    if (this.clock.isAvailable?.() === false) return;
    if (!['instructions', 'false-start', 'timeout', 'result'].includes(this.state.phase)) return;
    this.clearTimer();
    const generation = this.generation;
    this.publish({ ...this.state, phase: 'waiting', activatedAt: null });
    this.timer = this.clock.schedule(() => {
      // A cleared callback may already be queued. Never let it activate a new trial.
      if (generation !== this.generation || this.state.phase !== 'waiting') return;
      if (this.clock.isAvailable?.() === false) { this.interrupt(); return; }
      this.clearTimer();
      const activatedAt = this.clock.now();
      this.publish({ ...this.state, phase: 'active', activatedAt });
      this.scheduleTimeout();
    }, 2000 + this.clock.random() * 3000);
  };

  private finish(attempt: Attempt) {
    if (this.state.phase !== 'waiting' && this.state.phase !== 'active') return;
    this.clearTimer();
    const attempts = [...this.state.attempts, attempt];
    this.publish({
      ...this.state, attempts, activatedAt: null,
      times: attempt.kind === 'valid' ? [...this.state.times, attempt.reactionMs] : this.state.times,
      falseStarts: this.state.falseStarts + (attempt.kind === 'false-start' ? 1 : 0),
      timeouts: this.state.timeouts + (attempt.kind === 'timeout' ? 1 : 0),
      phase: attempts.length === 5 ? 'complete' : attempt.kind === 'valid' ? 'result' : attempt.kind,
    });
  }

  private timeout() { this.finish({ kind: 'timeout', reason: 'deadline' }); }

  private scheduleTimeout() {
    if (this.clock.isAvailable?.() === false) { this.interrupt(); return; }
    if (this.state.phase !== 'active' || this.state.activatedAt === null) return;
    const remaining = RESPONSE_WINDOW_MS - (this.clock.now() - this.state.activatedAt);
    if (remaining <= 0) {
      this.timeout();
      return;
    }
    const generation = this.generation;
    this.timer = this.clock.schedule(() => {
      if (generation !== this.generation || this.state.phase !== 'active') return;
      this.timer = null;
      // Timers may fire early or late. Only monotonic elapsed time ends the window.
      this.scheduleTimeout();
    }, remaining);
  }

  respond = () => {
    if (this.clock.isAvailable?.() === false) { this.interrupt(); return; }
    if (this.state.phase === 'waiting') {
      this.finish({ kind: 'false-start' });
    } else if (this.state.phase === 'active' && this.state.activatedAt !== null) {
      const elapsed = this.clock.now() - this.state.activatedAt;
      // Enforce the deadline even if the timeout callback is delayed behind input.
      if (elapsed >= RESPONSE_WINDOW_MS) {
        this.timeout();
        return;
      }
      this.finish({ kind: 'valid', reactionMs: elapsed });
    }
  };

  // Leaving a live attempt consumes it as a timeout; never measure across interruptions.
  interrupt = () => {
    if (this.state.phase === 'waiting' || this.state.phase === 'active') {
      this.finish({ kind: 'timeout', reason: 'interrupted' });
    } else this.clearTimer();
  };

  restart = () => {
    this.clearTimer();
    this.publish(initialState());
  };

  dispose = () => {
    this.clearTimer();
    this.listeners.clear();
    this.state = initialState();
  };
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export const BEST_KEY = 'pilot-reflex.visual-reaction.competitive-median.v2';
type StorageReader = Pick<Storage, 'getItem'>;
type BestStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readBest(storage: StorageReader): number | null {
  try {
    const raw = storage.getItem(BEST_KEY);
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= PENALTY_MS ? value : null;
  } catch { return null; }
}

/** Null means no completed score was saved, including unavailable storage. */
export function saveBest(storage: BestStorage, state: GameState): number | null {
  if (state.phase !== 'complete' || state.attempts.length !== 5) return null;
  const score = median(state.attempts.map(attemptScore))!;
  try {
    const previous = readBest(storage);
    const best = previous === null ? score : Math.min(previous, score);
    storage.setItem(BEST_KEY, String(best));
    return best;
  } catch { return null; }
}
