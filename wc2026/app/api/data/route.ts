import { NextResponse } from "next/server";
import { fetchTournament } from "@/lib/api";
import { seedData } from "@/lib/seed";
import type { TournamentData } from "@/lib/types";

// Serverless route. Pulls the live World Cup data from FotMob on the server and
// caches it briefly so a flood of visitors doesn't hammer the source. Falls back
// to the last good cache, then to seed data, so the site never goes dark.

export const dynamic = "force-dynamic";

let cache: { data: TournamentData; at: number } | null = null;
const TTL_MS = 15_000; // 15s: fresh for the live clock, still gentle on the source

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, { headers: cacheHeaders() });
  }

  try {
    const data = await fetchTournament();
    cache = { data, at: Date.now() };
    return NextResponse.json(data, { headers: cacheHeaders() });
  } catch (err) {
    // Don't take the site down if FotMob hiccups — serve last good cache, or
    // seed as a last resort.
    if (cache) return NextResponse.json(cache.data, { headers: cacheHeaders() });
    const data = seedData();
    return NextResponse.json(
      { ...data, error: String(err) },
      { headers: cacheHeaders() },
    );
  }
}

function cacheHeaders() {
  return {
    "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
  };
}
