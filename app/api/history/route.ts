import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const ALLOWED_DAYS = new Set([30, 90, 180, 365, 730, 1825, 3650]);
const DAYS_TO_RANGE: Record<number, string> = {
  30: "1mo",
  90: "3mo",
  180: "6mo",
  365: "1y",
  730: "2y",
  1825: "5y",
  3650: "10y",
};

type Point = { d: string; c: number };

/**
 * Daily close history via Yahoo Finance's public chart API (keyless).
 * One request per symbol server-side; the whole response is CDN-cached
 * for 6 hours so upstream load stays negligible regardless of traffic.
 * Returns { series: { SYM: [{ d: "YYYY-MM-DD", c }, ...] } } chronologically.
 */
async function fetchYahoo(symbol: string, range: string): Promise<Point[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=1d`;
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    },
    next: { revalidate: 21600 },
  });
  if (!r.ok) return [];
  const data = await r.json();
  const res = data?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const closes: Array<number | null> = res?.indicators?.quote?.[0]?.close ?? [];
  const points: Point[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c)) {
      points.push({ d: new Date(ts[i] * 1000).toISOString().slice(0, 10), c });
    }
  }
  return points;
}

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s))
    .slice(0, 30)
    .sort(); // stable order → stable cache key

  const days = Number(req.nextUrl.searchParams.get("days") || 180);
  if (symbols.length === 0 || !ALLOWED_DAYS.has(days)) {
    return NextResponse.json({ error: "Invalid symbols or days" }, { status: 400 });
  }

  try {
    const series: Record<string, Point[]> = {};
    const results = await Promise.all(
      symbols.map(async (sym) => ({
        sym,
        points: await fetchYahoo(sym, DAYS_TO_RANGE[days]).catch(() => [] as Point[]),
      }))
    );
    for (const { sym, points } of results) {
      if (points.length > 0) series[sym] = points;
    }

    return NextResponse.json(
      { series },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
    );
  } catch {
    return NextResponse.json({ error: "History fetch failed" }, { status: 502 });
  }
}
