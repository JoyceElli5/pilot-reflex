export type InstrumentId = 'altitude' | 'heading' | 'airspeed' | 'verticalSpeed';
export const INSTRUMENTS: readonly { id: InstrumentId; name: string; unit: string; values: readonly number[] }[] = [
  { id: 'altitude', name: 'Altitude', unit: 'feet', values: [2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000, 8500, 9000, 9500] },
  { id: 'heading', name: 'Heading', unit: 'degrees', values: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] },
  { id: 'airspeed', name: 'Airspeed', unit: 'knots', values: [90, 110, 130, 150, 170, 190, 210] },
  { id: 'verticalSpeed', name: 'Vertical speed', unit: 'feet per minute', values: [-1500, -1000, -500, 0, 500, 1000, 1500] },
];
export type Readings = Readonly<Record<InstrumentId, number>>;
export type Puzzle = Readonly<{ before: Readings; after: Readings; changed: InstrumentId }>;
type Result =
  | { kind: 'correct'; selected: InstrumentId; decisionMs: number }
  | { kind: 'incorrect'; selected: InstrumentId; decisionMs: number }
  | { kind: 'timeout'; reason: 'deadline' | 'interrupted' };
export type Outcome = Readonly<Result & { puzzle: Puzzle }>;
export type Phase = 'instructions' | 'observe' | 'transition' | 'identify' | 'result' | 'complete';
export type State = Readonly<{
  phase: Phase;
  puzzle: Puzzle | null;
  decisionStartedAt: number | null;
  rounds: readonly Outcome[];
}>;
type Clock = {
  now: () => number;
  random: () => number;
  isAvailable?: () => boolean;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (token: number) => void;
};
const durations = { observe: 4000, transition: 1000, identify: 5000 } as const;
type TimedPhase = keyof typeof durations;
const initialState = (): State => ({ phase: 'instructions', puzzle: null, decisionStartedAt: null, rounds: [] });

export function generateRound(random: () => number): Puzzle {
  const before = {} as Record<InstrumentId, number>;
  for (const item of INSTRUMENTS) before[item.id] = item.values[Math.floor(random() * item.values.length)];
  const changed = INSTRUMENTS[Math.floor(random() * INSTRUMENTS.length)];
  const originalIndex = changed.values.indexOf(before[changed.id]);
  // A nonzero offset guarantees a distinct replacement without a random retry loop.
  const offset = 1 + Math.floor(random() * (changed.values.length - 1));
  const replacement = changed.values[(originalIndex + offset) % changed.values.length];
  return { before, after: { ...before, [changed.id]: replacement }, changed: changed.id };
}

export function formatReading(id: InstrumentId, value: number): string {
  if (id === 'heading') return String(value).padStart(3, '0');
  const absolute = Math.abs(value).toLocaleString('en-US');
  return value < 0 ? `−${absolute}` : id === 'verticalSpeed' && value > 0 ? `+${absolute}` : absolute;
}
export const instrumentName = (id: InstrumentId) => INSTRUMENTS.find(item => item.id === id)!.name;

/** React renders snapshots; synchronous transitions enforce one outcome per round. */
export class FocusGame {
  private state = initialState();
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
  beginRound = () => {
    if (this.clock.isAvailable?.() === false || !['instructions', 'result'].includes(this.state.phase)) return;
    this.state = { ...this.state, puzzle: generateRound(this.clock.random) };
    this.enterPhase('observe');
  };
  private enterPhase(phase: TimedPhase) {
    this.clearTimer();
    const generation = this.generation;
    const startedAt = this.clock.now();
    this.publish({ ...this.state, phase, decisionStartedAt: phase === 'identify' ? startedAt : null });
    if (generation === this.generation) this.armPhase(phase, startedAt + durations[phase]);
  }
  private armPhase(phase: TimedPhase, deadline: number) {
    if (this.state.phase !== phase) return;
    const remaining = deadline - this.clock.now();
    if (remaining <= 0) {
      if (phase === 'observe') this.enterPhase('transition');
      else if (phase === 'transition') this.enterPhase('identify');
      else this.finish({ kind: 'timeout', reason: 'deadline' });
      return;
    }
    const generation = this.generation;
    this.timer = this.clock.schedule(() => {
      if (generation !== this.generation || this.state.phase !== phase) return;
      this.timer = null;
      if (this.clock.isAvailable?.() === false) { this.interrupt(); return; }
      this.armPhase(phase, deadline);
    }, remaining);
  }
  answer = (selected: InstrumentId) => {
    if (this.clock.isAvailable?.() === false) { this.interrupt(); return; }
    if (this.state.phase !== 'identify' || !this.state.puzzle || this.state.decisionStartedAt === null) return;
    if (!INSTRUMENTS.some(item => item.id === selected)) return;
    const decisionMs = this.clock.now() - this.state.decisionStartedAt;
    if (decisionMs >= durations.identify) this.finish({ kind: 'timeout', reason: 'deadline' });
    else this.finish({ kind: selected === this.state.puzzle.changed ? 'correct' : 'incorrect', selected, decisionMs });
  };
  private finish(result: Result) {
    if (!['observe', 'transition', 'identify'].includes(this.state.phase) || !this.state.puzzle) return;
    this.clearTimer();
    const rounds = [...this.state.rounds, { ...result, puzzle: this.state.puzzle }];
    this.publish({ ...this.state, rounds, decisionStartedAt: null, phase: rounds.length === 5 ? 'complete' : 'result' });
  }
  // All live phases count as a timeout on interruption, with no invented decision time.
  interrupt = () => {
    if (['observe', 'transition', 'identify'].includes(this.state.phase)) this.finish({ kind: 'timeout', reason: 'interrupted' });
    else this.clearTimer();
  };
  restart = () => { this.clearTimer(); this.publish(initialState()); };
  dispose = () => { this.clearTimer(); this.listeners.clear(); this.state = initialState(); };
}
