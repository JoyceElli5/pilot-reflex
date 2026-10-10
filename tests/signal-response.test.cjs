/* eslint-disable @typescript-eslint/no-require-imports -- Node 20 CommonJS test harness loads TypeScript through the local compiler hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SignalGame, createSequence, summarize, readBest, completeReport, BEST_KEY } = require('../src/app/challenges/signal-response/game.ts');
const { KeyLatch } = require('../src/app/challenges/visual-reaction/input.ts');

function setup(random = () => .25) {
  let now = 100; let available = true; let id = 0;
  const pending = new Map();
  const game = new SignalGame({
    now: () => now, random, isAvailable: () => available,
    schedule: (fn, delay) => { pending.set(++id, { fn, delay }); return id; },
    cancel: token => pending.delete(token),
  });
  return {
    game, pending,
    advance(ms) { now += ms; },
    hide() { available = false; },
    fire() { const [key, timer] = pending.entries().next().value; pending.delete(key); now += timer.delay; timer.fn(); },
    target() { while (game.getSnapshot().phase === 'distractor') this.fire(); },
    correct(ms) { game.beginRound(); this.target(); this.advance(ms); game.respond(); },
  };
}

const correct = reactionMs => ({ kind: 'correct', reactionMs });
const incorrect = { kind: 'incorrect', signal: 'HOLD' };
const timeout = { kind: 'timeout', reason: 'deadline' };
const complete = rounds => ({ phase: 'complete', signal: null, activatedAt: null, rounds });
const storageWith = initial => {
  const data = new Map(initial);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('sequence has shuffled distractors, varied delays, and exactly one final CLEARED', () => {
  const first = createSequence(() => 0);
  const other = createSequence(() => .99999);
  for (const sequence of [first, other]) {
    assert.ok(sequence.length >= 3 && sequence.length <= 4);
    assert.equal(sequence.at(-1).signal, 'CLEARED');
    assert.equal(sequence.filter(x => x.signal === 'CLEARED').length, 1);
    assert.ok(sequence.slice(0, -1).every(x => ['STANDBY', 'HOLD', 'MONITOR'].includes(x.signal) && x.durationMs >= 700 && x.durationMs <= 1600));
  }
  assert.notDeepEqual(first.map(x => x.signal), other.map(x => x.signal));
  assert.notEqual(first.slice(0, -1).reduce((n, x) => n + x.durationMs, 0), other.slice(0, -1).reduce((n, x) => n + x.durationMs, 0));
});

test('correct response uses the actual CLEARED activation timestamp', () => {
  const h = setup(); h.game.respond(); assert.deepEqual(h.game.getSnapshot().rounds, []);
  h.game.beginRound(); assert.equal(h.game.getSnapshot().phase, 'distractor');
  h.target(); assert.equal(h.game.getSnapshot().signal, 'CLEARED');
  h.advance(231.75); h.game.respond();
  assert.equal(h.game.getSnapshot().phase, 'result');
  assert.deepEqual(h.game.getSnapshot().rounds, [correct(231.75)]);
  assert.equal(h.pending.size, 0);
});

test('responding to each distractor consumes exactly one round and cancels sequence', () => {
  for (const index of [0, 1, 2]) {
    const h = setup(() => .9); h.game.beginRound();
    for (let n = 0; n < index; n++) h.fire();
    const signal = h.game.getSnapshot().signal;
    const stale = [...h.pending.values()][0].fn;
    h.game.respond(); h.game.respond(); stale();
    assert.deepEqual(h.game.getSnapshot().rounds, [{ kind: 'incorrect', signal }]);
    assert.equal(h.pending.size, 0);
    h.game.beginRound(); stale(); assert.equal(h.game.getSnapshot().phase, 'distractor');
  }
});

for (const elapsed of [2999.5, 3000, 3000.5, 5000]) {
  test(`response at ${elapsed} ms enforces deadline independently of timer order`, () => {
    const h = setup(); h.game.beginRound(); h.target();
    const stale = [...h.pending.values()][0].fn;
    h.advance(elapsed); h.game.respond();
    const state = h.game.getSnapshot();
    assert.deepEqual(state.rounds, [elapsed < 3000 ? correct(2999.5) : timeout]);
    stale(); h.game.respond(); assert.equal(h.game.getSnapshot(), state);
    assert.equal(h.pending.size, 0);
  });
}

test('target expires at 3000 ms; early callback re-arms the remaining time', () => {
  const h = setup(); h.game.beginRound(); h.target();
  const [key, timer] = h.pending.entries().next().value;
  assert.equal(timer.delay, 3000);
  h.pending.delete(key); h.advance(2999); timer.fn();
  assert.equal(h.game.getSnapshot().phase, 'target');
  assert.equal([...h.pending.values()][0].delay, 1);
  h.fire(); h.game.respond();
  assert.deepEqual(h.game.getSnapshot().rounds, [timeout]);
});

for (const outcome of ['correct', 'incorrect', 'timeout', 'mixed']) {
  test(`five ${outcome} rounds complete, with no sixth round or duplicate input`, () => {
    const h = setup();
    for (let index = 0; index < 5; index++) {
      h.game.beginRound(); h.game.beginRound(); assert.equal(h.pending.size, 1);
      const kind = outcome === 'mixed' ? ['correct', 'incorrect', 'timeout', 'correct', 'correct'][index] : outcome;
      if (kind === 'incorrect') h.game.respond();
      else { h.target(); if (kind === 'timeout') h.fire(); else { h.advance(200); h.game.respond(); } }
      h.game.respond(); assert.equal(h.game.getSnapshot().rounds.length, index + 1);
    }
    const state = h.game.getSnapshot();
    assert.equal(state.phase, 'complete'); h.game.beginRound(); h.game.respond();
    assert.equal(h.game.getSnapshot(), state); assert.equal(h.pending.size, 0);
    const report = summarize(state);
    assert.equal(report.score, outcome === 'incorrect' || outcome === 'timeout' ? 3000 : 200);
    assert.equal(report.accuracy, outcome === 'mixed' ? 60 : outcome === 'correct' ? 100 : 0);
    assert.equal(report.fastest, outcome === 'incorrect' || outcome === 'timeout' ? null : 200);
  });
}

test('summary includes penalty scores, correct-only fastest and all outcome counts', () => {
  const report = summarize(complete([correct(300), incorrect, correct(100), timeout, correct(200)]));
  assert.equal(report.score, 300); assert.equal(report.fastest, 100);
  assert.equal(report.correct, 3); assert.equal(report.incorrect, 1); assert.equal(report.timeouts, 1); assert.equal(report.accuracy, 60);
  assert.deepEqual(report.scores, [300, 3000, 100, 3000, 200]);
  assert.throws(() => summarize(complete([correct(100)])));
  assert.throws(() => summarize({ ...complete(Array(5).fill(correct(100))), phase: 'result' }));
});

for (const phase of ['distractor', 'target']) {
  for (const action of ['restart', 'dispose']) {
    test(`${action} during ${phase} clears timers and rejects queued callbacks`, () => {
      const h = setup(); h.game.beginRound(); if (phase === 'target') h.target();
      const stale = [...h.pending.values()][0].fn;
      h.game[action](); stale(); h.game.respond();
      assert.equal(h.game.getSnapshot().phase, 'instructions'); assert.deepEqual(h.game.getSnapshot().rounds, []);
      assert.equal(h.pending.size, 0);
      h.game.beginRound(); stale(); assert.equal(h.game.getSnapshot().phase, 'distractor');
    });
  }
  test(`hidden ${phase} round is a single timeout, never a measured response`, () => {
    const h = setup(); h.game.beginRound(); if (phase === 'target') h.target();
    const stale = [...h.pending.values()][0].fn;
    h.hide(); h.game.respond(); h.game.interrupt(); stale();
    assert.deepEqual(h.game.getSnapshot().rounds, [{ kind: 'timeout', reason: 'interrupted' }]);
    assert.equal(h.pending.size, 0); h.game.beginRound(); assert.equal(h.pending.size, 0);
  });
}

test('timer callbacks cannot activate a hidden signal; idle blur consumes nothing', () => {
  const h = setup(); h.game.interrupt(); assert.deepEqual(h.game.getSnapshot().rounds, []);
  h.game.beginRound(); h.hide(); h.fire();
  assert.deepEqual(h.game.getSnapshot().rounds, [{ kind: 'timeout', reason: 'interrupted' }]);
});

test('held key guard survives round changes and suppresses repeats', () => {
  const h = setup(); const keys = new KeyLatch(); h.game.beginRound();
  if (keys.press('Space', false)) h.game.respond();
  h.game.beginRound();
  for (const repeat of [true, false]) if (keys.press('Space', repeat)) h.game.respond();
  assert.equal(h.game.getSnapshot().rounds.length, 1);
  keys.release('Space'); h.target(); h.advance(200);
  if (keys.press('Space', false)) h.game.respond();
  assert.equal(h.game.getSnapshot().rounds.length, 2);
});

test('Signal Response personal best is versioned and isolated from Visual Reaction', () => {
  const visualKey = 'pilot-reflex.visual-reaction.competitive-median.v2';
  const storage = storageWith([[visualKey, '50']]);
  assert.match(BEST_KEY, /signal-response.*v1$/); assert.equal(readBest(storage), null);
  const report = completeReport(complete([correct(300), incorrect, correct(100), timeout, correct(200)]), storage);
  assert.equal(report.score, 300); assert.equal(report.previousBest, null); assert.equal(report.comparison, 'first');
  assert.equal(readBest(storage), 300); assert.equal(storage.getItem(visualKey), '50');
  const improved = completeReport(complete(Array(5).fill(correct(150))), storage);
  assert.equal(improved.previousBest, 300); assert.equal(improved.comparison, 'new');
  assert.equal(completeReport(complete(Array(5).fill(correct(150))), storage).comparison, 'matched');
  assert.equal(completeReport(complete(Array(5).fill(timeout)), storage).comparison, 'not-beaten');
  assert.equal(readBest(storage), 150);
  const h = setup(); h.correct(200); h.game.restart(); h.game.beginRound();
  assert.deepEqual(h.game.getSnapshot().rounds, []); assert.equal(readBest(storage), 150);
});

test('storage failures and corrupt values do not prevent completion', () => {
  for (const value of ['', '-1', 'NaN', '3001', 'Infinity']) assert.equal(readBest(storageWith([[BEST_KEY, value]])), null);
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const report = completeReport(complete(Array(5).fill(timeout)), blocked);
  assert.equal(report.score, 3000); assert.equal(report.saved, false); assert.equal(report.comparison, 'unavailable');
});
