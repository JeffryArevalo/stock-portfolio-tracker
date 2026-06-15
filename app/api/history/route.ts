import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
// days=1 is the intraday view (5-min bars for the latest session).
const ALLOWED_DAYS = new Set([1, 30, 90, 180, 365, 730, 1825, 3650, 99999]);
const DAYS_TO_RANGE: Record<number, string> = {
  1: "1d",
  30: "1mo",
  90: "3mo",
  180: "6mo",
  365: "1y",
  730: "2y",
  1825: "5y",
  3650: "10y",
  99999: "max",
};

type Point = { d: string; c: number };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/**
 * Price history via Yahoo Finance's public chart API (keyless).
 * Daily closes for ranges of 1 month and up; for the 1-day view it returns
 * intraday 5-minute bars, prepended with the previous close so the series
 * starts at yesterday's close (a true one-day move). Point dates are
 * "YYYY-MM-DD" for daily and full ISO timestamps for intraday.
 */
async function fetchYahoo(symbol: string, range: string): Promise<Point[]> {
  const intraday = range === "1d";
  const interval = intraday ? "5m" : "1d";
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${interval}`;
  const r = await fetch(url, {
    headers: { "User-Agent": UA },
    next: { revalidate: intraday ? 60 : 21600 },
  });
  if (!r.ok) return [];
  const data = await r.json();
  const res = data?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const closes: Array<number | null> = res?.indicators?.quote?.[0]?.close ?? [];

  const points: Point[] = [];
  let firstTs = 0;
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c)) {
      if (!firstTs) firstTs = ts[i];
      const iso = new Date(ts[i] * 1000).toISOString();
      points.push({ d: intraday ? iso : iso.slice(0, 10), c });
    }
  }

  // anchor the intraday line at the previous close
  const prevClose = res?.meta?.chartPreviousClose;
  if (intraday && points.length && typeof prevClose === "number" && Number.isFinite(prevClose)) {
    points.unshift({ d: new Date((firstTs - 300) * 1000).toISOString(), c: prevClose });
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

  const maxAge = days === 1 ? 60 : 21600;

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
      { headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}` } }
    );
  } catch {
    return NextResponse.json({ error: "History fetch failed" }, { status: 502 });
  }
}
