"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { TickerAvatar, TradeBadge } from "@/components/ui";
import { dateLabel, money, shares as fmtShares } from "@/lib/format";
import {
  clearToken, commitDataFile, fetchDataFile, getToken, saveToken, subscribeToken, verifyToken,
} from "@/lib/githubClient";
import { sharesHeld } from "@/lib/portfolio";
import type { Transaction, TransactionsFile } from "@/lib/types";
import { REPO_NAME, REPO_OWNER } from "@/lib/config";

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AdminClient() {
  // token lives in localStorage; null during server render
  const token = useSyncExternalStore(subscribeToken, getToken, () => null);

  return (
    <main className="container" style={{ padding: "28px 24px 48px", maxWidth: 760 }}>
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800 }}>Admin</h1>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--muted)" }}>
        Record buys and sells. Changes go live on the public site within about a minute.
      </p>
      {token ? (
        <TradeManager token={token} onSignOut={clearToken} />
      ) : (
        <TokenSetup onSaved={saveToken} />
      )}
    </main>
  );
}

/* ---------------------------------------------------------------------- */

function TokenSetup({ onSaved }: { onSaved: (t: string) => void }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    const res = await verifyToken(input.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Verification failed.");
      return;
    }
    onSaved(input.trim());
  }

  return (
    <div className="card">
      <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>One-time setup</h2>
      <p style={{ fontSize: 13.5, color: "var(--muted2)", lineHeight: 1.65, margin: "0 0 14px" }}>
        This page needs a GitHub token to save trades. The token is stored only in this
        browser and is sent only to GitHub — never to this site&apos;s server. Create one like this:
      </p>
      <ol style={{ fontSize: 13.5, color: "var(--muted2)", lineHeight: 1.8, margin: "0 0 18px", paddingLeft: 20 }}>
        <li>
          Open{" "}
          <a
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)" }}
          >
            github.com/settings/personal-access-tokens/new
          </a>
        </li>
        <li>Token name: <code>portfolio-admin</code>. Expiration: up to you (you&apos;ll paste a new one when it expires).</li>
        <li>
          Repository access: <strong>Only select repositories</strong> →{" "}
          <code>{REPO_OWNER}/{REPO_NAME}</code>
        </li>
        <li>
          Permissions → Repository permissions → <strong>Contents: Read and write</strong>. Nothing else.
        </li>
        <li>Generate, copy, and paste it below.</li>
      </ol>
      <input
        type="password"
        className="field"
        placeholder="github_pat_..."
        value={input}
        onChange={(e) => { setInput(e.target.value); setError(""); }}
        onKeyDown={(e) => e.key === "Enter" && input.trim() && submit()}
        autoFocus
      />
      {error && <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--bad)" }}>{error}</p>}
      <button
        className="btn-primary"
        style={{ marginTop: 16, width: "100%" }}
        disabled={!input.trim() || busy}
        onClick={submit}
      >
        {busy ? "Verifying…" : "Verify & Save"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function TradeManager({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [file, setFile] = useState<{ data: TransactionsFile; sha: string } | null>(null);
  const [loadError, setLoadError] = useState("");

  const [type, setType] = useState<"buy" | "sell">("buy");
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setFile(await fetchDataFile(token));
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load data file.");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // live price hint for the entered symbol
  useEffect(() => {
    const sym = symbol.trim().toUpperCase();
    setLivePrice(null);
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) return;
    const id = setTimeout(() => {
      fetch(`/api/quotes?symbols=${sym}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setLivePrice(d?.quotes?.[sym]?.c ?? null))
        .catch(() => {});
    }, 500);
    return () => clearTimeout(id);
  }, [symbol]);

  const transactions = useMemo(() => file?.data.transactions ?? [], [file]);
  const heldOfSymbol = useMemo(
    () => (symbol.trim() ? sharesHeld(transactions, symbol.trim()) : 0),
    [transactions, symbol]
  );

  const recent = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
        .slice(0, 12),
    [transactions]
  );

  async function withRetry(fn: (f: { data: TransactionsFile; sha: string }) => Promise<void>) {
    // refetch + retry once if someone else committed in between
    let current = await fetchDataFile(token);
    try {
      await fn(current);
    } catch (e) {
      if (e instanceof Error && e.message === "CONFLICT") {
        current = await fetchDataFile(token);
        await fn(current);
      } else {
        throw e;
      }
    }
  }

  async function submitTrade() {
    setMsg(null);
    const sym = symbol.trim().toUpperCase();
    const q = Number(qty);
    const p = Number(price);

    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) return setMsg({ kind: "err", text: "Enter a valid ticker symbol." });
    if (!Number.isFinite(q) || q <= 0) return setMsg({ kind: "err", text: "Shares must be a positive number." });
    if (!Number.isFinite(p) || p <= 0) return setMsg({ kind: "err", text: "Price must be a positive number." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setMsg({ kind: "err", text: "Pick a valid date." });

    setBusy(true);
    try {
      await withRetry(async (current) => {
        if (type === "sell") {
          const held = sharesHeld(current.data.transactions, sym);
          if (q > held + 1e-9) {
            throw new Error(`Cannot sell ${q} shares of ${sym} — you hold ${held}.`);
          }
        }
        const tx: Transaction = {
          id: uid(),
          date,
          type,
          symbol: sym,
          shares: q,
          price: p,
          ...(note.trim() ? { note: note.trim() } : {}),
        };
        const next: TransactionsFile = {
          transactions: [...current.data.transactions, tx],
        };
        await commitDataFile(
          token,
          next,
          current.sha,
          `trade: ${type.toUpperCase()} ${q} ${sym} @ ${p}`
        );
      });
      setMsg({ kind: "ok", text: `${type === "buy" ? "Buy" : "Sell"} recorded. The public site updates within a minute.` });
      setSymbol(""); setQty(""); setPrice(""); setNote(""); setDate(todayISO());
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to save trade." });
    } finally {
      setBusy(false);
    }
  }

  async function deleteTrade(tx: Transaction) {
    if (!confirm(`Delete this entry?\n\n${tx.type.toUpperCase()} ${tx.shares} ${tx.symbol} @ ${tx.price} on ${tx.date}`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await withRetry(async (current) => {
        const next: TransactionsFile = {
          transactions: current.data.transactions.filter((t) => t.id !== tx.id),
        };
        await commitDataFile(
          token,
          next,
          current.sha,
          `trade: remove ${tx.type.toUpperCase()} ${tx.shares} ${tx.symbol} (${tx.id})`
        );
      });
      setMsg({ kind: "ok", text: "Entry deleted." });
      await load();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Failed to delete." });
    } finally {
      setBusy(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--muted)",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };

  return (
    <>
      {loadError && (
        <div className="card" style={{ borderColor: "var(--bad)", color: "var(--bad)", marginBottom: 16, fontSize: 14 }}>
          {loadError} — <button className="btn-ghost" onClick={load}>retry</button>
        </div>
      )}

      {/* Trade form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {(["buy", "sell"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
                cursor: "pointer",
                border: `1px solid ${type === t ? (t === "buy" ? "var(--good)" : "var(--bad)") : "var(--border)"}`,
                background: type === t ? (t === "buy" ? "var(--good-soft)" : "var(--bad-soft)") : "transparent",
                color: type === t ? (t === "buy" ? "var(--good)" : "var(--bad)") : "var(--muted)",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Symbol</label>
            <input
              className="field"
              placeholder="e.g. MSFT"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5, minHeight: 16 }}>
              {livePrice != null && (
                <>
                  Live: {money(livePrice)}{" "}
                  <button
                    onClick={() => setPrice(String(livePrice))}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, padding: 0 }}
                  >
                    use
                  </button>
                </>
              )}
              {type === "sell" && symbol.trim() && (
                <span> · holding {fmtShares(heldOfSymbol)} sh</span>
              )}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input className="field" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Shares</label>
            <input className="field" type="number" min="0" step="any" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Price per share ($)</label>
            <input className="field" type="number" min="0" step="any" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Note (optional, shown publicly)</label>
            <input className="field" placeholder="e.g. Adding on the dip" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {qty && price && Number(qty) > 0 && Number(price) > 0 && (
          <div style={{ marginTop: 14, fontSize: 13.5, color: "var(--muted2)" }}>
            Total: <strong style={{ color: "var(--text)" }}>{money(Number(qty) * Number(price))}</strong>
          </div>
        )}

        {msg && (
          <div
            style={{
              marginTop: 14,
              padding: "11px 14px",
              borderRadius: 10,
              fontSize: 13.5,
              border: `1px solid ${msg.kind === "ok" ? "var(--good)" : "var(--bad)"}`,
              background: msg.kind === "ok" ? "var(--good-soft)" : "var(--bad-soft)",
              color: msg.kind === "ok" ? "var(--good)" : "var(--bad)",
            }}
          >
            {msg.text}
          </div>
        )}

        <button
          className="btn-primary"
          style={{ marginTop: 16, width: "100%" }}
          disabled={busy || !file}
          onClick={submitTrade}
        >
          {busy ? "Saving…" : `Record ${type === "buy" ? "Buy" : "Sell"}`}
        </button>
      </div>

      {/* Recent entries */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent entries</h2>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{transactions.length} total</span>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
            No trades yet. Record your current holdings as buys to get started.
          </div>
        ) : (
          recent.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 20px",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <TickerAvatar symbol={t.symbol.toUpperCase()} size={30} />
              <TradeBadge type={t.type} />
              <div style={{ flex: 1, fontSize: 13.5 }}>
                <strong>{t.symbol.toUpperCase()}</strong> · {fmtShares(t.shares)} sh @ {money(t.price)}
                <span style={{ color: "var(--muted)" }}> · {dateLabel(t.date)}</span>
              </div>
              <button
                onClick={() => deleteTrade(t)}
                disabled={busy}
                title="Delete entry"
                style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16, padding: 4 }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <button className="btn-ghost" onClick={onSignOut}>
        Sign out (remove token from this browser)
      </button>
    </>
  );
}
