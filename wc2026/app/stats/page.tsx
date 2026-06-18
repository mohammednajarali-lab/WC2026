"use client";
import { useTournament } from "@/lib/useTournament";
import { Flag } from "@/components/ui";
import type { Match, Team } from "@/lib/types";

export default function StatsPage() {
  const { data } = useTournament();
  const matches = (data?.matches ?? []).filter(
    m => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null);

  const played = matches.length;
  const goals = matches.reduce((s, m) => s + m.homeScore! + m.awayScore!, 0);
  const avg = played ? (goals / played).toFixed(2) : "0.00";
  const biggest = biggestWin(matches);

  const scoring = teamAgg(matches, (gf) => gf).slice(0, 6);   // goals for
  const defense = teamAgg(matches, undefined, (ga) => ga)
    .filter(t => t.played > 0)
    .sort((a, b) => a.against - b.against || b.played - a.played)
    .slice(0, 6);

  if (!data) return <p className="empty">Loading stats…</p>;

  return (
    <>
      <h1 className="page">Stats</h1>
      <p className="sub">
        The tournament by the numbers — updating live as matches finish.
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

        <div className="stat">
          <h4>Most goals scored</h4>
          <ol>
            {scoring.map(t => (
              <li key={t.team.id}>
                <Flag team={t.team} />{t.team.name}
                <span className="v num">{t.for}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="stat">
          <h4>Meanest defenses</h4>
          <ol>
            {defense.map(t => (
              <li key={t.team.id}>
                <Flag team={t.team} />{t.team.name}
                <span className="v num">{t.against} GA</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="foot">
        Player-level leaders (top scorers, assists, cards) come from the provider&apos;s
        players endpoint — wire <code>/players/topscorers?league=1&amp;season=2026</code> into
        a new card here when you want them.
      </p>
    </>
  );
}

interface Agg { team: Team; for: number; against: number; played: number; }

function teamAgg(
  matches: Match[],
  _byFor?: (gf: number) => number,
  _byAgainst?: (ga: number) => number,
): Agg[] {
  const map = new Map<string, Agg>();
  const add = (team: Team, gf: number, ga: number) => {
    const a = map.get(team.id) ?? { team, for: 0, against: 0, played: 0 };
    a.for += gf; a.against += ga; a.played += 1;
    map.set(team.id, a);
  };
  for (const m of matches) {
    if (!m.home || !m.away) continue;
    add(m.home, m.homeScore!, m.awayScore!);
    add(m.away, m.awayScore!, m.homeScore!);
  }
  return [...map.values()].sort((a, b) => b.for - a.for);
}

function biggestWin(matches: Match[]): Match | null {
  let best: Match | null = null; let margin = -1;
  for (const m of matches) {
    const d = Math.abs(m.homeScore! - m.awayScore!);
    if (d > margin) { margin = d; best = m; }
  }
  return best;
}
