export function money(n: number) {
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Signed currency: +$123.45 / -$123.45 */
export function moneySigned(n: number) {
  if (!Number.isFinite(n)) return "–";
  return `${n >= 0 ? "+" : ""}${money(n)}`;
}

/** Fraction → percent: 0.123 → "12.30%" */
export function pct(n: number) {
  if (!Number.isFinite(n)) return "–";
  return `${(n * 100).toFixed(2)}%`;
}

export function pctSigned(n: number) {
  if (!Number.isFinite(n)) return "–";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
}

/** Already-a-percent number: 12.3 → "12.30%" */
export function pctPlain(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "–";
  return `${n.toFixed(2)}%`;
}

export function shares(n: number) {
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Large numbers: 2_500_000 → "$2.50M" (input in raw dollars) */
export function compact(n: number) {
  if (!Number.isFinite(n)) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return money(n);
}

/** "2026-06-10" → "Jun 10, 2026" (parsed as local date, not UTC) */
export function dateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "2026-06-10" → "June 2026" */
export function monthLabel(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m) return iso;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function timeAgo(unixSec: number) {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
