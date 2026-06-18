import { NextResponse } from "next/server";
import { fetchMatchEvents } from "@/lib/api";
import type { MatchEvent } from "@/lib/types";

// Per-match box score (goals, cards, subs) + venue, scraped from FotMob's match
// page on demand so the main 60s poll stays cheap. Cached per fixture id.

export const dynamic = "force-dynamic";

const TTL_MS = 30_000;
const cache = new Map<string, { events: MatchEvent[]; venue?: { stadium?: string; city?: string }; at: number }>();

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  // The client passes FotMob's match page path (e.g. "/matches/.../#id") so we
  // can reach the right page; fall back to the bare id if it's missing.
  const pageUrl = new URL(req.url).searchParams.get("url") || id;

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ events: hit.events, venue: hit.venue, source: "api" });
  }

  try {
    const { events, venue } = await fetchMatchEvents(pageUrl);
    cache.set(id, { events, venue, at: Date.now() });
    return NextResponse.json({ events, venue, source: "api" });
  } catch (err) {
    if (hit) return NextResponse.json({ events: hit.events, venue: hit.venue, source: "api" });
    return NextResponse.json({ events: [], source: "api", error: String(err) });
  }
}
