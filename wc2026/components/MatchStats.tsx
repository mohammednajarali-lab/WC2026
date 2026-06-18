import type { MatchStatGroup } from "@/lib/types";

// A single comparison row: label centered, values on each side, and a split
// bar showing each team's share of the metric (FotMob "Key match facts" style).
function StatRow({ label, home, away, homeNum, awayNum }: {
  label: string; home: string; away: string; homeNum?: number; awayNum?: number;
}) {
  const hasBar = homeNum != null && awayNum != null && homeNum + awayNum > 0;
  const total = (homeNum ?? 0) + (awayNum ?? 0);
  const homePct = hasBar ? Math.round((homeNum! / total) * 100) : 50;
  const homeLeads = (homeNum ?? 0) >= (awayNum ?? 0);

  return (
    <div className="msrow">
      <div className="msvals">
        <span className={`msv ${homeLeads ? "lead" : ""}`}>{home}</span>
        <span className="mslabel">{label}</span>
        <span className={`msv ${!homeLeads ? "lead" : ""}`}>{away}</span>
      </div>
      {hasBar && (
        <div className="msbar" role="presentation">
          <span className="msbar-h" style={{ width: `${homePct}%` }} />
          <span className="msbar-a" style={{ width: `${100 - homePct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function MatchStats({ groups }: { groups: MatchStatGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="msgroups">
      {groups.map((g) => (
        <section className="msgroup" key={g.title}>
          <h3 className="mstitle">{g.title}</h3>
          {g.stats.map((s) => <StatRow key={s.label} {...s} />)}
        </section>
      ))}
    </div>
  );
}
