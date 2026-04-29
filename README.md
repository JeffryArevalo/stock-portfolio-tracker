# Stock Portfolio Tracker

A real-time stock portfolio tracker built with Next.js and TypeScript. Displays live prices, performance charts, allocation breakdowns, and gain/loss metrics for a personal investment portfolio.

Deployed as a static site on GitHub Pages with no backend or hosting costs.

## Live Demo

https://jeffryarevalo.github.io/stock-portfolio-tracker

## Features

- Real-time stock quotes with auto-refresh
- Daily and total gain/loss tracking per position
- Portfolio vs S&P 500 performance chart
- Allocation donut chart by current value
- Dividend yield display
- Sortable holdings table
- Dark and light mode
- Holdings persisted locally in the browser
- PIN-protected admin mode to add/remove positions

## Tech Stack

- Next.js 16 (static export)
- React 19
- TypeScript
- Recharts
- GitHub Pages (hosting)
- GitHub Actions (CI/CD)

## Setup

1. Clone the repository

```bash
git clone https://github.com/JeffryArevalo/stock-portfolio-tracker.git
cd stock-portfolio-tracker
npm install
```

2. Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_FINNHUB_API_KEY=your_finnhub_key
NEXT_PUBLIC_TWELVEDATA_KEY=your_twelvedata_key
NEXT_PUBLIC_ADMIN_PIN=your_chosen_pin
```

3. Run the development server:

```bash
npm run dev
```

Open http://localhost:3000/stock-portfolio-tracker

## Deployment

The project deploys automatically to GitHub Pages on every push to `main` via GitHub Actions.

Add these secrets to your repository (Settings > Secrets > Actions):

- `FINNHUB_API_KEY`
- `TWELVEDATA_KEY`
- `ADMIN_PIN`

Then enable GitHub Pages in Settings > Pages > Source: GitHub Actions.

## Admin Mode

To edit holdings on the live site, click the "Portfolio Tracker" title three times quickly. A PIN prompt will appear. Enter the PIN you configured in your environment variables to unlock the trade form and remove buttons.

## Author

Jeffry Arevalo
https://github.com/JeffryArevalo
