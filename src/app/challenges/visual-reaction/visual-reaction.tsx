'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { ReactionGame, attemptScore, readBest } from './game';
import { KeyLatch } from './input';
import FlightReport from './flight-report';
import { completeReport, outcomeLabel, type FlightReport as Report } from './report';

const bestChanged = 'pilot-reflex-best-changed';
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
const formatTime = (value: number) => `${Math.round(value)} ms`;
const actionClass = 'min-h-12 rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-[#081219] hover:bg-[#a0e7ed]';

export default function VisualReaction() {
  const [game] = useState(() => new ReactionGame({
    isAvailable: () => !document.hidden && document.hasFocus(),
    now: () => performance.now(),
    random: () => Math.random(),
    // Commit the green cue synchronously with activation, without a React transition.
    schedule: (callback, delay) => window.setTimeout(() => flushSync(callback), delay),
    cancel: token => window.clearTimeout(token),
  }));
  const [report, setReport] = useState<Report | null>(null);
  const [keys] = useState(() => new KeyLatch());
  const state = useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
  const best = useSyncExternalStore(subscribeBest, getBest, serverBest);
  const target = useRef<HTMLButtonElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const isLive = state.phase === 'waiting' || state.phase === 'active';

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      const fresh = keys.press(event.code, event.repeat);
      if (!fresh) { event.preventDefault(); return; }
      const element = event.target;
      const interactive = element instanceof Element && element.closest('button, a, input, textarea, select, [contenteditable]');
      if (element === target.current || (event.code === 'Space' && !interactive)) {
        event.preventDefault(); // Suppress scrolling and the synthesized button click.
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
      keys.clear();
      game.dispose();
    };
  }, [game, keys]);

  useEffect(() => game.subscribe(() => {
    const completed = game.getSnapshot();
    if (completed.phase !== 'complete') return;
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Browser storage may be disabled. */ }
    // This runs once on completion, before the stored best is updated.
    setReport(completeReport(completed, storage));
    window.dispatchEvent(new Event(bestChanged));
  }), [game]);

  function begin() {
    game.beginAttempt();
    target.current?.focus();
  }
  function restart() {
    flushSync(() => game.restart());
    start.current?.focus();
  }

  function playAgain() {
    flushSync(() => {
      setReport(null);
      game.restart();
      game.beginAttempt();
    });
    target.current?.focus();
  }

  if (state.phase === 'complete' && report) {
    return <FlightReport report={report} onPlayAgain={playAgain} />;
  }

  const lastAttempt = state.attempts.at(-1);
  const messages = {
    instructions: 'Ready when you are. Read the instructions, then start your session.',
    waiting: `Attempt ${state.attempts.length + 1} of 5. Wait for green.`,
    active: 'GO — respond within 3 seconds!',
    timeout: lastAttempt?.kind === 'timeout' && lastAttempt.reason === 'interrupted'
      ? 'Attempt interrupted. A timeout and 3,000 ms game-score penalty were recorded. Continue to the next attempt.'
      : 'Timeout. This attempt scored a 3,000 ms penalty, not a reaction time. Continue to the next attempt.',
    'false-start': 'False start. This attempt scored a 3,000 ms penalty. Continue to the next attempt.',
    result: `Attempt ${state.attempts.length} recorded: ${formatTime(state.times.at(-1) ?? 0)}. Continue when ready.`,
    complete: 'Five attempts complete. Your Flight Performance Report is ready.',
  };

  return (
    <div className="mt-8">
      <section aria-labelledby="instructions-title" className="mb-6 rounded-sm border border-white/10 bg-[#0d1721] p-5 sm:p-6">
        <h2 id="instructions-title" className="text-base font-medium">Your flight briefing</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-300">
          <li>Start a session, then wait. The indicator stays red for a random 2–5 seconds.</li>
          <li>When it turns green and says GO, click or tap the reaction panel, or press Space before 3,000 ms (3 seconds) have elapsed.</li>
          <li>You get exactly five attempts. A false start or timeout consumes an attempt and scores a 3,000 ms penalty. Valid reactions score their actual time.</li>
        </ol>
        <p className="mt-3 text-xs leading-6 text-slate-400">Release the key between responses. Your game score is the median of all five scores, including penalties; lower is better. Switching tabs or leaving the window during a live attempt counts as a timeout. Restarting or leaving the challenge discards the unfinished session.</p>
      </section>

      <div className="mb-4 flex flex-wrap justify-between gap-3 font-mono text-xs text-slate-300">
        <span>{state.attempts.length} / 5 ATTEMPTS</span>
        <span>SUCCESSFUL / {state.times.length}</span>
        <span>FALSE STARTS / {state.falseStarts}</span>
        <span>TIMEOUTS / {state.timeouts}</span>
      </div>
      <button
        ref={target}
        type="button"
        aria-label={state.phase === 'active' ? 'GO. Respond now' : state.phase === 'waiting' ? 'Wait for green. Reaction panel' : state.phase === 'timeout' ? 'Timeout. Use Next Attempt to continue' : 'Reaction panel. Use the session controls below to continue'}
        aria-disabled={!isLive}
        onPointerDown={event => {
          if (!event.isPrimary || event.button !== 0) return;
          // Pointer input is measured on contact. Ignore its later click event.
          event.preventDefault();
          target.current?.focus();
          game.respond();
        }}
        onClick={event => { if (event.detail === 0) game.respond(); }}
        className={`flex min-h-64 w-full touch-manipulation select-none flex-col items-center justify-center gap-5 rounded-sm border-2 px-5 py-10 sm:min-h-72 ${state.phase === 'active' ? 'border-emerald-400 bg-emerald-950' : state.phase === 'waiting' ? 'border-red-400 bg-red-950/40' : state.phase === 'timeout' ? 'border-amber-400/60 bg-amber-950/30' : 'border-white/15 bg-[#0d1721]'} ${isLive ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span aria-hidden="true" className={`h-14 w-14 rounded-full border-4 ${state.phase === 'active' ? 'border-emerald-200 bg-emerald-400' : state.phase === 'waiting' ? 'border-red-200 bg-red-500' : state.phase === 'timeout' ? 'border-amber-200 bg-amber-400' : 'border-slate-500 bg-slate-700'}`} />
        <span className="text-3xl font-semibold tracking-[.12em]">{state.phase === 'active' ? 'GO' : state.phase === 'waiting' ? 'WAIT' : state.phase === 'complete' ? 'COMPLETE' : state.phase === 'false-start' ? 'TOO EARLY' : state.phase === 'timeout' ? 'TIMEOUT' : 'STAND BY'}</span>
        <span className="text-sm text-slate-300">{isLive ? 'Click · Tap · Space' : 'Five attempts. Stay curious.'}</span>
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-5 min-h-12 text-sm leading-6 text-slate-300">{messages[state.phase]}</p>

      <div className="mt-4 flex flex-wrap gap-4">
        {state.phase === 'instructions' && <button ref={start} type="button" className={actionClass} onClick={begin}>Start session</button>}
        {['result', 'false-start', 'timeout'].includes(state.phase) && <button type="button" className={actionClass} onClick={begin}>Next Attempt {state.attempts.length + 1} / 5</button>}
        {state.phase !== 'instructions' && <button type="button" className="min-h-12 rounded-sm border border-white/20 px-6 py-3 text-sm text-slate-200 hover:border-accent" onClick={restart}>Restart session</button>}
      </div>

      <section aria-labelledby="trials-title" className="mt-8">
        <h2 id="trials-title" className="text-lg font-medium">Attempt log</h2>
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <li key={index} className="rounded-sm border border-white/10 p-4"><span className="font-mono text-xs text-slate-400">ATTEMPT {index + 1}</span><p className="mt-2 font-mono text-lg">{state.attempts[index] === undefined ? <span className="text-sm text-slate-400">Pending</span> : formatTime(attemptScore(state.attempts[index]))}</p>{state.attempts[index] && <p className="mt-2 text-xs leading-5 text-slate-400">{outcomeLabel(state.attempts[index])}</p>}</li>)}
        </ol>
      </section>
      <p className="mt-6 text-sm text-slate-300">Personal best game score: <span className="font-mono text-accent">{best === null ? 'No saved session' : formatTime(best)}</span></p>
      <p className="mt-2 text-xs leading-6 text-slate-400">Best completed sessions are saved on this browser when local storage is available. Competitive scoring v2 includes 3,000 ms mistake penalties. Earlier scoring versions are not compared.</p>
    </div>
  );
}
