"use client";

import React from "react";
import { AnimatedNumber } from "./AnimatedNumber";

export function KpiCard({
  title,
  value,
  format,
  tone,
  sub,
}: {
  title: string;
  value: number;
  format: (n: number) => string;
  tone?: "good" | "bad" | "neutral";
  sub?: React.ReactNode;
}) {
  const color =
    tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <div className="card fade-up" style={{ padding: "16px 18px" }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--muted)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 7,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

const AVATAR_COLORS = [
  "#22d3ee", "#818cf8", "#34d399", "#f59e0b",
  "#f87171", "#a78bfa", "#2dd4bf", "#fb923c",
];

/** Colored monogram for a ticker — zero API cost, consistent per symbol. */
export function TickerAvatar({ symbol, size = 36 }: { symbol: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.32,
        fontWeight: 800,
        flexShrink: 0,
        letterSpacing: -0.5,
      }}
    >
      {symbol.slice(0, 4)}
    </div>
  );
}

export function TradeBadge({ type }: { type: "buy" | "sell" }) {
  const buy = type === "buy";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 7,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        color: buy ? "var(--good)" : "var(--bad)",
        background: buy ? "var(--good-soft)" : "var(--bad-soft)",
        border: `1px solid ${buy ? "var(--good)" : "var(--bad)"}33`,
      }}
    >
      {type}
    </span>
  );
}

export function Skeleton({
  width,
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number;
  style?: React.CSSProperties;
}) {
  return <div className="skeleton" style={{ width: width ?? "100%", height, ...style }} />;
}

export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 16,
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
        {sub && (
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--muted)" }}>{sub}</p>
        )}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}
