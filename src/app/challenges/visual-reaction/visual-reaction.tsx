'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { ReactionGame, median, readBest, saveBest } from './game';
import { KeyLatch } from './input';

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
    now: () => performance.now(),
    random: () => Math.random(),
    // Commit the green cue synchronously with activation, without a React transition.
    schedule: (callback, delay) => window.setTimeout(() => flushSync(callback), delay),
    cancel: token => window.clearTimeout(token),
  }));
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

  useEffect(() => {
    if (state.phase !== 'complete') return;
    try {
      saveBest(window.localStorage, state);
      window.dispatchEvent(new Event(bestChanged));
    } catch { /* Storage may be disabled. The completed result stays available. */ }
  }, [state]);

  function begin() {
    game.beginTrial();
    target.current?.focus();
  }
  function restart() {
    flushSync(() => game.restart());
    start.current?.focus();
  }

  const messages = {
    instructions: 'Ready when you are. Read the instructions, then start your session.',
    waiting: `Trial ${state.times.length + 1} of 5. Wait for green.`,
    active: 'GO — respond within 3 seconds!',
    timeout: 'Timeout. The 3-second response window has closed. No reaction was recorded. Retry the same trial when ready.',
    'false-start': 'Too early. This trial did not count. Retry when you are ready.',
    result: `Trial ${state.times.length} recorded: ${formatTime(state.times.at(-1) ?? 0)}. Continue when ready.`,
    interrupted: 'Trial paused because you left the page. Retry this trial; no penalty was added.',
    complete: `Session complete. Median ${formatTime(median(state.times) ?? 0)}. Fastest ${formatTime(Math.min(...state.times))}. ${state.falseStarts} false starts. ${state.timeouts} timeouts.`,
  };

  return (
    <div className="mt-8">
      <section aria-labelledby="instructions-title" className="mb-6 rounded-sm border border-white/10 bg-[#0d1721] p-5 sm:p-6">
        <h2 id="instructions-title" className="text-base font-medium">Your flight briefing</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-300">
          <li>Start a session, then wait. The indicator stays red for a random 2–5 seconds.</li>
          <li>When it turns green and says GO, click or tap the reaction panel, or press Space before 3,000 ms (3 seconds) have elapsed.</li>
          <li>Complete five valid trials. An early response adds a false start. Missing the 3-second window adds a timeout. Either requires a retry of the same trial.</li>
        </ol>
        <p className="mt-3 text-xs leading-6 text-slate-400">Release the key between responses. Your score is the median of five trials; lower is faster.</p>
      </section>

      <div className="mb-4 flex flex-wrap justify-between gap-3 font-mono text-xs text-slate-300">
        <span>{state.times.length} / 5 VALID TRIALS</span>
        <span>FALSE STARTS / {state.falseStarts}</span>
        <span>TIMEOUTS / {state.timeouts}</span>
      </div>
      <button
        ref={target}
        type="button"
        aria-label={state.phase === 'active' ? 'GO. Respond now' : state.phase === 'waiting' ? 'Wait for green. Reaction panel' : state.phase === 'timeout' ? 'Timeout. Use Retry trial to continue' : 'Reaction panel. Use the session controls below to continue'}
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
        <span className="text-sm text-slate-300">{isLive ? 'Click · Tap · Space' : 'Five trials. Stay curious.'}</span>
      </button>
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-5 min-h-12 text-sm leading-6 text-slate-300">{messages[state.phase]}</p>

      <div className="mt-4 flex flex-wrap gap-4">
        {state.phase === 'instructions' && <button ref={start} type="button" className={actionClass} onClick={begin}>Start session</button>}
        {['result', 'false-start', 'timeout', 'interrupted'].includes(state.phase) && <button type="button" className={actionClass} onClick={begin}>{state.phase === 'result' ? 'Next trial' : 'Retry trial'} {state.times.length + 1} / 5</button>}
        {state.phase !== 'instructions' && <button type="button" className="min-h-12 rounded-sm border border-white/20 px-6 py-3 text-sm text-slate-200 hover:border-accent" onClick={restart}>Restart session</button>}
      </div>

      {state.phase === 'complete' && (
        <section aria-labelledby="results-title" className="mt-8 rounded-sm border border-accent/40 bg-[#0d1721] p-6">
          <p className="eyebrow">SESSION DEBRIEF</p>
          <h2 id="results-title" className="mt-2 text-2xl font-medium">Your results</h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-sm text-slate-400">Median reaction</dt><dd className="mt-2 font-mono text-3xl text-accent">{formatTime(median(state.times)!)}</dd></div>
            <div><dt className="text-sm text-slate-400">Fastest reaction</dt><dd className="mt-2 font-mono text-3xl">{formatTime(Math.min(...state.times))}</dd></div>
            <div><dt className="text-sm text-slate-400">False starts</dt><dd className="mt-2 font-mono text-3xl">{state.falseStarts}</dd></div>
            <div><dt className="text-sm text-slate-400">Timeouts</dt><dd className="mt-2 font-mono text-3xl">{state.timeouts}</dd></div>
          </dl>
        </section>
      )}

      <section aria-labelledby="trials-title" className="mt-8">
        <h2 id="trials-title" className="text-lg font-medium">Trial log</h2>
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <li key={index} className="rounded-sm border border-white/10 p-4"><span className="font-mono text-xs text-slate-400">TRIAL {index + 1}</span><p className="mt-2 font-mono text-lg">{state.times[index] === undefined ? <span className="text-sm text-slate-400">Pending</span> : formatTime(state.times[index])}</p></li>)}
        </ol>
      </section>
      <p className="mt-6 text-sm text-slate-300">Personal best median: <span className="font-mono text-accent">{best === null ? 'No saved session' : formatTime(best)}</span></p>
      <p className="mt-2 text-xs leading-6 text-slate-400">Best completed sessions are saved on this browser when local storage is available. False starts and timeouts are counted separately and do not add a time penalty.</p>
    </div>
  );
}
