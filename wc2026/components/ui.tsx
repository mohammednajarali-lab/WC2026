"use client";
import Link from "next/link";
import type { Match, Team } from "@/lib/types";
import { formatETShort, formatETTime, whereLabel } from "@/lib/venues";
import { useNow, liveClockLabel } from "@/lib/clock";

export function Flag({ team }: { team: Team | null }) {
  if (!team) return <span className="flag">·</span>;
  const isUrl = team.flag?.startsWith("http");
  return (
    <span className="flag">
      {isUrl
        ? <img
            src={team.flag}
            alt=""
            loading="lazy"
            // Knockout placeholders (e.g. "1E") have no real crest yet — hide
            // the broken image rather than showing a torn-image icon.
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        : (team.flag ?? "🏳️")}
    </span>
  );
}

export function statusLabel(m: Match): { text: string; cls: string } {
  if (m.status === "LIVE") return { text: m.minute ? `${m.minute}'` : "LIVE", cls: "live" };
  if (m.status === "FINISHED") return { text: "FT", cls: "ft" };
  return { text: formatETShort(m.kickoff), cls: "" };
}

// Live-ticking minute text, e.g. "45+2'". Falls back to "LIVE" with no clock.
export function LiveMinuteText({ m }: { m: Match }) {
  const now = useNow();
  if (m.status !== "LIVE") return null;
  return <>{m.clock ? liveClockLabel(m.clock, now) : "LIVE"}</>;
}

// The status pill shown on every match card: a ticking minute while live,
// otherwise FT or the scheduled Eastern kickoff time.
export function StatusPill({ m }: { m: Match }) {
  if (m.status === "LIVE") {
    return <span className="pill live"><LiveMinuteText m={m} /></span>;
  }
  const s = statusLabel(m);
  return <span className={`pill ${s.cls}`}>{s.text}</span>;
}

function sideClass(m: Match, side: "home" | "away") {
  if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) return "";
  const a = side === "home" ? m.homeScore : m.awayScore;
  const b = side === "home" ? m.awayScore : m.homeScore;
  if (a === b) {
    const pa = side === "home" ? m.homePens : m.awayPens;
    const pb = side === "home" ? m.awayPens : m.homePens;
    if (pa != null && pb != null) return pa > pb ? "win" : "lose";
    return "";
  }
  return a > b ? "win" : "lose";
}

export function MatchCard({ m }: { m: Match }) {
  const showScore = m.status !== "SCHEDULED";
  const where = whereLabel(m);
  return (
    <Link href={`/match/${m.id}`} className="match" aria-label="View match details">
      <div className="top">
        <span>
          {m.matchNumber ? <b className="mno">#{m.matchNumber}</b> : null}
          {m.group ? `Group ${m.group}` : stageName(m.stage)}
        </span>
        <StatusPill m={m} />
      </div>
      <Side m={m} side="home" showScore={showScore} />
      <Side m={m} side="away" showScore={showScore} />
      <div className="mmeta">
        <span>{m.status === "SCHEDULED" ? formatETTime(m.kickoff) : formatETShort(m.kickoff)}</span>
        {where && <span className="venue">{where}</span>}
      </div>
    </Link>
  );
}

function Side({ m, side, showScore }: { m: Match; side: "home" | "away"; showScore: boolean }) {
  const team = side === "home" ? m.home : m.away;
  const score = side === "home" ? m.homeScore : m.awayScore;
  const pens = side === "home" ? m.homePens : m.awayPens;
  const cls = sideClass(m, side);
  return (
    <div className="side">
      <span className="name">
        <Flag team={team} />
        <span className={cls}>{team?.name ?? "TBD"}</span>
      </span>
      <span className={`score num ${cls}`}>
        {showScore && score != null ? score : "–"}
        {pens != null && <span className="pens num">({pens})</span>}
      </span>
    </div>
  );
}

export function stageName(s: string): string {
  return ({
    GROUP: "Group", R32: "Round of 32", R16: "Round of 16",
    QF: "Quarter-final", SF: "Semi-final", THIRD_PLACE: "3rd place", FINAL: "Final",
  } as Record<string, string>)[s] ?? s;
}

export function Ticker({ matches }: { matches: Match[] }) {
  if (!matches.length) return null;
  return (
    <div className="ticker">
      {matches.map(m => {
        const s = statusLabel(m);
        const isLive = m.status === "LIVE";
        return (
          <div className="tcard" key={m.id}>
            <div className="meta">
              <span>{m.group ? `GRP ${m.group}` : stageName(m.stage)}</span>
              <span style={{ color: isLive ? "var(--red)" : undefined }}>
                {isLive ? <LiveMinuteText m={m} /> : s.text}
              </span>
            </div>
            <div className="trow">
              <span className="t"><Flag team={m.home} />{m.home?.code ?? "TBD"}</span>
              <span className="sc num">{m.homeScore ?? "–"}</span>
            </div>
            <div className="trow">
              <span className="t"><Flag team={m.away} />{m.away?.code ?? "TBD"}</span>
              <span className="sc num">{m.awayScore ?? "–"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
