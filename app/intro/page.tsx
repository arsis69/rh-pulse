import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { ScanSearch, Cpu, ShieldCheck, Coins, TrendingUp, ArrowRight, Waves } from 'lucide-react';

export const metadata = {
  title: 'Intro — $PULSE',
  description:
    'Meet $PULSE — the token that powers Pulse, the AI that reads every launch on Robinhood Chain before you ape.',
};

// The $PULSE score card mirrors the real token drawer, so the intro shows the
// product's own visual language rather than describing it.
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

      <main className="mx-auto max-w-[1120px] px-4 pb-24 sm:px-6">
        {/* ---------------- hero ---------------- */}
        <section className="relative flex flex-col items-center pt-16 text-center sm:pt-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[420px] max-w-[720px] rounded-full opacity-30 blur-3xl"
            style={{ background: 'radial-gradient(closest-side, rgba(204,255,0,0.35), transparent)' }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpg"
            alt="Pulse"
            className="h-20 w-20 rounded-2xl ring-1 ring-edge shadow-[0_0_40px_rgba(204,255,0,0.35)]"
          />
          <h1 className="mt-6 text-[44px] font-bold leading-none tracking-tight sm:text-[64px]">
            <span className="text-pulse text-glow">$PULSE</span>
          </h1>
          <p className="mt-4 max-w-[640px] text-[17px] leading-relaxed text-ink-2 sm:text-[19px]">
            The token that runs <span className="font-semibold text-ink">Pulse</span> — the AI that reads every launch
            on Robinhood Chain before you ape.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="btn-press inline-flex items-center gap-2 rounded-xl bg-pulse px-5 py-3 text-[14px] font-bold text-bg transition-transform hover:scale-[1.02]"
            >
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#fees"
              className="btn-press inline-flex items-center gap-2 rounded-xl border border-edge bg-surface-2 px-5 py-3 text-[14px] font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              How the fees work
            </Link>
          </div>
        </section>

        {/* ---------------- drawer-style $PULSE card ---------------- */}
        <section className="mt-16 flex flex-col items-center sm:mt-20">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
            {/* banner */}
            <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-surface-2">
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ background: 'radial-gradient(120% 120% at 50% 0%, rgba(204,255,0,0.18), transparent 60%)' }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="" className="h-24 w-24 rounded-2xl ring-1 ring-edge" />
            </div>

            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[22px] font-bold leading-none">$PULSE</div>
                  <div className="mt-1 text-[13px] text-ink-3">Pulse</div>
                </div>
                <div
                  className="num flex h-12 w-12 items-center justify-center rounded-xl text-[20px] font-bold text-pulse"
                  style={{ background: 'var(--color-surface-2)' }}
                  title="What a clean, real token looks like on Pulse"
                >
                  92
                </div>
              </div>

              <div className="rounded-xl border border-edge bg-surface-2 p-4">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">Trust score</div>
                <div className="mt-1 text-[13px] text-ink-2">Live chain signals · ranked vs the board</div>
                <div className="mt-3 space-y-2 border-t border-edge pt-3">
                  {SCORE_PARTS.map((p) => (
                    <div key={p.label} className="grid grid-cols-[104px_1fr_44px] items-center gap-2">
                      <div className="text-[12px] text-ink-2">{p.label}</div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full bg-pulse" style={{ width: `${(p.value / p.weight) * 100}%` }} />
                      </div>
                      <div className="num text-right text-[12px] text-ink-2">
                        {p.value}/{p.weight}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[13px] leading-relaxed text-ink-2">
                Real traction, clean distribution, its own verified socials — no tax, no games. This is what Pulse is
                built to surface.
              </p>
            </div>
          </div>
          <div className="mt-4 text-[12px] text-ink-3">How Pulse sees a clean token.</div>
        </section>

        {/* ---------------- what pulse does ---------------- */}
        <section className="mt-20 sm:mt-28">
          <SectionHeading kicker="The product" title="What Pulse does" />
          <p className="mx-auto mt-4 max-w-[720px] text-center text-[15px] leading-relaxed text-ink-2">
            Thousands of tokens hit Robinhood Chain every day. Almost all of it is noise. Pulse is the signal — the
            second a token launches, it takes it apart, live and on-chain.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={ScanSearch}
              title="A trust score from real data"
              body="Every token is scored on what matters — traction, holder concentration, liquidity, buy-vs-sell pressure, verified socials, deployer history. And you see exactly why the number is what it is."
            />
            <FeatureCard
              icon={Cpu}
              title="AI that explains the verdict"
              body="A model reads each token and calls it in plain English — the risk, the green flags, the red ones — in two blunt sentences."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Catches what scanners miss"
              body="Real holder concentration with the LP filtered out. Dead or borrowed X links — the token citing Elon's tweet instead of its own. Whale and smart-money moves, the moment they land."
            />
          </div>
        </section>

        {/* ---------------- where $PULSE fits ---------------- */}
        <section id="fees" className="mt-20 scroll-mt-24 sm:mt-28">
          <SectionHeading kicker="The token" title="Where $PULSE fits" />
          <p className="mx-auto mt-4 max-w-[720px] text-center text-[15px] leading-relaxed text-ink-2">
            $PULSE is how the machine stays running — and how you get the edge.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <FeatureCard
              icon={Coins}
              title="Hold to unlock"
              body="$PULSE holders get the premium layer: the whale & smart-money feed, custom launch and price alerts, and higher limits across the app."
            />
            <FeatureCard
              icon={TrendingUp}
              title="Every trade fuels the app"
              body="$PULSE trades carry the standard 1% pons fee, and 0.7% of it flows straight into Pulse — paying for the servers, the AI that scores every token, the data, and everything shipped next. The token you trade literally powers the product you use."
            />
          </div>
        </section>

        {/* ---------------- what's next ---------------- */}
        <section className="mt-20 sm:mt-28">
          <div className="relative overflow-hidden rounded-3xl border border-edge bg-surface p-8 text-center sm:p-14">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-full opacity-40"
              style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(204,255,0,0.14), transparent 60%)' }}
            />
            <div className="relative">
              <Waves className="mx-auto h-8 w-8 text-pulse" />
              <h2 className="mx-auto mt-5 max-w-[640px] text-[26px] font-bold leading-tight tracking-tight sm:text-[34px]">
                Robinhood Chain today.
                <br />
                <span className="text-pulse text-glow">Wherever the attention goes tomorrow.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-[620px] text-[15px] leading-relaxed text-ink-2">
                For now, Pulse watches Robinhood Chain — because that&apos;s where the attention is today. But attention
                moves. The engine underneath — the AI, the scoring, the whale tracking — was never tied to one chain. As
                the money and the launches flow toward the next hot network, Pulse follows.
              </p>
              <Link
                href="/"
                className="btn-press mt-8 inline-flex items-center gap-2 rounded-xl bg-pulse px-5 py-3 text-[14px] font-bold text-bg transition-transform hover:scale-[1.02]"
              >
                Enter Pulse <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-edge py-6 text-center text-[12px] text-ink-3">
        Pulse · live token intelligence for Robinhood Chain
      </footer>
    </div>
  );
}

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="text-center">
      <div className="text-[12px] font-semibold uppercase tracking-[0.18em] text-pulse">{kicker}</div>
      <h2 className="mt-2 text-[28px] font-bold tracking-tight sm:text-[36px]">{title}</h2>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
}) {
  return (
    <div className="glass-border hover-lift glass-hover rounded-2xl bg-surface p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pulse/10">
        <Icon className="h-5 w-5 text-pulse" />
      </span>
      <div className="mt-4 text-[16px] font-bold">{title}</div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{body}</p>
    </div>
  );
}
