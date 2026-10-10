'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { formatMilliseconds } from '../visual-reaction/report';
import { outcomeLabel, type CompletedReport } from './game';

export default function PerformanceReport({ report, onPlayAgain }: { report: CompletedReport; onPlayAgain: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const comparison = {
    first: 'First session — your Signal Response best starts here.',
    new: 'New Signal Response personal best',
    matched: 'You matched your Signal Response personal best',
    'not-beaten': 'Your previous Signal Response best still stands',
    unavailable: 'Personal-best comparison unavailable',
  };
  return (
    <section aria-labelledby="report-title" className="mt-8 rounded-sm border border-accent/30 bg-[#0d1721]">
      <div className="border-b border-white/10 px-5 py-7 sm:px-8">
        <p className="eyebrow">SIGNAL RESPONSE / 5 ROUNDS COMPLETE</p>
        <h2 id="report-title" ref={heading} tabIndex={-1} className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Flight Performance Report</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">Your response to the signal, round by round.</p>
      </div>
      <div className="grid gap-8 px-5 py-8 sm:px-8 md:grid-cols-2">
        <div>
          <p className="eyebrow">MEDIAN GAME SCORE</p>
          <p className="mt-3 font-mono text-[clamp(2.5rem,8vw,4.5rem)] leading-none tracking-tight text-accent">{formatMilliseconds(report.score)} <span className="text-xl text-slate-400">ms</span></p>
          <p className="mt-5 text-sm font-medium text-accent">{comparison[report.comparison]}</p>
          {typeof report.previousBest === 'number' && <p className="mt-2 text-xs text-slate-400">Previous best: {formatMilliseconds(report.previousBest)} ms. Comparisons use unrounded scores.</p>}
          {!report.saved && <p className="mt-3 text-sm leading-6 text-amber-200">Your personal best could not be saved in this browser. These session results are still available.</p>}
        </div>
        <dl className="grid grid-cols-2 gap-6 border-t border-white/10 pt-6 md:border-t-0 md:border-l md:pl-8 md:pt-0">
          <div className="col-span-2"><dt className="text-sm text-slate-400">Fastest correct response</dt><dd className="mt-2 font-mono text-2xl">{report.fastest === null ? 'No correct responses' : `${formatMilliseconds(report.fastest)} ms`}</dd></div>
          <div className="col-span-2"><dt className="text-sm text-slate-400">Accuracy</dt><dd className="mt-2 font-mono text-2xl">{report.accuracy}% <span className="text-sm text-slate-400">({report.correct} / 5 correct)</span></dd></div>
          <div><dt className="text-sm text-slate-400">Incorrect responses</dt><dd className="mt-2 font-mono text-2xl">{report.incorrect}</dd></div>
          <div><dt className="text-sm text-slate-400">Timeouts</dt><dd className="mt-2 font-mono text-2xl">{report.timeouts}</dd></div>
        </dl>
      </div>
      <section aria-labelledby="outcomes-title" className="border-y border-white/10 px-5 py-7 sm:px-8">
        <h3 id="outcomes-title" className="mb-4 text-lg font-medium">Your five rounds</h3>
        <ol className="divide-y divide-white/10">
          {report.rounds.map((outcome, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 py-4">
            <div><p className="font-mono text-xs text-slate-400">ROUND {index + 1}</p><p className={`mt-1 text-sm ${outcome.kind === 'correct' ? 'text-slate-200' : 'text-amber-200'}`}>{outcomeLabel(outcome)}</p></div>
            <p className={`font-mono text-sm ${outcome.kind === 'correct' ? 'text-accent' : 'text-amber-200'}`}>{formatMilliseconds(report.scores[index])} ms{outcome.kind !== 'correct' && ' penalty'}</p>
          </li>)}
        </ol>
        <p className="mt-4 text-xs leading-6 text-slate-400">Your game score is the median of all five round scores, including 3,000 ms penalties. Penalties are not measured reaction times. Accuracy is correct rounds divided by five. Displayed times are rounded to 0.1 ms.</p>
      </section>
      <div className="flex flex-wrap gap-4 px-5 py-7 sm:px-8">
        <button type="button" onClick={onPlayAgain} className="min-h-12 rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-[#081219] hover:bg-[#a0e7ed]">Play Again</button>
        <Link href="/#challenges" className="inline-flex min-h-12 items-center rounded-sm border border-white/25 px-6 py-3 text-sm text-slate-200 hover:border-accent">Back to Challenges</Link>
      </div>
    </section>
  );
}
