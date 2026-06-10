import { NextRequest, NextResponse } from "next/server";
import type { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

const FINNHUB = "https://finnhub.io/api/v1";
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * Live quote proxy. The Finnhub key stays server-side and the response is
 * CDN-cached for 30s, so all visitors share one upstream call per symbol.
 */
export async function GET(req: NextRequest) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Market data not configured" }, { status: 503 });
  }

  const symbols = (req.nextUrl.searchParams.get("symbols") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s))
    .slice(0, 30);

  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols" }, { status: 400 });
  }

  const quotes: Record<string, Quote | null> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const r = await fetch(`${FINNHUB}/quote?symbol=${sym}&token=${key}`, {
          next: { revalidate: 30 },
        });
        const q = await r.json();
        quotes[sym] = q && Number.isFinite(q.c) && q.c > 0 ? q : null;
      } catch {
        quotes[sym] = null;
      }
    })
  );

  return NextResponse.json(
    { quotes, t: Date.now() },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } }
  );
}
