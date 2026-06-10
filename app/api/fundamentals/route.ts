import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FINNHUB = "https://finnhub.io/api/v1";
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * Slow-moving per-symbol fundamentals (dividend yield) used by the
 * holdings table and KPI cards. Cached for 6 hours.
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

  const dividendYield: Record<string, number | null> = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const r = await fetch(
          `${FINNHUB}/stock/metric?symbol=${sym}&metric=all&token=${key}`,
          { next: { revalidate: 21600 } }
        );
        const data = await r.json();
        const raw =
          data.metric?.currentDividendYieldTTM ??
          data.metric?.dividendYieldIndicatedAnnual ??
          null;
        dividendYield[sym] =
          typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      } catch {
        dividendYield[sym] = null;
      }
    })
  );

  return NextResponse.json(
    { dividendYield },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
  );
}
