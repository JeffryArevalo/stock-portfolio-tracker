"use client";

import { DATA_PATH, REPO_BRANCH, REPO_NAME, REPO_OWNER } from "./config";
import type { TransactionsFile } from "./types";

/**
 * Browser-side GitHub Contents API client used ONLY by the admin page.
 * The fine-grained PAT lives in the admin's own browser localStorage and
 * is sent directly to api.github.com — it never touches this site's server.
 */

const TOKEN_KEY = "gh_admin_token";
const API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_PATH}`;

const TOKEN_EVENT = "gh-token-change";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token.trim());
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event(TOKEN_EVENT));
}

/** Subscribe to token changes — for useSyncExternalStore. */
export function subscribeToken(cb: () => void) {
  window.addEventListener(TOKEN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(TOKEN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function b64encode(s: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

function b64decode(s: string) {
  return new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0))
  );
}

/** Confirms the token can write to the repo (read check is sufficient here). */
export async function verifyToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${API}?ref=${REPO_BRANCH}`, { headers: headers(token) });
    if (r.status === 401) return { ok: false, error: "Token rejected by GitHub (401). Check that you copied it fully." };
    if (r.status === 403) return { ok: false, error: "Token lacks access to this repository (403). Grant it Contents read & write on the repo." };
    if (r.status === 404) return { ok: false, error: "Repository or data file not found. Make sure the token can access the repo." };
    if (!r.ok) return { ok: false, error: `GitHub returned ${r.status}.` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error reaching GitHub." };
  }
}

export async function fetchDataFile(
  token: string
): Promise<{ data: TransactionsFile; sha: string }> {
  const r = await fetch(`${API}?ref=${REPO_BRANCH}`, {
    headers: headers(token),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`GitHub read failed (${r.status})`);
  const json = await r.json();
  const data = JSON.parse(b64decode(json.content)) as TransactionsFile;
  if (!Array.isArray(data.transactions)) throw new Error("Unexpected data file format");
  return { data, sha: json.sha };
}

export async function commitDataFile(
  token: string,
  data: TransactionsFile,
  sha: string,
  message: string
): Promise<void> {
  const r = await fetch(API, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      branch: REPO_BRANCH,
      sha,
      content: b64encode(JSON.stringify(data, null, 2) + "\n"),
    }),
  });
  if (r.status === 409) throw new Error("CONFLICT");
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    throw new Error(body?.message || `GitHub write failed (${r.status})`);
  }
}
