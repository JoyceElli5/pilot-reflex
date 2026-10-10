/* eslint-disable @typescript-eslint/no-require-imports -- Node 20 CommonJS test harness loads TypeScript through the local compiler hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FocusGame, generateRound, INSTRUMENTS } = require('../src/app/challenges/focus-challenge/game.ts');
const { summarize, compareBest, readBest, completeReport, BEST_KEY } = require('../src/app/challenges/focus-challenge/report.ts');
const { KeyLatch } = require('../src/app/challenges/visual-reaction/input.ts');

function setup() {
  let now = 100; let available = true; let token = 0;
  const pending = new Map();
  const game = new FocusGame({
    now: () => now, random: () => .25, isAvailable: () => available,
    schedule: (fn, delay) => { pending.set(++token, { fn, at: now + delay, delay }); return token; },
    cancel: id => pending.delete(id),
  });
  return {
    game, pending,
    advance(ms) { now += ms; }, hide() { available = false; },
    fire() { const [id, timer] = pending.entries().next().value; pending.delete(id); now = Math.max(now, timer.at); timer.fn(); },
    identify() { game.beginRound(); this.fire(); this.fire(); },
    correct(ms = 250) { this.identify(); this.advance(ms); game.answer(game.getSnapshot().puzzle.changed); },
  };
}
const storageWith = entries => {
  const data = new Map(entries);
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

// Deterministic seeded samples cover every instrument without flaky random assertions.
test('generated panels always change exactly one reading to a different allowed value', () => {
  let seed = 7821; const seen = new Set();
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let n = 0; n < 1000; n++) {
    const puzzle = generateRound(random);
    const changed = INSTRUMENTS.filter(item => puzzle.before[item.id] !== puzzle.after[item.id]);
    assert.equal(changed.length, 1); assert.equal(changed[0].id, puzzle.changed); seen.add(puzzle.changed);
    for (const item of INSTRUMENTS) {
      assert.ok(item.values.includes(puzzle.before[item.id])); assert.ok(item.values.includes(puzzle.after[item.id]));
    }
  }
  assert.equal(seen.size, 4);
  for (const value of [0, .999999]) {
    const puzzle = generateRound(() => value);
    assert.notEqual(puzzle.before[puzzle.changed], puzzle.after[puzzle.changed]);
  }
});

test('observation lasts 4000 ms, blank transition 1000 ms, answer window 5000 ms', () => {
  const h = setup(); h.game.beginRound();
  assert.equal(h.game.getSnapshot().phase, 'observe'); assert.equal(h.game.getSnapshot().decisionStartedAt, null);
  assert.equal([...h.pending.values()][0].delay, 4000);
  h.game.answer('altitude'); assert.equal(h.game.getSnapshot().rounds.length, 0);
  h.fire(); assert.equal(h.game.getSnapshot().phase, 'transition');
  assert.equal([...h.pending.values()][0].delay, 1000);
  h.game.answer('altitude'); assert.equal(h.game.getSnapshot().rounds.length, 0);
  h.fire(); assert.equal(h.game.getSnapshot().phase, 'identify');
  assert.equal([...h.pending.values()][0].delay, 5000);
  h.advance(321.5); h.game.answer(h.game.getSnapshot().puzzle.changed);
  assert.equal(h.game.getSnapshot().rounds[0].decisionMs, 321.5);
  assert.equal(h.pending.size, 0);
});

test('early timers re-arm rather than shortening observation or transition', () => {
  const h = setup(); h.game.beginRound();
  for (const [duration, phase] of [[4000, 'observe'], [1000, 'transition']]) {
    const [id, timer] = h.pending.entries().next().value;
    h.pending.delete(id); h.advance(duration - 1); timer.fn();
    assert.equal(h.game.getSnapshot().phase, phase); assert.equal([...h.pending.values()][0].delay, 1);
    h.fire();
  }
  assert.equal(h.game.getSnapshot().phase, 'identify');
});

test('delayed observation callback still provides a full blank phase and fresh decision clock', () => {
  const h = setup(); h.game.beginRound(); h.advance(6000); h.fire();
  assert.equal(h.game.getSnapshot().phase, 'transition'); assert.equal([...h.pending.values()][0].delay, 1000);
  h.fire(); h.advance(100); h.game.answer(h.game.getSnapshot().puzzle.changed);
  assert.equal(h.game.getSnapshot().rounds[0].decisionMs, 100);
});

for (const elapsed of [0, 4999.5, 5000, 5000.5, 7000]) {
  test(`answer at ${elapsed} ms enforces monotonic deadline regardless of callback order`, () => {
    const h = setup(); h.identify(); const stale = [...h.pending.values()][0].fn;
    h.advance(elapsed); h.game.answer(h.game.getSnapshot().puzzle.changed);
    const state = h.game.getSnapshot();
    assert.equal(state.rounds[0].kind, elapsed < 5000 ? 'correct' : 'timeout');
    if (elapsed < 5000) assert.equal(state.rounds[0].decisionMs, elapsed);
    else assert.equal('decisionMs' in state.rounds[0], false);
    stale(); h.game.answer('heading'); assert.equal(h.game.getSnapshot(), state); assert.equal(h.pending.size, 0);
  });
}

for (const type of ['correct', 'incorrect', 'timeout', 'mixed']) {
  test(`five ${type} rounds complete with no extra rounds`, () => {
    const h = setup();
    for (let index = 0; index < 5; index++) {
      h.identify();
      const kind = type === 'mixed' ? ['correct', 'incorrect', 'timeout', 'correct', 'correct'][index] : type;
      if (kind === 'timeout') h.fire();
      else {
        const puzzle = h.game.getSnapshot().puzzle;
        const selected = kind === 'correct' ? puzzle.changed : INSTRUMENTS.find(item => item.id !== puzzle.changed).id;
        h.advance(200); h.game.answer(selected);
      }
      assert.equal(h.game.getSnapshot().rounds.length, index + 1);
      if (index < 4) assert.equal(h.game.getSnapshot().phase, 'result');
    }
    const state = h.game.getSnapshot(); assert.equal(state.phase, 'complete');
    h.game.beginRound(); h.game.answer('altitude'); assert.equal(h.game.getSnapshot(), state);
    const report = summarize(state);
    assert.equal(report.correct, type === 'correct' ? 5 : type === 'mixed' ? 3 : 0);
    assert.equal(report.accuracy, type === 'correct' ? 100 : type === 'mixed' ? 60 : 0);
    assert.equal(report.averageCorrectMs, type === 'correct' || type === 'mixed' ? 200 : null);
    assert.equal(report.incorrect, type === 'incorrect' ? 5 : type === 'mixed' ? 1 : 0);
    assert.equal(report.timeouts, type === 'timeout' ? 5 : type === 'mixed' ? 1 : 0);
    assert.equal(report.rounds.length, 5); assert.equal(h.pending.size, 0);
  });
}

test('average decision time includes correct answers only', () => {
  const h = setup(); h.correct(100); h.correct(300);
  h.identify(); h.advance(4500); h.game.answer(INSTRUMENTS.find(item => item.id !== h.game.getSnapshot().puzzle.changed).id);
  h.identify(); h.fire(); h.identify(); h.fire();
  assert.equal(summarize(h.game.getSnapshot()).averageCorrectMs, 200);
});

for (const phase of ['observe', 'transition', 'identify']) {
  test(`hidden ${phase} round records one interruption timeout without decision time`, () => {
    const h = setup(); h.game.beginRound(); if (phase !== 'observe') h.fire(); if (phase === 'identify') h.fire();
    const stale = [...h.pending.values()][0].fn;
    h.hide(); h.game.answer('altitude'); h.game.interrupt(); stale();
    const state = h.game.getSnapshot(); assert.equal(state.rounds.length, 1);
    assert.equal(state.rounds[0].kind, 'timeout'); assert.equal(state.rounds[0].reason, 'interrupted');
    assert.equal('decisionMs' in state.rounds[0], false); assert.equal(h.pending.size, 0);
    h.game.beginRound(); assert.equal(h.pending.size, 0);
  });
  for (const action of ['restart', 'dispose']) {
    test(`${action} clears ${phase} timers and stale callbacks`, () => {
      const h = setup(); h.game.beginRound(); if (phase !== 'observe') h.fire(); if (phase === 'identify') h.fire();
      const stale = [...h.pending.values()][0].fn;
      h.game[action](); stale();
      assert.equal(h.game.getSnapshot().phase, 'instructions'); assert.equal(h.pending.size, 0);
      assert.deepEqual(h.game.getSnapshot().rounds, []);
      h.game.beginRound(); stale(); assert.equal(h.game.getSnapshot().phase, 'observe');
    });
  }
}

test('hidden timer cannot advance a panel and duplicate starts cannot add timers', () => {
  const h = setup(); h.game.interrupt(); h.game.beginRound(); h.game.beginRound();
  assert.equal(h.pending.size, 1); h.hide(); h.fire();
  assert.equal(h.game.getSnapshot().rounds[0].reason, 'interrupted');
  assert.equal(h.pending.size, 0);
});

test('held answer key during observation cannot answer on identification', () => {
  const h = setup(); const keys = new KeyLatch(); h.game.beginRound();
  if (keys.press('Digit1', false)) h.game.answer('altitude');
  h.fire(); h.fire();
  for (const repeat of [true, false]) if (keys.press('Digit1', repeat)) h.game.answer('altitude');
  assert.equal(h.game.getSnapshot().rounds.length, 0);
  keys.release('Digit1'); if (keys.press('Digit1', false)) h.game.answer('altitude');
  assert.equal(h.game.getSnapshot().rounds.length, 1);
});

for (const [current, previous, expected] of [
  [{ correct: 4, averageCorrectMs: 4000 }, { correct: 3, averageCorrectMs: 100 }, 'new'],
  [{ correct: 3, averageCorrectMs: 100 }, { correct: 4, averageCorrectMs: 4000 }, 'not-beaten'],
  [{ correct: 3, averageCorrectMs: 199.5 }, { correct: 3, averageCorrectMs: 200 }, 'new'],
  [{ correct: 3, averageCorrectMs: 201 }, { correct: 3, averageCorrectMs: 200 }, 'not-beaten'],
  [{ correct: 3, averageCorrectMs: 200 }, { correct: 3, averageCorrectMs: 200 }, 'matched'],
  [{ correct: 0, averageCorrectMs: null }, { correct: 0, averageCorrectMs: null }, 'matched'],
]) {
  test(`best comparison: ${JSON.stringify(current)} vs ${JSON.stringify(previous)}`, () => assert.equal(compareBest(current, previous), expected));
}

test('best persists separately, uses pre-save comparison and survives restart', () => {
  const visual = 'pilot-reflex.visual-reaction.competitive-median.v2';
  const signal = 'pilot-reflex.signal-response.competitive-median.v1';
  const storage = storageWith([[visual, '100'], [signal, '200']]);
  assert.match(BEST_KEY, /focus-challenge.*v1$/);
  const h = setup(); for (let n = 0; n < 5; n++) h.correct(300);
  const first = completeReport(h.game.getSnapshot(), storage);
  assert.equal(first.comparison, 'first'); assert.equal(first.saved, true);
  assert.deepEqual(readBest(storage), { correct: 5, averageCorrectMs: 300 });
  h.game.restart(); for (let n = 0; n < 5; n++) h.correct(200);
  const improved = completeReport(h.game.getSnapshot(), storage);
  assert.equal(improved.comparison, 'new'); assert.equal(improved.previousBest.averageCorrectMs, 300);
  assert.deepEqual(readBest(storage), { correct: 5, averageCorrectMs: 200 });
  h.game.restart(); assert.equal(h.game.getSnapshot().rounds.length, 0);
  assert.equal(readBest(storage).correct, 5); assert.equal(storage.getItem(visual), '100'); assert.equal(storage.getItem(signal), '200');
  h.correct(100); assert.throws(() => completeReport(h.game.getSnapshot(), storage));
});

test('storage validates scores and handles blocked reads or writes', () => {
  for (const value of ['bad', '{}', 'null', '{"correct":6,"averageCorrectMs":200}', '{"correct":0,"averageCorrectMs":100}', '{"correct":1,"averageCorrectMs":null}', '{"correct":1,"averageCorrectMs":5000}']) {
    assert.equal(readBest(storageWith([[BEST_KEY, value]])), null);
  }
  const h = setup(); for (let n = 0; n < 5; n++) { h.identify(); h.fire(); }
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const report = completeReport(h.game.getSnapshot(), blocked);
  assert.equal(report.comparison, 'unavailable'); assert.equal(report.saved, false); assert.equal(report.averageCorrectMs, null);
  const readOnly = { getItem: () => null, setItem() { throw Error('quota'); } };
  assert.equal(completeReport(h.game.getSnapshot(), readOnly).saved, false);
});
