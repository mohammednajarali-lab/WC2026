"use client";
import { useEffect, useState, useMemo } from "react";
import type { TournamentData } from "./types";
import { computeStandings, bestThirdPlaced, allGroupsComplete } from "./standings";
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

  // Prefer the provider's official tables and bracket when they're present
  // (live data). For seed data, compute everything locally.
  const standings = useMemo(
    () => data?.standings ?? (data ? computeStandings(data.teams, data.matches) : null),
    [data]);
  const thirds = useMemo(
    () => data?.thirdPlace ?? (standings ? bestThirdPlaced(standings) : []),
    [data, standings]);
  const bracket = useMemo(() => {
    const base = data?.bracket ?? (data ? buildBracket(data.teams, data.matches) : []);
    // Seed the Round of 32 from the current live standings so the bracket
    // reflects who is advancing right now, not only after the groups finish.
    return projectBracket(base, standings, thirds);
  }, [data, standings, thirds]);
  const groupsDone = useMemo(
    () => data ? allGroupsComplete(data.matches) : false,
    [data]);

  return { data, standings, thirds, bracket, groupsDone, loading, error };
}
