/* eslint-disable @typescript-eslint/no-require-imports -- Node 20 CommonJS test harness loads TypeScript through the local compiler hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ReactionGame, median, readBest, saveBest, BEST_KEY } = require('../src/app/challenges/visual-reaction/game.ts');

function setup(random = 0) {
  let now = 100;
  let id = 0;
  const pending = new Map();
  const game = new ReactionGame({
    now: () => now, random: () => random,
    schedule: (fn, delay) => { pending.set(++id, { fn, delay }); return id; },
    cancel: (token) => pending.delete(token),
  });
  return {
    game, pending,
    advance(ms) { now += ms; },
    green() { const [key, timer] = pending.entries().next().value; pending.delete(key); now += timer.delay; timer.fn(); },
    valid(ms) { game.beginTrial(); this.green(); this.advance(ms); game.respond(); },
  };
}

test('instructions → waiting → active → result, using the activation timestamp', () => {
  const h = setup();
  assert.equal(h.game.getSnapshot().phase, 'instructions');
  h.game.respond();
  assert.deepEqual(h.game.getSnapshot().times, []);
  h.game.beginTrial();
  assert.equal(h.game.getSnapshot().phase, 'waiting');
  assert.equal([...h.pending.values()][0].delay, 2000);
  h.green();
  assert.equal(h.game.getSnapshot().phase, 'active');
  h.advance(247.25);
  h.game.respond();
  assert.equal(h.game.getSnapshot().phase, 'result');
  assert.deepEqual(h.game.getSnapshot().times, [247.25]);
});

test('random wait stays within 2–5 seconds', () => {
  const h = setup(0.999999);
  h.game.beginTrial();
  assert.ok([...h.pending.values()][0].delay >= 2000);
  assert.ok([...h.pending.values()][0].delay <= 5000);
});

test('early input cancels timer, counts once, and retries the same trial', () => {
  const h = setup();
  h.game.beginTrial();
  const stale = [...h.pending.values()][0].fn;
  h.game.respond(); h.game.respond();
  assert.equal(h.pending.size, 0);
  assert.equal(h.game.getSnapshot().phase, 'false-start');
  assert.equal(h.game.getSnapshot().falseStarts, 1);
  assert.equal(h.game.getSnapshot().times.length, 0);
  h.game.beginTrial();
  stale();
  assert.equal(h.game.getSnapshot().phase, 'waiting');
  h.green(); h.advance(200); h.game.respond();
  assert.deepEqual(h.game.getSnapshot().times, [200]);
});

test('exactly five valid trials complete a session; duplicate inputs are ignored', () => {
  const h = setup();
  for (const ms of [300, 200, 500, 100, 250]) {
    h.valid(ms);
    h.game.respond();
  }
  const state = h.game.getSnapshot();
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.times, [300, 200, 500, 100, 250]);
  h.game.beginTrial(); h.game.respond();
  assert.equal(h.game.getSnapshot(), state);
  assert.equal(h.pending.size, 0);
});

test('median sorts a copy and handles odd/even samples', () => {
  const values = [300, 200, 500, 100, 250];
  assert.equal(median(values), 250);
  assert.equal(median([400, 100]), 250);
  assert.deepEqual(values, [300, 200, 500, 100, 250]);
  assert.equal(median([]), null);
});

test('restart clears scores, false starts and stale timers', () => {
  const h = setup();
  h.valid(200); h.game.beginTrial(); h.game.respond(); h.game.beginTrial();
  const stale = [...h.pending.values()][0].fn;
  h.game.restart(); stale();
  assert.equal(h.pending.size, 0);
  assert.deepEqual(h.game.getSnapshot(), { phase: 'instructions', times: [], falseStarts: 0, timeouts: 0, activatedAt: null });
  h.valid(150);
  assert.deepEqual(h.game.getSnapshot().times, [150]);
});

test('duplicate starts do not schedule extra timers', () => {
  const h = setup();
  h.game.beginTrial(); h.game.beginTrial();
  assert.equal(h.pending.size, 1);
  h.green(); h.game.beginTrial();
  assert.equal(h.pending.size, 1);
  assert.equal(h.game.getSnapshot().phase, 'active');
});

test('interrupt and dispose cancel timers and invalidate queued callbacks', () => {
  for (const method of ['interrupt', 'dispose']) {
    const h = setup();
    h.game.beginTrial();
    const stale = [...h.pending.values()][0].fn;
    h.game[method](); stale(); h.game.respond();
    assert.equal(h.pending.size, 0);
    assert.equal(h.game.getSnapshot().times.length, 0);
    assert.equal(h.game.getSnapshot().falseStarts, 0);
  }
  const h = setup(); h.game.beginTrial(); h.green(); h.game.interrupt(); h.game.respond();
  assert.equal(h.game.getSnapshot().phase, 'interrupted');
  assert.equal(h.game.getSnapshot().times.length, 0);
  h.valid(200);
  assert.deepEqual(h.game.getSnapshot().times, [200]);
});

test('personal best only persists completed sessions and retains the lower median', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const h = setup(); h.valid(200);
  assert.equal(saveBest(storage, h.game.getSnapshot()), null);
  assert.equal(data.size, 0);
  for (let i = 0; i < 4; i++) h.valid(200);
  assert.equal(saveBest(storage, h.game.getSnapshot()), 200);
  assert.equal(readBest(storage), 200);
  storage.setItem(BEST_KEY, '150');
  assert.equal(saveBest(storage, h.game.getSnapshot()), 150);
  storage.setItem(BEST_KEY, '500');
  assert.equal(saveBest(storage, h.game.getSnapshot()), 200);
});

test('corrupt and unavailable storage are harmless', () => {
  for (const value of ['', 'nope', '-1', 'Infinity', 'null']) {
    assert.equal(readBest({ getItem: () => value }), null);
  }
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(readBest(storage), null);
  const h = setup(); for (let i = 0; i < 5; i++) h.valid(200);
  assert.equal(saveBest(storage, h.game.getSnapshot()), null);
});

test('held keys are rejected until released, including across trial changes', () => {
  const { KeyLatch } = require('../src/app/challenges/visual-reaction/input.ts');
  const latch = new KeyLatch();
  assert.equal(latch.press('Space', false), true);
  assert.equal(latch.press('Space', true), false);
  assert.equal(latch.press('Space', false), false);
  latch.release('Space');
  assert.equal(latch.press('Space', true), false);
  latch.release('Space');
  assert.equal(latch.press('Space', false), true);
  latch.clear();
  assert.equal(latch.press('Enter', false), true);
});


test('green expires after 3000 ms and rejects all late responses', () => {
  const h = setup(); h.game.beginTrial(); h.green();
  assert.equal([...h.pending.values()][0]?.delay, 3000);
  h.green(); // Fire the response-window timer at its deadline.
  const state = h.game.getSnapshot();
  assert.equal(state.phase, 'timeout');
  assert.equal(state.timeouts, 1);
  assert.equal(state.falseStarts, 0);
  assert.equal(state.activatedAt, null);
  assert.deepEqual(state.times, []);
  assert.equal(h.pending.size, 0);
  h.game.respond(); h.game.respond();
  assert.equal(h.game.getSnapshot(), state);
});

for (const elapsed of [2999.5, 3000, 3000.5, 4500]) {
  test(`response at ${elapsed} ms enforces the deadline before the timer callback`, () => {
    const h = setup(); h.game.beginTrial(); h.green();
    const stale = [...h.pending.values()][0]?.fn;
    h.advance(elapsed); h.game.respond();
    assert.equal(h.game.getSnapshot().phase, elapsed < 3000 ? 'result' : 'timeout');
    assert.deepEqual(h.game.getSnapshot().times, elapsed < 3000 ? [2999.5] : []);
    assert.equal(h.game.getSnapshot().timeouts, elapsed < 3000 ? 0 : 1);
    assert.equal(h.pending.size, 0);
    const state = h.game.getSnapshot();
    stale?.(); h.game.respond();
    assert.equal(h.game.getSnapshot(), state);
  });
}

test('an early timer callback re-arms the remaining monotonic window', () => {
  const h = setup(); h.game.beginTrial(); h.green();
  const entry = h.pending.entries().next().value;
  assert.ok(entry);
  const [id, timer] = entry;
  h.pending.delete(id); h.advance(2999); timer.fn();
  assert.equal(h.game.getSnapshot().phase, 'active');
  assert.equal([...h.pending.values()][0].delay, 1);
  h.advance(0.5); h.game.respond();
  assert.deepEqual(h.game.getSnapshot().times, [2999.5]);
  assert.equal(h.pending.size, 0);
});

test('timeout retries the same trial and completion still requires five valid trials', () => {
  const h = setup(); h.valid(250);
  h.game.beginTrial(); h.game.respond(); // One false start.
  h.game.beginTrial(); h.green();
  const stale = [...h.pending.values()][0]?.fn;
  h.advance(3000); h.game.respond();
  assert.equal(h.game.getSnapshot().timeouts, 1);
  assert.equal(h.game.getSnapshot().falseStarts, 1);
  assert.deepEqual(h.game.getSnapshot().times, [250]);
  h.game.beginTrial(); h.green(); stale?.();
  assert.equal(h.game.getSnapshot().phase, 'active');
  h.advance(200); h.game.respond(); h.game.respond();
  h.valid(300); h.valid(100);
  assert.equal(h.game.getSnapshot().phase, 'result');
  h.valid(150);
  assert.equal(h.game.getSnapshot().phase, 'complete');
  assert.deepEqual(h.game.getSnapshot().times, [250, 200, 300, 100, 150]);
  assert.equal(median(h.game.getSnapshot().times), 200);
  assert.equal(h.game.getSnapshot().timeouts, 1);
  assert.equal(h.pending.size, 0);
  h.game.restart();
  assert.equal(h.game.getSnapshot().timeouts, 0);
});

for (const action of ['restart', 'dispose', 'interrupt']) {
  test(`${action} cancels the active deadline and invalidates its callback`, () => {
    const h = setup(); h.game.beginTrial(); h.green();
    assert.equal(h.pending.size, 1);
    const stale = [...h.pending.values()][0].fn;
    h.game[action]();
    assert.equal(h.pending.size, 0);
    h.advance(3000); stale(); h.game.respond();
    assert.equal(h.game.getSnapshot().timeouts, 0);
    assert.deepEqual(h.game.getSnapshot().times, []);
    h.game.beginTrial(); h.green(); stale();
    assert.equal(h.game.getSnapshot().phase, 'active');
    h.advance(100); h.game.respond();
    assert.deepEqual(h.game.getSnapshot().times, [100]);
  });
}
