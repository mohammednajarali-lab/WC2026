import { NextResponse } from "next/server";
import { fetchMatchEvents } from "@/lib/api";
import type { MatchEvent } from "@/lib/types";

// Per-match box score (goals, cards, subs). Fetched on demand so the main
// 30s poll stays well within the free-tier quota. Cached per fixture id.
// With no API key, returns an empty timeline — the seed data already carries a
// synthesized one inline, so the match page falls back to that.

export const dynamic = "force-dynamic";

const TTL_MS = 30_000;
const cache = new Map<string, { events: MatchEvent[]; at: number }>();

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const key = process.env.API_FOOTBALL_KEY;
  const id = params.id;
  const home = new URL(req.url).searchParams.get("home") ?? undefined;

  if (!key) return NextResponse.json({ events: [], source: "seed" });

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ events: hit.events, source: "api" });
  }

  try {
    const events = await fetchMatchEvents(key, id, home);
    cache.set(id, { events, at: Date.now() });
    return NextResponse.json({ events, source: "api" });
  } catch (err) {
    if (hit) return NextResponse.json({ events: hit.events, source: "api" });
    return NextResponse.json({ events: [], source: "api", error: String(err) });
  }
}
