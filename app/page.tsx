"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/** -----------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */
type Holding = {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
};

type Quote = {
  c: number;  // current price
  d: number;  // daily change $
  dp: number; // daily change %
  t: number;  // unix timestamp
};

/** -----------------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------------- */
const DEFAULT_SYMBOLS = ["AMZN", "COST", "GOOGL", "META", "MSFT", "SCHD", "VOO"];
const LS_KEY = "stock_portfolio_holdings_v1";
const FINNHUB = "https://finnhub.io/api/v1";
const API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN;
const TWELVEDATA_KEY = process.env.NEXT_PUBLIC_TWELVEDATA_KEY;

const PIE_COLORS = [
  "#22d3ee",
  "#818cf8",
  "#34d399",
  "#f59e0b",
  "#f87171",
  "#a78bfa",
  "#2dd4bf",
];

/** -----------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */
function money(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function pct(n: number) {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

function pctPlain(n: number) {
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)}%`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** -----------------------------------------------------------------------
 * AnimatedNumber — smooth count-up on value change
 * ---------------------------------------------------------------------- */
function AnimatedNumber({
  value,
  format,
  durationMs = 700,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState<number>(
    Number.isFinite(value) ? value : 0
  );
  const prevRef = useRef<number>(Number.isFinite(value) ? value : 0);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const start = prevRef.current;
    const end = value;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + (end - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <>{format(display)}</>;
}

/** -----------------------------------------------------------------------
 * Main page component
 * ---------------------------------------------------------------------- */
export default function Page() {
  /* ---- Core state ---- */
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [divYields, setDivYields] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /* ---- Chart / refresh state ---- */
  const [refreshEverySec, setRefreshEverySec] = useState(30);
  const [rangeDays, setRangeDays] = useState(180);
  const [perfData, setPerfData] = useState<any[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "desc" | "asc" }>({
    key: "value",
    dir: "desc",
  });

  /* ---- Theme ---- */
  const [darkMode, setDarkMode] = useState(true);

  /* ---- Admin / PIN state ---- */
  const [isAdmin, setIsAdmin] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const titleClickCount = useRef(0);
  const titleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Trade form state ---- */
  const [tradeSymbol, setTradeSymbol] = useState("");
  const [tradeShares, setTradeShares] = useState<number | "">("");
  const [tradeAvgCost, setTradeAvgCost] = useState<number | "">("");
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  /* ================================================================
   * Effects
   * ============================================================= */

  // Restore theme
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) setDarkMode(saved === "dark");
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // Restore admin session (cleared when tab closes)
  useEffect(() => {
    setIsAdmin(sessionStorage.getItem("admin") === "true");
  }, []);

  // Load holdings from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      setHoldings(raw ? JSON.parse(raw) : []);
    } catch {
      setHoldings([]);
    }
  }, []);

  // Persist holdings
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(holdings));
  }, [holdings]);

  /* ================================================================
   * Computed
   * ============================================================= */
  const symbolsToTrack = useMemo(() => {
    const fromHoldings = holdings.map((h) => h.symbol.toUpperCase());
    return Array.from(new Set([...DEFAULT_SYMBOLS, ...fromHoldings])).sort();
  }, [holdings]);

  /* ================================================================
   * Admin PIN mechanism
   * ============================================================= */
  function handleTitleClick() {
    titleClickCount.current += 1;
    if (titleClickTimer.current) clearTimeout(titleClickTimer.current);
    titleClickTimer.current = setTimeout(() => {
      titleClickCount.current = 0;
    }, 2000);
    if (titleClickCount.current >= 3) {
      titleClickCount.current = 0;
      if (titleClickTimer.current) clearTimeout(titleClickTimer.current);
      if (!ADMIN_PIN) return; // admin disabled when pin not configured
      setShowPinModal(true);
      setPinInput("");
      setPinError("");
    }
  }

  function submitPin() {
    if (pinInput === ADMIN_PIN) {
      setIsAdmin(true);
      sessionStorage.setItem("admin", "true");
      setShowPinModal(false);
      setPinError("");
    } else {
      setPinError("Incorrect PIN. Try again.");
    }
  }

  function exitAdmin() {
    setIsAdmin(false);
    sessionStorage.removeItem("admin");
  }

  /* ================================================================
   * Data fetching — live market quotes
   * ============================================================= */
  async function fetchQuotes() {
    if (!API_KEY) return;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        symbolsToTrack.map(async (sym) => {
          const r = await fetch(
            `${FINNHUB}/quote?symbol=${sym}&token=${API_KEY}`
          );
          const quote = await r.json();
          return { symbol: sym, quote };
        })
      );
      const next: Record<string, Quote | null> = {};
      for (const { symbol, quote } of results) {
        next[symbol] = quote && Number.isFinite(quote.c) && quote.c > 0 ? (quote as Quote) : null;
      }
      setQuotes(next);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message || "Network error fetching quotes");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDividendYields() {
    if (!API_KEY) return;
    try {
      const results = await Promise.all(
        symbolsToTrack.map(async (sym) => {
          const r = await fetch(
            `${FINNHUB}/stock/metric?symbol=${sym}&metric=all&token=${API_KEY}`
          );
          const data = await r.json();
          const raw =
            data.metric?.currentDividendYieldTTM ??
            data.metric?.dividendYieldIndicatedAnnual ??
            null;
          return {
            symbol: sym,
            dividendYieldPct:
              typeof raw === "number" && Number.isFinite(raw) ? raw : null,
          };
        })
      );
      const next: Record<string, number | null> = {};
      for (const { symbol, dividendYieldPct } of results) {
        next[symbol] = dividendYieldPct;
      }
      setDivYields(next);
    } catch {
      // silent fail — dividend yields are supplementary
    }
  }

  // Auto-refresh quotes on interval
  useEffect(() => {
    fetchQuotes();
    fetchDividendYields();
    const id = setInterval(fetchQuotes, Math.max(10, refreshEverySec) * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshEverySec, symbolsToTrack.join(",")]);

  // Refresh dividend yields every 5 minutes (they change slowly)
  useEffect(() => {
    const id = setInterval(fetchDividendYields, 5 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsToTrack.join(",")]);

  /* ================================================================
   * Historical performance chart
   * ============================================================= */
  function toDateLabel(unixSec: number) {
    const d = new Date(unixSec * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function isoDate(unixSec: number) {
    return new Date(unixSec * 1000).toISOString().split("T")[0];
  }

  async function fetchTwelveDataHistory(
    unique: string[],
    from: number,
    to: number
  ): Promise<Map<string, Map<number, number>>> {
    const bySym = new Map<string, Map<number, number>>();
    if (!TWELVEDATA_KEY) return bySym;

    const url =
      `https://api.twelvedata.com/time_series` +
      `?symbol=${unique.join(",")}` +
      `&interval=1day` +
      `&start_date=${isoDate(from)}` +
      `&end_date=${isoDate(to)}` +
      `&outputsize=5000` +
      `&apikey=${TWELVEDATA_KEY}`;

    const r = await fetch(url);
    const data = await r.json();

    for (const sym of unique) {
      // Single-symbol response is unwrapped; multi-symbol is keyed by symbol
      const series = unique.length === 1 ? data : data[sym];
      if (!series || !Array.isArray(series.values) || series.values.length === 0)
        continue;

      const map = new Map<number, number>();
      // values come newest-first — iterate in reverse for chronological order
      for (let i = series.values.length - 1; i >= 0; i--) {
        const v = series.values[i];
        const ts = Math.floor(
          new Date(v.datetime + "T00:00:00Z").getTime() / 1000
        );
        const close = Number(v.close);
        if (Number.isFinite(close)) map.set(ts, close);
      }
      bySym.set(sym, map);
    }

    return bySym;
  }

  useEffect(() => {
    const run = async () => {
      if (!holdings.length || !TWELVEDATA_KEY) {
        setPerfData([]);
        return;
      }
      setPerfLoading(true);
      try {
        const syms = Array.from(
          new Set(holdings.map((h) => h.symbol.toUpperCase()))
        );
        const to = Math.floor(Date.now() / 1000);
        const from = to - rangeDays * 24 * 60 * 60;
        const unique = [...new Set([...syms, "VOO"])];

        const bySym = await fetchTwelveDataHistory(unique, from, to);

        const benchMap = bySym.get("VOO") || new Map<number, number>();
        const dates = Array.from(benchMap.keys()).sort((a, b) => a - b);
        const lastClose = new Map<string, number>();

        const rawPoints = dates.map((t) => {
          let portfolioValue = 0;
          for (const h of holdings) {
            const sym = h.symbol.toUpperCase();
            const m = bySym.get(sym) || new Map<number, number>();
            const c = m.get(t);
            if (typeof c === "number" && Number.isFinite(c))
              lastClose.set(sym, c);
            const useClose = lastClose.get(sym);
            if (typeof useClose === "number" && Number.isFinite(useClose)) {
              portfolioValue += h.shares * useClose;
            }
          }
          const benchClose = benchMap.get(t);
          return {
            t,
            date: toDateLabel(t),
            portfolio: portfolioValue,
            bench: Number.isFinite(benchClose) ? (benchClose as number) : NaN,
          };
        });

        const firstPortfolio =
          rawPoints.find((p) => Number.isFinite(p.portfolio))?.portfolio ?? 0;
        const firstBench =
          rawPoints.find((p) => Number.isFinite(p.bench))?.bench ?? 0;

        setPerfData(
          rawPoints.map((p) => ({
            date: p.date,
            Portfolio:
              firstPortfolio > 0
                ? (p.portfolio / firstPortfolio - 1) * 100
                : NaN,
            "S&P 500 (VOO)":
              firstBench > 0 ? (p.bench / firstBench - 1) * 100 : NaN,
          }))
        );
      } catch {
        setPerfData([]);
      } finally {
        setPerfLoading(false);
      }
    };
    run();
  }, [holdings, rangeDays]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ================================================================
   * Derived table rows
   * ============================================================= */
  const rows = useMemo(() => {
    const base = holdings.map((h) => {
      const sym = h.symbol.toUpperCase();
      const q = quotes[sym] ?? null;
      const price = q?.c ?? NaN;
      const invest = h.shares * h.avgCost;
      const value = q?.c ? h.shares * q.c : NaN;
      const gain = value - invest;
      const gainPct = invest > 0 ? gain / invest : NaN;
      const daily = q?.d ? h.shares * q.d : NaN;
      const dailyPct = q?.dp ?? NaN;
      const divYieldPct = divYields[sym] ?? null;
      return { ...h, sym, q, price, invest, value, gain, gainPct, daily, dailyPct, divYieldPct };
    });

    const getNum = (x: any) => (Number.isFinite(x) ? x : -Infinity);
    base.sort((a: any, b: any) => {
      const dir = sort.dir === "desc" ? -1 : 1;
      if (sort.key === "sym") return a.sym.localeCompare(b.sym) * dir;
      const av = getNum(a[sort.key]);
      const bv = getNum(b[sort.key]);
      return av === bv ? a.sym.localeCompare(b.sym) : (av - bv) * dir;
    });
    return base;
  }, [holdings, quotes, divYields, sort]);

  const allocationData = useMemo(
    () =>
      rows
        .filter((r: any) => Number.isFinite(r.value) && r.value > 0)
        .map((r: any) => ({ name: r.sym, value: r.value })),
    [rows]
  );

  const totals = useMemo(() => {
    const totalInvest = rows.reduce(
      (s: number, r: any) => s + (Number.isFinite(r.invest) ? r.invest : 0),
      0
    );
    const totalValue = rows.reduce(
      (s: number, r: any) => s + (Number.isFinite(r.value) ? r.value : 0),
      0
    );
    const totalDaily = rows.reduce(
      (s: number, r: any) => s + (Number.isFinite(r.daily) ? r.daily : 0),
      0
    );
    const totalGain = totalValue - totalInvest;
    const totalGainPct = totalInvest > 0 ? totalGain / totalInvest : 0;
    return { totalInvest, totalValue, totalDaily, totalGain, totalGainPct };
  }, [rows]);

  /* ================================================================
   * Trade actions
   * ============================================================= */
  function buyTrade() {
    setError(null);
    const s = tradeSymbol.trim().toUpperCase();
    if (!s || tradeShares === "" || tradeAvgCost === "") return;
    const qty = Number(tradeShares);
    const price = Number(tradeAvgCost);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) return;
    const existing = holdings.find((h) => h.symbol.toUpperCase() === s);
    if (existing) {
      const newShares = existing.shares + qty;
      const newAvg =
        newShares > 0
          ? (existing.shares * existing.avgCost + qty * price) / newShares
          : existing.avgCost;
      setHoldings((prev) =>
        prev.map((h) =>
          h.id === existing.id ? { ...h, shares: newShares, avgCost: newAvg } : h
        )
      );
    } else {
      setHoldings((prev) => [
        ...prev,
        { id: uid(), symbol: s, shares: qty, avgCost: price },
      ]);
    }
    setTradeSymbol("");
    setTradeShares("");
    setTradeAvgCost("");
  }

  function sellTrade() {
    setError(null);
    const s = tradeSymbol.trim().toUpperCase();
    if (!s || tradeShares === "") return;
    const qty = Number(tradeShares);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const existing = holdings.find((h) => h.symbol.toUpperCase() === s);
    if (!existing) {
      setError(`Cannot sell: ${s} is not in holdings.`);
      return;
    }
    if (qty > existing.shares) {
      setError(`Cannot sell: you only have ${existing.shares} shares of ${s}.`);
      return;
    }
    const newShares = existing.shares - qty;
    if (newShares <= 0) {
      setHoldings((prev) => prev.filter((h) => h.id !== existing.id));
    } else {
      setHoldings((prev) =>
        prev.map((h) => (h.id === existing.id ? { ...h, shares: newShares } : h))
      );
    }
    setTradeSymbol("");
    setTradeShares("");
    setTradeAvgCost("");
  }

  function removeHolding(id: string) {
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  }

  /* ================================================================
   * Theme CSS variables (applied to root wrapper via inline style)
   * ============================================================= */
  const D = darkMode;
  const themeVars: Record<string, string> = D
    ? {
        "--bg": "#050d1a",
        "--surface": "#0d1829",
        "--panel": "rgba(13,24,41,0.85)",
        "--panel2": "rgba(255,255,255,0.04)",
        "--border": "rgba(148,163,184,0.12)",
        "--text": "#f1f5f9",
        "--muted": "#64748b",
        "--accent": "#22d3ee",
        "--good": "#34d399",
        "--bad": "#f87171",
      }
    : {
        "--bg": "#f0f4f8",
        "--surface": "#ffffff",
        "--panel": "rgba(255,255,255,0.92)",
        "--panel2": "rgba(15,23,42,0.04)",
        "--border": "rgba(15,23,42,0.10)",
        "--text": "#0f172a",
        "--muted": "#64748b",
        "--accent": "#0891b2",
        "--good": "#059669",
        "--bad": "#dc2626",
      };

  const CARD = cardStyle(D);
  const rangeLabels = ["1M", "3M", "6M", "1Y", "2Y", "5Y"];
  const rangeDayOptions = [30, 90, 180, 365, 730, 1825];

  /* ================================================================
   * Render
   * ============================================================= */
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        ...(themeVars as any),
      }}
    >
      {/* ---- PIN Modal ---- */}
      {showPinModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.8)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              background: D ? "#0d1829" : "#ffffff",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: "32px 36px",
              width: 340,
              boxShadow: "0 32px 64px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ marginBottom: 6, fontSize: 13, color: "var(--accent)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Admin Access
            </div>
            <h3 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700 }}>
              Enter PIN
            </h3>
            <p style={{ margin: "0 0 22px", fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
              Enter your admin PIN to enable portfolio editing.
            </p>
            <input
              type="password"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && submitPin()}
              placeholder="PIN"
              autoFocus
              style={{
                width: "100%",
                padding: "11px 14px",
                borderRadius: 10,
                border: `1px solid ${pinError ? "var(--bad)" : "var(--border)"}`,
                background: D ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)",
                color: "var(--text)",
                fontSize: 16,
                letterSpacing: 4,
              }}
            />
            {pinError && (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--bad)" }}>
                {pinError}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                onClick={submitPin}
                style={{
                  flex: 1,
                  padding: "11px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--accent)",
                  color: "#000",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Unlock
              </button>
              <button
                onClick={() => setShowPinModal(false)}
                style={{
                  flex: 1,
                  padding: "11px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--muted)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Sticky Header ---- */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: D ? "rgba(5,13,26,0.94)" : "rgba(240,244,248,0.94)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            height: 62,
          }}
        >
          {/* Logo + title — click 3x to open admin PIN */}
          <div
            onClick={handleTitleClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flex: 1,
              cursor: "default",
              userSelect: "none",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: "linear-gradient(135deg, #22d3ee 0%, #818cf8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 900,
                color: "#000",
                flexShrink: 0,
                boxShadow: "0 0 16px rgba(34,211,238,0.35)",
              }}
            >
              P
            </div>
            <span
              style={{
                fontSize: 17,
                fontWeight: 700,
                background: D
                  ? "linear-gradient(90deg, #f1f5f9 30%, #22d3ee 100%)"
                  : undefined,
                WebkitBackgroundClip: D ? "text" : undefined,
                WebkitTextFillColor: D ? "transparent" : undefined,
                color: D ? undefined : "#0f172a",
              }}
            >
              Portfolio Tracker
            </span>
          </div>

          {/* Right side controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Live / loading indicator */}
            {loading ? (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                Updating...
              </span>
            ) : lastUpdated ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#34d399",
                    display: "inline-block",
                    animation: "pulse-dot 2s ease infinite",
                  }}
                />
                {lastUpdated.toLocaleTimeString()}
              </div>
            ) : null}

            {/* Admin indicator */}
            {isAdmin && (
              <button
                onClick={exitAdmin}
                title="Exit admin mode"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(251,191,36,0.4)",
                  background: "rgba(251,191,36,0.1)",
                  color: "#fbbf24",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                &#128275; Admin
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={() => {
                fetchQuotes();
                fetchDividendYields();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 15px",
                borderRadius: 9,
                border: "1px solid var(--border)",
                background: D
                  ? "rgba(34,211,238,0.08)"
                  : "rgba(8,145,178,0.07)",
                color: "var(--accent)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  animation: loading ? "spin 0.9s linear infinite" : "none",
                }}
              >
                &#8635;
              </span>
              Refresh
            </button>

            {/* Theme toggle */}
            <button
              onClick={() => setDarkMode((v) => !v)}
              style={{
                padding: "7px 12px",
                borderRadius: 9,
                border: "1px solid var(--border)",
                background: "var(--panel2)",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 15,
                lineHeight: 1,
              }}
              title={D ? "Switch to light mode" : "Switch to dark mode"}
            >
              {D ? "☀" : "☾"}
            </button>
          </div>
        </div>
      </header>

      {/* ---- Main content ---- */}
      <main style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 24px 48px" }}>

        {/* API key banner */}
        {!API_KEY && (
          <div
            style={{
              marginBottom: 20,
              padding: "14px 18px",
              borderRadius: 12,
              border: "1px solid rgba(251,191,36,0.35)",
              background: "rgba(251,191,36,0.07)",
              color: "#fbbf24",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <strong>Setup required:</strong> Market data API key is not configured. Add your key to{" "}
            <code
              style={{
                fontSize: 12,
                background: "rgba(0,0,0,0.25)",
                padding: "2px 6px",
                borderRadius: 5,
              }}
            >
              .env.local
            </code>{" "}
            to enable live prices.
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div
            style={{
              marginBottom: 20,
              padding: "13px 18px",
              borderRadius: 12,
              border: "1px solid rgba(248,113,113,0.35)",
              background: "rgba(248,113,113,0.07)",
              color: "var(--bad)",
              fontSize: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* ---- KPI Grid ---- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <KpiCard title="Invested" value={totals.totalInvest} format={money} dark={D} />
          <KpiCard title="Current Value" value={totals.totalValue} format={money} dark={D} />
          <KpiCard
            title="Day Change"
            value={totals.totalDaily}
            format={money}
            tone={totals.totalDaily >= 0 ? "good" : "bad"}
            dark={D}
          />
          <KpiCard
            title="Total Gain"
            value={totals.totalGain}
            format={money}
            tone={totals.totalGain >= 0 ? "good" : "bad"}
            dark={D}
          />
          <KpiCard
            title="Return"
            value={totals.totalGainPct}
            format={pct}
            tone={totals.totalGainPct >= 0 ? "good" : "bad"}
            dark={D}
          />
        </div>

        {/* ---- Charts Row ---- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 400px",
            gap: 14,
            marginBottom: 24,
          }}
        >
          {/* Performance chart */}
          <div style={CARD}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 16,
                gap: 12,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                  Performance
                </h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  % Return vs S&P 500 (VOO)
                </p>
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {rangeDayOptions.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setRangeDays(d)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 7,
                      border: `1px solid ${
                        rangeDays === d ? "var(--accent)" : "var(--border)"
                      }`,
                      background:
                        rangeDays === d
                          ? D
                            ? "rgba(34,211,238,0.14)"
                            : "rgba(8,145,178,0.10)"
                          : "transparent",
                      color: rangeDays === d ? "var(--accent)" : "var(--muted)",
                      fontSize: 12,
                      fontWeight: rangeDays === d ? 700 : 400,
                      cursor: "pointer",
                      transition: "all 120ms",
                    }}
                  >
                    {rangeLabels[i]}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 286, position: "relative" }}>
              {/* Loading spinner overlay — chart stays visible underneath */}
              {perfLoading && (
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: D ? "rgba(13,24,41,0.85)" : "rgba(255,255,255,0.85)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "4px 10px",
                    fontSize: 12,
                    color: "var(--muted)",
                  }}
                >
                  <span style={{ animation: "spin 0.9s linear infinite", display: "inline-block" }}>&#8635;</span>
                  Updating
                </div>
              )}
              {perfData.length === 0 ? (
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
                  {perfLoading
                    ? "Loading chart…"
                    : !TWELVEDATA_KEY
                    ? "Performance chart API key not configured. Add NEXT_PUBLIC_TWELVEDATA_KEY to .env.local"
                    : "Add holdings to see performance history"}
                </div>
              ) : (
                <ResponsiveContainer>
                  <AreaChart data={perfData}>
                    <defs>
                      <linearGradient
                        id="gradPortfolio"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#818cf8"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="95%"
                          stopColor="#818cf8"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="gradBench"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#f59e0b"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="95%"
                          stopColor="#f59e0b"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={
                        D ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)"
                      }
                    />
                    <XAxis dataKey="date" hide />
                    <YAxis
                      tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                      domain={["auto", "auto"]}
                      tick={{
                        fill: "var(--muted)" as any,
                        fontSize: 11,
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine
                      y={0}
                      stroke={D ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)"}
                      strokeWidth={1}
                      strokeDasharray="5 5"
                    />
                    <Tooltip
                      formatter={(v: any) => `${Number(v).toFixed(2)}%`}
                      contentStyle={{
                        background: D ? "#0d1829" : "#fff",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        fontSize: 13,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                      }}
                      labelStyle={{ color: "var(--muted)" as any, marginBottom: 4 }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
                    />
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
                      dataKey="S&P 500 (VOO)"
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

          {/* Allocation donut */}
          <div style={CARD}>
            <h2 style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700 }}>
              Allocation
            </h2>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)" }}>
              By current value
            </p>
            <div style={{ height: 316 }}>
              {allocationData.length === 0 ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--muted)",
                    fontSize: 14,
                  }}
                >
                  No holdings
                </div>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={allocationData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="44%"
                      innerRadius={62}
                      outerRadius={104}
                      paddingAngle={2}
                    >
                      {allocationData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: any) => money(Number(v))}
                      contentStyle={{
                        background: D ? "#0d1829" : "#fff",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        fontSize: 13,
                      }}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      align="center"
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ---- Holdings Table ---- */}
        <div
          style={{
            ...CARD,
            padding: 0,
            overflow: "hidden",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              padding: "16px 22px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                Holdings
              </h2>
            </div>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {rows.length} position{rows.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr
                  style={{
                    background: D
                      ? "rgba(255,255,255,0.025)"
                      : "rgba(15,23,42,0.025)",
                  }}
                >
                  <SortableTh
                    label="Ticker"
                    sortKey="sym"
                    sort={sort}
                    setSort={setSort}
                    left
                  />
                  <SortableTh label="Shares" sortKey="shares" sort={sort} setSort={setSort} />
                  <SortableTh label="Avg Cost" sortKey="avgCost" sort={sort} setSort={setSort} />
                  <SortableTh label="Price" sortKey="price" sort={sort} setSort={setSort} />
                  <SortableTh label="Day $" sortKey="daily" sort={sort} setSort={setSort} />
                  <SortableTh label="Day %" sortKey="dailyPct" sort={sort} setSort={setSort} />
                  <SortableTh label="Div Yield" sortKey="divYieldPct" sort={sort} setSort={setSort} />
                  <SortableTh label="Invested" sortKey="invest" sort={sort} setSort={setSort} />
                  <SortableTh label="Value" sortKey="value" sort={sort} setSort={setSort} />
                  <SortableTh label="Gain" sortKey="gain" sort={sort} setSort={setSort} />
                  <SortableTh label="Gain %" sortKey="gainPct" sort={sort} setSort={setSort} />
                  {isAdmin && <th style={TH_STYLE} />}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 12 : 11}
                      style={{
                        padding: "36px 24px",
                        textAlign: "center",
                        color: "var(--muted)",
                        fontSize: 14,
                      }}
                    >
                      No holdings yet.{" "}
                      {isAdmin
                        ? "Use the trade form below to add positions."
                        : ""}
                    </td>
                  </tr>
                ) : (
                  rows.map((r: any, idx: number) => {
                    const tone: "good" | "bad" | "neutral" = Number.isFinite(r.gain)
                      ? r.gain >= 0
                        ? "good"
                        : "bad"
                      : "neutral";

                    return (
                      <tr
                        key={r.id}
                        style={{
                          background:
                            idx % 2 === 0
                              ? D
                                ? "rgba(255,255,255,0.018)"
                                : "rgba(15,23,42,0.018)"
                              : "transparent",
                          transition: "background 100ms ease",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background =
                            D
                              ? "rgba(34,211,238,0.06)"
                              : "rgba(8,145,178,0.05)";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLTableRowElement).style.background =
                            idx % 2 === 0
                              ? D
                                ? "rgba(255,255,255,0.018)"
                                : "rgba(15,23,42,0.018)"
                              : "transparent";
                        }}
                      >
                        <td
                          style={{
                            ...TD_STYLE,
                            fontWeight: 700,
                            letterSpacing: 0.6,
                            color: "var(--accent)",
                            paddingLeft: 22,
                          }}
                        >
                          {r.sym}
                        </td>
                        <td style={TDN}>{r.shares}</td>
                        <td style={TDN}>{money(r.avgCost)}</td>
                        <td style={{ ...TDN, fontWeight: 600 }}>
                          {r.q?.c ? money(r.q.c) : "-"}
                        </td>
                        <td style={TDN}>
                          <Pill
                            kind={
                              Number.isFinite(r.daily)
                                ? r.daily >= 0
                                  ? "good"
                                  : "bad"
                                : "neutral"
                            }
                          >
                            {Number.isFinite(r.daily) ? money(r.daily) : "-"}
                          </Pill>
                        </td>
                        <td style={TDN}>
                          <Pill
                            kind={
                              Number.isFinite(r.q?.dp)
                                ? r.q.dp >= 0
                                  ? "good"
                                  : "bad"
                                : "neutral"
                            }
                          >
                            {Number.isFinite(r.q?.dp)
                              ? `${r.q.dp >= 0 ? "+" : ""}${r.q.dp.toFixed(2)}%`
                              : "-"}
                          </Pill>
                        </td>
                        <td style={TDN}>
                          {typeof r.divYieldPct === "number"
                            ? pctPlain(r.divYieldPct)
                            : "-"}
                        </td>
                        <td style={TDN}>{money(r.invest)}</td>
                        <td style={{ ...TDN, fontWeight: 600 }}>
                          {Number.isFinite(r.value) ? money(r.value) : "-"}
                        </td>
                        <td style={TDN}>
                          <Pill kind={tone}>
                            {Number.isFinite(r.gain) ? money(r.gain) : "-"}
                          </Pill>
                        </td>
                        <td style={TDN}>
                          <Pill kind={tone}>
                            {Number.isFinite(r.gainPct) ? pct(r.gainPct) : "-"}
                          </Pill>
                        </td>
                        {isAdmin && (
                          <td style={{ ...TDN, paddingRight: 18 }}>
                            <button
                              onClick={() => removeHolding(r.id)}
                              style={{
                                padding: "5px 11px",
                                borderRadius: 7,
                                border: "1px solid rgba(248,113,113,0.35)",
                                background: "rgba(248,113,113,0.08)",
                                color: "var(--bad)",
                                cursor: "pointer",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---- Trade Form (admin only) ---- */}
        {isAdmin && (
          <div style={{ ...CARD, marginBottom: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 18,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                  Trade
                </h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  Add or remove positions
                </p>
              </div>
              {/* Buy / Sell tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 3,
                  background: D
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(15,23,42,0.06)",
                  padding: 3,
                  borderRadius: 10,
                }}
              >
                {(["buy", "sell"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTradeMode(mode)}
                    style={{
                      padding: "6px 18px",
                      borderRadius: 8,
                      border: "none",
                      background:
                        tradeMode === mode
                          ? mode === "buy"
                            ? "rgba(52,211,153,0.18)"
                            : "rgba(248,113,113,0.18)"
                          : "transparent",
                      color:
                        tradeMode === mode
                          ? mode === "buy"
                            ? "var(--good)"
                            : "var(--bad)"
                          : "var(--muted)",
                      fontWeight: tradeMode === mode ? 700 : 400,
                      cursor: "pointer",
                      fontSize: 13,
                      transition: "all 140ms",
                      textTransform: "capitalize",
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "flex-end",
              }}
            >
              <FieldInput label="Ticker">
                <input
                  value={tradeSymbol}
                  onChange={(e) => setTradeSymbol(e.target.value)}
                  placeholder="AMZN"
                  style={INP_STYLE}
                />
              </FieldInput>
              <FieldInput label="Shares">
                <input
                  type="number"
                  value={tradeShares}
                  placeholder="0"
                  onChange={(e) =>
                    setTradeShares(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  min={0}
                  step={1}
                  style={INP_STYLE}
                />
              </FieldInput>
              {tradeMode === "buy" && (
                <FieldInput label="Avg Cost ($)">
                  <input
                    type="number"
                    value={tradeAvgCost}
                    placeholder="0.00"
                    onChange={(e) =>
                      setTradeAvgCost(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    min={0}
                    step={0.01}
                    style={INP_STYLE}
                  />
                </FieldInput>
              )}
              <button
                onClick={tradeMode === "buy" ? buyTrade : sellTrade}
                style={{
                  padding: "10px 26px",
                  borderRadius: 10,
                  border: `1px solid ${
                    tradeMode === "buy"
                      ? "rgba(52,211,153,0.4)"
                      : "rgba(248,113,113,0.4)"
                  }`,
                  background:
                    tradeMode === "buy"
                      ? "rgba(52,211,153,0.14)"
                      : "rgba(248,113,113,0.14)",
                  color: tradeMode === "buy" ? "var(--good)" : "var(--bad)",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                  alignSelf: "flex-end",
                }}
              >
                {tradeMode === "buy" ? "Buy" : "Sell"}
              </button>
            </div>
          </div>
        )}

        {/* ---- Footer ---- */}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 12,
            color: "var(--muted)",
            paddingTop: 20,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div>
            Holdings stored locally in your browser
          </div>
          <label
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            Auto-refresh:
            <select
              value={refreshEverySec}
              onChange={(e) => setRefreshEverySec(Number(e.target.value))}
              style={{
                padding: "4px 8px",
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--panel2)",
                color: "var(--text)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1 min</option>
              <option value={120}>2 min</option>
              <option value={300}>5 min</option>
            </select>
          </label>
        </div>
      </main>
    </div>
  );
}

/** -----------------------------------------------------------------------
 * KPI Card
 * ---------------------------------------------------------------------- */
function KpiCard({
  title,
  value,
  format,
  tone,
  dark,
}: {
  title: string;
  value: number;
  format: (n: number) => string;
  tone?: "good" | "bad";
  dark: boolean;
}) {
  const color =
    tone === "good"
      ? "var(--good)"
      : tone === "bad"
      ? "var(--bad)"
      : "var(--text)";

  const accentLine =
    tone === "good"
      ? "#34d399"
      : tone === "bad"
      ? "#f87171"
      : "#22d3ee";

  return (
    <div
      style={{
        borderRadius: 14,
        padding: "18px 18px 16px",
        background: dark ? "rgba(13,24,41,0.85)" : "rgba(255,255,255,0.92)",
        border: "1px solid var(--border)",
        borderTop: `2px solid ${accentLine}`,
        boxShadow: dark
          ? "0 4px 20px rgba(0,0,0,0.4)"
          : "0 4px 16px rgba(15,23,42,0.07)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        {tone === "good" && (
          <span style={{ fontSize: 11, color }}>&#9650;</span>
        )}
        {tone === "bad" && (
          <span style={{ fontSize: 11, color }}>&#9660;</span>
        )}
        <span
          style={{
            fontSize: 21,
            fontWeight: 800,
            color,
            letterSpacing: -0.5,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Number.isFinite(value) ? (
            <AnimatedNumber value={value} format={format} />
          ) : (
            "-"
          )}
        </span>
      </div>
    </div>
  );
}

/** -----------------------------------------------------------------------
 * Pill badge (gain/loss colored tag)
 * ---------------------------------------------------------------------- */
function Pill({
  kind,
  children,
}: {
  kind: "good" | "bad" | "neutral";
  children: React.ReactNode;
}) {
  const map: Record<string, React.CSSProperties> = {
    good: {
      background: "rgba(52,211,153,0.12)",
      border: "1px solid rgba(52,211,153,0.28)",
      color: "var(--good)",
    },
    bad: {
      background: "rgba(248,113,113,0.12)",
      border: "1px solid rgba(248,113,113,0.28)",
      color: "var(--bad)",
    },
    neutral: {
      background: "rgba(148,163,184,0.08)",
      border: "1px solid rgba(148,163,184,0.18)",
      color: "var(--muted)",
    },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "4px 10px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
        minWidth: 76,
        whiteSpace: "nowrap",
        ...map[kind],
      }}
    >
      {children}
    </span>
  );
}

/** -----------------------------------------------------------------------
 * FieldInput — label + input wrapper
 * ---------------------------------------------------------------------- */
function FieldInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          color: "var(--muted)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

/** -----------------------------------------------------------------------
 * SortableTh — clickable table header with sort indicator
 * ---------------------------------------------------------------------- */
function SortableTh({
  label,
  sortKey,
  sort,
  setSort,
  left,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: "desc" | "asc" };
  setSort: React.Dispatch<
    React.SetStateAction<{ key: string; dir: "desc" | "asc" }>
  >;
  left?: boolean;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === "desc" ? "▼" : "▲") : "";
  return (
    <th
      style={{
        ...TH_STYLE,
        ...(left ? { textAlign: "left", paddingLeft: 22 } : {}),
      }}
    >
      <button
        onClick={() =>
          setSort((prev) =>
            prev.key === sortKey
              ? { key: sortKey, dir: prev.dir === "desc" ? "asc" : "desc" }
              : { key: sortKey, dir: "desc" }
          )
        }
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: left ? "flex-start" : "center",
          gap: 5,
          width: "100%",
          userSelect: "none",
        }}
        title={`Sort by ${label}`}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: 0.7,
            color: active ? "var(--accent)" : "var(--muted)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {arrow && (
          <span style={{ fontSize: 9, color: "var(--accent)" }}>{arrow}</span>
        )}
      </button>
    </th>
  );
}

/** -----------------------------------------------------------------------
 * Shared style helpers
 * ---------------------------------------------------------------------- */
function cardStyle(dark: boolean): React.CSSProperties {
  return {
    background: dark ? "rgba(13,24,41,0.85)" : "rgba(255,255,255,0.92)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 22,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow: dark
      ? "0 4px 24px rgba(0,0,0,0.4)"
      : "0 4px 16px rgba(15,23,42,0.07)",
  };
}

const TH_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "center",
  borderBottom: "1px solid var(--border)",
};

const TD_STYLE: React.CSSProperties = {
  padding: "13px 12px",
  borderBottom: "1px solid var(--border)",
  fontSize: 14,
  color: "var(--text)",
  verticalAlign: "middle",
};

const TDN: React.CSSProperties = {
  ...TD_STYLE,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const INP_STYLE: React.CSSProperties = {
  padding: "9px 13px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--panel2)",
  color: "var(--text)",
  fontSize: 14,
  minWidth: 150,
};
