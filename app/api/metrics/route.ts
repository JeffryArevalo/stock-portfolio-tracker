// app/api/metrics/route.ts
import { NextResponse } from "next/server";

type MetricResponse = {
  metric?: Record<string, unknown>;
};

function asFiniteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function GET(req: Request) {
  try {
    // 1) Read symbols from query string: /api/metrics?symbols=MSFT,JPM
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get("symbols") || "";
    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (!symbols.length) {
      return NextResponse.json({ results: [] });
    }

    // 2) Read your Finnhub key from .env
    const key = process.env.FINNHUB_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Missing FINNHUB_API_KEY" },
        { status: 500 }
      );
    }

    // 3) For each symbol, call Finnhub stock/metric and pick dividend yield
    // NOTE: Finnhub returns yields in "percent" for these fields (ex: 0.9467 means 0.9467%)
    const results = await Promise.allSettled(
      symbols.map(async (sym) => {
        const r = await fetch(
          `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(
            sym
          )}&metric=all&token=${key}`,
          { cache: "no-store" }
        );

        if (!r.ok) {
          return { symbol: sym, dividendYieldPct: null as number | null };
        }

        const data = (await r.json()) as MetricResponse;
        const m = (data?.metric ?? {}) as Record<string, unknown>;

        // 4) Finnhub can store yield in different keys depending on the asset
        // We try the most common ones first.
        const candidates: Array<{ key: string; value: unknown }> = [
          { key: "dividendYieldIndicatedAnnual", value: m.dividendYieldIndicatedAnnual },
          { key: "currentDividendYieldTTM", value: (m as any).currentDividendYieldTTM },
          { key: "dividendYieldAnnual", value: (m as any).dividendYieldAnnual },
          { key: "dividendYieldTTM", value: (m as any).dividendYieldTTM },
          { key: "dividendYield", value: (m as any).dividendYield },
        ];

        // 5) Pick the first valid (>0) number we can find
        let dividendYieldPct: number | null = null;

        for (const c of candidates) {
          const n = asFiniteNumber(c.value);
          if (n !== null && n > 0) {
            dividendYieldPct = n;
            break;
          }
        }

        // IMPORTANT:
        // If Finnhub returns 0 for a symbol like JPM, that is Finnhub data/plan behavior.
        // In that case, we return null (so your UI can show "-" instead of "0.00%").
        if (dividendYieldPct === 0) dividendYieldPct = null;

        return { symbol: sym, dividendYieldPct };
      })
    );

    // 6) Convert Promise.allSettled into a clean results array
    const clean = results.map((r, i) => {
      const sym = symbols[i];

      if (r.status === "fulfilled") return r.value;
      return { symbol: sym, dividendYieldPct: null as number | null };
    });

    return NextResponse.json({ results: clean });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "metrics error" },
      { status: 500 }
    );
  }
}