import { median } from '../visual-reaction/game';

export type Distractor = 'STANDBY' | 'HOLD' | 'MONITOR';
export type Signal = Distractor | 'CLEARED';
export type Outcome = Readonly<
  { kind: 'correct'; reactionMs: number } |
  { kind: 'incorrect'; signal: Distractor } |
  { kind: 'timeout'; reason: 'deadline' | 'interrupted' }
>;
export type State = Readonly<{
  phase: 'instructions' | 'distractor' | 'target' | 'result' | 'complete';
  signal: Signal | null;
  activatedAt: number | null;
  rounds: readonly Outcome[];
}>;
type Clock = {
  now: () => number;
  random: () => number;
  isAvailable?: () => boolean;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (token: number) => void;
};
type Step = { signal: Signal; durationMs: number };
const WINDOW_MS = 3000;
const initialState = (): State => ({ phase: 'instructions', signal: null, activatedAt: null, rounds: [] });

export function createSequence(random: () => number): Step[] {
  const distractors: Distractor[] = ['STANDBY', 'HOLD', 'MONITOR'];
  for (let index = distractors.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [distractors[index], distractors[other]] = [distractors[other], distractors[index]];
  }
  const count = random() < .5 ? 2 : 3;
  return [
    ...distractors.slice(0, count).map(signal => ({ signal, durationMs: 700 + random() * 900 })),
    { signal: 'CLEARED', durationMs: WINDOW_MS },
  ];
}

/** One synchronous state owner, one timer, and a generation guard for canceled callbacks. */
export class SignalGame {
  private state = initialState();
  private sequence: Step[] = [];
  private timer: number | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(private clock: Clock) {}
  getSnapshot = (): State => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: State) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  private clearTimer() {
    this.generation++;
    if (this.timer !== null) this.clock.cancel(this.timer);
    this.timer = null;
  }
  private schedule(callback: () => void, delay: number) {
    const generation = this.generation;
    this.timer = this.clock.schedule(() => {
      if (generation !== this.generation) return;
      this.clearTimer();
      if (this.clock.isAvailable?.() === false) { this.interrupt(); return; }
      callback();
    }, delay);
  }
  beginRound = () => {
    if (this.clock.isAvailable?.() === false || !['instructions', 'result'].includes(this.state.phase)) return;
    this.clearTimer();
    this.sequence = createSequence(this.clock.random);
    this.showStep(0);
  };
  private showStep(index: number) {
    const step = this.sequence[index];
    if (step.signal === 'CLEARED') {
      const activatedAt = this.clock.now();
      this.publish({ ...this.state, phase: 'target', signal: 'CLEARED', activatedAt });
      this.armDeadline();
    } else {
      this.publish({ ...this.state, phase: 'distractor', signal: step.signal, activatedAt: null });
      this.schedule(() => this.showStep(index + 1), step.durationMs);
    }
  }
  private armDeadline() {
    if (this.state.phase !== 'target' || this.state.activatedAt === null) return;
    const remaining = WINDOW_MS - (this.clock.now() - this.state.activatedAt);
    if (remaining <= 0) this.finish({ kind: 'timeout', reason: 'deadline' });
    else this.schedule(() => this.armDeadline(), remaining);
  }
  private finish(outcome: Outcome) {
    if (this.state.phase !== 'distractor' && this.state.phase !== 'target') return;
    this.clearTimer();
    const rounds = [...this.state.rounds, outcome];
    this.publish({ phase: rounds.length === 5 ? 'complete' : 'result', signal: null, activatedAt: null, rounds });
  }
  respond = () => {
    if (this.clock.isAvailable?.() === false) { this.interrupt(); return; }
    if (this.state.phase === 'distractor' && this.state.signal && this.state.signal !== 'CLEARED') {
      this.finish({ kind: 'incorrect', signal: this.state.signal });
    } else if (this.state.phase === 'target' && this.state.activatedAt !== null) {
      const elapsed = this.clock.now() - this.state.activatedAt;
      // Input cannot beat the deadline simply by running before an overdue timer callback.
      this.finish(elapsed >= WINDOW_MS ? { kind: 'timeout', reason: 'deadline' } : { kind: 'correct', reactionMs: elapsed });
    }
  };
  interrupt = () => {
    if (this.state.phase === 'distractor' || this.state.phase === 'target') {
      this.finish({ kind: 'timeout', reason: 'interrupted' });
    } else this.clearTimer();
  };
  restart = () => {
    this.clearTimer();
    this.sequence = [];
    this.publish(initialState());
  };
  dispose = () => {
    this.clearTimer();
    this.listeners.clear();
    this.sequence = [];
    this.state = initialState();
  };
}

export const roundScore = (outcome: Outcome) => outcome.kind === 'correct' ? outcome.reactionMs : WINDOW_MS;
export function outcomeLabel(outcome: Outcome) {
  if (outcome.kind === 'correct') return 'Correct · measured response';
  if (outcome.kind === 'incorrect') return `Incorrect · responded to ${outcome.signal}`;
  return outcome.reason === 'interrupted' ? 'Timeout · round interrupted' : 'Timeout · no response within 3 seconds';
}

export function summarize(state: State) {
  if (state.phase !== 'complete' || state.rounds.length !== 5) throw new Error('Five completed rounds are required.');
  const correct = state.rounds.filter(outcome => outcome.kind === 'correct');
  const scores = state.rounds.map(roundScore);
  return {
    rounds: state.rounds.map(outcome => ({ ...outcome })), scores,
    score: median(scores)!,
    fastest: correct.length ? Math.min(...correct.map(outcome => outcome.reactionMs)) : null,
    accuracy: correct.length / 5 * 100,
    correct: correct.length,
    incorrect: state.rounds.filter(outcome => outcome.kind === 'incorrect').length,
    timeouts: state.rounds.filter(outcome => outcome.kind === 'timeout').length,
  };
}
export const BEST_KEY = 'pilot-reflex.signal-response.competitive-median.v1';
type BestStorage = Pick<Storage, 'getItem' | 'setItem'>;
function parseBest(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= WINDOW_MS ? value : null;
}
export function readBest(storage: Pick<Storage, 'getItem'>) {
  try { return parseBest(storage.getItem(BEST_KEY)); } catch { return null; }
}
export function completeReport(state: State, storage: BestStorage | null) {
  const summary = summarize(state);
  let previousBest: number | null | undefined;
  let saved = false;
  try {
    if (storage) previousBest = parseBest(storage.getItem(BEST_KEY));
  } catch { /* A blocked read is different from a first session. */ }
  const comparison: 'unavailable' | 'first' | 'new' | 'matched' | 'not-beaten' = previousBest === undefined ? 'unavailable'
    : previousBest === null ? 'first'
    : summary.score < previousBest ? 'new'
    : summary.score === previousBest ? 'matched' : 'not-beaten';
  try {
    // If reading failed, do not risk overwriting a better stored score.
    if (storage && previousBest !== undefined) {
      storage.setItem(BEST_KEY, String(previousBest === null ? summary.score : Math.min(previousBest, summary.score)));
      saved = true;
    }
  } catch { /* Completion and the report still work without writable storage. */ }
  return { ...summary, previousBest, comparison, saved };
}
export type CompletedReport = ReturnType<typeof completeReport>;
