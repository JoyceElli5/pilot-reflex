import type { Metadata } from 'next';
import Link from 'next/link';
import SignalResponse from './signal-response';

export const metadata: Metadata = {
  title: 'Signal Response | Pilot Reflex',
  description: 'Respond only to CLEARED in five aviation-inspired signal rounds. An entertainment and educational challenge, not an official aptitude or medical assessment.',
};

export default function SignalResponsePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 sm:px-10">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="flex min-h-24 flex-wrap items-center justify-between gap-4 border-b border-white/10 py-5">
        <Link href="/" className="text-sm font-semibold tracking-[.18em]">PILOT <span className="text-accent">REFLEX</span></Link>
        <Link href="/#challenges" className="nav-link py-3 text-sm text-slate-300">← Back to Challenges</Link>
      </header>
      <main id="main" className="py-10 sm:py-14">
        <p className="eyebrow mb-3">CHALLENGE 02 / NOTICE. DECIDE.</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Signal Response</h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-400">Read the signal. Choose your moment. Five rounds of attention and response.</p>
        <SignalResponse />
      </main>
      <footer className="border-t border-white/10 py-8 text-xs leading-6 text-slate-400">
        For entertainment and educational purposes only. Not an official pilot aptitude test, medical assessment, or measure of fitness to fly. Signals are game cues, not operational aviation instructions. Browser, display, and input-device latency affect results.
      </footer>
    </div>
  );
}
