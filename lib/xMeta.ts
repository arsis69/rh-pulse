// Free X/Twitter signals.
//
// Follower counts are deliberately NOT here: they cost ~$200/mo via the official
// API, and they'd be actively misleading. 84 of 110 X links on this board are
// meme-tweet links to famous accounts (googlejapan x7, elonmusk x5, AP) rather
// than the project's own account — scoring by followers would rank a scam that
// links an Elon tweet as the safest coin on the site.
//
// What IS free and honest: does the link resolve, whose account is it, is it
// blue-verified, how much engagement did the tweet get, and how old is it.
import { XSignal } from '@/lib/types';

const TWEET_API = 'https://cdn.syndication.twimg.com/tweet-result';
const UA = 'Mozilla/5.0 (compatible; PulseBot/1.0; +https://pulseapp.top)';

export interface ParsedX {
  kind: 'status' | 'profile' | 'handle';
  handle?: string;
  statusId?: string;
}

// Sources disagree on format: GT gives a bare handle, DexScreener/on-chain/
// launchpad give full URLs, some give a link to a specific tweet.
export function parseX(raw: string): ParsedX | null {
  const s = raw.trim();
  if (!s) return null;
  const status = s.match(/(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i);
  if (status) return { kind: 'status', handle: status[1].toLowerCase(), statusId: status[2] };
  const profile = s.match(/(?:x|twitter)\.com\/@?([^/?#]+)/i);
  if (profile) return { kind: 'profile', handle: profile[1].toLowerCase() };
  if (/^@?[A-Za-z0-9_]{1,15}$/.test(s)) return { kind: 'handle', handle: s.replace(/^@/, '').toLowerCase() };
  return null;
}

export interface TweetInfo {
  handle?: string;
  blueVerified?: boolean;
  likes?: number;
  createdAt?: number; // epoch seconds
  dead: boolean;
}

// Undocumented endpoint used by embedded tweets. Treat any failure as UNKNOWN,
// never as a negative — if X blocks us we must not start calling every token a
// fake. Only an explicit "no such tweet" counts as dead.
export async function fetchTweet(statusId: string): Promise<TweetInfo | null> {
  try {
    const res = await fetch(`${TWEET_API}?id=${statusId}&token=a`, {
      headers: { accept: 'application/json', 'user-agent': UA },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 404) return { dead: true };
    if (!res.ok) return null;
    const j = await res.json();
    const u = j?.user;
    if (!u?.screen_name) return { dead: true }; // resolved, but no tweet behind it
    return {
      handle: String(u.screen_name).toLowerCase(),
      blueVerified: Boolean(u.is_blue_verified || u.verified),
      likes: Number(j.favorite_count ?? 0),
      createdAt: j.created_at ? Math.floor(new Date(j.created_at).getTime() / 1000) : undefined,
      dead: false,
    };
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Does the handle plausibly belong to THIS project?
function handleMatchesToken(handle: string, ticker: string, name: string): boolean {
  const h = norm(handle);
  const t = norm(ticker);
  const n = norm(name);
  if (!h) return false;
  return (t.length >= 3 && h.includes(t)) || (n.length >= 4 && h.includes(n));
}

/**
 * Classify a token's X link.
 *
 * `handleUses` maps handle → how many DISTINCT tokens on the board link it.
 * This is the borrowed-fame test, and it needs no API at all: if seven different
 * tokens all link @googlejapan, that account provably belongs to none of them.
 */
export function classifyX(
  parsed: ParsedX,
  tweet: TweetInfo | null,
  ticker: string,
  name: string,
  handleUses: number,
): XSignal {
  const handle = tweet?.handle ?? parsed.handle;
  const dead = tweet?.dead === true;
  const matches = handle ? handleMatchesToken(handle, ticker, name) : false;

  // Shared across unrelated tokens, or a tweet link whose author has nothing to
  // do with the ticker → the deployer is riding someone else's audience.
  const borrowed = !dead && !matches && (handleUses > 1 || parsed.kind === 'status');

  return {
    handle,
    own: !dead && !borrowed && Boolean(handle),
    borrowed,
    dead,
    blueVerified: tweet?.blueVerified,
    likes: tweet?.likes,
    tweetAgeSec: tweet?.createdAt ? Math.max(0, Date.now() / 1000 - tweet.createdAt) : undefined,
  };
}
