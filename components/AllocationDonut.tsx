"use client";

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { money } from "@/lib/format";
import type { HoldingRow } from "@/lib/usePortfolioData";
import { SectionTitle } from "./ui";

const PIE_COLORS = [
  "#22d3ee", "#818cf8", "#34d399", "#f59e0b",
  "#f87171", "#a78bfa", "#2dd4bf", "#fb923c",
];

export function AllocationDonut({ rows }: { rows: HoldingRow[] }) {
  const data = useMemo(
    () =>
      rows
        .filter((r) => Number.isFinite(r.value) && r.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((r) => ({ name: r.symbol, value: r.value })),
    [rows]
  );

  return (
    <div className="card">
      <SectionTitle title="Allocation" sub="By current value" />
      <div style={{ height: 316 }}>
        {data.length === 0 ? (
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
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="44%"
                innerRadius={62}
                outerRadius={104}
                paddingAngle={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v?: number | string, name?: string | number) => {
                  const total = data.reduce((s, d) => s + d.value, 0);
                  const p = total > 0 ? ((Number(v) / total) * 100).toFixed(1) : "0.0";
                  return [`${money(Number(v))}  (${p}%)`, name];
                }}
                contentStyle={{
                  background: "var(--tooltip-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "var(--text)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                }}
                itemStyle={{ color: "var(--text)" }}
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
  );
}
