/* eslint-disable @typescript-eslint/no-require-imports -- Node 20 CommonJS test harness loads TypeScript through the local compiler hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ReactionGame, median, readBest, saveBest, BEST_KEY } = require('../src/app/challenges/visual-reaction/game.ts');

function setup(random = 0) {
  let now = 100;
  let available = true;
  let id = 0;
  const pending = new Map();
  const game = new ReactionGame({
    isAvailable: () => available,
    now: () => now, random: () => random,
    schedule: (fn, delay) => { pending.set(++id, { fn, delay }); return id; },
    cancel: (token) => pending.delete(token),
  });
  return {
    game, pending,
    hide() { available = false; },
    advance(ms) { now += ms; },
    green() { const [key, timer] = pending.entries().next().value; pending.delete(key); now += timer.delay; timer.fn(); },
    valid(ms) { game.beginAttempt(); this.green(); this.advance(ms); game.respond(); },
  };
}

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



test('five mixed outcomes consume exactly five attempts and score penalties', () => {
  const h = setup();
  h.game.respond(); assert.equal(h.game.getSnapshot().attempts.length, 0);
  h.valid(200);
  h.game.beginAttempt(); h.game.respond(); h.game.respond();
  h.game.beginAttempt(); h.green(); h.green();
  h.valid(400); assert.equal(h.game.getSnapshot().phase, 'result');
  h.valid(300);
  const state = h.game.getSnapshot();
  assert.equal(state.phase, 'complete');
  assert.deepEqual(state.attempts.map(a => a.kind), ['valid', 'false-start', 'timeout', 'valid', 'valid']);
  assert.deepEqual(state.times, [200, 400, 300]);
  assert.equal(state.falseStarts, 1); assert.equal(state.timeouts, 1);
  h.game.beginAttempt(); h.game.respond(); assert.equal(h.game.getSnapshot(), state);
  assert.equal(h.pending.size, 0);
});

for (const outcome of ['valid', 'false-start', 'timeout']) {
  test(`five ${outcome} outcomes complete the session`, () => {
    const h = setup();
    for (let i = 0; i < 5; i++) {
      h.game.beginAttempt();
      if (outcome !== 'false-start') h.green();
      if (outcome === 'timeout') h.green(); else { h.advance(250); h.game.respond(); }
      assert.equal(h.game.getSnapshot().attempts.length, i + 1);
    }
    assert.equal(h.game.getSnapshot().phase, 'complete');
    assert.equal(h.game.getSnapshot().falseStarts, outcome === 'false-start' ? 5 : 0);
    assert.equal(h.game.getSnapshot().timeouts, outcome === 'timeout' ? 5 : 0);
    assert.equal(h.pending.size, 0);
  });
}

for (const elapsed of [2999.5, 3000, 3000.5, 4500]) {
  test(`response at ${elapsed} ms uses monotonic deadline and records once`, () => {
    const h = setup(); h.game.beginAttempt(); h.green();
    const stale = [...h.pending.values()][0].fn;
    h.advance(elapsed); h.game.respond();
    const state = h.game.getSnapshot();
    assert.equal(state.attempts[0].kind, elapsed < 3000 ? 'valid' : 'timeout');
    assert.deepEqual(state.times, elapsed < 3000 ? [2999.5] : []);
    stale(); h.game.respond(); assert.equal(h.game.getSnapshot(), state);
    assert.equal(h.pending.size, 0);
  });
}

test('false start clears waiting timer and advances to next attempt', () => {
  const h = setup(); h.game.beginAttempt(); const stale = [...h.pending.values()][0].fn;
  h.game.respond(); assert.equal(h.pending.size, 0);
  h.game.beginAttempt(); stale(); assert.equal(h.game.getSnapshot().phase, 'waiting');
  h.green(); h.advance(100); h.game.respond();
  assert.equal(h.game.getSnapshot().attempts.length, 2);
});

test('duplicate starts do not create extra timers; early deadline callbacks re-arm', () => {
  const h = setup(); h.game.beginAttempt(); h.game.beginAttempt(); assert.equal(h.pending.size, 1);
  h.green(); h.game.beginAttempt(); assert.equal(h.pending.size, 1);
  const [id, timer] = h.pending.entries().next().value;
  h.pending.delete(id); h.advance(2999); timer.fn();
  assert.equal(h.game.getSnapshot().phase, 'active');
  assert.equal([...h.pending.values()][0].delay, 1);
  h.advance(.5); h.game.respond(); assert.deepEqual(h.game.getSnapshot().times, [2999.5]);
});

for (const phase of ['waiting', 'active']) {
  test(`interruption during ${phase} consumes one attempt as timeout`, () => {
    const h = setup(); h.game.beginAttempt(); if (phase === 'active') h.green();
    const stale = [...h.pending.values()][0].fn;
    h.game.interrupt(); h.game.interrupt(); h.advance(5000); stale(); h.game.respond();
    assert.deepEqual(h.game.getSnapshot().attempts, [{ kind: 'timeout', reason: 'interrupted' }]);
    assert.equal(h.game.getSnapshot().timeouts, 1); assert.equal(h.pending.size, 0);
    h.valid(200); assert.equal(h.game.getSnapshot().attempts.length, 2);
  });
  for (const action of ['restart', 'dispose']) {
    test(`${action} cancels ${phase} timers and starts clean`, () => {
      const h = setup(); h.game.beginAttempt(); if (phase === 'active') h.green();
      const stale = [...h.pending.values()][0].fn;
      h.game[action](); stale(); h.game.respond();
      assert.equal(h.pending.size, 0); assert.deepEqual(h.game.getSnapshot().attempts, []);
      assert.equal(h.game.getSnapshot().phase, 'instructions'); h.valid(150);
      assert.deepEqual(h.game.getSnapshot().times, [150]);
    });
  }
}

test('interruption of the fifth attempt completes; idle interruptions consume nothing', () => {
  const h = setup(); h.game.interrupt(); assert.equal(h.game.getSnapshot().attempts.length, 0);
  for (let i = 0; i < 4; i++) { h.valid(200); h.game.interrupt(); }
  h.game.beginAttempt(); h.game.interrupt();
  assert.equal(h.game.getSnapshot().phase, 'complete');
  assert.equal(h.game.getSnapshot().attempts.length, 5);
});

test('competitive personal best uses a new version and includes penalties', () => {
  const data = new Map([['pilot-reflex.visual-reaction.best-median.v1', '50']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.notEqual(BEST_KEY, 'pilot-reflex.visual-reaction.best-median.v1');
  assert.equal(readBest(storage), null);
  const h = setup(); h.valid(100); h.valid(200);
  assert.equal(saveBest(storage, h.game.getSnapshot()), null);
  for (let i = 0; i < 3; i++) { h.game.beginAttempt(); h.game.respond(); }
  assert.equal(saveBest(storage, h.game.getSnapshot()), 3000);
  h.game.restart(); for (let i = 0; i < 5; i++) h.valid(250);
  assert.equal(saveBest(storage, h.game.getSnapshot()), 250);
  h.game.restart(); assert.equal(readBest(storage), 250);
  assert.equal(data.get('pilot-reflex.visual-reaction.best-median.v1'), '50');
});

test('median and corrupt/unavailable storage remain safe', () => {
  assert.equal(median([3000, 100, 3000, 200, 300]), 300);
  for (const value of ['', 'bad', '-1', 'Infinity', '3001']) assert.equal(readBest({ getItem: () => value }), null);
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const h = setup(); for (let i = 0; i < 5; i++) h.valid(200);
  assert.equal(saveBest(storage, h.game.getSnapshot()), null);
});

for (const phase of ['waiting', 'active']) {
  test(`hidden ${phase} attempt cannot score before the visibility event arrives`, () => {
    const h = setup(); h.game.beginAttempt(); if (phase === 'active') h.green();
    h.hide(); h.advance(100); h.game.respond();
    assert.deepEqual(h.game.getSnapshot().attempts, [{ kind: 'timeout', reason: 'interrupted' }]);
    assert.deepEqual(h.game.getSnapshot().times, []);
    h.game.beginAttempt(); assert.equal(h.pending.size, 0);
  });
}
test('timer activation while hidden records an interruption instead of showing green', () => {
  const h = setup(); h.game.beginAttempt(); h.hide(); h.green();
  assert.equal(h.game.getSnapshot().phase, 'timeout');
  assert.equal(h.game.getSnapshot().attempts[0].reason, 'interrupted');
  assert.equal(h.pending.size, 0);
});
