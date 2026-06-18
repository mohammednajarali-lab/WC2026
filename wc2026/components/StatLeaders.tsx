"use client";
import { useState } from "react";
import type { StatCategory, StatLeader } from "@/lib/types";

function teamCrest(teamId?: string): string | null {
  return teamId ? `https://images.fotmob.com/image_resources/logo/teamlogo/${teamId}.png` : null;
}

function fmt(value: number, fractions = 0): string {
  return Number.isFinite(value) ? value.toFixed(fractions) : "–";
}

function hideOnError(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
}

function Avatar({ leader }: { leader: StatLeader }) {
  if (leader.image) {
    return (
      <span className="avatar">
        <img src={leader.image || "/placeholder.svg"} alt="" loading="lazy" onError={hideOnError} />
      </span>
    );
  }
  const crest = teamCrest(leader.teamId);
  return (
    <span className="avatar crest">
      {crest ? <img src={crest || "/placeholder.svg"} alt="" loading="lazy" onError={hideOnError} /> : null}
    </span>
  );
}

function LeaderRow({ leader, fractions }: { leader: StatLeader; fractions?: number }) {
  const crest = teamCrest(leader.teamId);
  return (
    <li className="lrow">
      <span className="lrank num">{leader.rank}</span>
      <Avatar leader={leader} />
      <span className="lname">
        <span className="ln">{leader.name}</span>
        <span className="lt">
          {crest && leader.image ? (
            <img className="ltlogo" src={crest || "/placeholder.svg"} alt="" loading="lazy" onError={hideOnError} />
          ) : null}
          {leader.teamName ?? leader.ccode ?? ""}
        </span>
      </span>
      <span className="lval num">{fmt(leader.value, fractions)}</span>
    </li>
  );
}

export function StatLeaderboard({ category }: { category: StatCategory }) {
  const [expanded, setExpanded] = useState(false);
  const top = category.leaders.slice(0, expanded ? category.leaders.length : 5);
  const canExpand = category.leaders.length > 5;
  return (
    <div className="lcard">
      <div className="lhead">
        <h4>{category.title}</h4>
        <span className="ltag">{category.kind === "team" ? "Team" : "Player"}</span>
      </div>
      <ol className="llist">
        {top.map((l) => (
          <LeaderRow key={`${category.key}-${l.id}-${l.rank}`} leader={l} fractions={category.fractions} />
        ))}
      </ol>
      {canExpand && (
        <button className="lmore" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `Show all ${category.leaders.length}`}
        </button>
      )}
    </div>
  );
}

export function StatLeaders({ categories }: { categories: StatCategory[] }) {
  const players = categories.filter((c) => c.kind === "player");
  const teams = categories.filter((c) => c.kind === "team");
  const [tab, setTab] = useState<"player" | "team">("player");
  const shown = tab === "player" ? players : teams;

  return (
    <section className="leaders">
      <div className="ltabs" role="tablist" aria-label="Stat type">
        <button
          role="tab"
          aria-selected={tab === "player"}
          className={tab === "player" ? "on" : ""}
          onClick={() => setTab("player")}
        >
          Players
        </button>
        <button
          role="tab"
          aria-selected={tab === "team"}
          className={tab === "team" ? "on" : ""}
          onClick={() => setTab("team")}
        >
          Teams
        </button>
      </div>
      <div className="lgrid">
        {shown.map((c) => (
          <StatLeaderboard key={c.key} category={c} />
        ))}
      </div>
    </section>
  );
}
