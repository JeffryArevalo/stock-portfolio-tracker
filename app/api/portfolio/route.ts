import { NextResponse } from "next/server";
import { DATA_PATH, REPO_BRANCH, REPO_NAME, REPO_OWNER } from "@/lib/config";
import type { TransactionsFile } from "@/lib/types";
import fallback from "@/data/transactions.json";

export const dynamic = "force-dynamic";

const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${DATA_PATH}`;

/**
 * Serves the trade log. Reads the latest committed data/transactions.json
 * straight from GitHub so new trades appear without a redeploy; falls back
 * to the copy bundled at build time if GitHub is unreachable.
 */
export async function GET() {
  let data: TransactionsFile = fallback as TransactionsFile;
  try {
    const r = await fetch(RAW_URL, { next: { revalidate: 60 } });
    if (r.ok) {
      const json = await r.json();
      if (json && Array.isArray(json.transactions)) data = json;
    }
  } catch {
    // fall back to bundled copy
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
