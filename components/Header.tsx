"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "./ThemeProvider";
import { SITE_NAME } from "@/lib/config";

/** US market session check (Mon–Fri, 9:30–16:00 ET). */
function isMarketOpen(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday");
  if (day === "Sat" || day === "Sun") return false;
  const mins = Number(get("hour")) * 60 + Number(get("minute"));
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

const TABS = [
  { href: "/", label: "Portfolio" },
  { href: "/activity", label: "Activity" },
];

export function Header() {
  const { dark, toggle } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    const update = () => setOpen(isMarketOpen(new Date()));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--header-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="container"
        style={{ display: "flex", alignItems: "center", gap: 14, height: 62 }}
      >
        <Link
          href="/"
          style={{ display: "flex", alignItems: "center", gap: 10, userSelect: "none" }}
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
              color: "#04101f",
              flexShrink: 0,
              boxShadow: "0 0 16px rgba(34,211,238,0.35)",
            }}
          >
            J
          </div>
          <span className="hide-mobile" style={{ fontSize: 17, fontWeight: 700 }}>
            {SITE_NAME}
          </span>
        </Link>

        {/* Tab navigation */}
        <nav style={{ display: "flex", gap: 4, marginLeft: 8, flex: 1 }}>
          {TABS.map((tab) => {
            const active =
              tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  padding: "7px 16px",
                  borderRadius: 9,
                  fontSize: 14,
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--accent)" : "var(--muted)",
                  background: active ? "var(--accent-soft)" : "transparent",
                  border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
                  transition: "all 120ms",
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {open !== null && (
            <div
              className="hide-mobile"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12,
                fontWeight: 600,
                color: open ? "var(--good)" : "var(--muted)",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "currentColor",
                  display: "inline-block",
                  animation: open ? "pulse-dot 2s ease infinite" : "none",
                }}
              />
              {open ? "Market open" : "Market closed"}
            </div>
          )}

          <button
            onClick={toggle}
            className="btn-ghost"
            style={{ fontSize: 15, lineHeight: 1, padding: "7px 12px" }}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? "☀" : "☾"}
          </button>
        </div>
      </div>
    </header>
  );
}
