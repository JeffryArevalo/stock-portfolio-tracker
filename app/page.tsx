"use client";

import { createClient } from "../src/lib/supabase/client";
import { useRouter } from "next/navigation";

import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
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

/** -----------------------------
 * Types (data shapes)
 * ------------------------------*/
type Holding = {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
};

type Quote = {
  c: number; // current price
  d: number; // price change
  dp: number; // percent change (already % number, e.g. 1.23)
  t: number; // unix timestamp
};

/** -----------------------------
 * Constants
 * ------------------------------*/
const DEFAULT_SYMBOLS = ["AMZN", "COST", "GOOGL", "META", "MSFT", "SCHD", "VOO"];
const LS_KEY = "stock_portfolio_holdings_v1";

const PIE_COLORS = [
  "#6366F1", // Indigo
  "#10B981", // Emerald
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#3B82F6", // Blue
  "#A855F7", // Purple
  "#14B8A6", // Teal
];

/** -----------------------------
 * Small helper functions
 * ------------------------------*/
function money(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// Use when the number is a decimal (0.25 => 25.00%)
function pct(n: number) {
  if (!Number.isFinite(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

// Use when the number is already a percent (2.35 => 2.35%)
function pctPlain(n: number) {
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(2)}%`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** -----------------------------
 * Animated number (nice KPI effect)
 * ------------------------------*/
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
  const prevRef = React.useRef<number>(Number.isFinite(value) ? value : 0);

  useEffect(() => {
    if (!Number.isFinite(value)) return;

    const start = prevRef.current;
    const end = value;
    const startTime = performance.now();

    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease out
      const next = start + (end - start) * eased;
      setDisplay(next);

      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = end;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <>{format(display)}</>;
}

/** -----------------------------
 * Main page component
 * ------------------------------*/
export default function Page() {
  const router = useRouter();

  /**
   * ------------------------------------------------
   * Create Supabase client ONCE
   * ------------------------------------------------
   */
  const supabase = useMemo(() => createClient(), []);

  /**
   * ------------------------------------------------
   * Session state (tracks if user is logged in)
   * ------------------------------------------------
   */
  const [session, setSession] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    // Get current session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });

    // Listen for login/logout
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  /**
   * ------------------------------------------------
   * Protect route (redirect if not logged in)
   * ------------------------------------------------
   */
  useEffect(() => {
    if (!authChecked) return;
    if (!session) {
      router.push("/login");
    }
  }, [authChecked, session, router]);

  /** --- App state --- */
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [divYields, setDivYields] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);

  const [refreshEverySec, setRefreshEverySec] = useState<number>(30);
  const [rangeDays, setRangeDays] = useState(180); // 6 months
  const [perfData, setPerfData] = useState<any[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);

  const [sort, setSort] = useState<{ key: string; dir: "desc" | "asc" }>({
    key: "value",
    dir: "desc",
  });

  /** --- Theme (dark / light) --- */
  const [darkMode, setDarkMode] = useState(true);

  // Read saved theme once
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved) setDarkMode(saved === "dark");
  }, []);

  // Save theme when it changes
  useEffect(() => {
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  /**
   * ------------------------------------------------
   * Theme variables (so dark/light actually changes)
   * ------------------------------------------------
   */
  const themeVars = useMemo(() => {
    const dark = {
      ["--bg" as any]: "#070A0F",
      ["--panel" as any]: "rgba(17, 24, 39, 0.78)",
      ["--panel2" as any]: "rgba(31, 41, 55, 0.75)",
      ["--text" as any]: "#E5E7EB",
      ["--muted" as any]: "rgba(229,231,235,0.65)",
      ["--border" as any]: "rgba(148,163,184,0.20)",
      ["--good" as any]: "#22c55e",
      ["--bad" as any]: "#ef4444",
    };

    const light = {
      ["--bg" as any]: "#F6F7FB",
      ["--panel" as any]: "#FFFFFF",
      ["--panel2" as any]: "#EEF2F7",
      ["--text" as any]: "#0F172A",
      ["--muted" as any]: "rgba(15,23,42,0.55)",
      ["--border" as any]: "rgba(15,23,42,0.14)",
      ["--good" as any]: "#0f766e",
      ["--bad" as any]: "#b91c1c",
    };

    return darkMode ? dark : light;
  }, [darkMode]);

  /**
   * ------------------------------------------------
   * Cloud sync guard:
   * prevents "load from cloud" from immediately saving back
   * ------------------------------------------------
   */
  const [initialCloudLoadDone, setInitialCloudLoadDone] = useState(false);

  /**
   * ------------------------------------------------
   * Load holdings from LocalStorage ONLY when logged out
   * ------------------------------------------------
   */
  useEffect(() => {
    if (session?.user?.id) return;

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setHoldings(JSON.parse(raw));
      else setHoldings([]);
    } catch {
      setHoldings([]);
    }
  }, [session?.user?.id]);

  /**
   * ------------------------------------------------
   * Auto load from cloud after login
   * ------------------------------------------------
   */
  useEffect(() => {
    if (session?.user?.id) {
      loadHoldingsFromCloud();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  /**
   * ------------------------------------------------
   * Save holdings to LocalStorage ONLY when logged out
   * ------------------------------------------------
   */
  useEffect(() => {
    if (session?.user?.id) return;
    localStorage.setItem(LS_KEY, JSON.stringify(holdings));
  }, [holdings, session?.user?.id]);

  /**
   * ------------------------------------------------
   * Auto save holdings to cloud when logged in
   * (only AFTER initial cloud load is complete)
   * ------------------------------------------------
   */
  useEffect(() => {
    if (!session?.user?.id) return;
    if (!initialCloudLoadDone) return;

    saveHoldingsToCloud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings, session?.user?.id, initialCloudLoadDone]);

  /** --- Which symbols we should track (defaults + user holdings) --- */
  const symbolsToTrack = useMemo(() => {
    const fromHoldings = holdings.map((h) => h.symbol.toUpperCase());
    return Array.from(new Set([...DEFAULT_SYMBOLS, ...fromHoldings])).sort();
  }, [holdings]);

  /** -----------------------------
   * Auth actions
   * ------------------------------*/
  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  /** -----------------------------
   * API calls (quotes + yields)
   * ------------------------------*/

  // Get latest quotes
  async function fetchQuotes() {
    setError(null);
    try {
      const qs = symbolsToTrack.join(",");
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(qs)}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data?.error) {
        setError(data?.error || "Failed to fetch quotes");
        return;
      }

      const next: Record<string, Quote | null> = {};
      for (const item of data.results ?? []) {
        next[String(item.symbol).toUpperCase()] = item.quote
          ? (item.quote as Quote)
          : null;
      }
      setQuotes(next);
    } catch (e: any) {
      setError(e?.message || "Network error");
    }
  }

  // Get dividend yields (percent, like 2.35 meaning 2.35%)
  async function fetchDividendYields() {
    try {
      const qs = symbolsToTrack.join(",");
      const res = await fetch(`/api/metrics?symbols=${encodeURIComponent(qs)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) return;

      const next: Record<string, number | null> = {};
      for (const item of data.results ?? []) {
        const sym = String(item.symbol).toUpperCase();
        next[sym] =
          typeof item.dividendYieldPct === "number" &&
          Number.isFinite(item.dividendYieldPct)
            ? item.dividendYieldPct
            : null;
      }
      setDivYields(next);
    } catch {
      // silent fail
    }
  }

  /**
   * ------------------------------------------------
   * Load holdings from Supabase
   * ------------------------------------------------
   */
  async function loadHoldingsFromCloud() {
    setError(null);

    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from("holdings")
      .select("id, symbol, shares, avg_cost")
      .order("created_at", { ascending: true });

    if (error) {
      setError(error.message);
      return;
    }

    const mapped: Holding[] = (data ?? []).map((row: any) => ({
      id: row.id,
      symbol: String(row.symbol),
      shares: Number(row.shares),
      avgCost: Number(row.avg_cost),
    }));

    setHoldings(mapped);
    setInitialCloudLoadDone(true);
  }

  /**
   * ------------------------------------------------
   * Save holdings to Supabase
   * Uses UPSERT so we don't delete everything
   * ------------------------------------------------
   */
  async function saveHoldingsToCloud() {
    setError(null);

    if (!session?.user?.id) return;

    const rowsToUpsert = holdings.map((h) => ({
      user_id: session.user.id,
      symbol: h.symbol.toUpperCase(),
      shares: h.shares,
      avg_cost: h.avgCost,
    }));

    const { error } = await supabase
      .from("holdings")
      .upsert(rowsToUpsert, { onConflict: "user_id,symbol" });

    if (error) {
      setError(error.message);
    }
  }

  /** --- Polling (refresh quotes + yields) --- */
  useEffect(() => {
    fetchQuotes();
    fetchDividendYields();

    const id = setInterval(() => {
      fetchQuotes();
      fetchDividendYields();
    }, Math.max(10, refreshEverySec) * 1000);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshEverySec, symbolsToTrack.join(",")]);

  /** -----------------------------
   * Build table rows (calculated values)
   * ------------------------------*/
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
      const dailyPct = q?.dp ? q.dp / 100 : NaN;

      const divYieldPct = divYields[sym] ?? null;

      return {
        ...h,
        sym,
        q,
        price,
        invest,
        value,
        gain,
        gainPct,
        daily,
        dailyPct,
        divYieldPct,
      };
    });

    const getNum = (x: any) => (Number.isFinite(x) ? x : -Infinity);

    base.sort((a: any, b: any) => {
      const dirMul = sort.dir === "desc" ? -1 : 1;

      if (sort.key === "sym") {
        return a.sym.localeCompare(b.sym) * dirMul;
      }

      const av = getNum(a[sort.key]);
      const bv = getNum(b[sort.key]);
      if (av === bv) return a.sym.localeCompare(b.sym);
      return (av - bv) * dirMul;
    });

    return base;
  }, [holdings, quotes, divYields, sort]);

  /** -----------------------------
   * Performance chart (history)
   * ------------------------------*/
  function toDateLabel(unixSec: number) {
    const d = new Date(unixSec * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function buildCloseMap(candles: any) {
    const map = new Map<number, number>();
    if (!candles || candles.s !== "ok") return map;
    for (let i = 0; i < candles.t.length; i++) {
      map.set(candles.t[i], candles.c[i]);
    }
    return map;
  }

  useEffect(() => {
    const run = async () => {
      if (!holdings.length) {
        setPerfData([]);
        return;
      }

      setPerfLoading(true);
      try {
        const symbols = Array.from(
          new Set(holdings.map((h) => h.symbol.toUpperCase()))
        );
        const to = Math.floor(Date.now() / 1000);
        const from = to - rangeDays * 24 * 60 * 60;

        const res = await fetch(
          `/api/history?symbols=${encodeURIComponent(
            symbols.join(",")
          )}&from=${from}&to=${to}&benchmark=VOO`
        );
        const data = await res.json();

        const seriesArr: any[] = data.series || [];
        const bySym = new Map<string, Map<number, number>>();
        for (const item of seriesArr) {
          bySym.set(item.sym, buildCloseMap(item.candles));
        }

        // Use VOO as the timeline
        const benchMap = bySym.get("VOO") || new Map<number, number>();
        const dates = Array.from(benchMap.keys()).sort((a, b) => a - b);

        // Forward-fill prices
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

        // Convert to % return from start
        const firstPortfolio =
          rawPoints.find((p) => Number.isFinite(p.portfolio))?.portfolio ?? 0;
        const firstBench =
          rawPoints.find((p) => Number.isFinite(p.bench))?.bench ?? 0;

        const indexed = rawPoints.map((p) => ({
          date: p.date,
          Portfolio:
            firstPortfolio > 0
              ? (p.portfolio / firstPortfolio - 1) * 100
              : NaN,
          "S&P 500 (VOO)":
            firstBench > 0 ? (p.bench / firstBench - 1) * 100 : NaN,
        }));

        setPerfData(indexed);
      } catch (e) {
        console.error(e);
        setPerfData([]);
      } finally {
        setPerfLoading(false);
      }
    };

    run();
  }, [holdings, rangeDays]);

  /** -----------------------------
   * Pie chart data
   * ------------------------------*/
  const allocationData = useMemo(() => {
    return rows
      .filter((r: any) => Number.isFinite(r.value) && r.value > 0)
      .map((r: any) => ({ name: r.sym, value: r.value }));
  }, [rows]);

  /** -----------------------------
   * Total KPIs
   * ------------------------------*/
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

  /** -----------------------------
   * Trade form state (buy/sell)
   * ------------------------------*/
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState<number | "">("");
  const [avgCost, setAvgCost] = useState<number | "">("");

  // Buy: add shares, update avg cost using weighted average
  function buyTrade() {
    setError(null);

    const s = symbol.trim().toUpperCase();
    if (!s || shares === "" || avgCost === "") return;

    const qty = Number(shares);
    const price = Number(avgCost);
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (!Number.isFinite(price) || price <= 0) return;

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

    setSymbol("");
    setShares("");
    setAvgCost("");
  }

  // Sell: subtract shares; if shares hits 0, remove holding
  function sellTrade() {
    setError(null);

    const s = symbol.trim().toUpperCase();
    if (!s || shares === "") return;

    const qty = Number(shares);
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

    setSymbol("");
    setShares("");
    setAvgCost("");
  }

  function removeHolding(id: string) {
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  }

  /** -----------------------------
   * Render UI
   * ------------------------------*/
  return (
    <div style={{ ...pageStyle, ...(themeVars as any) }}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: 24,
          fontFamily: "system-ui, Arial",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
            gap: 10,
          }}
        >
          <h1
            style={{
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: -0.5,
              margin: 0,
              color: darkMode ? undefined : "#0f172a",
              background: darkMode
                ? "linear-gradient(90deg, #ffffff, #4ac0de)"
                : undefined,
              WebkitBackgroundClip: darkMode ? "text" : undefined,
              WebkitTextFillColor: darkMode ? "transparent" : undefined,
            }}
          >
            Stock Portfolio Tracker
          </h1>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => setDarkMode((v) => !v)}
              style={{
                padding: "10px 16px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--panel)",
                color: "var(--text)",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {darkMode ? "☀️ Light" : "🌙 Dark"}
            </button>

            {!!session && (
              <button
                onClick={signOut}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--panel2)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Subtitle */}
        <div
          style={{
            opacity: 0.7,
            marginBottom: 24,
            fontSize: 14,
            letterSpacing: 0.3,
          }}
        >
          Real-time Finnhub quotes • Auto-synced securely to cloud
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <button onClick={fetchQuotes} style={primaryBtn}>
            Refresh now
          </button>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Auto-refresh (sec):
            <input
              type="number"
              value={refreshEverySec}
              onChange={(e) => setRefreshEverySec(Number(e.target.value || 30))}
              min={10}
              style={{
                width: 90,
                padding: 6,
                borderRadius: 10,
                border: "1px solid var(--border)",
              }}
            />
          </label>

          {error && <span style={{ color: "crimson" }}>{error}</span>}
        </div>

        {/* KPI tiles */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <Kpi
            title="Total Invested"
            value={totals.totalInvest}
            format={money}
            darkMode={darkMode}
          />
          <Kpi
            title="Current Value"
            value={totals.totalValue}
            format={money}
            darkMode={darkMode}
          />
          <Kpi
            title="Daily Change"
            value={totals.totalDaily}
            tone={totals.totalDaily >= 0 ? "good" : "bad"}
            format={money}
            darkMode={darkMode}
          />
          <Kpi
            title="Total Gain/Loss"
            value={totals.totalGain}
            tone={totals.totalGain >= 0 ? "good" : "bad"}
            format={money}
            darkMode={darkMode}
          />
          <Kpi
            title="Total Gain/Loss %"
            value={totals.totalGainPct}
            tone={totals.totalGainPct >= 0 ? "good" : "bad"}
            format={pct}
            darkMode={darkMode}
          />
        </div>

        {/* Allocation Pie Chart */}
        <div style={{ ...panelStyle, marginBottom: 18 }}>
          <h2
            style={{
              marginTop: 0,
              marginBottom: 10,
              fontSize: 18,
              fontWeight: 800,
            }}
          >
            Allocation (by Current Value)
          </h2>

          <div style={{ width: "100%", height: 375 }}>
            <ResponsiveContainer>
              <PieChart margin={{ top: 20, right: 40, bottom: 50, left: 40 }}>
                <Pie
                  data={allocationData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={125}
                  label={(props: any) =>
                    `${props.name}: $${props.value.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })} (${((props.percent ?? 0) * 100).toFixed(1)}%)`
                  }
                >
                  {allocationData.map((_, index) => (
                    <Cell
                      key={index}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>

                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ paddingTop: 20 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Performance line chart */}
        <div style={{ ...panelStyle, marginBottom: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              <b>Performance (% Return) vs S&P 500 Proxy (VOO)</b>
            </h2>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ opacity: 0.75, fontSize: 12 }}>Range:</span>
              <select
                value={rangeDays}
                onChange={(e) => setRangeDays(Number(e.target.value))}
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--panel2)",
                  color: "var(--text)",
                }}
              >
                <option value={30}>1M</option>
                <option value={90}>3M</option>
                <option value={180}>6M</option>
                <option value={365}>1Y</option>
                <option value={730}>2Y</option>
                <option value={1825}>5Y</option>
              </select>
            </div>
          </div>

          <div style={{ width: "100%", height: 320, marginTop: 12 }}>
            {perfLoading ? (
              <div style={{ opacity: 0.7 }}>Loading history…</div>
            ) : perfData.length === 0 ? (
              <div style={{ opacity: 0.7 }}>
                No history yet (add holdings or widen the range).
              </div>
            ) : (
              <ResponsiveContainer>
                <LineChart data={perfData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="date" hide />
                  <YAxis
                    tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                    domain={["auto", "auto"]}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="#9CA3AF"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                  />
                  <Tooltip
                    formatter={(v: any) => `${Number(v).toFixed(2)}%`}
                  />
                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="Portfolio"
                    dot={false}
                    stroke="#634ade"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="S&P 500 (VOO)"
                    dot={false}
                    stroke="#ef4444"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Trade box */}
        <div style={{ ...panelStyle, marginBottom: 18 }}>
          <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 18, fontWeight: 900 }}>
            Trade
          </h2>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <Field label="Ticker">
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="AMZN"
                style={inp}
              />
            </Field>

            <Field label="Shares">
              <input
                type="number"
                value={shares}
                placeholder="0"
                onChange={(e) =>
                  setShares(e.target.value === "" ? "" : Number(e.target.value))
                }
                min={0}
                step={1}
                style={inp}
              />
            </Field>

            <Field label="Avg Cost ($)">
              <input
                type="number"
                value={avgCost}
                placeholder="0.00"
                onChange={(e) =>
                  setAvgCost(e.target.value === "" ? "" : Number(e.target.value))
                }
                min={0}
                step={0.01}
                style={inp}
              />
            </Field>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={buyTrade} style={buyBtn}>
                Buy
              </button>
              <button onClick={sellTrade} style={sellBtn}>
                Sell
              </button>
            </div>
          </div>
        </div>

        {/* Holdings table */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            background: "var(--panel)",
          }}
        >
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <strong>Holdings</strong>
            <span style={{ opacity: 0.6 }}>{rows.length} Positions</span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ background: "var(--panel2)" }}>
              <tr>
                <SortableTh
                  label="Ticker"
                  sortKey="sym"
                  sort={sort}
                  setSort={setSort}
                  thStyle={thStickyLeft}
                />
                <SortableTh
                  label="Shares"
                  sortKey="shares"
                  sort={sort}
                  setSort={setSort}
                />
                <SortableTh
                  label="Avg Cost"
                  sortKey="avgCost"
                  sort={sort}
                  setSort={setSort}
                />
                <SortableTh
                  label="Price"
                  sortKey="price"
                  sort={sort}
                  setSort={setSort}
                />
                <SortableTh
                  label="Daily $"
                  sortKey="daily"
                  sort={sort}
                  setSort={setSort}
                />
                <SortableTh
                  label="Div Yield"
                  sortKey="divYieldPct"
                  sort={sort}
                  setSort={setSort}
                />
                <SortableTh
                  label="Invested"
                  sortKey="invest"
                  sort={sort}
                  setSort={setSort}
                />
                <SortableTh
                  label="Value"
                  sortKey="value"
                  sort={sort}
                  setSort={setSort}
                />
                <SortableTh
                  label="Gain"
                  sortKey="gain"
                  sort={sort}
                  setSort={setSort}
                />
                <SortableTh
                  label="Gain %"
                  sortKey="gainPct"
                  sort={sort}
                  setSort={setSort}
                />
                <th style={th}></th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 14, opacity: 0.75 }}>
                    No holdings yet. Add AMZN, COST, GOOGL, META, MSFT, SCHD,
                    VOO — or any ticker.
                  </td>
                </tr>
              ) : (
                rows.map((r: any) => {
                  const tone = Number.isFinite(r.gain)
                    ? r.gain >= 0
                      ? "good"
                      : "bad"
                    : "neutral";

                  return (
                    <tr
                      key={r.id}
                      style={{
                        ...rowBase,
                        background: darkMode
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(15,23,42,0.02)",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLTableRowElement;
                        el.style.background = darkMode
                          ? "rgba(74,192,222,0.10)"
                          : "rgba(59,130,246,0.08)";
                        el.style.transform = "translateY(-1px)";
                        el.style.boxShadow = darkMode
                          ? "0 10px 28px rgba(0,0,0,0.35)"
                          : "0 10px 24px rgba(15,23,42,0.10)";
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLTableRowElement;
                        el.style.background = darkMode
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(15,23,42,0.02)";
                        el.style.transform = "translateY(0px)";
                        el.style.boxShadow = "none";
                      }}
                    >
                      <td style={tdSym}>{r.sym}</td>

                      <td style={tdNum}>{r.shares}</td>
                      <td style={tdNum}>{money(r.avgCost)}</td>
                      <td style={tdNum}>{r.q?.c ? money(r.q.c) : "-"}</td>

                      <td style={tdNum}>
                        <span
                          style={pillStyle(
                            Number.isFinite(r.daily)
                              ? r.daily >= 0
                                ? "good"
                                : "bad"
                              : "neutral"
                          )}
                        >
                          {Number.isFinite(r.daily) ? money(r.daily) : "-"}
                        </span>
                      </td>

                      <td style={tdNum}>
                        {typeof r.divYieldPct === "number"
                          ? pctPlain(r.divYieldPct)
                          : "-"}
                      </td>

                      <td style={tdNum}>{money(r.invest)}</td>
                      <td style={tdNum}>
                        {Number.isFinite(r.value) ? money(r.value) : "-"}
                      </td>

                      <td style={tdNum}>
                        <span style={pillStyle(tone)}>
                          {Number.isFinite(r.gain) ? money(r.gain) : "-"}
                        </span>
                      </td>

                      <td style={tdNum}>
                        <span style={pillStyle(tone)}>
                          {Number.isFinite(r.gainPct) ? pct(r.gainPct) : "-"}
                        </span>
                      </td>

                      <td style={tdNum}>
                        <button
                          onClick={() => removeHolding(r.id)}
                          style={{
                            cursor: "pointer",
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "var(--panel2)",
                            color: "var(--text)",
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** -----------------------------
 * KPI tile component
 * ------------------------------*/
function Kpi({
  title,
  value,
  tone,
  format,
  darkMode,
}: {
  title: string;
  value: number;
  tone?: "good" | "bad" | "neutral";
  format: (n: number) => string;
  darkMode: boolean;
}) {
  const color =
    tone === "good"
      ? darkMode
        ? "#22c55e"
        : "#0f766e"
      : tone === "bad"
      ? darkMode
        ? "#ef4444"
        : "#b91c1c"
      : "var(--text)";

  const gradient = darkMode
    ? tone === "good"
      ? "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(0,0,0,0.65))"
      : tone === "bad"
      ? "linear-gradient(135deg, rgba(239,68,68,0.10), rgba(0,0,0,0.65))"
      : "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(0,0,0,0.65))"
    : tone === "good"
    ? "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(255,255,255,0.96))"
    : tone === "bad"
    ? "linear-gradient(135deg, rgba(239,68,68,0.10), rgba(255,255,255,0.96))"
    : "linear-gradient(135deg, rgba(15,23,42,0.04), rgba(255,255,255,0.98))";

  const arrow = tone === "good" ? "▲" : tone === "bad" ? "▼" : null;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 18,
        background: gradient,
        boxShadow: darkMode
          ? "0 4px 20px rgba(0,0,0,0.45)"
          : "0 10px 24px rgba(15,23,42,0.10)",
      }}
    >
      <div
        style={{
          opacity: 0.7,
          fontSize: 12,
          marginBottom: 6,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        {arrow && <span style={{ fontSize: 14, color }}>{arrow}</span>}

        <span style={{ fontSize: 24, fontWeight: 800, color }}>
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

/** -----------------------------
 * Small input label component
 * ------------------------------*/
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>
      {children}
    </label>
  );
}

/** -----------------------------
 * Styles (inline)
 * ------------------------------*/
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--bg)",
  color: "var(--text)",
};

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 14,
  background: "var(--panel)",
};

const inp: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--panel2)",
  color: "var(--text)",
  minWidth: 160,
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background:
    "linear-gradient(90deg, rgba(74,192,222,0.25), rgba(99,102,241,0.25))",
  color: "var(--text)",
  fontWeight: 800,
  cursor: "pointer",
};

const buyBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid rgba(34,197,94,0.35)",
  background: "rgba(34,197,94,0.16)",
  color: "var(--text)",
  fontWeight: 900,
  cursor: "pointer",
};

const sellBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 12,
  border: "1px solid rgba(239,68,68,0.35)",
  background: "rgba(239,68,68,0.14)",
  color: "var(--text)",
  fontWeight: 900,
  cursor: "pointer",
};

const th: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 2,
  textAlign: "center",
  padding: "12px 10px",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.8,
  color: "var(--text)",
  borderBottom: "1px solid var(--border)",
  textTransform: "uppercase",
  background: "var(--panel)",
};

const thStickyLeft: React.CSSProperties = {
  ...th,
  left: 0,
  zIndex: 4,
  background: "var(--panel2)",
};

const td: React.CSSProperties = {
  padding: "12px 10px",
  verticalAlign: "middle",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 14,
};

const tdNum: React.CSSProperties = {
  ...td,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const tdSym: React.CSSProperties = {
  ...td,
  fontWeight: 900,
  letterSpacing: 0.4,
  position: "sticky",
  left: 0,
  zIndex: 3,
  background: "var(--panel)",
};

const rowBase: React.CSSProperties = {
  transition: "background 180ms ease, transform 180ms ease, box-shadow 180ms ease",
};

function pillStyle(kind: "good" | "bad" | "neutral"): React.CSSProperties {
  const bg =
    kind === "good"
      ? "rgba(34,197,94,0.14)"
      : kind === "bad"
      ? "rgba(239,68,68,0.14)"
      : "rgba(148,163,184,0.10)";

  const border =
    kind === "good"
      ? "rgba(34,197,94,0.35)"
      : kind === "bad"
      ? "rgba(239,68,68,0.35)"
      : "rgba(148,163,184,0.25)";

  const color =
    kind === "good"
      ? "var(--good)"
      : kind === "bad"
      ? "var(--bad)"
      : "var(--text)";

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "6px 10px",
    borderRadius: 999,
    background: bg,
    border: `1px solid ${border}`,
    color,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    minWidth: 90,
  };
}

/** -----------------------------
 * Sortable table header cell
 * ------------------------------*/
function SortableTh({
  label,
  sortKey,
  sort,
  setSort,
  thStyle,
}: {
  label: string;
  sortKey: string;
  sort: { key: string; dir: "desc" | "asc" };
  setSort: React.Dispatch<
    React.SetStateAction<{ key: string; dir: "desc" | "asc" }>
  >;
  thStyle?: React.CSSProperties;
}) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === "desc" ? "▼" : "▲") : "";

  return (
    <th style={thStyle ?? th}>
      <button
        onClick={() => {
          setSort((prev) => {
            if (prev.key === sortKey) {
              return { key: sortKey, dir: prev.dir === "desc" ? "asc" : "desc" };
            }
            return { key: sortKey, dir: "desc" };
          });
        }}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          width: "100%",
          userSelect: "none",
        }}
        title={`Sort by ${label}`}
      >
        <span
          style={{
            fontWeight: 900,
            color: active ? "#4ac0de" : "var(--text)",
          }}
        >
          {label}
        </span>

        <span
          style={{
            fontSize: 12,
            color: active ? "#4ac0de" : "var(--muted)",
          }}
        >
          {arrow}
        </span>
      </button>
    </th>
  );
}