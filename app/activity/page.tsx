"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, KpiCard, Skeleton, TickerAvatar, TradeBadge } from "@/components/ui";
import { dateLabel, money, monthLabel, shares } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { usePortfolioData } from "@/lib/usePortfolioData";

type TypeFilter = "all" | "buy" | "sell";

export default function ActivityPage() {
  const { loading, transactions } = usePortfolioData();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [symbolFilter, setSymbolFilter] = useState<string>("all");

  const symbols = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.symbol.toUpperCase()))).sort(),
    [transactions]
  );

  const filtered = useMemo(
    () =>
      [...transactions]
        .filter((t) => typeFilter === "all" || t.type === typeFilter)
        .filter((t) => symbolFilter === "all" || t.symbol.toUpperCase() === symbolFilter)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [transactions, typeFilter, symbolFilter]
  );

  // group by YYYY-MM
  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of filtered) {
      const key = t.date.slice(0, 7);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const stats = useMemo(() => {
    const buys = transactions.filter((t) => t.type === "buy");
    const sells = transactions.filter((t) => t.type === "sell");
    return {
      total: transactions.length,
      invested: buys.reduce((s, t) => s + t.shares * t.price, 0),
      proceeds: sells.reduce((s, t) => s + t.shares * t.price, 0),
    };
  }, [transactions]);

  return (
    <main className="container" style={{ padding: "28px 24px 48px" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Activity</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
          Every buy and sell in this portfolio, newest first.
        </p>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))", marginBottom: 24 }}>
        <KpiCard title="Total Trades" value={stats.total} format={(n) => `${Math.round(n)}`} />
        <KpiCard title="Total Invested" value={stats.invested} format={money} sub="Sum of all buys" />
        <KpiCard title="Total Proceeds" value={stats.proceeds} format={money} sub="Sum of all sells" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "buy", "sell"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: `1px solid ${typeFilter === t ? "var(--accent)" : "var(--border)"}`,
                background: typeFilter === t ? "var(--accent-soft)" : "transparent",
                color: typeFilter === t ? "var(--accent)" : "var(--muted)",
                fontSize: 13,
                fontWeight: typeFilter === t ? 700 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t === "all" ? "All" : `${t}s`}
            </button>
          ))}
        </div>
        <select
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          className="field"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13 }}
        >
          <option value="all">All symbols</option>
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} height={52} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState>
            No activity yet — trades will appear here as soon as they happen.
          </EmptyState>
        </div>
      ) : (
        groups.map(([month, txs]) => (
          <section key={month} style={{ marginBottom: 22 }}>
            <h3
              style={{
                margin: "0 0 10px",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              {monthLabel(`${month}-01`)}
            </h3>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {txs.map((t, i) => (
                <Link
                  key={t.id}
                  href={`/stock/${t.symbol.toUpperCase()}`}
                  className="row-click"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 18px",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <TickerAvatar symbol={t.symbol.toUpperCase()} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14.5 }}>
                        {t.symbol.toUpperCase()}
                      </span>
                      <TradeBadge type={t.type} />
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                      {dateLabel(t.date)}
                      {t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, fontVariantNumeric: "tabular-nums" }}>
                      {money(t.shares * t.price)}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                      {shares(t.shares)} sh @ {money(t.price)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
