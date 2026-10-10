import type { Metadata } from 'next';
import Link from 'next/link';
import FocusChallenge from './focus-challenge';

export const metadata: Metadata = {
  title: 'Focus Challenge | Pilot Reflex',
  description: 'Observe four flight instrument readings and identify what changed across five rounds. A visual attention and memory game for entertainment and education only.',
};

export default function FocusChallengePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 sm:px-10">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="flex min-h-24 flex-wrap items-center justify-between gap-4 border-b border-white/10 py-5">
        <Link href="/" className="text-sm font-semibold tracking-[.18em]">PILOT <span className="text-accent">REFLEX</span></Link>
        <Link href="/#challenges" className="nav-link py-3 text-sm text-slate-300">← Back to Challenges</Link>
      </header>
      <main id="main" className="py-10 sm:py-14">
        <p className="eyebrow mb-3">CHALLENGE 03 / OBSERVE. REMEMBER. IDENTIFY.</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Focus Challenge</h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-400">Four instruments. One change. Take in the readings, then find the detail that moved.</p>
        <FocusChallenge />
      </main>
      <footer className="border-t border-white/10 py-8 text-xs leading-6 text-slate-400">
        For entertainment and educational purposes only. Not an official pilot aptitude test, medical assessment, or measure of fitness to fly. Instrument readings are generated game values, not real flight data. Browser, display, and input-device latency affect decision times.
      </footer>
    </div>
  );
}
