// Smart-money set: top 30 holders of the top 30 Robinhood-chain coins by market cap.
// The universe of candidate tokens is hard-coded because DexScreener does not expose
// a free chain-wide top-by-market-cap endpoint and Blockscout market-cap data is
// incomplete for many native memecoins (e.g. PONS, VEX, HAN).

const EXPLORER_V2 = 'https://robinhoodchain.blockscout.com/api/v2';
const DEXSCREENER = 'https://api.dexscreener.com';
const TOP_COINS_LIMIT = 30;
const HOLDERS_PER_COIN = 30;
const TTL_MS = 30 * 60 * 1000; // 30 min

// Candidate universe — native Robinhood coins. Market caps are re-fetched from
// DexScreener each cycle and the top 30 by mcap are selected dynamically.
const CANDIDATE_ADDRESSES: string[] = [
  '0x020bfC650A365f8BB26819deAAbF3E21291018b4', // CASHCAT
  '0x45242320DBB855EeA8Fd36804C6487E10E97FCF9', // TENDIES
  '0x8Ff92566f2e81BDd68EDfAa8cde73942A723796b', // VEX
  '0x3746a5ebCA295Dee695dd1bcba50A8626Df3099C', // HAN
  '0xc6911796042b15d7Fa4F6CDe69e245DdCd3d9c31', // VIRTUAL
  '0x39dBED3a2bd333467115dE45665cC57F813C4571', // PONS
  '0xD7321801CAae694090694Ff55A9323139F043B88', // JUGGERNAUT
  '0x8e62F281f282686fCa6dCB39288069a93fC23F1c', // HOODRAT
  '0x77581054581B9c525E7dd7a0155DE43867532d03', // WISHBONE
  '0x01637b14B7378B99dE75A64d50656d98488D9a4d', // MARIAN
  '0xf2915d1e3C1B0c769d0c756Ec43F1c1f6c99cD03', // ARROW
  '0xF8BC08092C06dB6148114DCf82AF881F1085f92b', // WOOD
  '0x5A283986B204326344A1cC04b52b37f1af54Ef72', // CASHDOG
  '0x57C0E45cB534413D1C20A4240955d6bB250BB4F1', // UP
  '0x241F3Caad03Db31137F641beF005A32176530024', // NPC
  '0x178E54df3D091EE4D0B2534742eF9e3692b76526', // BNKR
  '0x17bb0C898254406b1Ea2e8E99B0C263e26c9E4a4', // DIH
  '0x2103faA9D1762e27a716C61718b3aCf3Ec1F9bf1', // FOX
  '0xbf72347bacEfE747Eaf48b8A66E38BABad3020A0', // STONKS
  '0xf44702b17d9abD53815F703e772F35E9c71A53af', // RAXOL
  '0x75C8258eAa6d0f94b82951194191cA3efB0bCBe2', // MEOW
  '0xA80eb66b3E0CF66ccB46f8b8C9e7ff5803eEb820', // WEN
  '0x84b7515081A7Ac5adc26179b77A8B18A8c6725C0', // MLY
  '0xc79D46D716B33b463b3A6574d6eE26009aBF4E9a', // BYCOCKET
  '0x8d4dFaaA4198b6486E0293Fec914C2B6a821D4DC', // KITSU
  '0xF4C450c1570C2DBda91DE1Ed2E39995a15028c97', // HODL
  '0xdcc34bdD5D3C30237303b95D2F59cc29437b5c74', // COOKWARE
  '0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3', // HOODIE
  '0x834b31164b5e5F4a08B441D796aBB85f714bb7C1', // HOPPY
  '0xE49A1C3033EcC6b804bc423021D3F71F1A3e0F9B', // WIF
  '0xeaa9abB805Db03b6859662354aBfE0C2A30902ae', // SUIT
  '0x880B852316d430741C5B693AA53f22871e42eE77', // NVR
  '0x65b445518B1AD0d9C597731494f5bD2991b7EC08', // CLAWBANK
  '0xe8fB470E0685437d7739BD2AacBA60b228800335', // THROBBIN
  '0xf314AEDeAaDCB02F33a13Eae471Fe06D13AA7777', // 401K
  '0xbfc3a980B78B007eF0CDe9625E52dbB66c51A1A7', // EARN
  '0xE77d354898A44808ff3999947002785CD727BEd5', // SFI
  '0xF82119ebd01eb6AB67105C9536A713D61a25cf9f', // ADX
  '0xE44951407D2ed8E73dce4b7002908732BC0d0bC3', // KINDRA
];

interface DSCToken {
  address: string;
  marketCap: number;
}

let cached: { set: Set<string>; at: number } | null = null;

async function fetchDexScreenerCaps(addresses: string[]): Promise<Map<string, number>> {
  const caps = new Map<string, number>();
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    const res = await fetch(`${DEXSCREENER}/tokens/v1/robinhood/${batch.join(',')}`, { cache: 'no-store' });
    if (!res.ok) continue;
    const pairs = (await res.json()) as Array<{ baseToken: { address: string }; marketCap?: number; fdv?: number }>;
    for (const p of pairs) {
      const addr = p.baseToken.address.toLowerCase();
      const mc = p.marketCap ?? p.fdv ?? 0;
      caps.set(addr, Math.max(caps.get(addr) ?? 0, mc));
    }
  }
  return caps;
}

async function selectTopCoins(): Promise<DSCToken[]> {
  const caps = await fetchDexScreenerCaps(CANDIDATE_ADDRESSES);
  const tokens: DSCToken[] = [];
  for (const addr of CANDIDATE_ADDRESSES) {
    const mc = caps.get(addr.toLowerCase()) ?? 0;
    if (mc > 0) tokens.push({ address: addr.toLowerCase(), marketCap: mc });
  }
  tokens.sort((a, b) => b.marketCap - a.marketCap);
  return tokens.slice(0, TOP_COINS_LIMIT);
}

async function fetchTopHolders(tokenAddress: string): Promise<string[]> {
  const res = await fetch(`${EXPLORER_V2}/tokens/${tokenAddress}/holders`, { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  const items = (json.items || []).slice(0, HOLDERS_PER_COIN);
  return items
    .map((it: { address?: { hash?: string } }) => it.address?.hash?.toLowerCase())
    .filter(Boolean) as string[];
}

export async function getSmartMoneySet(): Promise<Set<string>> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.set;

  const coins = await selectTopCoins();
  const set = new Set<string>();
  await Promise.all(
    coins.map(async (coin) => {
      const holders = await fetchTopHolders(coin.address);
      holders.forEach((h) => set.add(h));
    })
  );

  cached = { set, at: Date.now() };
  return set;
}

export function peekSmartMoneyForDebug(): typeof cached {
  return cached;
}
