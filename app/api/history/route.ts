import { NextResponse } from "next/server";

function parseSymbols(raw: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30);
}

// Stooq uses tickers like:
// AAPL.US, MSFT.US, AMZN.US
function toStooqSymbol(sym: string) {
  return `${sym.toLowerCase()}.us`;
}

function toUnixDay(dateStr: string) {
  // dateStr "YYYY-MM-DD"
  const d = new Date(dateStr + "T00:00:00Z");
  return Math.floor(d.getTime() / 1000);
}

async function fetchStooqDaily(sym: string) {
  const stooq = toStooqSymbol(sym);
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=d`;

  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Stooq ${sym} error ${res.status}: ${text}`);
  }

  // CSV header: Date,Open,High,Low,Close,Volume
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { s: "no_data", t: [], c: [] };

  const t: number[] = [];
  const c: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    const date = parts[0];
    const close = Number(parts[4]);

    if (!date || !Number.isFinite(close)) continue;

    t.push(toUnixDay(date));
    c.push(close);
  }

  return { s: t.length ? "ok" : "no_data", t, c };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbols = parseSymbols(url.searchParams.get("symbols"));
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    const benchmark = (url.searchParams.get("benchmark") || "VOO").toUpperCase();

    if (!symbols.length) {
      return NextResponse.json({ error: "Provide ?symbols=AMZN,MSFT" }, { status: 400 });
    }
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return NextResponse.json({ error: "Provide unix seconds ?from=...&to=..." }, { status: 400 });
    }

    const unique = Array.from(new Set([...symbols, benchmark]));

    const series = await Promise.all(
      unique.map(async (sym) => {
        const candles = await fetchStooqDaily(sym);

        // Filter to requested window
        if (candles.s === "ok") {
          const ft: number[] = [];
          const fc: number[] = [];
          for (let i = 0; i < candles.t.length; i++) {
            const ts = candles.t[i];
            if (ts >= from && ts <= to) {
              ft.push(ts);
              fc.push(candles.c[i]);
            }
          }
          return { sym, candles: { s: ft.length ? "ok" : "no_data", t: ft, c: fc } };
        }

        return { sym, candles };
      })
    );

    return NextResponse.json({
      from,
      to,
      benchmark,
      series,
      ts: new Date().toISOString(),
      source: "stooq",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
