import { NextRequest, NextResponse } from "next/server";
import type { StockDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

const FINNHUB = "https://finnhub.io/api/v1";
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Company profile + key metrics + recent news for the stock detail page.
 * Three Finnhub calls, CDN-cached for 1 hour.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Market data not configured" }, { status: 503 });
  }

  const symbol = (await params).symbol.toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const newsFrom = new Date(Date.now() - 30 * 86400_000).toISOString().split("T")[0];
  const newsTo = new Date().toISOString().split("T")[0];
  const opts = { next: { revalidate: 3600 } };

  try {
    const [profileR, metricR, newsR] = await Promise.all([
      fetch(`${FINNHUB}/stock/profile2?symbol=${symbol}&token=${key}`, opts),
      fetch(`${FINNHUB}/stock/metric?symbol=${symbol}&metric=all&token=${key}`, opts),
      fetch(`${FINNHUB}/company-news?symbol=${symbol}&from=${newsFrom}&to=${newsTo}&token=${key}`, opts),
    ]);
    const [profile, metric, news] = await Promise.all([
      profileR.json(),
      metricR.json(),
      newsR.json(),
    ]);

    const m = metric?.metric ?? {};
    const detail: StockDetail = {
      profile: profile?.name
        ? {
            name: profile.name,
            logo: profile.logo || "",
            industry: profile.finnhubIndustry || "",
            exchange: profile.exchange || "",
            ipo: profile.ipo || "",
            marketCap: num(profile.marketCapitalization) ?? 0,
            sharesOutstanding: num(profile.shareOutstanding) ?? 0,
            weburl: profile.weburl || "",
            country: profile.country || "",
            currency: profile.currency || "USD",
          }
        : null,
      metrics: {
        peTTM: num(m.peTTM ?? m.peBasicExclExtraTTM),
        epsTTM: num(m.epsTTM ?? m.epsBasicExclExtraItemsTTM),
        high52: num(m["52WeekHigh"]),
        low52: num(m["52WeekLow"]),
        beta: num(m.beta),
        dividendYield: num(m.currentDividendYieldTTM ?? m.dividendYieldIndicatedAnnual),
        payoutRatio: num(m.payoutRatioTTM),
        revenueGrowthTTM: num(m.revenueGrowthTTMYoy),
        netMargin: num(m.netProfitMarginTTM),
      },
      news: Array.isArray(news)
        ? news.slice(0, 8).map((n) => ({
            id: n.id,
            datetime: n.datetime,
            headline: n.headline,
            source: n.source,
            summary: n.summary,
            url: n.url,
            image: n.image,
          }))
        : [],
    };

    return NextResponse.json(detail, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  } catch {
    return NextResponse.json({ error: "Stock data fetch failed" }, { status: 502 });
  }
}
