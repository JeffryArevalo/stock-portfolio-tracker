"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, SectionTitle, Skeleton, TickerAvatar, TradeBadge } from "@/components/ui";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  compact, dateLabel, money, moneySigned, pctPlain, pctSigned, shares, timeAgo,
} from "@/lib/format";
import { deriveHoldings } from "@/lib/portfolio";
import type { Quote, StockDetail, Transaction } from "@/lib/types";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 1825 },
];

export function StockDetailClient({ symbol }: { symbol: string }) {
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [days, setDays] = useState(180);
  const [histResult, setHistResult] = useState<{
    key: string;
    points: Array<{ d: string; c: number }>;
  } | null>(null);

  // profile + metrics + news
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/stock/${symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // live quote, polled
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/quotes?symbols=${symbol}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled) setQuote(d.quotes?.[symbol] ?? null);
      } catch {}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  // trade log
  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTransactions(Array.isArray(d.transactions) ? d.transactions : []);
      })
      .catch(() => {
        if (!cancelled) setTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // price history
  const histKey = `${symbol}|${days}`;
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/history?symbols=${symbol}&days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setHistResult({ key: histKey, points: d?.series?.[symbol] ?? [] });
      })
      .catch(() => {
        if (!cancelled) setHistResult({ key: histKey, points: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, days, histKey]);

  const history = histResult?.key === histKey ? histResult.points : null;

  // this stock's trades, newest first, with running position
  const myTrades = useMemo(() => {
    if (!transactions) return [];
    const mine = transactions
      .filter((t) => t.symbol.toUpperCase() === symbol)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    let running = 0;
    const withRunning = mine.map((t) => {
      running += t.type === "buy" ? t.shares : -t.shares;
      return { ...t, running: Math.max(0, running) };
    });
    return withRunning.reverse();
  }, [transactions, symbol]);

  const position = useMemo(() => {
    if (!transactions) return null;
    return deriveHoldings(transactions).find((h) => h.symbol === symbol) ?? null;
  }, [transactions, symbol]);

  const held = (position?.shares ?? 0) > 1e-9;
  const value = held && quote?.c ? position!.shares * quote.c : NaN;
  const unrealized = held && quote?.c ? value - position!.invested : NaN;
  const unrealizedPct =
    held && position!.invested > 0 ? unrealized / position!.invested : NaN;

  const up = (quote?.d ?? 0) >= 0;
  const m = detail?.metrics;
  const p = detail?.profile;

  const chartUp =
    history && history.length >= 2 ? history[history.length - 1].c >= history[0].c : true;
  const chartColor = chartUp ? "#34d399" : "#f87171";

  const stats: Array<{ label: string; value: string }> = [
    { label: "Market Cap", value: p?.marketCap ? compact(p.marketCap * 1e6) : "–" },
    { label: "P/E (TTM)", value: m?.peTTM != null ? m.peTTM.toFixed(1) : "–" },
    { label: "EPS (TTM)", value: m?.epsTTM != null ? money(m.epsTTM) : "–" },
    { label: "Dividend Yield", value: pctPlain(m?.dividendYield) },
    {
      label: "52-Week Range",
      value: m?.low52 != null && m?.high52 != null ? `${money(m.low52)} – ${money(m.high52)}` : "–",
    },
    {
      label: "Day Range",
      value: quote?.l && quote?.h ? `${money(quote.l)} – ${money(quote.h)}` : "–",
    },
    { label: "Beta", value: m?.beta != null ? m.beta.toFixed(2) : "–" },
    { label: "Net Margin", value: pctPlain(m?.netMargin) },
  ];

  return (
    <main className="container" style={{ padding: "28px 24px 48px" }}>
      <Link href="/" style={{ fontSize: 13, color: "var(--muted)" }}>
        ← Back to portfolio
      </Link>

      {/* Company header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          margin: "16px 0 22px",
          flexWrap: "wrap",
        }}
      >
        {p?.logo ? (
          <img
            src={p.logo}
            alt={`${p.name} logo`}
            width={52}
            height={52}
            style={{ borderRadius: 13, background: "#fff", objectFit: "contain", flexShrink: 0 }}
          />
        ) : (
          <TickerAvatar symbol={symbol} size={52} />
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
            {p?.name ?? symbol}
          </h1>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>
            {symbol}
            {p?.exchange ? ` · ${p.exchange}` : ""}
            {p?.industry ? ` · ${p.industry}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {quote?.c ? <AnimatedNumber value={quote.c} format={money} /> : <Skeleton width={120} height={28} />}
          </div>
          {quote && (
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: up ? "var(--good)" : "var(--bad)",
                marginTop: 3,
              }}
            >
              {moneySigned(quote.d)} ({pctPlain(quote.dp)}) today
            </div>
          )}
        </div>
      </div>

      {/* Price chart */}
      <div className="card" style={{ marginBottom: 24 }}>
        <SectionTitle
          title="Price History"
          right={
            <div style={{ display: "flex", gap: 4 }}>
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
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          }
        />
        <div style={{ height: 280 }}>
          {history === null ? (
            <Skeleton height={280} />
          ) : history.length === 0 ? (
            <EmptyState>Price history unavailable for {symbol}.</EmptyState>
          ) : (
            <ResponsiveContainer>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="gradPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="d" hide />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v?: number | string) => [money(Number(v)), symbol]}
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
                <Area
                  type="monotone"
                  dataKey="c"
                  stroke={chartColor}
                  strokeWidth={2.5}
                  fill="url(#gradPrice)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Key stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <div key={s.label} className="card" style={{ padding: "14px 16px" }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 6,
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="charts-row" style={{ alignItems: "start" }}>
        {/* My activity for this stock */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>My Activity</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--muted)" }}>
              {held
                ? `Currently holding ${shares(position!.shares)} shares`
                : "No open position"}
            </p>
          </div>

          {/* Position summary */}
          {held && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 1,
                background: "var(--border)",
              }}
            >
              {[
                { label: "Shares", v: shares(position!.shares) },
                { label: "Avg Cost", v: money(position!.avgCost) },
                { label: "Market Value", v: money(value) },
                {
                  label: "Unrealized P/L",
                  v: `${moneySigned(unrealized)} (${pctSigned(unrealizedPct)})`,
                  tone: unrealized >= 0 ? "var(--good)" : "var(--bad)",
                },
              ].map((x) => (
                <div key={x.label} style={{ background: "var(--panel)", padding: "12px 22px" }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>
                    {x.label}
                  </div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 3, color: x.tone ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                    {x.v}
                  </div>
                </div>
              ))}
            </div>
          )}
          {position && position.realizedPnL !== 0 && (
            <div style={{ padding: "10px 22px", borderTop: "1px solid var(--border)", fontSize: 13, color: "var(--muted)" }}>
              Realized P/L from sells:{" "}
              <strong style={{ color: position.realizedPnL >= 0 ? "var(--good)" : "var(--bad)" }}>
                {moneySigned(position.realizedPnL)}
              </strong>
            </div>
          )}

          {/* Trade timeline */}
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {transactions === null ? (
              <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} height={40} />
                ))}
              </div>
            ) : myTrades.length === 0 ? (
              <EmptyState>I haven&apos;t traded {symbol} yet.</EmptyState>
            ) : (
              myTrades.map((t, i) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 22px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <TradeBadge type={t.type} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {shares(t.shares)} sh @ {money(t.price)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      {dateLabel(t.date)}
                      {t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {money(t.shares * t.price)}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                      position: {shares(t.running)} sh
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* News */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent News</h2>
          </div>
          {detail === null ? (
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} height={48} />
              ))}
            </div>
          ) : detail.news.length === 0 ? (
            <EmptyState>No recent news for {symbol}.</EmptyState>
          ) : (
            detail.news.map((n, i) => (
              <a
                key={n.id ?? i}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="row-click"
                style={{
                  display: "block",
                  padding: "13px 22px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45 }}>
                  {n.headline}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  {n.source} · {timeAgo(n.datetime)}
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
