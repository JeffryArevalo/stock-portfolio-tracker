import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const ALLOWED_DAYS = new Set([30, 90, 180, 365, 730, 1825]);

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400_000).toISOString().split("T")[0];
}

/**
 * Daily close history via TwelveData (free tier: 8 credits/min, 800/day).
 * One batched request for all symbols; CDN-cached for 6 hours, so the
 * whole site costs a handful of credits per day regardless of traffic.
 * Returns { series: { SYM: [{ d: "YYYY-MM-DD", c: number }, ...] } } in
 * chronological order.
 */
export async function GET(req: NextRequest) {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "History data not configured" }, { status: 503 });
  }

  const symbols = (req.nextUrl.searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s))
    .slice(0, 20)
    .sort(); // stable order → stable cache key

  const days = Number(req.nextUrl.searchParams.get("days") || 180);
  if (symbols.length === 0 || !ALLOWED_DAYS.has(days)) {
    return NextResponse.json({ error: "Invalid symbols or days" }, { status: 400 });
  }

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=${symbols.join(",")}` +
    `&interval=1day&start_date=${isoDaysAgo(days)}` +
    `&outputsize=5000&apikey=${key}`;

  try {
    const r = await fetch(url, { next: { revalidate: 21600 } });
    const data = await r.json();

    const series: Record<string, Array<{ d: string; c: number }>> = {};
    for (const sym of symbols) {
      // single-symbol responses are unwrapped; multi-symbol keyed by symbol
      const s = symbols.length === 1 ? data : data[sym];
      if (!s || !Array.isArray(s.values)) continue;
      const points: Array<{ d: string; c: number }> = [];
      for (let i = s.values.length - 1; i >= 0; i--) {
        const close = Number(s.values[i].close);
        if (Number.isFinite(close)) points.push({ d: s.values[i].datetime, c: close });
      }
      series[sym] = points;
    }

    return NextResponse.json(
      { series },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
    );
  } catch {
    return NextResponse.json({ error: "History fetch failed" }, { status: 502 });
  }
}
