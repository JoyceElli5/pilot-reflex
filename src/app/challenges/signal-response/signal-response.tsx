'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { KeyLatch } from '../visual-reaction/input';
import { formatMilliseconds } from '../visual-reaction/report';
import { SignalGame, readBest, completeReport, outcomeLabel, roundScore, type CompletedReport } from './game';
import PerformanceReport from './performance-report';

const bestChanged = 'pilot-reflex-signal-best-changed';
function getBest() {
  try { return readBest(window.localStorage); } catch { return null; }
}
function subscribeBest(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(bestChanged, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(bestChanged, listener);
  };
}
const serverBest = () => null;
const buttonClass = 'min-h-12 rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-[#081219] hover:bg-[#a0e7ed]';

export default function SignalResponse() {
  const [game] = useState(() => new SignalGame({
    now: () => performance.now(), random: () => Math.random(),
    isAvailable: () => !document.hidden && document.hasFocus(),
    // Commit the displayed signal synchronously with its activation timestamp.
    schedule: (callback, delay) => window.setTimeout(() => flushSync(callback), delay),
    cancel: token => window.clearTimeout(token),
  }));
  const [keys] = useState(() => new KeyLatch());
  const [report, setReport] = useState<CompletedReport | null>(null);
  const state = useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
  const best = useSyncExternalStore(subscribeBest, getBest, serverBest);
  const target = useRef<HTMLButtonElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const live = state.phase === 'distractor' || state.phase === 'target';

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      if (!keys.press(event.code, event.repeat)) { event.preventDefault(); return; }
      const element = event.target;
      const interactive = element instanceof Element && element.closest('button, a, input, textarea, select, [contenteditable]');
      if (element === target.current || (event.code === 'Space' && !interactive)) {
        event.preventDefault(); // Suppress scrolling and native synthesized clicks.
        game.respond();
      }
    };
    const keyup = (event: KeyboardEvent) => keys.release(event.code);
    const interrupt = () => { keys.clear(); game.interrupt(); };
    const visibility = () => { if (document.hidden) interrupt(); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', interrupt);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', interrupt);
      document.removeEventListener('visibilitychange', visibility);
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

  function begin() { game.beginRound(); target.current?.focus(); }
  function restart() {
    flushSync(() => { setReport(null); game.restart(); });
    start.current?.focus();
  }
  function playAgain() {
    flushSync(() => { setReport(null); game.restart(); game.beginRound(); });
    target.current?.focus();
  }

  if (state.phase === 'complete' && report) return <PerformanceReport report={report} onPlayAgain={playAgain} />;

  const last = state.rounds.at(-1);
  const status = live
    ? state.phase === 'target' ? 'CLEARED. Respond now, before 3 seconds elapse.' : `${state.signal}. Wait. Respond only to CLEARED.`
    : last ? `${outcomeLabel(last)}. ${formatMilliseconds(roundScore(last))} milliseconds${last.kind === 'correct' ? ' measured' : ' game-score penalty'}. ${state.rounds.length} of 5 rounds complete.`
    : 'Read the briefing, then start your session when ready.';
  const panelText = state.signal ?? (last?.kind === 'correct' ? 'RECORDED' : last?.kind === 'incorrect' ? 'INCORRECT' : last?.kind === 'timeout' ? 'TIMEOUT' : 'READY');

  return (
    <div className="mt-8">
      <section aria-labelledby="briefing-title" className="mb-6 rounded-sm border border-white/10 bg-[#0d1721] p-5 sm:p-6">
        <h2 id="briefing-title" className="font-medium">Your flight briefing</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-300">
          <li>Each of five rounds shows a changing sequence of signals. Ignore STANDBY, HOLD, and MONITOR.</li>
          <li>Respond only to <strong className="text-accent">CLEARED</strong>: click or tap the signal panel, or press Space before 3,000 ms elapse.</li>
          <li>An incorrect response or timeout consumes the round and scores a 3,000 ms penalty. Correct responses score their measured time.</li>
        </ol>
        <p className="mt-3 text-xs leading-6 text-slate-400">Your game score is the median of all five scores; lower is better. Release the key between responses. Switching tabs or leaving the window during a live round counts as a timeout. Restarting or navigating away discards an unfinished session.</p>
      </section>
      <div className="mb-4 flex flex-wrap justify-between gap-3 font-mono text-xs text-slate-300">
        <span>{state.rounds.length} / 5 ROUNDS COMPLETE</span><span>TARGET / <span className="text-accent">CLEARED</span></span>
      </div>
      <button ref={target} type="button" aria-disabled={!live}
        aria-label={live ? `Signal: ${state.signal}. Respond only to CLEARED` : `${panelText}. Use the session controls below to continue`}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault(); target.current?.focus(); game.respond();
        }}
        onClick={event => { if (event.detail === 0) game.respond(); }}
        className={`flex min-h-64 w-full touch-manipulation select-none flex-col items-center justify-center gap-6 rounded-sm border-2 bg-[#0d1721] px-4 py-10 sm:min-h-72 ${live ? 'cursor-pointer border-accent/40' : last && last.kind !== 'correct' ? 'cursor-default border-amber-400/50' : 'cursor-default border-white/15'}`}
      >
        <span className="font-mono text-[10px] tracking-[.2em] text-slate-400">SIGNAL CHANNEL / 02</span>
        <span className="font-mono text-[clamp(1.75rem,7vw,3.5rem)] font-semibold tracking-[.06em] text-slate-100">{panelText}</span>
        <span className="text-sm text-slate-300">{live ? 'Respond only to CLEARED' : 'Five rounds. Choose your moment.'}</span>
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-5 min-h-12 text-sm leading-6 text-slate-300">{status}</p>
      <div className="mt-4 flex flex-wrap gap-4">
        {state.phase === 'instructions' && <button ref={start} type="button" className={buttonClass} onClick={begin}>Start session</button>}
        {state.phase === 'result' && <button type="button" className={buttonClass} onClick={begin}>Next Round {state.rounds.length + 1} / 5</button>}
        {state.phase !== 'instructions' && <button type="button" onClick={restart} className="min-h-12 rounded-sm border border-white/20 px-6 py-3 text-sm text-slate-200 hover:border-accent">Restart session</button>}
      </div>
      <section aria-labelledby="round-log-title" className="mt-8">
        <h2 id="round-log-title" className="text-lg font-medium">Round log</h2>
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => {
            const outcome = state.rounds[index];
            return <li key={index} className="rounded-sm border border-white/10 p-4">
              <span className="font-mono text-xs text-slate-400">ROUND {index + 1}</span>
              <p className="mt-2 font-mono text-lg">{outcome ? `${formatMilliseconds(roundScore(outcome))} ms` : <span className="text-sm text-slate-400">Pending</span>}</p>
              {outcome && <p className="mt-2 text-xs leading-5 text-slate-400">{outcomeLabel(outcome)}{outcome.kind !== 'correct' && ' · penalty'}</p>}
            </li>;
          })}
        </ol>
      </section>
      <p className="mt-6 text-sm text-slate-300">Signal Response personal best: <span className="font-mono text-accent">{best === null ? 'No saved session' : `${formatMilliseconds(best)} ms`}</span></p>
      <p className="mt-2 text-xs leading-6 text-slate-400">Saved in this browser when storage is available. Each challenge keeps its own personal best.</p>
    </div>
  );
}
