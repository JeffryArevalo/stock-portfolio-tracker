"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Holding } from "@/lib/types";
import { BENCHMARK_SYMBOL } from "@/lib/config";
import { SectionTitle } from "./ui";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
  { label: "5Y", days: 1825 },
];

type SeriesMap = Record<string, Array<{ d: string; c: number }>>;

/** % return of the current holdings mix vs the S&P 500 over the range. */
export function PerformanceChart({ holdings }: { holdings: Holding[] }) {
  const [days, setDays] = useState(180);
  const [result, setResult] = useState<{
    key: string;
    series: SeriesMap | null; // null = fetch failed
  } | null>(null);

  const symbols = useMemo(
    () =>
      Array.from(new Set([...holdings.map((h) => h.symbol), BENCHMARK_SYMBOL]))
        .sort()
        .join(","),
    [holdings]
  );

  const key = `${symbols}|${days}`;

  useEffect(() => {
    if (!holdings.length) return;
    let cancelled = false;
    fetch(`/api/history?symbols=${symbols}&days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setResult({ key, series: d.series ?? {} });
      })
      .catch(() => {
        if (!cancelled) setResult({ key, series: null });
      });
    return () => {
      cancelled = true;
    };
  }, [symbols, days, key, holdings.length]);

  // show the previous chart while the next range loads
  const series = result?.series ?? null;
  const loading = holdings.length > 0 && result?.key !== key;
  const failed = result?.key === key && result.series === null;

  const data = useMemo(() => {
    if (!series || !holdings.length) return [];
    const bench = series[BENCHMARK_SYMBOL] ?? [];
    if (!bench.length) return [];

    // index closes by date per symbol, carry last known close forward
    const closes = new Map<string, Map<string, number>>();
    for (const [sym, points] of Object.entries(series)) {
      closes.set(sym, new Map(points.map((p) => [p.d, p.c])));
    }
    const lastClose = new Map<string, number>();

    const raw = bench.map((bp) => {
      let value = 0;
      for (const h of holdings) {
        const c = closes.get(h.symbol)?.get(bp.d);
        if (Number.isFinite(c)) lastClose.set(h.symbol, c as number);
        const use = lastClose.get(h.symbol);
        if (Number.isFinite(use)) value += h.shares * (use as number);
      }
      return { date: bp.d, value, bench: bp.c };
    });

    const firstValue = raw.find((p) => p.value > 0)?.value ?? 0;
    const firstBench = raw.find((p) => p.bench > 0)?.bench ?? 0;
    return raw.map((p) => ({
      date: p.date,
      Portfolio: firstValue > 0 ? (p.value / firstValue - 1) * 100 : NaN,
      "S&P 500": firstBench > 0 ? (p.bench / firstBench - 1) * 100 : NaN,
    }));
  }, [series, holdings]);

  return (
    <div className="card">
      <SectionTitle
        title="Performance"
        sub={`% return of current holdings vs S&P 500 (${BENCHMARK_SYMBOL})`}
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
              : "No holdings yet."}
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
                tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                domain={["auto", "auto"]}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={0} stroke="var(--muted)" strokeWidth={1} strokeDasharray="5 5" />
              <Tooltip
                formatter={(v?: number | string) => `${Number(v).toFixed(2)}%`}
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
                dataKey="Portfolio"
                stroke="#818cf8"
                strokeWidth={2.5}
                fill="url(#gradPortfolio)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="S&P 500"
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
    </div>
  );
}
