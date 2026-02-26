import { NextResponse } from "next/server";

type FinnhubQuote = {
  c: number;  // current
  d: number;  // change
  dp: number; // percent change
  h: number;
  l: number;
  o: number;
  pc: number; // prev close
  t: number;  // timestamp
};

const CACHE_TTL_MS = 25_000;
const cache = new Map<string, { ts: number; quote: FinnhubQuote }>();

function parseSymbols(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbols = parseSymbols(url.searchParams.get("symbols"));

  if (symbols.length === 0) {
    return NextResponse.json({ error: "Provide ?symbols=AMZN,MSFT" }, { status: 400 });
  }

  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return NextResponse.json({ error: "Missing FINNHUB_API_KEY in .env.local" }, { status: 500 });
  }

  const now = Date.now();

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const cached = cache.get(symbol);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        return { symbol, quote: cached.quote, cached: true };
      }

      const endpoint = new URL("https://finnhub.io/api/v1/quote");
      endpoint.searchParams.set("symbol", symbol);
      endpoint.searchParams.set("token", token);

      const res = await fetch(endpoint.toString(), { cache: "no-store" });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { symbol, error: `Finnhub error ${res.status}: ${text || res.statusText}` };
      }

      const quote = (await res.json()) as FinnhubQuote;
      cache.set(symbol, { ts: now, quote });
      return { symbol, quote, cached: false };
    })
  );

  return NextResponse.json({ results, ts: new Date().toISOString() });
}
