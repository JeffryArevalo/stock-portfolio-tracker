"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Transaction } from "@/lib/types";
import { BENCHMARK_SYMBOL } from "@/lib/config";
import { compact, dateLabel, money } from "@/lib/format";
import { SectionTitle } from "./ui";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
  { label: "5Y", days: 1825 },
  { label: "Max", days: 99999 }, // since the first trade
];

type Point = { d: string; c: number };
type SeriesMap = Record<string, Point[]>;

/** Last close on or before the given date; NaN if none yet. */
function closeOnOrBefore(points: Point[], date: string): number {
  let lo = 0,
    hi = points.length - 1,
    ans = NaN;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].d <= date) {
      ans = points[mid].c;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * "What if every dollar had bought the S&P 500 instead?"
 *
 * The blue line is the actual portfolio: shares held on each date (replayed
 * from the trade log) × that day's closing prices. The orange line replays
 * the exact same trades into VOO — each buy converts its dollar amount into
 * VOO shares at that date's close, each sell removes the same dollar amount.
 * Dividends are not counted on either side.
 */
export function PerformanceChart({ transactions }: { transactions: Transaction[] }) {
  const [days, setDays] = useState(180);
  const [rangeResult, setRangeResult] = useState<{ key: string; series: SeriesMap | null } | null>(null);
  const [benchFull, setBenchFull] = useState<Point[] | null>(null);

  const txSorted = useMemo(
    () =>
      [...transactions].sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
      ),
    [transactions]
  );

  const symbols = useMemo(
    () =>
      Array.from(
        new Set([...txSorted.map((t) => t.symbol.toUpperCase()), BENCHMARK_SYMBOL])
      )
        .sort()
        .join(","),
    [txSorted]
  );

  const key = `${symbols}|${days}`;

  // closes for all traded symbols over the display range
  useEffect(() => {
    if (!txSorted.length) return;
    let cancelled = false;
    fetch(`/api/history?symbols=${symbols}&days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setRangeResult({ key, series: d.series ?? {} });
      })
      .catch(() => {
        if (!cancelled) setRangeResult({ key, series: null });
      });
    return () => {
      cancelled = true;
    };
  }, [symbols, days, key, txSorted.length]);

  // full benchmark history (10y) — needed to price trades made before the range
  useEffect(() => {
    if (!txSorted.length) return;
    let cancelled = false;
    // 10y daily — Yahoo's "max" range degrades to monthly bars, which would
    // misprice trades made on volatile days; daily covers all trades back to 2016
    fetch(`/api/history?symbols=${BENCHMARK_SYMBOL}&days=3650`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setBenchFull(d.series?.[BENCHMARK_SYMBOL] ?? []);
      })
      .catch(() => {
        if (!cancelled) setBenchFull([]);
      });
    return () => {
      cancelled = true;
    };
  }, [txSorted.length]);

  const current = rangeResult?.key === key ? rangeResult.series : null;
  const loading = txSorted.length > 0 && (!current || benchFull === null);
  const failed =
    rangeResult?.key === key &&
    (rangeResult.series === null || (benchFull !== null && benchFull.length === 0));

  const data = useMemo(() => {
    if (!current || !benchFull || !benchFull.length || !txSorted.length) return [];
    // start the timeline at the first trade — no flat zero before it
    const firstTradeDate = txSorted[0].date;
    const benchRange = (current[BENCHMARK_SYMBOL] ?? []).filter(
      (p) => p.d >= firstTradeDate
    );
    if (!benchRange.length) return [];

    // cumulative VOO shares of the shadow portfolio after each trade
    const shadowSteps: Array<{ date: string; shares: number }> = [];
    let shadowShares = 0;
    for (const t of txSorted) {
      const vooClose = closeOnOrBefore(benchFull, t.date);
      if (Number.isFinite(vooClose) && vooClose > 0) {
        const dollars = t.shares * t.price;
        shadowShares += (t.type === "buy" ? 1 : -1) * (dollars / vooClose);
        shadowShares = Math.max(0, shadowShares);
      }
      shadowSteps.push({ date: t.date, shares: shadowShares });
    }

    // per-symbol cumulative share counts after each trade
    const holdingsSteps = new Map<string, Array<{ date: string; shares: number }>>();
    const running = new Map<string, number>();
    for (const t of txSorted) {
      const sym = t.symbol.toUpperCase();
      const prev = running.get(sym) ?? 0;
      const next =
        t.type === "buy" ? prev + t.shares : Math.max(0, prev - t.shares);
      running.set(sym, next);
      if (!holdingsSteps.has(sym)) holdingsSteps.set(sym, []);
      holdingsSteps.get(sym)!.push({ date: t.date, shares: next });
    }

    const sharesAt = (steps: Array<{ date: string; shares: number }>, date: string) => {
      let lo = 0,
        hi = steps.length - 1,
        ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (steps[mid].date <= date) {
          ans = steps[mid].shares;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    };

    const raw = benchRange.map((bp) => {
      let portfolio = 0;
      for (const [sym, steps] of holdingsSteps) {
        const sh = sharesAt(steps, bp.d);
        if (sh <= 0) continue;
        const points = current[sym];
        if (!points) continue;
        const c = closeOnOrBefore(points, bp.d);
        if (Number.isFinite(c)) portfolio += sh * c;
      }
      const bench = sharesAt(shadowSteps, bp.d) * bp.c;
      return { date: bp.d, portfolio, bench };
    });

    // Deposit-adjusted % return: gain relative to (starting value + money
    // added since). Counting deposits as gains would massively inflate the
    // Max view, where the portfolio was built up over years of buying.
    const t0 = raw[0].date;
    const startPort = raw[0].portfolio;
    const startBench = raw[0].bench;
    let flowIdx = 0;
    while (flowIdx < txSorted.length && txSorted[flowIdx].date <= t0) flowIdx++;
    let netFlows = 0;

    return raw.map((p) => {
      while (flowIdx < txSorted.length && txSorted[flowIdx].date <= p.date) {
        const t = txSorted[flowIdx];
        netFlows += (t.type === "buy" ? 1 : -1) * t.shares * t.price;
        flowIdx++;
      }
      const portBase = startPort + netFlows;
      const benchBase = startBench + netFlows;
      return {
        date: p.date,
        "My Portfolio": p.portfolio,
        "S&P 500 (same investments)": p.bench,
        pPct: portBase > 0 ? ((p.portfolio - portBase) / portBase) * 100 : NaN,
        bPct: benchBase > 0 ? ((p.bench - benchBase) / benchBase) * 100 : NaN,
      };
    });
  }, [current, benchFull, txSorted]);

  const last = data.length ? data[data.length - 1] : null;
  const ahead = last
    ? last["My Portfolio"] - last["S&P 500 (same investments)"]
    : 0;

  const fmtPct = (p: number) =>
    Number.isFinite(p) ? `${p >= 0 ? "+" : ""}${p.toFixed(2)}%` : "–";

  return (
    <div className="card">
      <SectionTitle
        title="Portfolio vs S&P 500"
        sub="Actual value vs putting the same money into VOO on the same dates (dividends excluded)"
        right={
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: `1px solid ${days === r.days ? "var(--accent)" : "var(--border)"}`,
                  background: days === r.days ? "var(--accent-soft)" : "transparent",
                  color: days === r.days ? "var(--accent)" : "var(--muted)",
                  fontSize: 12,
                  fontWeight: days === r.days ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 120ms",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />
      <div style={{ height: 286, position: "relative" }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            <span style={{ animation: "spin 0.9s linear infinite", display: "inline-block" }}>
              &#8635;
            </span>
            Updating
          </div>
        )}
        {data.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--muted)",
              fontSize: 14,
              textAlign: "center",
              padding: "0 24px",
            }}
          >
            {loading
              ? "Loading chart…"
              : failed
              ? "Historical data temporarily unavailable."
              : "No trades yet."}
          </div>
        ) : (
          <ResponsiveContainer>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBench" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" hide />
              <YAxis
                tickFormatter={(v) => compact(Number(v))}
                domain={["auto", "auto"]}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip
                formatter={(
                  v?: number | string,
                  name?: string | number,
                  item?: { payload?: { pPct?: number; bPct?: number } }
                ) => {
                  const n = Number(v);
                  const p =
                    name === "My Portfolio"
                      ? item?.payload?.pPct
                      : item?.payload?.bPct;
                  return `${money(n)}  (${fmtPct(p ?? NaN)})`;
                }}
                labelFormatter={(d) => dateLabel(String(d))}
                contentStyle={{
                  background: "var(--tooltip-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 13,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                }}
                labelStyle={{ color: "var(--muted)", marginBottom: 4 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Area
                type="monotone"
                dataKey="My Portfolio"
                stroke="#818cf8"
                strokeWidth={2.5}
                fill="url(#gradPortfolio)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="S&P 500 (same investments)"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#gradBench)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {last &&
        (() => {
          const portPct = last.pPct;
          const benchPct = last.bPct;
          const diff = portPct - benchPct;
          const out = diff >= 0;
          if (!Number.isFinite(diff)) return null;
          return (
            <>
              <div
                style={{
                  marginTop: 14,
                  padding: "13px 18px",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  background: out ? "var(--good-soft)" : "var(--bad-soft)",
                  border: `1px solid ${out ? "var(--good)" : "var(--bad)"}55`,
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>
                  {out ? "▲" : "▼"}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: out ? "var(--good)" : "var(--bad)",
                    }}
                  >
                    {out ? "Outperforming" : "Underperforming"} the S&P 500 by{" "}
                    {Math.abs(diff).toFixed(2)}%
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    My Portfolio {fmtPct(portPct)} vs S&P 500 {fmtPct(benchPct)} —
                    return on money invested this period
                  </div>
                </div>
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
                Value today: {money(last["My Portfolio"])} vs{" "}
                {money(last["S&P 500 (same investments)"])} —{" "}
                <strong style={{ color: ahead >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {ahead >= 0 ? "ahead" : "behind"} by {money(Math.abs(ahead))}
                </strong>{" "}
                on price alone.
              </p>
            </>
          );
        })()}
    </div>
  );
}
