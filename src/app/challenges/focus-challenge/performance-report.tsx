'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { formatMilliseconds } from '../visual-reaction/report';
import { formatReading, instrumentName } from './game';
import type { CompletedReport } from './report';

export default function PerformanceReport({ report, onPlayAgain }: { report: CompletedReport; onPlayAgain: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const comparisons = {
    first: 'Your first Focus Challenge personal best', new: 'New Focus Challenge personal best',
    matched: 'You matched your personal best', 'not-beaten': 'Your previous personal best still stands',
    unavailable: 'Personal-best comparison unavailable',
  };
  return (
    <section aria-labelledby="report-title" className="mt-8 rounded-sm border border-accent/30 bg-[#0d1721]">
      <div className="border-b border-white/10 px-5 py-7 sm:px-8">
        <p className="eyebrow">FOCUS CHALLENGE / 5 ROUNDS COMPLETE</p>
        <h2 id="report-title" ref={heading} tabIndex={-1} className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Focus Performance Report</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">The details you noticed, round by round.</p>
      </div>
      <div className="grid gap-8 px-5 py-8 sm:px-8 md:grid-cols-2">
        <div>
          <p className="eyebrow">CORRECT ANSWERS</p>
          <p className="mt-3 font-mono text-6xl tracking-tight text-accent">{report.correct}<span className="text-2xl text-slate-400"> / 5</span></p>
          <p className="mt-5 text-sm font-medium text-accent">{comparisons[report.comparison]}</p>
          {report.previousBest && <p className="mt-2 text-xs leading-6 text-slate-400">Previous best: {report.previousBest.correct} / 5{report.previousBest.averageCorrectMs !== null && ` · ${formatMilliseconds(report.previousBest.averageCorrectMs)} ms average for correct answers`}.</p>}
          {!report.saved && <p className="mt-3 text-sm leading-6 text-amber-200">Your personal best could not be saved in this browser. These session results are still available.</p>}
        </div>
        <dl className="grid grid-cols-2 gap-6 border-t border-white/10 pt-6 md:border-t-0 md:border-l md:pl-8 md:pt-0">
          <div><dt className="text-sm text-slate-400">Accuracy</dt><dd className="mt-2 font-mono text-2xl">{report.accuracy}%</dd></div>
          <div><dt className="text-sm text-slate-400">Incorrect answers</dt><dd className="mt-2 font-mono text-2xl">{report.incorrect}</dd></div>
          <div><dt className="text-sm text-slate-400">Timeouts</dt><dd className="mt-2 font-mono text-2xl">{report.timeouts}</dd></div>
          <div className="col-span-2"><dt className="text-sm text-slate-400">Average decision time · correct answers only</dt><dd className="mt-2 font-mono text-2xl">{report.averageCorrectMs === null ? 'No correct answers' : `${formatMilliseconds(report.averageCorrectMs)} ms`}</dd></div>
        </dl>
      </div>
      <section aria-labelledby="outcomes-title" className="border-y border-white/10 px-5 py-7 sm:px-8">
        <h3 id="outcomes-title" className="mb-4 text-lg font-medium">Your five rounds</h3>
        <ol className="divide-y divide-white/10">
          {report.rounds.map((outcome, index) => <li key={index} className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div>
              <p className="font-mono text-xs text-slate-400">ROUND {index + 1}</p>
              <p className={`mt-2 text-sm font-medium ${outcome.kind === 'correct' ? 'text-accent' : 'text-amber-200'}`}>{outcome.kind === 'correct' ? 'Correct · 1 point' : outcome.kind === 'incorrect' ? 'Incorrect · 0 points' : `Timeout${outcome.reason === 'interrupted' ? ' · interrupted' : ''} · 0 points`}</p>
              <p className="mt-1 text-sm leading-6 text-slate-300">Changed: {instrumentName(outcome.puzzle.changed)} · {formatReading(outcome.puzzle.changed, outcome.puzzle.before[outcome.puzzle.changed])} → {formatReading(outcome.puzzle.changed, outcome.puzzle.after[outcome.puzzle.changed])}</p>
              {outcome.kind !== 'timeout' && <p className="text-xs leading-6 text-slate-400">Your answer: {instrumentName(outcome.selected)}</p>}
            </div>
            <p className="font-mono text-xs leading-6 text-slate-400">{outcome.kind === 'timeout' ? 'No answer · no decision time' : `${formatMilliseconds(outcome.decisionMs)} ms decision time`}</p>
          </li>)}
        </ol>
        <p className="mt-4 text-xs leading-6 text-slate-400">Accuracy comes first. For equal scores with at least one correct answer, the lower average correct decision time wins. Time is measured only during identification; displayed times are rounded to 0.1 ms. Unanswered rounds have no decision time.</p>
      </section>
      <div className="flex flex-wrap gap-4 px-5 py-7 sm:px-8">
        <button type="button" onClick={onPlayAgain} className="min-h-12 rounded-sm bg-accent px-6 py-3 text-sm font-semibold text-[#081219] hover:bg-[#a0e7ed]">Play Again</button>
        <Link href="/#challenges" className="inline-flex min-h-12 items-center rounded-sm border border-white/25 px-6 py-3 text-sm text-slate-200 hover:border-accent">Back to Challenges</Link>
      </div>
    </section>
  );
}
