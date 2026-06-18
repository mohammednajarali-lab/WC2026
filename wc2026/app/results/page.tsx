"use client";
import { useMemo, useState } from "react";
import { useTournament } from "@/lib/useTournament";
import { MatchCard } from "@/components/ui";
import { etDateKey, etSortKey } from "@/lib/venues";
import type { Match } from "@/lib/types";

type Filter = "ALL" | "GROUP" | "KO" | "LIVE";

export default function ResultsPage() {
  const { data } = useTournament();
  const [filter, setFilter] = useState<Filter>("ALL");
  const matches = data?.matches ?? [];

  const filtered = useMemo(() => {
    let ms = matches;
    if (filter === "GROUP") ms = ms.filter(m => m.stage === "GROUP");
    if (filter === "KO") ms = ms.filter(m => m.stage !== "GROUP");
    if (filter === "LIVE") ms = ms.filter(m => m.status === "LIVE" || m.status === "FINISHED");
    return ms;
  }, [matches, filter]);

  const days = useMemo(() => groupByDay(filtered), [filtered]);

  if (!data) return <p className="empty">Loading results…</p>;

  const finished = matches.filter(m => m.status === "FINISHED").length;
  const live = matches.filter(m => m.status === "LIVE").length;

  return (
    <>
      <h1 className="page">Results & schedule</h1>
      <p className="sub">
        Every match across all 104 fixtures — tap any match for its box score.
        {" "}{finished} played{live ? ` · ${live} live now` : ""}.
      </p>

      <div className="filters">
        {([["ALL","All"],["LIVE","Played & live"],["GROUP","Group stage"],["KO","Knockouts"]] as [Filter,string][])
          .map(([f, label]) => (
            <button
              key={f}
              className={`fbtn ${filter === f ? "on" : ""}`}
              onClick={() => setFilter(f)}
            >{label}</button>
          ))}
      </div>

      {days.length === 0 && <p className="empty">No matches to show.</p>}

      {days.map(([day, ms]) => (
        <section key={day} className="dayblock">
          <h2 className="dayhead">{day}</h2>
          <div className="grid">
            {ms.map(m => <MatchCard key={m.id} m={m} />)}
          </div>
        </section>
      ))}

      {data.source === "seed" && (
        <p className="foot">Sample schedule shown. Connect an API key for the official fixtures, venues and live scores.</p>
      )}
    </>
  );
}

function groupByDay(matches: Match[]): [string, Match[]][] {
  const map = new Map<string, { label: string; ms: Match[] }>();
  for (const m of matches) {
    const k = etSortKey(m.kickoff);
    const label = etDateKey(m.kickoff);
    if (!map.has(k)) map.set(k, { label, ms: [] });
    map.get(k)!.ms.push(m);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => {
      v.ms.sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff)
        || (a.matchNumber ?? 0) - (b.matchNumber ?? 0));
      return [v.label, v.ms] as [string, Match[]];
    });
}
