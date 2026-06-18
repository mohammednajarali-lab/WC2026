"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTournament } from "@/lib/useTournament";
import { Flag, stageName, StatusPill } from "@/components/ui";
import { formatET, whereLabel } from "@/lib/venues";
import MatchStats from "@/components/MatchStats";
import type { Match, MatchDetailData, MatchEvent } from "@/lib/types";

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useTournament();
  const [detail, setDetail] = useState<MatchDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  const match = data?.matches.find(m => m.id === id) ?? null;

  // Fetch the live FotMob box score for this fixture (skip for unplayed games
  // and for seed data, which carries no provider page).
  useEffect(() => {
    if (!match) return;
    if (data?.source !== "api" || match.status === "SCHEDULED") { setDetail(null); return; }
    let alive = true;
    setLoading(true);
    const qs = match.pageUrl ? `?url=${encodeURIComponent(match.pageUrl)}` : "";
    fetch(`/api/match/${encodeURIComponent(match.id)}${qs}`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (alive) setDetail(j); })
      .catch(() => { if (alive) setDetail(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [match?.id, match?.status, data?.source]);

  if (!data) return <p className="empty">Loading…</p>;
  if (!match) return (
    <>
      <p className="empty">Match not found.</p>
      <p style={{ textAlign: "center" }}><Link className="back" href="/results">← All results</Link></p>
    </>
  );

  const where = whereLabel({
    stadium: detail?.info.stadium ?? match.stadium,
    city: detail?.info.city ?? match.city,
    venue: match.venue,
  });
  const events = detail?.events ?? [];
  const scheduled = match.status === "SCHEDULED";

  return (
    <>
      <Link className="back" href="/results">← All results</Link>

      <div className="mhead">
        <div className="mhead-top">
          <span>
            {match.matchNumber ? <b className="mno">Match {match.matchNumber}</b> : null}
            {match.group ? `Group ${match.group}` : stageName(match.stage)}
          </span>
          <StatusPill m={match} />
        </div>

        <div className="scoreline">
          <TeamBlock m={match} side="home" />
          <div className="bigscore num">
            {scheduled
              ? <span className="vs">vs</span>
              : <>{match.homeScore ?? 0}<span className="dash">–</span>{match.awayScore ?? 0}</>}
            {match.homePens != null && match.awayPens != null && (
              <div className="penline num">pens {match.homePens}–{match.awayPens}</div>
            )}
          </div>
          <TeamBlock m={match} side="away" />
        </div>

        <div className="mhead-meta">
          <span>{formatET(detail?.info.kickoff ?? match.kickoff)}</span>
          {where && <span>{where}</span>}
          {detail?.info.referee && <span>Referee: {detail.info.referee}</span>}
          {detail?.info.attendance ? <span>Att: {detail.info.attendance.toLocaleString()}</span> : null}
        </div>

        {detail?.motm && (
          <div className="motm">
            <span className="motm-tag">Player of the match</span>
            <span className="motm-name">{detail.motm.name}</span>
            {detail.motm.teamName && <span className="motm-team">{detail.motm.teamName}</span>}
            {detail.motm.rating && <span className="motm-rating num">{detail.motm.rating}</span>}
          </div>
        )}
      </div>

      <h2 className="sectiontitle">Timeline</h2>
      {scheduled ? (
        <p className="empty">The match timeline appears here once the game kicks off.</p>
      ) : loading && !detail ? (
        <p className="empty">Loading match facts…</p>
      ) : events.length === 0 ? (
        <p className="empty">No event detail available for this match yet.</p>
      ) : (
        <Timeline events={events} match={match} />
      )}

      {detail && detail.statGroups.length > 0 && (
        <>
          <h2 className="sectiontitle">Key match facts</h2>
          <div className="msteamhead">
            <span><Flag team={match.home} /> {match.home?.code}</span>
            <span>{match.away?.code} <Flag team={match.away} /></span>
          </div>
          <MatchStats groups={detail.statGroups} />
        </>
      )}
    </>
  );
}

function Timeline({ events, match }: { events: MatchEvent[]; match: Match }) {
  return (
    <ul className="timeline">
      {events.map((e, i) => {
        if (e.type === "PERIOD" || e.type === "ADDED") {
          return (
            <li key={i} className="tl marker">
              <span className="tl-marker-line" />
              <span className="tl-marker-text">{e.text}{e.minute ? ` · ${min(e)}` : ""}</span>
            </li>
          );
        }
        return (
          <li key={i} className={`tl ${e.side}`}>
            <span className="tl-min num">{min(e)}</span>
            <span className="tl-ico" aria-hidden>{icon(e)}</span>
            <span className="tl-body">
              <b>{e.player ?? (e.side === "home" ? match.home?.name : match.away?.name)}</b>
              {e.type === "GOAL" && e.score && (
                <span className="tl-score num"> {e.score[0]}–{e.score[1]}</span>
              )}
              {e.type === "GOAL" && e.assist && <span className="tl-sub"> assist: {e.assist}</span>}
              {e.type === "GOAL" && e.detail && <span className="tl-sub"> · {e.detail}</span>}
              {e.type === "SUBST" && e.playerOut && <span className="tl-sub"> ↓ {e.playerOut}</span>}
              {e.type === "CARD" && e.detail && <span className="tl-sub"> · {e.detail}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TeamBlock({ m, side }: { m: Match; side: "home" | "away" }) {
  const team = side === "home" ? m.home : m.away;
  return (
    <div className="tblock">
      <Flag team={team} />
      <span className="tname">{team?.name ?? "TBD"}</span>
      <span className="tcode">{team?.code ?? ""}</span>
    </div>
  );
}

function min(e: MatchEvent): string {
  return e.extra ? `${e.minute}+${e.extra}'` : `${e.minute}'`;
}
function icon(e: MatchEvent): string {
  if (e.type === "GOAL") return "⚽";
  if (e.type === "CARD") return e.card === "Red" ? "🟥" : "🟨";
  if (e.type === "SUBST") return "🔁";
  if (e.type === "VAR") return "📺";
  return "•";
}
