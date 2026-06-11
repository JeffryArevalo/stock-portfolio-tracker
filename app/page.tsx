"use client";

import { AllocationDonut } from "@/components/AllocationDonut";
import { HoldingsTable } from "@/components/HoldingsTable";
import { PerformanceChart } from "@/components/PerformanceChart";
import { KpiCard } from "@/components/ui";
import { money, moneySigned, pctSigned } from "@/lib/format";
import { usePortfolioData } from "@/lib/usePortfolioData";

export default function PortfolioPage() {
  const { loading, transactions, rows, totals, realizedPnL, lastUpdated, error } =
    usePortfolioData();

  return (
    <main className="container" style={{ padding: "28px 24px 48px" }}>
      {error && (
        <div
          style={{
            marginBottom: 20,
            padding: "13px 18px",
            borderRadius: 12,
            border: "1px solid var(--bad)",
            background: "var(--bad-soft)",
            color: "var(--bad)",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Portfolio</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Live view of my holdings — prices auto-refresh every minute.
          </p>
        </div>
        {lastUpdated && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* KPI cards */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KpiCard title="Current Value" value={totals.value} format={money} />
        <KpiCard
          title="Day Change"
          value={totals.daily}
          format={moneySigned}
          tone={totals.daily >= 0 ? "good" : "bad"}
          sub={pctSigned(
            totals.value - totals.daily > 0
              ? totals.daily / (totals.value - totals.daily)
              : NaN
          )}
        />
        <KpiCard
          title="Total Return"
          value={totals.gain}
          format={moneySigned}
          tone={totals.gain >= 0 ? "good" : "bad"}
          sub={pctSigned(totals.gainPct)}
        />
        <KpiCard
          title="Realized P/L"
          value={realizedPnL}
          format={moneySigned}
          tone={realizedPnL >= 0 ? "good" : "bad"}
          sub="From completed sells"
        />
        <KpiCard
          title="Expected Annual Dividend Income"
          value={totals.estAnnualDividends}
          format={money}
          sub={`≈ ${money(totals.estAnnualDividends / 12)}/month at current yields`}
        />
      </div>

      {/* Charts */}
      <div className="charts-row" style={{ marginBottom: 24 }}>
        <PerformanceChart transactions={transactions} />
        <AllocationDonut rows={rows} />
      </div>

      {/* Holdings */}
      <HoldingsTable rows={rows} loading={loading} />

      <footer
        style={{
          marginTop: 28,
          textAlign: "center",
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.7,
        }}
      >
        This is a personal portfolio shared for transparency — not investment advice.
        <br />
        Market data by Finnhub &amp; Twelve Data. Quotes may be delayed.
      </footer>
    </main>
  );
}
