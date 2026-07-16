# Pulse Status

## What this is

Pulse is a live token radar / dashboard for Robinhood Chain. It aggregates new launches and trading activity from launchpads (Flap, Pons, Klik, Virtuals, Bankr, etc.) and surfaces them with smart-money / whale signals, risk scoring, and image thumbnails.

## Latest updates

Last pushed: `main` branch.

Recent changes (since the last tagged commit):

- **Color & icon consistency** — buy signals are now green, sell signals red across `RecentTrades` and `TickerTape`. Whale / smart-money icons are standardized: 💎 = smart money, 🐋 = >1% supply buy/sell, 🐟 = large buy/sell.
- **Percent supply fix** — the % of supply traded is now computed from the live token supply, with a fallback to `trade.supply` for tokens that have dropped out of the feed.
- **On-chain metadata reader** — added `lib/onchainMeta.ts` to read Pons-style token logos, descriptions, and socials directly from the ERC-20 contract when no upstream image is available.
- **DexScreener latest profiles** — integrated DexScreener’s latest token profiles as an extra image/social source.
- **Image pipeline** — 256 px icons, 640 px card banners, Sharp WebP quality 85, deterministic SVG fallback for missing images, and extra image hosts added to the proxy allowlist.
- **Production** — rebuilt and restarted the Next.js service on `localhost:3100` behind Cloudflare Tunnel.

## Current problem

`https://pulseapp.top` loads correctly from the server and from other external vantage points, but the user cannot load it from their devices. Symptoms:

- Browser shows: “This page couldn’t load. Reload to try again, or go back.”
- Happens on multiple devices and multiple networks (including phone on different internet).
- DNS flush did not fix it.
- The root cause is not a server outage; the app and tunnel are healthy.

The working hypothesis is that **Cloudflare is unreachable or blocked from the user’s location/network**. The user asked to focus only on the new domain (`pulseapp.top`), so all fallback domains have been removed.

## Next steps

1. Confirm the user’s country/region and whether `https://www.cloudflare.com` is reachable from their network.
2. If Cloudflare is blocked, the fix must come from the user side (VPN / different network) or by moving the domain off Cloudflare (requires the user to update DNS for `pulseapp.top` to point directly to the server IP, since the server does not have Cloudflare API access for the `pulseapp.top` zone).
3. If Cloudflare is reachable, continue debugging with the user’s exact browser, error code, and `nslookup` output.

## Useful commands for the operator

```bash
# Check the Next.js app
sudo systemctl status rh-pulse.service

# Check the Cloudflare tunnel
sudo systemctl status cloudflared-rh-pulse.service

# External health check
curl -s -o /dev/null -w '%{http_code}\n' https://pulseapp.top/
```

## Live URL

- `https://pulseapp.top`

