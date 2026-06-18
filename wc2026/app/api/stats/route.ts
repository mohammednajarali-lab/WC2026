import { NextResponse } from "next/server";
import { fetchPlayerStats } from "@/lib/api";
import type { PlayerStats } from "@/lib/types";

// Live player & team leaderboards from FotMob. Cached briefly so a burst of
// visitors doesn't hammer the source; falls back to the last good cache.

export const dynamic = "force-dynamic";

let cache: { data: PlayerStats; at: number } | null = null;
const TTL_MS = 60_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, { headers: cacheHeaders() });
  }
  try {
    const data = await fetchPlayerStats();
    cache = { data, at: Date.now() };
    return NextResponse.json(data, { headers: cacheHeaders() });
  } catch (err) {
    if (cache) return NextResponse.json(cache.data, { headers: cacheHeaders() });
    return NextResponse.json(
      { categories: [], updatedAt: new Date().toISOString(), source: "seed", error: String(err) } satisfies PlayerStats,
      { headers: cacheHeaders() },
    );
  }
}

function cacheHeaders() {
  return { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };
}
