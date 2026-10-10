import Link from "next/link";

const challenges = [
  { number: "01", title: "Visual Reaction", category: "SEE. REACT.", description: "A change of light. A moment to respond. Explore the time between seeing a cue and taking action.", icon: "visual" },
  { number: "02", title: "Signal Response", category: "NOTICE. DECIDE.", description: "Find the right cue among competing signals. Explore how a little decision-making changes your response.", icon: "signal" },
  { number: "03", title: "Focus Challenge", category: "SETTLE IN. STAY SHARP.", description: "Keep your attention on what matters. Explore the balance between a quick response and a considered one.", icon: "focus" },
];

function Instrument() {
  return (
    <div className="instrument relative mx-auto w-full max-w-[460px]" aria-hidden="true">
      <svg viewBox="0 0 460 460" fill="none" className="w-full">
        <circle cx="230" cy="230" r="211" stroke="#263642" />
        <circle cx="230" cy="230" r="182" stroke="#263642" strokeDasharray="2 8" />
        <circle cx="230" cy="230" r="151" fill="#0d1b26" stroke="#344752" />
        {Array.from({ length: 36 }, (_, index) => (
          <path key={index} d={`M230 26 V${index % 3 === 0 ? 42 : 34}`} stroke={index % 3 === 0 ? "#7e959f" : "#344752"} transform={`rotate(${index * 10} 230 230)`} />
        ))}
        <path d="M230 66 L223 54 H237 Z" fill="#78d9e3" />
        <path d="M80 230 H380" stroke="#78d9e3" strokeOpacity=".55" />
        <path d="M110 252 H350 M125 274 H335 M145 296 H315" stroke="#253b46" />
        <path d="M200 166 H260 M214 187 H246 M200 208 H260 M214 252 H246 M200 274 H260" stroke="#6e8793" />
        <path d="M151 230 H202 L215 243 M309 230 H258 L245 243" stroke="#78d9e3" strokeWidth="3" />
        <circle cx="230" cy="230" r="5" stroke="#78d9e3" strokeWidth="2" />
        <path d="M230 315 V327 M208 322 H252" stroke="#6e8793" />
        <g fill="#91a6b2" fontSize="10" fontFamily="monospace" textAnchor="middle">
          <text x="230" y="17">N</text><text x="446" y="234">E</text><text x="230" y="453">S</text><text x="14" y="234">W</text>
          <text x="230" y="126" letterSpacing="3">STAY CENTERED</text>
          <text x="230" y="353" letterSpacing="2">PILOT REFLEX</text>
        </g>
      </svg>
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-background px-4 font-mono text-[10px] tracking-[.2em] text-slate-400">ATTITUDE / AWARENESS / ACTION</div>
    </div>
  );
}

function ChallengeIcon({ type }: { type: string }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {type === "visual" ? <><path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16Z" /><circle cx="16" cy="16" r="4" /></> : type === "signal" ? <><path d="M3 18h6l4-10 6 17 4-10h6" /><path d="M3 5v3M29 24v3" strokeOpacity=".5" /></> : <><path d="M11 4H4v7M21 4h7v7M4 21v7h7M28 21v7h-7" /><circle cx="16" cy="16" r="5" /><path d="M16 8v3M16 21v3M8 16h3M21 16h3" /></>}
    </svg>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 sm:px-10 lg:px-20">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="flex min-h-24 items-center justify-between gap-6 border-b border-white/10">
        <a href="#" aria-label="Pilot Reflex home" className="flex items-center gap-3">
          <svg aria-hidden="true" width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="m17 3 5 13 10 6-12-2-3 11-3-11-12 2 10-6 5-13Z" stroke="#78d9e3" strokeWidth="1.4" /></svg>
          <span className="text-sm font-semibold tracking-[.18em]">PILOT <span className="text-accent">REFLEX</span></span>
        </a>
        <nav aria-label="Main navigation" className="flex items-center gap-8 text-sm text-slate-300">
          <a href="#challenges" className="nav-link">Challenges</a>
          <a href="#about" className="nav-link hidden sm:inline">About the project <span aria-hidden="true" className="ml-1 text-accent">↗</span></a>
        </nav>
      </header>

      <main id="main">
        <section aria-labelledby="hero-title" className="grid items-center gap-14 py-16 lg:grid-cols-[1.25fr_1fr] lg:gap-10 lg:py-24">
          <div className="hero-copy">
            <p className="eyebrow mb-7 flex items-center gap-3"><span className="h-1.5 w-1.5 bg-accent" /> AVIATION INSPIRED. CURIOSITY DRIVEN.</p>
            <h1 id="hero-title" className="text-[clamp(3.25rem,7vw,6.5rem)] leading-[.98] font-semibold tracking-[-.065em]">HOW FAST<br />CAN YOU<br /><span className="text-accent">REACT?</span></h1>
            <p className="mt-7 max-w-md text-base leading-7 text-slate-400 sm:text-lg">A split second sparks a decision.<br />Explore your reactions through challenges inspired by the focus of flight.</p>
            <Link href="/challenges/visual-reaction" className="mt-9 inline-flex min-h-14 items-center gap-6 rounded-sm bg-accent px-6 text-sm font-semibold text-[#081219] transition-colors hover:bg-[#a0e7ed]" aria-describedby="launch-note">Start Challenge <span aria-hidden="true">↗</span></Link>
            <p id="launch-note" className="mt-3 font-mono text-xs text-slate-400">Visual Reaction · Five attempts · Ready to play</p>
          </div>
          <Instrument />
        </section>

        <section id="challenges" aria-labelledby="challenges-title" className="scroll-mt-8 border-t border-white/10 pt-10 pb-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div><p className="eyebrow mb-3">THE CHALLENGES</p><h2 id="challenges-title" className="text-2xl font-medium tracking-tight sm:text-3xl">Three ways to meet the moment.</h2></div>
            <span className="font-mono text-xs text-slate-400">02 READY / 01 IN DEVELOPMENT</span>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {challenges.map((challenge) => (
              <article key={challenge.number} className="rounded-sm border border-white/10 bg-[#0d1721] p-6 lg:p-7">
                <div className="mb-10 flex items-center justify-between"><span className="text-accent"><ChallengeIcon type={challenge.icon} /></span><span className="font-mono text-xs text-slate-500">/{challenge.number}</span></div>
                <p className="mb-3 font-mono text-[10px] tracking-[.15em] text-slate-400">{challenge.category}</p>
                <h3 className="mb-3 text-xl font-medium tracking-tight">{challenge.title}</h3>
                <p className="text-sm leading-6 text-slate-400">{challenge.description}</p>
                <div className="mt-7 border-t border-white/10 pt-4 font-mono text-[10px] tracking-[.12em] text-slate-400">{challenge.icon === "visual" ? <Link href="/challenges/visual-reaction" className="nav-link inline-flex min-h-11 items-center text-accent">PLAY VISUAL REACTION <span aria-hidden="true" className="ml-2">↗</span></Link> : challenge.icon === "signal" ? <Link href="/challenges/signal-response" className="nav-link inline-flex min-h-11 items-center text-accent">PLAY SIGNAL RESPONSE <span aria-hidden="true" className="ml-2">↗</span></Link> : "COMING SOON"}</div>
              </article>
            ))}
          </div>
        </section>

        <section id="coming-soon" tabIndex={-1} aria-labelledby="launch-title" className="mb-14 flex scroll-mt-8 flex-col gap-4 border-y border-white/10 py-7 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="eyebrow mb-2">ON THE HORIZON</p><h2 id="launch-title" className="text-xl font-medium">More challenges are preparing for takeoff.</h2></div>
          <p className="max-w-sm text-sm leading-6 text-slate-400">Visual Reaction and Signal Response are ready to play. Focus Challenge is still in development.</p>
        </section>
      </main>

      <footer id="about" className="grid gap-7 border-t border-white/10 py-8 sm:grid-cols-[1fr_2fr] sm:gap-16">
        <div><p className="text-xs font-semibold tracking-[.18em]">PILOT REFLEX</p><p className="mt-2 text-xs text-slate-400">A little curiosity. A different perspective.</p></div>
        <p className="max-w-2xl text-xs leading-6 text-slate-400"><span className="font-medium text-slate-300">Made for curiosity, not certification.</span> Pilot Reflex is an independent project for entertainment and educational purposes only. It is not an official pilot aptitude test, medical assessment, or measure of fitness to fly.</p>
      </footer>
    </div>
  );
}
