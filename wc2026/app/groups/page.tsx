"use client";
import Link from "next/link";
import { useTournament } from "@/lib/useTournament";
import { Flag, LiveMinuteText } from "@/components/ui";
import { LiveStamp } from "@/components/LiveStamp";
import { GROUPS } from "@/lib/standings";
import { formatETShort } from "@/lib/venues";
import type { Match, StandingRow } from "@/lib/types";

export default function GroupsPage() {
  const { standings, thirds, groupsDone, data } = useTournament();
  if (!standings) return <p className="empty">Loading standings…</p>;

  const qualifiedThirds = thirds.filter((t, i) => t.qualified ?? i < 8);
  const thirdIds = new Set(qualifiedThirds.map(t => t.team.id));
  const matchesByGroup = groupMatches(data?.matches ?? []);

  return (
    <>
      <div className="pagehead">
        <h1 className="page">Groups</h1>
        <LiveStamp updatedAt={data?.updatedAt} live={data?.source === "api"} />
      </div>
      <p className="sub">
        Top two of every group qualify automatically. The eight best third-placed teams
        take the remaining knockout spots — so third place is its own live race.
      </p>

      <div className="groups">
        {GROUPS.map(g => (
          <div className="gcard" key={g}>
            <h3><span>Group {g}</span></h3>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th>
                  <th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings[g].map(r => (
                  <tr key={r.team.id} className={rowClass(r, thirdIds)}>
                    <td className="num">{r.rank}</td>
                    <td><span className="teamcell"><Flag team={r.team} />{r.team.name}</span></td>
                    <td className="num">{r.played}</td>
                    <td className="num">{r.won}</td>
                    <td className="num">{r.drawn}</td>
                    <td className="num">{r.lost}</td>
                    <td className="num">{r.goalsFor}</td>
                    <td className="num">{r.goalsAgainst}</td>
                    <td className="num">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                    <td className="num ptscol">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <GroupResults matches={matchesByGroup[g] ?? []} />
          </div>
        ))}
      </div>

      <h2 className="sectiontitle">Third-place race</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        {groupsDone
          ? "Final standings — these eight third-placed teams advanced."
          : "Provisional — updates live as group matches finish. Green = currently in."}
      </p>
      <div className="thirds">
        {thirds.map((r, i) => {
          const isIn = r.qualified ?? i < 8;
          return (
            <div key={r.team.id} className={`third ${isIn ? "in" : "out"}`}>
              <span className="rk num">{i + 1}</span>
              <Flag team={r.team} />
              <span>{r.team.name}</span>
              <span className="pts num">{r.points}p · {r.group}</span>
            </div>
          );
        })}
      </div>

      {data?.source === "seed" && (
        <p className="foot">Sample arrangement shown. Connect an API key for the official groups and live tables.</p>
      )}
    </>
  );
}

function rowClass(r: StandingRow, thirdIds: Set<string>) {  if (r.rank <= 2) return r.rank === 1 ? "q1" : "q2";
  if (r.rank === 3 && thirdIds.has(r.team.id)) return "q3";
  return "";
}

function GroupResults({ matches }: { matches: Match[] }) {
  if (!matches.length) return null;
  return (
    <div className="gresults">
      {matches.map(m => {
        const done = m.status !== "SCHEDULED";
        const hw = done && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore;
        const aw = done && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore;
        return (
          <Link key={m.id} href={`/match/${m.id}`} className="gr">
            <span className="gr-no num">#{m.matchNumber ?? "–"}</span>
            <span className={`gr-t ${hw ? "w" : ""}`}><Flag team={m.home} />{m.home?.code ?? "TBD"}</span>
            <span className="gr-sc num">
              {done ? `${m.homeScore}–${m.awayScore}` : <span className="gr-time">{formatETShort(m.kickoff)}</span>}
            </span>
            <span className={`gr-t a ${aw ? "w" : ""}`}>{m.away?.code ?? "TBD"}<Flag team={m.away} /></span>
            <span className={`gr-st ${m.status === "LIVE" ? "live" : ""}`}>
              {m.status === "LIVE" ? <LiveMinuteText m={m} /> : m.status === "FINISHED" ? "FT" : ""}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function groupMatches(matches: Match[]): Record<string, Match[]> {
  const out: Record<string, Match[]> = {};
  for (const m of matches) {
    if (m.stage !== "GROUP" || !m.group) continue;
    (out[m.group] ??= []).push(m);
  }
  for (const g of Object.keys(out)) {
    out[g].sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff)
      || (a.matchNumber ?? 0) - (b.matchNumber ?? 0));
  }
  return out;
}
