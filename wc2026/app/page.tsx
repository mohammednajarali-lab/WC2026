"use client";
import { useMemo, useState } from "react";
import { useTournament } from "@/lib/useTournament";
import { MatchCard, Ticker } from "@/components/ui";
import { LiveStamp } from "@/components/LiveStamp";
import { MatchFilters, emptyFilter, matchPasses, filterActive, type MatchFilterState } from "@/components/MatchFilters";
import type { Match } from "@/lib/types";

function isToday(iso: string) {
  const d = new Date(iso); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function Home() {
  const { data } = useTournament();
  const [tf, setTf] = useState<MatchFilterState>(emptyFilter);
  const allMatches = data?.matches ?? [];
  const matches = useMemo(() => allMatches.filter(m => matchPasses(m, tf)), [allMatches, tf]);

  const allLive = allMatches.filter(m => m.status === "LIVE");
  const live = matches.filter(m => m.status === "LIVE");
  const today = matches.filter(m => isToday(m.kickoff) && m.status !== "LIVE");
  // When a filter is active, don't cap the lists — show every matching fixture.
  const cap = filterActive(tf) ? Infinity : 9;
  const recent = matches
    .filter(m => m.status === "FINISHED")
    .sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff))
    .slice(0, cap);
  const upcoming = matches
    .filter(m => m.status === "SCHEDULED")
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff))
    .slice(0, cap);

  return (
    <>
      <div className="statusbar">
        {allLive.length > 0
          ? <><span className="dot live" /> <span>{allLive.length} match{allLive.length > 1 ? "es" : ""} live now</span></>
          : <span>No matches live right now</span>}
        <span>·</span>
        <span>{allMatches.length} fixtures</span>
        {data?.source === "seed" && <span className="pill seed">Sample data — source unavailable</span>}
        <span className="spacer" />
        <LiveStamp updatedAt={data?.updatedAt} live={data?.source === "api"} />
      </div>

      <h1 className="page">The 48 are here.</h1>
      <p className="sub">
        Every match, every group, and a knockout bracket that fills itself in as results land —
        across 16 cities in the USA, Canada and Mexico.
      </p>

      <MatchFilters matches={allMatches} value={tf} onChange={setTf} />

      {allLive.length > 0 && <Ticker matches={allLive} />}

      <Section title="Live & today">
        {[...live, ...today].length
          ? <div className="grid">{[...live, ...today].map(m => <MatchCard key={m.id} m={m} />)}</div>
          : <p className="empty">Nothing scheduled for today. Check the upcoming fixtures below.</p>}
      </Section>

      <Section title="Latest results">
        <Grid matches={recent} empty="Results show here once matches finish." />
      </Section>

      <Section title="Upcoming">
        <Grid matches={upcoming} empty="No upcoming fixtures." />
      </Section>

      <p className="foot">
        {data?.source === "api"
          ? "Live source connected — scores and the match clock refresh automatically every few seconds while games are in play."
          : "Showing sample data — the live source is currently unavailable."}
      </p>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<><h2 className="sectiontitle">{title}</h2>{children}</>);
}
function Grid({ matches, empty }: { matches: Match[]; empty: string }) {
  if (!matches.length) return <p className="empty">{empty}</p>;
  return <div className="grid">{matches.map(m => <MatchCard key={m.id} m={m} />)}</div>;
}
