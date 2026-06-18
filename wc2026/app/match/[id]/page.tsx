"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTournament } from "@/lib/useTournament";
import { Flag, stageName, statusLabel } from "@/components/ui";
import { formatET, whereLabel } from "@/lib/venues";
import type { Match, MatchEvent } from "@/lib/types";

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useTournament();
  const [events, setEvents] = useState<MatchEvent[] | null>(null);

  const match = data?.matches.find(m => m.id === id) ?? null;

  // Use inline events (seed) if present; otherwise fetch the live box score.
  useEffect(() => {
    if (!match) return;
    if (match.events && match.events.length) { setEvents(match.events); return; }
    if (data?.source !== "api" || match.status === "SCHEDULED") { setEvents([]); return; }
    let alive = true;
    const home = match.home?.id ? `?home=${encodeURIComponent(match.home.id)}` : "";
    fetch(`/api/match/${encodeURIComponent(match.id)}${home}`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (alive) setEvents(j.events ?? []); })
      .catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, [match, data?.source]);

  if (!data) return <p className="empty">Loading…</p>;
  if (!match) return (
    <>
      <p className="empty">Match not found.</p>
      <p style={{ textAlign: "center" }}><Link className="back" href="/results">← All results</Link></p>
    </>
  );

  const s = statusLabel(match);
  const where = whereLabel(match);
  const goals = (events ?? []).filter(e => e.type === "GOAL");

  return (
    <>
      <Link className="back" href="/results">← All results</Link>

      <div className="mhead">
        <div className="mhead-top">
          <span>
            {match.matchNumber ? <b className="mno">Match {match.matchNumber}</b> : null}
            {match.group ? `Group ${match.group}` : stageName(match.stage)}
          </span>
          <span className={`pill ${s.cls}`}>{s.text}</span>
        </div>

        <div className="scoreline">
          <TeamBlock m={match} side="home" />
          <div className="bigscore num">
            {match.status === "SCHEDULED"
              ? <span className="vs">vs</span>
              : <>{match.homeScore ?? 0}<span className="dash">–</span>{match.awayScore ?? 0}</>}
            {match.homePens != null && match.awayPens != null && (
              <div className="penline num">pens {match.homePens}–{match.awayPens}</div>
            )}
          </div>
          <TeamBlock m={match} side="away" />
        </div>

        <div className="mhead-meta">
          <span>🗓 {formatET(match.kickoff)}</span>
          {where && <span>📍 {where}</span>}
        </div>
      </div>

      <h2 className="sectiontitle">Box score</h2>
      {events === null ? (
        <p className="empty">Loading box score…</p>
      ) : events.length === 0 ? (
        <p className="empty">
          {match.status === "SCHEDULED"
            ? "Goal timeline appears here once the match kicks off."
            : "No event detail available for this match yet."}
        </p>
      ) : (
        <>
          {goals.length > 0 && (
            <div className="goalstrip">
              {goals.map((e, i) => (
                <span key={i} className={`gchip ${e.side}`}>
                  ⚽ {e.player ?? (e.side === "home" ? match.home?.code : match.away?.code)} {min(e)}
                </span>
              ))}
            </div>
          )}
          <ul className="timeline">
            {events.map((e, i) => (
              <li key={i} className={`tl ${e.side}`}>
                <span className="tl-min num">{min(e)}</span>
                <span className="tl-ico">{icon(e)}</span>
                <span className="tl-body">
                  <b>{e.player ?? (e.side === "home" ? match.home?.name : match.away?.name)}</b>
                  {e.assist && e.type === "GOAL" && <span className="tl-sub"> · assist {e.assist}</span>}
                  {e.detail && e.type !== "GOAL" && <span className="tl-sub"> · {e.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.source === "seed" && match.status === "FINISHED" && (
        <p className="foot">Sample timeline (scorers shown once a live API key is connected).</p>
      )}
    </>
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
  if (e.type === "GOAL") return e.detail?.toLowerCase().includes("own") ? "⚽(OG)" : "⚽";
  if (e.type === "CARD") return e.detail?.toLowerCase().includes("red") ? "🟥" : "🟨";
  if (e.type === "SUBST") return "🔁";
  if (e.type === "VAR") return "📺";
  return "•";
}
