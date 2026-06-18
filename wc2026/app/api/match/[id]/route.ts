import { NextResponse } from "next/server";
import { fetchMatchEvents } from "@/lib/api";
import type { MatchDetailData } from "@/lib/types";

// Per-match box score: timeline of events + key match facts (team stats),
// match info and Player of the Match, scraped from FotMob's match page on
// demand so the main poll stays cheap. Cached per fixture id.

export const dynamic = "force-dynamic";

const TTL_MS = 20_000;
const cache = new Map<string, { data: MatchDetailData; at: number }>();

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // The client passes FotMob's match page path (e.g. "/matches/.../#id") so we
  // can reach the right page; fall back to the bare id if it's missing.
  const pageUrl = new URL(req.url).searchParams.get("url") || id;

  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data);
  }

  try {
    const data = await fetchMatchEvents(pageUrl);
    cache.set(id, { data, at: Date.now() });
    return NextResponse.json(data);
  } catch (err) {
    if (hit) return NextResponse.json(hit.data);
    return NextResponse.json({
      events: [], statGroups: [], info: {}, source: "api", error: String(err),
    } satisfies MatchDetailData);
  }
}
