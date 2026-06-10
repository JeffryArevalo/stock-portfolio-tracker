# Stock Portfolio Tracker

A public, real-time view of my personal stock portfolio. Anyone can see my holdings,
live prices, performance vs the S&P 500, and my full buy/sell history — but only I
can record trades.

**Live site:** https://stock-portfolio-tracker-black.vercel.app

## How it works

```
Visitors ──> Vercel (Next.js, free Hobby tier — always on)
              ├─ /              Portfolio: KPIs, performance & allocation charts, holdings
              ├─ /activity      Every buy & sell, newest first, filterable
              ├─ /stock/SYMBOL  Live quote, price chart, key stats, news, my trades
              └─ /api/*         Server routes: API keys stay server-side, responses
                                CDN-cached so free-tier rate limits are never hit

Admin (me) ──> /admin ──(GitHub token in my browser only)──> commits to
               data/transactions.json in this repo ──> site updates in ~1 minute
```

- **Source of truth** is [`data/transactions.json`](data/transactions.json) — an
  append-only trade log committed to this repo. Holdings, average cost, and realized
  P/L are all derived from it. Git history doubles as an audit trail.
- **View-only by construction**: the public site has no write path. Writing requires a
  fine-grained GitHub personal access token that exists only in the owner's browser.
- **Live market data**: quotes from [Finnhub](https://finnhub.io) (cached 30s),
  daily history from [Twelve Data](https://twelvedata.com) (cached 6h), proxied
  through API routes so keys are never exposed to the client.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Recharts for charts
- Vercel Hobby for hosting (free, no sleeping)
- GitHub Contents API as the "database"

## Local development

```bash
git clone https://github.com/JeffryArevalo/stock-portfolio-tracker.git
cd stock-portfolio-tracker
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

`.env.local` (server-side only — do **not** prefix with NEXT_PUBLIC_):

```
FINNHUB_API_KEY=your_finnhub_key
TWELVEDATA_API_KEY=your_twelvedata_key
```

Open http://localhost:3000

## Deployment (Vercel)

1. Import the repo in Vercel (already connected — every push to `main` deploys).
2. In **Project → Settings → Environment Variables**, add:
   - `FINNHUB_API_KEY`
   - `TWELVEDATA_API_KEY`
3. Redeploy. That's it — no other infrastructure.

## Recording trades (owner only)

1. Visit `/admin` on the live site.
2. One-time setup: create a **fine-grained PAT** at
   github.com/settings/personal-access-tokens/new scoped to *this repo only* with
   **Contents: Read and write**, and paste it on the setup screen. It is stored in
   your browser's localStorage and sent only to `api.github.com`.
3. Use the Buy/Sell form. Each trade becomes a commit
   (`trade: BUY 5 MSFT @ 430.10`) and the public site reflects it within a minute.

## Author

Jeffry Arevalo — https://github.com/JeffryArevalo
