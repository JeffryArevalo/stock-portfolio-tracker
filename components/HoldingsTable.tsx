"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { money, moneySigned, pct, pctPlain, pctSigned, shares } from "@/lib/format";
import type { HoldingRow } from "@/lib/usePortfolioData";
import { EmptyState, Skeleton, TickerAvatar } from "./ui";

type SortKey =
  | "symbol" | "price" | "dailyPct" | "shares" | "avgCost"
  | "invested" | "value" | "gain" | "gainPct" | "weight" | "divYieldPct";

const COLS: Array<{ key: SortKey; label: string; align: "left" | "right"; hideMobile?: boolean }> = [
  { key: "symbol", label: "Symbol", align: "left" },
  { key: "price", label: "Price", align: "right" },
  { key: "dailyPct", label: "Day %", align: "right" },
  { key: "shares", label: "Shares", align: "right", hideMobile: true },
  { key: "avgCost", label: "Avg Cost", align: "right", hideMobile: true },
  { key: "invested", label: "Cost Basis", align: "right", hideMobile: true },
  { key: "value", label: "Value", align: "right" },
  { key: "gain", label: "Total Gain", align: "right" },
  { key: "gainPct", label: "Return", align: "right", hideMobile: true },
  { key: "weight", label: "Weight", align: "right", hideMobile: true },
  { key: "divYieldPct", label: "Div Yield", align: "right", hideMobile: true },
];

export function HoldingsTable({ rows, loading }: { rows: HoldingRow[]; loading: boolean }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "value",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const dir = sort.dir === "desc" ? -1 : 1;
    const getNum = (x: number | null) =>
      x != null && Number.isFinite(x) ? x : -Infinity;
    return [...rows].sort((a, b) => {
      if (sort.key === "symbol") return a.symbol.localeCompare(b.symbol) * dir;
      const av = getNum(a[sort.key] as number | null);
      const bv = getNum(b[sort.key] as number | null);
      return av === bv ? a.symbol.localeCompare(b.symbol) : (av - bv) * dir;
    });
  }, [rows, sort]);

  function clickSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "symbol" ? "asc" : "desc" }
    );
  }

  const toneStyle = (n: number) => ({
    color: !Number.isFinite(n) ? "var(--muted)" : n >= 0 ? "var(--good)" : "var(--bad)",
  });

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Holdings</h2>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {rows.length} position{rows.length !== 1 ? "s" : ""} · click a row for details
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ background: "var(--panel2)" }}>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => clickSort(c.key)}
                  className={c.hideMobile ? "hide-mobile" : undefined}
                  style={{
                    padding: "11px 16px",
                    textAlign: c.align,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.7,
                    color: sort.key === c.key ? "var(--accent)" : "var(--muted)",
                    cursor: "pointer",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  {COLS.map((c) => (
                    <td key={c.key} style={{ padding: "14px 16px" }} className={c.hideMobile ? "hide-mobile" : undefined}>
                      <Skeleton height={14} />
                    </td>
                  ))}
                </tr>
              ))
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={COLS.length}>
                  <EmptyState>No positions yet — check back soon.</EmptyState>
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr
                  key={r.symbol}
                  className="row-click"
                  onClick={() => router.push(`/stock/${r.symbol}`)}
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <TickerAvatar symbol={r.symbol} size={32} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{r.symbol}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                          {r.tradeCount} trade{r.tradeCount !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <Td>{money(r.price)}</Td>
                  <Td style={toneStyle(r.dailyPct)}>{pctPlain(r.dailyPct)}</Td>
                  <Td hideMobile>{shares(r.shares)}</Td>
                  <Td hideMobile>{money(r.avgCost)}</Td>
                  <Td hideMobile>{money(r.invested)}</Td>
                  <Td style={{ fontWeight: 700 }}>{money(r.value)}</Td>
                  <Td style={{ ...toneStyle(r.gain), fontWeight: 600 }}>
                    {moneySigned(r.gain)}
                  </Td>
                  <Td hideMobile style={toneStyle(r.gainPct)}>{pctSigned(r.gainPct)}</Td>
                  <Td hideMobile>{pct(r.weight)}</Td>
                  <Td hideMobile>{pctPlain(r.divYieldPct)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Td({
  children,
  style,
  hideMobile,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  hideMobile?: boolean;
}) {
  return (
    <td
      className={hideMobile ? "hide-mobile" : undefined}
      style={{
        padding: "12px 16px",
        textAlign: "right",
        fontSize: 13.5,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
