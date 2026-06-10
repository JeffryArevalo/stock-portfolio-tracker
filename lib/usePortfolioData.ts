"use client";

import { useEffect, useMemo, useState } from "react";
import type { Holding, Quote, Transaction } from "./types";
import { openHoldings, totalRealizedPnL } from "./portfolio";

const QUOTE_POLL_MS = 60_000;

export type HoldingRow = Holding & {
  quote: Quote | null;
  price: number;
  value: number;
  gain: number;
  gainPct: number;
  daily: number;
  dailyPct: number;
  divYieldPct: number | null;
  weight: number;
};

/**
 * Single client-side source of portfolio state: trade log from
 * /api/portfolio, live quotes polled from /api/quotes, dividend yields
 * from /api/fundamentals. Holdings are derived from the trade log.
 */
export function usePortfolioData() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [divYields, setDivYields] = useState<Record<string, number | null>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Trade log
  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTransactions(Array.isArray(d.transactions) ? d.transactions : []);
      })
      .catch(() => {
        if (!cancelled) {
          setTransactions([]);
          setError("Could not load portfolio data.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const holdings = useMemo(
    () => (transactions ? openHoldings(transactions) : []),
    [transactions]
  );
  const realizedPnL = useMemo(
    () => (transactions ? totalRealizedPnL(transactions) : 0),
    [transactions]
  );

  const symbols = useMemo(
    () => holdings.map((h) => h.symbol).sort().join(","),
    [holdings]
  );

  // Live quotes (poll)
  useEffect(() => {
    if (!symbols) return;
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch(`/api/quotes?symbols=${symbols}`);
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && d.quotes) {
          setQuotes(d.quotes);
          setLastUpdated(new Date());
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Live prices temporarily unavailable.");
      }
    }

    load();
    const id = setInterval(load, QUOTE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbols]);

  // Dividend yields (once per symbols set)
  useEffect(() => {
    if (!symbols) return;
    let cancelled = false;
    fetch(`/api/fundamentals?symbols=${symbols}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.dividendYield) setDivYields(d.dividendYield);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  const rows: HoldingRow[] = useMemo(() => {
    const base = holdings.map((h) => {
      const q = quotes[h.symbol] ?? null;
      const price = q?.c ?? NaN;
      const value = q?.c ? h.shares * q.c : NaN;
      const gain = value - h.invested;
      const gainPct = h.invested > 0 ? gain / h.invested : NaN;
      const daily = q?.d ? h.shares * q.d : NaN;
      const dailyPct = q?.dp ?? NaN;
      return {
        ...h,
        quote: q,
        price,
        value,
        gain,
        gainPct,
        daily,
        dailyPct,
        divYieldPct: divYields[h.symbol] ?? null,
        weight: NaN,
      };
    });
    const totalValue = base.reduce(
      (s, r) => s + (Number.isFinite(r.value) ? r.value : 0),
      0
    );
    for (const r of base) {
      r.weight = totalValue > 0 && Number.isFinite(r.value) ? r.value / totalValue : NaN;
    }
    return base;
  }, [holdings, quotes, divYields]);

  const totals = useMemo(() => {
    const invested = rows.reduce((s, r) => s + r.invested, 0);
    const value = rows.reduce((s, r) => s + (Number.isFinite(r.value) ? r.value : 0), 0);
    const daily = rows.reduce((s, r) => s + (Number.isFinite(r.daily) ? r.daily : 0), 0);
    const gain = value - invested;
    const gainPct = invested > 0 ? gain / invested : 0;
    const estAnnualDividends = rows.reduce((s, r) => {
      if (r.divYieldPct != null && Number.isFinite(r.value)) {
        return s + (r.value * r.divYieldPct) / 100;
      }
      return s;
    }, 0);
    return { invested, value, daily, gain, gainPct, estAnnualDividends };
  }, [rows]);

  return {
    loading: transactions === null,
    transactions: transactions ?? [],
    holdings,
    rows,
    totals,
    realizedPnL,
    quotes,
    lastUpdated,
    error,
  };
}
