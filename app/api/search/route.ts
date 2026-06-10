import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Symbol lookup for the admin trade form. Cached for a day per query.
 */
export async function GET(req: NextRequest) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Market data not configured" }, { status: 503 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 30);
  if (q.length < 1) {
    return NextResponse.json({ result: [] });
  }

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&exchange=US&token=${key}`,
      { next: { revalidate: 86400 } }
    );
    const data = await r.json();
    const result = Array.isArray(data?.result)
      ? data.result.slice(0, 8).map((x: { symbol: string; description: string; type: string }) => ({
          symbol: x.symbol,
          description: x.description,
          type: x.type,
        }))
      : [];
    return NextResponse.json(
      { result },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } }
    );
  } catch {
    return NextResponse.json({ result: [] });
  }
}
