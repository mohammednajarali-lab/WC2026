"use client";
import { useTournament } from "@/lib/useTournament";
import { usePlayerStats } from "@/lib/usePlayerStats";
import { StatLeaders } from "@/components/StatLeaders";
import { LiveStamp } from "@/components/LiveStamp";
import type { Match } from "@/lib/types";

export default function StatsPage() {
  const { data } = useTournament();
  const { data: stats, loading: statsLoading } = usePlayerStats();

  const matches = (data?.matches ?? []).filter(
    m => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null);

  const played = matches.length;
  const goals = matches.reduce((s, m) => s + m.homeScore! + m.awayScore!, 0);
  const avg = played ? (goals / played).toFixed(2) : "0.00";
  const biggest = biggestWin(matches);

  if (!data) return <p className="empty">Loading stats…</p>;

  return (
    <>
      <div className="pagehead">
        <h1 className="page">Stats</h1>
        <LiveStamp updatedAt={stats?.updatedAt ?? data.updatedAt} live={stats?.source === "api"} />
      </div>
      <p className="sub">
        Live player and team leaderboards from across the tournament — goals, assists,
        ratings and more, refreshing automatically as matches play out.
      </p>

      <div className="statgrid">
        <div className="stat">
          <h4>Tournament pulse</h4>
          <ol>
            <li>Matches played <span className="v num">{played}</span></li>
            <li>Goals scored <span className="v num">{goals}</span></li>
            <li>Goals per match <span className="v num">{avg}</span></li>
            {biggest && (
              <li>Biggest win
                <span className="v">{biggest.home!.code} {biggest.homeScore}–{biggest.awayScore} {biggest.away!.code}</span>
              </li>
            )}
          </ol>
        </div>
      </div>

      <h2 className="section">Leaderboards</h2>
      {statsLoading && !stats ? (
        <p className="empty">Loading leaderboards…</p>
      ) : stats && stats.categories.length ? (
        <StatLeaders categories={stats.categories} />
      ) : (
        <p className="empty">Leaderboards will appear once matches are under way.</p>
      )}
    </>
  );
}

function biggestWin(matches: Match[]): Match | null {
  let best: Match | null = null; let margin = -1;
  for (const m of matches) {
    const d = Math.abs(m.homeScore! - m.awayScore!);
    if (d > margin) { margin = d; best = m; }
  }
  return best;
}
