"use client";
import { useEffect, useState, useMemo } from "react";
import type { TournamentData } from "./types";
import { computeStandings, rankThirdPlace, allGroupsComplete } from "./standings";
import { buildBracket } from "./bracket";
import { projectBracket } from "./projectBracket";

// Refresh cadence. We poll faster while matches are live so scores and the
// clock stay current, and ease off when nothing is in play.
const POLL_LIVE_MS = 10_000;
const POLL_IDLE_MS = 30_000;

export function useTournament() {
  const [data, setData] = useState<TournamentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        const json = (await res.json()) as TournamentData;
        // Anchor every live clock to the data's capture time so the UI can tick
        // it forward accurately, regardless of cache age or network latency.
        const anchor = json.updatedAt ? Date.parse(json.updatedAt) : Date.now();
        for (const m of json.matches ?? []) {
          if (m.clock) m.clock.anchorMs = anchor;
        }
        if (alive) { setData(json); setError(null); }
        return json;
      } catch (e) {
        if (alive) setError(String(e));
        return null;
      } finally {
        if (alive) setLoading(false);
      }
    }

    async function loop() {
      const json = await load();
      if (!alive) return;
      const anyLive = !!json?.matches?.some((m) => m.status === "LIVE");
      timer = setTimeout(loop, anyLive ? POLL_LIVE_MS : POLL_IDLE_MS);
    }

    loop();
    // Refresh immediately when the tab regains focus.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearTimeout(timer); window.removeEventListener("focus", onFocus); };
  }, []);

  const groupsDone = useMemo(
    () => data ? allGroupsComplete(data.matches) : false,
    [data]);

  // Always recompute standings from the live match results (including matches
  // in progress) so the tables reflect what's happening right now. The
  // provider's precomputed table omits live games, so we only fall back to it
  // once the group stage is complete (for authoritative final tiebreakers).
  const standings = useMemo(() => {
    if (!data) return null;
    const live = computeStandings(data.teams, data.matches);
    if (groupsDone && data.standings) return data.standings;
    return live;
  }, [data, groupsDone]);

  const thirds = useMemo(() => {
    if (groupsDone && data?.thirdPlace) return data.thirdPlace;
    return standings ? rankThirdPlace(standings) : [];
  }, [data, standings, groupsDone]);

  const bracket = useMemo(() => {
    const base = data?.bracket ?? (data ? buildBracket(data.teams, data.matches) : []);
    // Seed the Round of 32 from the current live standings so the bracket
    // reflects who is advancing right now, not only after the groups finish.
    return projectBracket(base, standings, thirds);
  }, [data, standings, thirds]);

  return { data, standings, thirds, bracket, groupsDone, loading, error };
}
