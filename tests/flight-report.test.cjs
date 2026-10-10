/* eslint-disable @typescript-eslint/no-require-imports -- Node 20 CommonJS test harness loads TypeScript through the local compiler hook. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createReport, completeReport, chartData, formatMilliseconds } = require('../src/app/challenges/visual-reaction/report.ts');
const { reportSvg } = require('../src/app/challenges/visual-reaction/report-image.ts');
const { ReactionGame, BEST_KEY } = require('../src/app/challenges/visual-reaction/game.ts');
const completed = (times = [310.5, 210.5, 510.5, 110.5, 260.5]) => ({ phase: 'complete', times, attempts: times.map(reactionMs => ({ kind: 'valid', reactionMs })), falseStarts: 0, timeouts: 0, activatedAt: null });
const storageWith = initial => {
  let value = initial;
  return { getItem: () => value, setItem: (key, next) => { assert.equal(key, BEST_KEY); value = next; } };
};

test('report calculates actual median and fastest without changing trial order', () => {
  const state = completed(); const report = createReport(state, 300);
  assert.equal(report.score, 260.5); assert.equal(report.fastest, 110.5);
  assert.deepEqual(report.attempts.map(a => a.reactionMs), [310.5, 210.5, 510.5, 110.5, 260.5]);
  assert.equal(report.falseStarts, 0); assert.equal(report.timeouts, 0);
  state.attempts[0].reactionMs = 999;
  assert.equal(report.attempts.map(a => a.reactionMs)[0], 310.5);
  assert.equal(formatMilliseconds(260.5), '260.5');
});

test('reports require exactly five completed attempt outcomes', () => {
  assert.throws(() => createReport({ ...completed(), phase: 'result' }, null));
  for (const times of [[1, 2], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 3000], [1, 2, 3, 4, NaN]]) {
    assert.throws(() => createReport(completed(times), null));
  }
});

for (const [prior, expected] of [[300, 'new'], [260.5, 'matched'], [200, 'not-beaten'], [null, 'first']]) {
  test(`personal best outcome ${expected} is captured before persistence`, () => {
    const storage = storageWith(prior === null ? null : String(prior));
    const report = completeReport(completed(), storage);
    assert.equal(report.comparison, expected);
    assert.equal(report.previousBest, prior);
    assert.equal(report.saved, true);
    assert.equal(Number(storage.getItem()), prior === 200 ? 200 : 260.5);
    assert.equal(report.comparison, expected);
  });
}

test('comparison uses raw precision rather than rounded display times', () => {
  assert.equal(createReport(completed([250.01, 250.01, 250.01, 250.01, 250.01]), 250.02).comparison, 'new');
});

test('unavailable storage does not claim a personal best or lose report data', () => {
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const report = completeReport(completed(), storage);
  assert.equal(report.comparison, 'unavailable'); assert.equal(report.saved, false);
  assert.equal(report.score, 260.5);
  const readOnly = { getItem: () => '300', setItem() { throw Error('quota'); } };
  const unsaved = completeReport(completed(), readOnly);
  assert.equal(unsaved.comparison, 'new'); assert.equal(unsaved.saved, false);
});

test('chart has a zero baseline, chronological attempts and a readable scale', () => {
  const chart = chartData(completed([100, 200, 300, 400, 500]).attempts);
  assert.equal(chart.maximum, 500);
  assert.deepEqual(chart.ticks, [0, 250, 500]);
  assert.deepEqual(chart.trials.map(x => [x.trial, x.value, x.fraction]), [[1, 100, .2], [2, 200, .4], [3, 300, .6], [4, 400, .8], [5, 500, 1]]);
});

for (const times of [[0, 0, 0, 0, 0], [220, 220, 220, 220, 220], [.1, .2, .3, .4, .5], [2999.9, 1, 220, 2500, 1000]]) {
  test(`chart scales edge values ${times.join(', ')}`, () => {
    const chart = chartData(completed(times).attempts);
    assert.ok(chart.maximum > 0 && chart.maximum >= Math.max(...times));
    assert.ok(chart.trials.every(x => Number.isFinite(x.fraction) && x.fraction >= 0 && x.fraction <= 1));
    assert.deepEqual(chart.trials.map(x => x.value), times);
    if (times.every(x => x === times[0])) assert.equal(new Set(chart.trials.map(x => x.fraction)).size, 1);
  });
}

test('export SVG contains the actual scores and one accurately scaled bar per trial', () => {
  const report = createReport(completed(), null);
  const svg = reportSvg(report);
  assert.match(svg, /PILOT REFLEX/); assert.match(svg, /260.5 ms/); assert.match(svg, /110.5 ms/);
  for (const [index, value] of report.attempts.map(a => a.reactionMs).entries()) {
    assert.ok(svg.includes(`Attempt ${index + 1}`)); assert.ok(svg.includes(`${value} ms`));
  }
  const widths = [...svg.matchAll(/data-trial="\d"[^>]*width="([\d.]+)"/g)].map(x => Number(x[1]));
  const fractions = chartData(report.attempts).trials.map(x => x.fraction);
  assert.equal(widths.length, 5);
  widths.forEach((width, i) => assert.ok(Math.abs(width - fractions[i] * 650) < .001));
  assert.match(svg, /Not an official aviation aptitude or medical assessment/);
  assert.doesNotMatch(svg, /<image|<script|foreignObject/);
});

test('Play Again starts fresh while retaining the saved personal best', () => {
  let now = 0; let callback;
  const game = new ReactionGame({ now: () => now, random: () => 0, schedule: fn => { callback = fn; return 1; }, cancel() {} });
  for (let i = 0; i < 5; i++) { game.beginAttempt(); now += 2000; callback(); now += 200; game.respond(); }
  const storage = storageWith(null); completeReport(game.getSnapshot(), storage);
  game.restart(); game.beginAttempt();
  assert.equal(game.getSnapshot().phase, 'waiting'); assert.deepEqual(game.getSnapshot().times, []);
  assert.equal(game.getSnapshot().falseStarts, 0); assert.equal(game.getSnapshot().timeouts, 0);
  assert.equal(storage.getItem(), '200');
});

for (const failure of ['decode', 'context', 'encode', null]) {
  test(`PNG generation ${failure ? `handles ${failure} failure` : 'returns PNG data'} and releases its source URL`, async t => {
    const { generateReportPng } = require('../src/app/challenges/visual-reaction/report-image.ts');
    const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    t.after(() => {
      if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage); else delete globalThis.Image;
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else delete globalThis.document;
    });
    let sourceBlob; const revoked = [];
    t.mock.method(URL, 'createObjectURL', blob => { sourceBlob = blob; return 'blob:test-source'; });
    t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
    const canvas = {
      width: 0, height: 0,
      getContext: () => failure === 'context' ? null : { drawImage() {} },
      toBlob: (callback, type) => callback(failure === 'encode' ? null : new Blob(['png'], { type })),
    };
    globalThis.Image = class {
      set src(value) { this.source = value; queueMicrotask(() => failure === 'decode' ? this.onerror?.() : this.onload?.()); }
    };
    globalThis.document = { createElement: () => canvas };
    const promise = generateReportPng(createReport(completed(), null));
    if (failure) await assert.rejects(promise, /rendered|not supported|PNG generation failed/);
    else {
      const blob = await promise;
      assert.equal(blob.type, 'image/png');
      assert.equal(canvas.width, 1200); assert.equal(canvas.height, 1000);
      assert.match(await sourceBlob.text(), /260.5 ms/);
    }
    assert.deepEqual(revoked, ['blob:test-source']);
  });
}

for (const kind of ['false-start', 'timeout']) {
  test(`five ${kind} penalties never become fastest measured reactions`, () => {
    const state = { ...completed(), attempts: Array.from({ length: 5 }, () => kind === 'timeout' ? { kind, reason: 'deadline' } : { kind }) };
    const report = createReport(state, null);
    assert.equal(report.score, 3000); assert.equal(report.fastest, null);
    assert.equal(report.successfulReactions, 0);
    assert.ok(chartData(report.attempts).trials.every(a => a.penalty && a.value === 3000));
    const svg = reportSvg(report);
    assert.match(svg, /No valid reactions/); assert.match(svg, /COMPETITIVE GAME SCORE/);
    assert.equal((svg.match(/data-penalty="true"/g) || []).length, 5);
  });
}

test('mixed report separates measured reactions and penalties in scoring and export', () => {
  const state = { ...completed(), attempts: [
    { kind: 'valid', reactionMs: 100 }, { kind: 'false-start' },
    { kind: 'timeout', reason: 'interrupted' }, { kind: 'valid', reactionMs: 250 },
    { kind: 'valid', reactionMs: 400 },
  ] };
  const report = createReport(state, 500);
  assert.equal(report.score, 400); assert.equal(report.fastest, 100);
  assert.equal(report.successfulReactions, 3); assert.equal(report.falseStarts, 1); assert.equal(report.timeouts, 1);
  assert.equal(report.comparison, 'new');
  const chart = chartData(report.attempts);
  assert.deepEqual(chart.trials.map(a => a.value), [100, 3000, 3000, 250, 400]);
  assert.deepEqual(chart.trials.map(a => a.penalty), [false, true, true, false, false]);
  assert.match(reportSvg(report), /Interrupted · timeout penalty/);
});
