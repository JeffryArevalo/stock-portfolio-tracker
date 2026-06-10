import type { Holding, Transaction } from "./types";

/**
 * Derive current positions from the append-only trade log.
 * Buys raise the weighted-average cost; sells reduce shares at the
 * current avg cost and book the difference as realized P/L.
 * Transactions are processed in chronological order.
 */
export function deriveHoldings(transactions: Transaction[]): Holding[] {
  const sorted = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );

  const map = new Map<string, Holding>();

  for (const tx of sorted) {
    const sym = tx.symbol.toUpperCase();
    let h = map.get(sym);
    if (!h) {
      h = {
        symbol: sym,
        shares: 0,
        avgCost: 0,
        invested: 0,
        realizedPnL: 0,
        totalBought: 0,
        firstBuy: null,
        lastActivity: null,
        tradeCount: 0,
      };
      map.set(sym, h);
    }

    h.tradeCount += 1;
    h.lastActivity = tx.date;

    if (tx.type === "buy") {
      const newShares = h.shares + tx.shares;
      h.avgCost =
        newShares > 0
          ? (h.shares * h.avgCost + tx.shares * tx.price) / newShares
          : 0;
      h.shares = newShares;
      h.totalBought += tx.shares * tx.price;
      if (!h.firstBuy) h.firstBuy = tx.date;
    } else {
      const sellQty = Math.min(tx.shares, h.shares);
      h.realizedPnL += sellQty * (tx.price - h.avgCost);
      h.shares = Math.max(0, h.shares - tx.shares);
      if (h.shares === 0) h.avgCost = 0;
    }

    h.invested = h.shares * h.avgCost;
  }

  return Array.from(map.values());
}

/** Open positions only (shares > 0). */
export function openHoldings(transactions: Transaction[]): Holding[] {
  return deriveHoldings(transactions).filter((h) => h.shares > 1e-9);
}

/** Shares currently held of one symbol — used to validate sells. */
export function sharesHeld(transactions: Transaction[], symbol: string): number {
  const h = deriveHoldings(transactions).find(
    (x) => x.symbol === symbol.toUpperCase()
  );
  return h?.shares ?? 0;
}

export function totalRealizedPnL(transactions: Transaction[]): number {
  return deriveHoldings(transactions).reduce((s, h) => s + h.realizedPnL, 0);
}
