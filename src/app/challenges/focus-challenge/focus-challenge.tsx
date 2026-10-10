'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { KeyLatch } from '../visual-reaction/input';
import { formatMilliseconds } from '../visual-reaction/report';
import { FocusGame, INSTRUMENTS, formatReading, instrumentName } from './game';
import { BEST_KEY, completeReport, parseBest, type CompletedReport } from './report';
import PerformanceReport from './performance-report';

const bestChanged = 'pilot-reflex-focus-best-changed';
// Use the raw string as the external-store snapshot: parsed objects are not referentially stable.
function getBestSnapshot() {
  try { return window.localStorage.getItem(BEST_KEY); } catch { return null; }
}
function subscribeBest(listener: () => void) {
  window.addEventListener('storage', listener); window.addEventListener(bestChanged, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(bestChanged, listener); };
}
const serverBest = () => null;
const actionClass = 'min-h-12 rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-[#081219] hover:bg-[#a0e7ed]';

export default function FocusChallenge() {
  const [game] = useState(() => new FocusGame({
    now: () => performance.now(), random: () => Math.random(),
    isAvailable: () => !document.hidden && document.hasFocus(),
    // Panel changes commit synchronously; identification owns its own start timestamp.
    schedule: (callback, delay) => window.setTimeout(() => flushSync(callback), delay),
    cancel: token => window.clearTimeout(token),
  }));
  const [keys] = useState(() => new KeyLatch());
  const [report, setReport] = useState<CompletedReport | null>(null);
  const state = useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
  const best = parseBest(useSyncExternalStore(subscribeBest, getBestSnapshot, serverBest));
  const firstCard = useRef<HTMLButtonElement>(null);
  const start = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const shortcut = /^(?:Digit|Numpad)([1-4])$/.exec(event.code);
      if (!shortcut && event.code !== 'Space' && event.code !== 'Enter') return;
      if (!keys.press(event.code, event.repeat)) { event.preventDefault(); return; }
      const element = event.target;
      if (element instanceof Element && element.closest('input, textarea, select, [contenteditable]')) return;
      const card = element instanceof Element ? element.closest<HTMLButtonElement>('button[data-instrument]') : null;
      const instrument = shortcut ? INSTRUMENTS[Number(shortcut[1]) - 1] : INSTRUMENTS.find(item => item.id === card?.dataset.instrument);
      if (instrument) { event.preventDefault(); game.answer(instrument.id); }
    };
    const keyup = (event: KeyboardEvent) => keys.release(event.code);
    const interrupt = () => { keys.clear(); game.interrupt(); };
    const visibility = () => { if (document.hidden) interrupt(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    window.addEventListener('blur', interrupt); document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', interrupt); document.removeEventListener('visibilitychange', visibility);
      keys.clear(); game.dispose();
    };
  }, [game, keys]);

  useEffect(() => game.subscribe(() => {
    const completed = game.getSnapshot();
    if (completed.phase !== 'complete') return;
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Storage may be disabled. */ }
    setReport(completeReport(completed, storage));
    window.dispatchEvent(new Event(bestChanged));
  }), [game]);

  function begin() { game.beginRound(); firstCard.current?.focus(); }
  function restart() {
    flushSync(() => { setReport(null); game.restart(); });
    start.current?.focus();
  }
  function playAgain() {
    flushSync(() => { setReport(null); game.restart(); game.beginRound(); });
    firstCard.current?.focus();
  }
  if (state.phase === 'complete' && report) return <PerformanceReport report={report} onPlayAgain={playAgain} />;

  const last = state.rounds.at(-1);
  const identifying = state.phase === 'identify';
  const feedback = state.phase === 'result';
  // Hidden readings are absent from both visible content and accessible button labels.
  const readings = state.phase === 'observe' ? state.puzzle?.before : identifying || feedback ? state.puzzle?.after : null;
  const phaseLabel = {
    instructions: 'Ready to observe', observe: 'Observe · 4 seconds', transition: 'Readings hidden · 1 second',
    identify: 'Which instrument changed? · 5 seconds', result: 'Round debrief', complete: 'Session complete',
  }[state.phase];
  const feedbackText = last ? last.kind === 'correct' ? `Correct. ${instrumentName(last.puzzle.changed)} changed. 1 point.`
    : last.kind === 'incorrect' ? `Incorrect. You selected ${instrumentName(last.selected)}; ${instrumentName(last.puzzle.changed)} changed. 0 points.`
    : `Timeout${last.reason === 'interrupted' ? ' because the round was interrupted' : ''}. No answer or decision time recorded. 0 points.` : '';
  const announcement = feedback ? feedbackText : state.phase === 'observe' ? 'Observe all four readings for four seconds. Answers are not active yet.'
    : state.phase === 'transition' ? 'Readings hidden. Remember the values.'
    : identifying ? 'One reading has changed. Choose its instrument within five seconds. Use the buttons or keys 1 to 4.' : 'Read the briefing, then start when ready.';

  return (
    <div className="mt-8">
      <section aria-labelledby="briefing-title" className="mb-6 rounded-sm border border-white/10 bg-[#0d1721] p-5 sm:p-6">
        <h2 id="briefing-title" className="font-medium">Your flight briefing</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-300">
          <li>Observe four instrument readings for 4 seconds. They will be hidden for 1 second.</li>
          <li>When the panel returns, exactly one reading has changed. Select that instrument within 5 seconds.</li>
          <li>Play five rounds. Correct answers earn 1 point; incorrect answers and timeouts earn 0.</li>
        </ol>
        <p className="mt-3 text-xs leading-6 text-slate-400">Click or tap an instrument, use keys 1–4, or Tab to a button and press Enter or Space. Release keys between answers. Leaving the window during any live phase counts as a timeout with no decision time. Restarting or navigating away discards an unfinished session. These readings are game values, not real flight data.</p>
      </section>
      <div className="mb-4 flex flex-wrap justify-between gap-3 font-mono text-xs text-slate-300">
        <span>{state.rounds.length} / 5 ROUNDS COMPLETE</span><span>CORRECT / {state.rounds.filter(outcome => outcome.kind === 'correct').length}</span>
      </div>
      <section aria-labelledby="panel-title">
        <h2 id="panel-title" className="mb-4 text-lg font-medium">{phaseLabel}</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {INSTRUMENTS.map((item, index) => {
            const changed = feedback && state.puzzle?.changed === item.id;
            const selected = feedback && last && last.kind !== 'timeout' && last.selected === item.id;
            const value = readings?.[item.id];
            return <button key={item.id} ref={index === 0 ? firstCard : undefined} type="button" data-instrument={item.id}
              aria-disabled={!identifying}
              aria-label={`${item.name}. ${value === undefined ? 'Reading hidden.' : `${formatReading(item.id, value)} ${item.unit}.`} ${identifying ? 'Select if this instrument changed.' : 'Answers are not active.'}`}
              aria-keyshortcuts={String(index + 1)}
              onPointerDown={event => {
                if (!event.isPrimary || event.button !== 0) return;
                event.preventDefault(); event.currentTarget.focus(); game.answer(item.id);
              }}
              onClick={event => { if (event.detail === 0) game.answer(item.id); }}
              className={`flex min-h-44 touch-manipulation select-none flex-col items-start rounded-sm border bg-[#0d1721] p-4 text-left sm:min-h-48 sm:p-6 ${changed ? 'border-accent' : selected ? 'border-amber-400/60' : 'border-white/15'} ${identifying ? 'cursor-pointer hover:border-accent' : 'cursor-default'}`}
            >
              <span className="flex w-full items-start justify-between gap-2 text-sm text-slate-300"><span>{item.name}</span><span aria-hidden="true" className="font-mono text-xs text-slate-400">{index + 1}</span></span>
              <span className="mt-4 font-mono text-[clamp(1.4rem,5vw,2.5rem)] leading-tight text-slate-100">{value === undefined ? '— —' : formatReading(item.id, value)}</span>
              <span className="mt-1 text-xs text-slate-400">{item.unit}</span>
              {feedback && <span className={`mt-3 text-xs ${changed ? 'text-accent' : selected ? 'text-amber-200' : 'text-slate-400'}`}>{changed ? 'Changed reading' : 'Unchanged'}{selected ? ' · your answer' : ''}</span>}
            </button>;
          })}
        </div>
      </section>
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-5 min-h-12 text-sm leading-6 text-slate-300">{announcement}</p>
      {feedback && last && <p className="text-sm leading-6 text-slate-400">{instrumentName(last.puzzle.changed)}: {formatReading(last.puzzle.changed, last.puzzle.before[last.puzzle.changed])} → {formatReading(last.puzzle.changed, last.puzzle.after[last.puzzle.changed])}{last.kind !== 'timeout' ? ` · ${formatMilliseconds(last.decisionMs)} ms decision time` : ''}</p>}
      <div className="mt-4 flex flex-wrap gap-4">
        {state.phase === 'instructions' && <button ref={start} type="button" className={actionClass} onClick={begin}>Start session</button>}
        {feedback && <button type="button" className={actionClass} onClick={begin}>Next Round {state.rounds.length + 1} / 5</button>}
        {state.phase !== 'instructions' && <button type="button" onClick={restart} className="min-h-12 rounded-sm border border-white/20 px-6 py-3 text-sm text-slate-200 hover:border-accent">Restart session</button>}
      </div>
      <section aria-labelledby="round-log-title" className="mt-8">
        <h2 id="round-log-title" className="text-lg font-medium">Round log</h2>
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => {
            const outcome = state.rounds[index];
            return <li key={index} className="rounded-sm border border-white/10 p-4"><span className="font-mono text-xs text-slate-400">ROUND {index + 1}</span><p className="mt-2 text-sm">{!outcome ? 'Pending' : outcome.kind === 'correct' ? 'Correct · 1 point' : outcome.kind === 'incorrect' ? 'Incorrect · 0 points' : 'Timeout · 0 points'}</p></li>;
          })}
        </ol>
      </section>
      <p className="mt-6 text-sm text-slate-300">Focus personal best: <span className="font-mono text-accent">{best === null ? 'No saved session' : `${best.correct} / 5${best.averageCorrectMs === null ? '' : ` · ${formatMilliseconds(best.averageCorrectMs)} ms average`}`}</span></p>
      <p className="mt-2 text-xs leading-6 text-slate-400">More correct answers wins. Average correct decision time breaks ties. Saved only in this browser when storage is available.</p>
    </div>
  );
}
