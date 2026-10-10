import type { Metadata } from 'next';
import Link from 'next/link';
import VisualReaction from './visual-reaction';

export const metadata: Metadata = {
  title: 'Visual Reaction | Pilot Reflex',
  description: 'Try five visual reaction attempts. Wait for green, then respond. An aviation-inspired challenge for entertainment and education only.',
};

export default function VisualReactionPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 sm:px-10">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="flex min-h-24 flex-wrap items-center justify-between gap-4 border-b border-white/10 py-5">
        <Link href="/" className="text-sm font-semibold tracking-[.18em]">PILOT <span className="text-accent">REFLEX</span></Link>
        <Link href="/#challenges" className="nav-link py-3 text-sm text-slate-300">← All challenges</Link>
      </header>
      <main id="main" className="py-10 sm:py-14">
        <p className="eyebrow mb-3">CHALLENGE 01 / SEE. REACT.</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Visual Reaction</h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-400">Find the moment between a signal and your response. Five attempts. One clear cue.</p>
        <VisualReaction />
      </main>
      <footer className="border-t border-white/10 py-8 text-xs leading-6 text-slate-400">
        For entertainment and educational purposes only. Not an official pilot aptitude test, medical assessment, or measure of fitness to fly. Browser, display, and input-device latency affect results.
      </footer>
    </div>
  );
}
