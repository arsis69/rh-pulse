import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { CopyCa } from '@/components/CopyCa';
import { ScanSearch, Cpu, ShieldCheck, ArrowRight, Radar, Gauge, Sparkles } from 'lucide-react';

export const metadata = {
  title: 'Intro · $PULSE',
  description:
    'Meet $PULSE, the token that powers Pulse. The AI that reads every launch on Robinhood Chain and tells you what is worth your attention.',
};

// Mirrors the real token drawer so the intro shows the product itself, not a
// description of it.
const SCORE_PARTS = [
  { label: 'Traction', value: 24, weight: 25 },
  { label: 'Distribution', value: 19, weight: 20 },
  { label: 'Liquidity', value: 14, weight: 15 },
  { label: 'Buy pressure', value: 13, weight: 15 },
  { label: 'Socials', value: 15, weight: 15 },
];

export default function IntroPage() {
  return (
    <div className="min-h-screen">
      <Nav />

      <main className="mx-auto max-w-[1040px] px-5 pb-28 sm:px-6">
        {/* ---------------- hero ---------------- */}
        <section className="pt-16 sm:pt-24">
          <div className="flex flex-col items-center text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface-2 px-3 py-1 text-[12px] font-medium text-ink-2">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-pulse" />
              Live on Robinhood Chain
            </span>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Pulse" className="mt-8 h-16 w-16 rounded-2xl ring-1 ring-edge" />

            <h1 className="mt-6 text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[56px]">
              <span className="text-pulse">$PULSE</span>
            </h1>
            <p className="mt-3 text-[19px] font-semibold text-ink sm:text-[22px]">The token that runs Pulse.</p>

            <p className="mt-5 max-w-[600px] text-[15.5px] leading-[1.7] text-ink-2">
              Pulse is the AI that reads every launch on Robinhood Chain, scores it on real on-chain data, and tells you
              what is worth your attention before you ape.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="btn-press inline-flex items-center gap-2 rounded-xl bg-pulse px-5 py-3 text-[14px] font-bold text-bg transition-transform hover:scale-[1.02]"
              >
                Open the dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#fees"
                className="btn-press inline-flex items-center gap-2 rounded-xl border border-edge bg-surface px-5 py-3 text-[14px] font-semibold text-ink-2 transition-colors hover:border-edge-bright hover:text-ink"
              >
                See how fees work
              </Link>
            </div>
          </div>

          {/* proof strip */}
          <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-edge bg-edge sm:grid-cols-4">
            <Stat value="Every launch" label="scored on arrival" />
            <Stat value="6 signals" label="behind every score" />
            <Stat value="0% tax" label="no mint, no games" />
            <Stat value="0.7%" label="of trades fund the app" />
          </div>

          {/* contract address */}
          <section className="mt-12 flex justify-center sm:mt-14">
            <CopyCa address="0x1768f95ccbbca58d7167aca8ddfad22f22649d1c" />
          </section>
        </section>

        {/* ---------------- the card + why ---------------- */}
        <section className="mt-24 grid items-center gap-10 sm:mt-32 lg:grid-cols-[420px_1fr]">
          <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
            <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-20 w-20 rounded-2xl ring-1 ring-edge" />
            </div>
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[21px] font-bold leading-none">$PULSE</div>
                  <div className="mt-1 text-[13px] text-ink-3">Pulse</div>
                </div>
                <div
                  className="num flex h-12 w-12 items-center justify-center rounded-xl text-[20px] font-bold text-pulse"
                  style={{ background: 'var(--color-surface-2)' }}
                >
                  92
                </div>
              </div>
              <div className="rounded-xl border border-edge bg-surface-2 p-4">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">Trust score</div>
                <div className="mt-1 text-[13px] text-ink-3">Live chain signals, ranked vs the board</div>
                <div className="mt-3 space-y-2 border-t border-edge pt-3">
                  {SCORE_PARTS.map((p) => (
                    <div key={p.label} className="grid grid-cols-[100px_1fr_44px] items-center gap-2">
                      <div className="text-[12px] text-ink-2">{p.label}</div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full bg-pulse" style={{ width: `${(p.value / p.weight) * 100}%` }} />
                      </div>
                      <div className="num text-right text-[12px] text-ink-3">
                        {p.value}/{p.weight}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <Kicker>The read</Kicker>
            <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
              No mystery number. You see the why.
            </h2>
            <p className="mt-5 max-w-[520px] text-[15.5px] leading-[1.7] text-ink-2">
              Most tools hand you a score and ask you to trust it. Pulse breaks every score into the signals that made
              it, traction, holder spread, liquidity, buy pressure, and socials, so you can judge a token in seconds
              instead of guessing.
            </p>
            <p className="mt-4 max-w-[520px] text-[15.5px] leading-[1.7] text-ink-2">
              The card above is exactly how a clean token looks inside Pulse. Real activity, healthy distribution, its
              own verified socials.
            </p>
          </div>
        </section>

        {/* ---------------- how it works ---------------- */}
        <section className="mt-24 sm:mt-32">
          <div className="text-center">
            <Kicker center>How it works</Kicker>
            <h2 className="mt-3 text-[28px] font-bold tracking-tight sm:text-[36px]">From launch to verdict in seconds</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Step n="01" icon={Radar} title="Launch detected" body="The moment a token hits the chain across any launchpad, Pulse picks it up and starts pulling it apart live." />
            <Step n="02" icon={Gauge} title="Scored on-chain" body="Six real signals become one trust score, calibrated against the live board so the number always means something." />
            <Step n="03" icon={Sparkles} title="AI verdict" body="A model reads the token and writes the call in plain English. The risk, the good, the bad, in two blunt lines." />
          </div>
        </section>

        {/* ---------------- what pulse catches ---------------- */}
        <section className="mt-24 sm:mt-32">
          <div className="text-center">
            <Kicker center>The edge</Kicker>
            <h2 className="mt-3 text-[28px] font-bold tracking-tight sm:text-[36px]">What Pulse catches that others miss</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <Feature icon={ScanSearch} title="Signals, not vibes" body="Traction, holder concentration, liquidity, buy versus sell pressure, verified socials, and deployer history. Every point is shown, so nothing is hidden." />
            <Feature icon={ShieldCheck} title="Beyond basic scanners" body="Real holder concentration with the liquidity pool filtered out, so a healthy token never reads as a rug. Dead and borrowed X links flagged for what they are." />
            <Feature icon={Cpu} title="Whales in real time" body="Smart money and whale moves surface the second they land, not minutes later when the move is already gone." />
          </div>
        </section>

        {/* ---------------- $PULSE + fees ---------------- */}
        <section id="fees" className="mt-24 scroll-mt-24 sm:mt-32">
          <div className="overflow-hidden rounded-3xl border border-edge bg-surface">
            <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-2">
              <div>
                <Kicker>The token</Kicker>
                <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
                  Hold $PULSE, keep Pulse free
                </h2>
                <p className="mt-5 text-[15.5px] leading-[1.7] text-ink-2">
                  Pulse is a free app. There are no premium tiers, paywalled feeds, or locked features. Holding $PULSE
                  is how the community funds the product directly.
                </p>
                <ul className="mt-6 space-y-3">
                  {['Smarter AI models and scoring', 'More data sources and launchpads', 'Faster infrastructure and new features'].map((t) => (
                    <li key={t} className="flex items-center gap-3 text-[14.5px] text-ink">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pulse/15 text-pulse">
                        <ArrowRight className="h-3 w-3" />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col justify-center rounded-2xl border border-edge bg-surface-2 p-6">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">Where the fees go</div>
                <p className="mt-3 text-[14.5px] leading-[1.7] text-ink-2">
                  Every $PULSE trade carries a 1% fee. The share that flows back to Pulse is reinvested entirely into
                  better AI, more signals, infrastructure, and continuous improvements — never to hide features behind
                  a paywall.
                </p>
                {/* split bar */}
                <div className="mt-6">
                  <div className="flex h-3 overflow-hidden rounded-full">
                    <div className="bg-pulse" style={{ width: '70%' }} />
                    <div className="bg-surface-3" style={{ width: '30%' }} />
                  </div>
                  <div className="num mt-3 flex justify-between text-[12px]">
                    <span className="text-pulse">0.7% reinvested into Pulse</span>
                    <span className="text-ink-3">0.3% protocol</span>
                  </div>
                </div>
                <p className="mt-6 text-[13px] leading-relaxed text-ink-3">
                  No paywalls. Just a better free app.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- outro ---------------- */}
        <section className="mt-24 text-center sm:mt-32">
          <Kicker center>What is next</Kicker>
          <h2 className="mx-auto mt-4 max-w-[680px] text-[30px] font-bold leading-[1.15] tracking-tight sm:text-[40px]">
            Robinhood Chain today.
            <br />
            <span className="text-pulse">Wherever the attention goes tomorrow.</span>
          </h2>
          <p className="mx-auto mt-6 max-w-[600px] text-[15.5px] leading-[1.7] text-ink-2">
            For now, Pulse watches Robinhood Chain, because that is where the attention is today. But attention moves.
            The engine underneath, the AI, the scoring, the whale tracking, was never tied to one chain. As the money
            flows toward the next network, Pulse follows.
          </p>
          <Link
            href="/"
            className="btn-press mt-9 inline-flex items-center gap-2 rounded-xl bg-pulse px-6 py-3 text-[14px] font-bold text-bg transition-transform hover:scale-[1.02]"
          >
            Enter Pulse
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-[1040px] flex-col items-center justify-between gap-3 px-5 py-8 text-[13px] text-ink-3 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-6 w-6 rounded-lg ring-1 ring-edge" />
            <span>Pulse, live token intelligence for Robinhood Chain</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/" className="transition-colors hover:text-ink">
              Dashboard
            </Link>
            <Link href="/intro" className="text-pulse transition-colors hover:text-ink">
              $PULSE
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Kicker({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-3 ${center ? 'justify-center' : ''}`}>
      <span className="h-1 w-1 rounded-full bg-pulse" />
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-surface px-4 py-5 text-center sm:px-6">
      <div className="text-[18px] font-bold tracking-tight text-ink sm:text-[20px]">{value}</div>
      <div className="mt-1 text-[12.5px] text-ink-3">{label}</div>
    </div>
  );
}

function Step({ n, icon: Icon, title, body }: { n: string; icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="glass-border rounded-2xl bg-surface p-6">
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pulse/10 text-pulse">
          <Icon className="h-5 w-5" />
        </span>
        <span className="num text-[13px] text-ink-3">{n}</span>
      </div>
      <div className="mt-4 text-[16px] font-bold">{title}</div>
      <p className="mt-2 text-[13.5px] leading-[1.65] text-ink-2">{body}</p>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div className="glass-border hover-lift glass-hover rounded-2xl bg-surface p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pulse/10 text-pulse">
        <Icon className="h-5 w-5" />
      </span>
      <div className="mt-4 text-[16px] font-bold">{title}</div>
      <p className="mt-2 text-[13.5px] leading-[1.65] text-ink-2">{body}</p>
    </div>
  );
}
