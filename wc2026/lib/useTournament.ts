"use client";
import { useEffect, useState, useMemo } from "react";
import type { TournamentData } from "./types";
import { computeStandings, bestThirdPlaced, allGroupsComplete } from "./standings";
import { buildBracket } from "./bracket";

const POLL_MS = 30_000;

export function useTournament() {
  const [data, setData] = useState<TournamentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/data", { cache: "no-store" });
        const json = await res.json();
        if (alive) { setData(json); setError(null); }
      } catch (e) {
        if (alive) setError(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Prefer the provider's official tables and bracket when they're present
  // (live data). For seed data, compute everything locally.
  const standings = useMemo(
    () => data?.standings ?? (data ? computeStandings(data.teams, data.matches) : null),
    [data]);
  const thirds = useMemo(
    () => data?.thirdPlace ?? (standings ? bestThirdPlaced(standings) : []),
    [data, standings]);
  const bracket = useMemo(
    () => data?.bracket ?? (data ? buildBracket(data.teams, data.matches) : []),
    [data]);
  const groupsDone = useMemo(
    () => data ? allGroupsComplete(data.matches) : false,
    [data]);

  return { data, standings, thirds, bracket, groupsDone, loading, error };
}
