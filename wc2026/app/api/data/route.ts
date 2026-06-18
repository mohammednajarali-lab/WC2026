import { NextResponse } from "next/server";
import { fetchTournament } from "@/lib/api";
import { seedData } from "@/lib/seed";
import type { TournamentData } from "@/lib/types";

// Serverless route. Runs on Vercel, keeps the API key server-side, and caches
// the upstream response briefly so a flood of visitors doesn't burn the daily
// request quota. Falls back to seed data if no key is set or the API errors.

export const dynamic = "force-dynamic";

let cache: { data: TournamentData; at: number } | null = null;
const TTL_MS = 30_000; // 30s: fresh enough for live, gentle on the quota

export async function GET() {
  const key = process.env.API_FOOTBALL_KEY;

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.data, { headers: cacheHeaders() });
  }

  if (!key) {
    const data = seedData();
    return NextResponse.json(data, { headers: cacheHeaders() });
  }

  try {
    const data = await fetchTournament(key);
    cache = { data, at: Date.now() };
    return NextResponse.json(data, { headers: cacheHeaders() });
  } catch (err) {
    // Don't take the site down if the provider hiccups — serve last good
    // cache, or seed as a last resort.
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
    "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
  };
}
