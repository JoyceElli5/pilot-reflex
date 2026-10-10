'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { chartData, formatMilliseconds, type FlightReport as Report } from './report';
import { generateReportPng } from './report-image';

const buttonClass = 'inline-flex min-h-12 items-center justify-center rounded-sm px-6 py-3 text-sm font-semibold';
const ms = (value: number) => `${formatMilliseconds(value)} ms`;

export default function FlightReport({ report, onPlayAgain }: { report: Report; onPlayAgain: () => void }) {
  const chart = chartData(report.attempts);
  const heading = useRef<HTMLHeadingElement>(null);
  const exportResources = useRef({ request: 0, imageUrl: null as string | null });
  const [preview, setPreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const resources = exportResources.current;
    heading.current?.focus();
    return () => {
      resources.request++;
      if (resources.imageUrl) URL.revokeObjectURL(resources.imageUrl);
    };
  }, []);

  async function shareResults() {
    const resources = exportResources.current;
    const current = ++resources.request;
    setGenerating(true); setError(''); setMessage('Preparing your results image…');
    try {
      const blob = await generateReportPng(report);
      if (resources.request !== current) return;
      const url = URL.createObjectURL(blob);
      if (resources.imageUrl) URL.revokeObjectURL(resources.imageUrl);
      resources.imageUrl = url;
      setPreview(url);
      setMessage('Your image is ready. Download the PNG to share it.');
    } catch {
      if (resources.request === current) {
        setMessage('');
        setError('We could not create the image. Please try again or use another browser. Your results are still available above.');
      }
    } finally {
      if (resources.request === current) setGenerating(false);
    }
  }

  function download() {
    if (!preview) return;
    const link = document.createElement('a');
    try {
      link.href = preview;
      link.download = 'pilot-reflex-visual-reaction.png';
      document.body.appendChild(link);
      link.click();
      setError('');
      setMessage('Download requested. If it did not start, open the image below and save it from your browser.');
    } catch {
      setError('The download could not start. Open the image below and save it from your browser.');
    } finally { link.remove(); }
  }

  const comparisons = {
    first: 'First session — your personal best starts here.',
    new: 'New personal best',
    matched: 'You matched your personal best',
    'not-beaten': 'Your previous personal best still stands',
    unavailable: 'Personal-best comparison unavailable',
  };

  return (
    <section aria-labelledby="report-title" className="mt-8 overflow-hidden rounded-sm border border-accent/30 bg-[#0d1721]">
      <div className="border-b border-white/10 px-5 py-7 sm:px-8">
        <p className="eyebrow">SESSION COMPLETE / 5 ATTEMPTS</p>
        <h2 id="report-title" ref={heading} tabIndex={-1} className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Flight Performance Report</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">A moment-by-moment look at your Visual Reaction session.</p>
      </div>

      <div className="grid gap-8 px-5 py-8 sm:px-8 md:grid-cols-2">
        <div>
          <p className="eyebrow">COMPETITIVE GAME SCORE</p>
          <p className="mt-3 font-mono text-[clamp(2.5rem,8vw,4.5rem)] leading-none tracking-tight text-accent">{formatMilliseconds(report.score)} <span className="text-xl text-slate-400">ms</span></p>
          <p className="mt-5 text-sm font-medium text-accent">{comparisons[report.comparison]}</p>
          {typeof report.previousBest === 'number' && <p className="mt-2 text-xs text-slate-400">Previous best: {ms(report.previousBest)}. Comparisons use unrounded times.</p>}
          {!report.saved && <p className="mt-3 text-sm leading-6 text-amber-200">Your result could not be saved on this browser. You can still download this report.</p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-6 border-t border-white/10 pt-6 md:border-t-0 md:border-l md:pl-8 md:pt-0">
          <div className="col-span-2"><dt className="text-sm text-slate-400">Fastest valid reaction</dt><dd className="mt-2 font-mono text-2xl">{report.fastest === null ? 'No valid reactions' : ms(report.fastest)}</dd></div>
          <div className="col-span-2"><dt className="text-sm text-slate-400">Successful reactions</dt><dd className="mt-2 font-mono text-2xl">{report.successfulReactions} / 5</dd></div>
          <div><dt className="text-sm text-slate-400">False starts</dt><dd className="mt-2 font-mono text-2xl">{report.falseStarts}</dd></div>
          <div><dt className="text-sm text-slate-400">Timeouts</dt><dd className="mt-2 font-mono text-2xl">{report.timeouts}</dd></div>
        </dl>
      </div>

      <figure aria-labelledby="chart-caption" className="border-y border-white/10 px-5 py-7 sm:px-8">
        <figcaption id="chart-caption" className="mb-6"><span className="text-lg font-medium">Your five attempts</span><span className="mt-1 block text-xs text-slate-400">Attempt score in milliseconds · lower is better</span></figcaption>
        <div className="mb-3 grid grid-cols-[3rem_minmax(0,1fr)_4.5rem] gap-2 text-[11px] text-slate-400" aria-hidden="true">
          <span /><div className="flex justify-between"><span>0</span><span>{chart.ticks[1]}</span><span>{chart.maximum}</span></div><span className="text-right">ms</span>
        </div>
        <ol className="space-y-4">
          {chart.trials.map(({ trial, value, fraction, penalty, label }) => (
            <li key={trial} className="grid grid-cols-[3rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs sm:text-sm">
              <span className="text-slate-300">Attempt {trial}</span>
              <div aria-hidden="true" className="relative h-7 border-x border-white/20 bg-white/[.03]">
                <span className="absolute inset-y-0 left-1/2 border-l border-white/10" />
                <span className={`absolute inset-y-1 left-0 ${penalty ? 'bg-amber-400' : 'bg-accent'}`} style={{ width: `${fraction * 100}%` }} />
              </div>
              <span className="text-right font-mono text-slate-200">{formatMilliseconds(value)}<span className="sr-only"> milliseconds{penalty ? " penalty" : " measured"}</span></span>
              <span className={`col-span-3 text-xs ${penalty ? "text-amber-200" : "text-slate-400"}`}>{label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs leading-6 text-slate-400">Cyan bars are measured reactions. Amber bars are 3,000 ms penalties, not measured reaction times. Your game score is the median of all five attempt scores, including penalties. Displayed values are rounded to 0.1 ms.</p>
      </figure>

      <div className="px-5 py-7 sm:px-8">
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onPlayAgain} className={`${buttonClass} bg-accent text-[#081219] hover:bg-[#a0e7ed]`}>Play Again <span aria-hidden="true" className="ml-3">↗</span></button>
          <button type="button" onClick={shareResults} disabled={generating} className={`${buttonClass} border border-white/25 text-slate-200 hover:border-accent disabled:cursor-wait disabled:opacity-60`}>{generating ? 'Creating image…' : 'Share Results'}</button>
        </div>
        <p className="mt-3 text-xs leading-6 text-slate-400">Create a PNG with your session results. No personal information is included and nothing is uploaded.</p>
        <p role="status" aria-live="polite" className="mt-3 text-sm leading-6 text-slate-300">{message}</p>
        {error && <p role="alert" className="mt-3 text-sm leading-6 text-amber-200">{error}</p>}
        {preview && <div className="mt-5">
          <Image src={preview} alt="PNG preview of this session’s Pilot Reflex report, with the competitive game score, fastest valid reaction, counts and five attempt outcomes shown above." width={1200} height={1000} unoptimized className="h-auto w-full rounded-sm border border-white/15" />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="button" onClick={download} className={`${buttonClass} bg-accent text-[#081219] hover:bg-[#a0e7ed]`}>Download PNG</button>
            <a href={preview} target="_blank" rel="noopener noreferrer" className="nav-link inline-flex min-h-12 items-center text-sm text-slate-300">Open image <span className="sr-only">in a new tab</span><span aria-hidden="true" className="ml-2">↗</span></a>
          </div>
        </div>}
      </div>
    </section>
  );
}
