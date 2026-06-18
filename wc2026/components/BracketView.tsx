import type { BracketSlot, SlotSource, Stage, Team } from "@/lib/types";
import { Flag } from "./ui";

const ROUND_ORDER: { stage: Stage; title: string }[] = [
  { stage: "R32", title: "Round of 32" },
  { stage: "R16", title: "Round of 16" },
  { stage: "QF", title: "Quarter-finals" },
  { stage: "SF", title: "Semi-finals" },
  { stage: "FINAL", title: "Final" },
];

function sourceTeam(src: SlotSource): Team | null {
  return src.kind === "team" ? src.team : null;
}

function sourceLabel(src: SlotSource): string {
  switch (src.kind) {
    case "winner-group": return `Winner ${src.group}`;
    case "runner-group": return `Runner-up ${src.group}`;
    case "third": return "3rd place";
    case "winner-match": return `Winner ${src.matchId.replace("R32-", "M")}`;
    case "loser-match": return `Loser ${src.matchId}`;
    default: return "TBD";
  }
}

function Row({ src, result, which }: {
  src: SlotSource; which: "home" | "away";
  result?: BracketSlot["result"];
}) {
  const team = sourceTeam(src);
  if (result) {
    const t = which === "home" ? result.home : result.away;
    const sc = which === "home" ? result.homeScore : result.awayScore;
    const pens = which === "home" ? result.homePens : result.awayPens;
    const won = result.winner === which;
    return (
      <div className={`row ${won ? "w" : "l"}`}>
        <span className="nm"><Flag team={t} />{t.name}</span>
        <span className="sc num">{sc}{pens != null && <span className="pens">({pens})</span>}</span>
      </div>
    );
  }
  if (team) {
    return (
      <div className="row">
        <span className="nm"><Flag team={team} />{team.name}</span>
        <span className="sc num">–</span>
      </div>
    );
  }
  return (
    <div className="row tbd">
      <span className="nm">{sourceLabel(src)}</span>
      <span className="sc num">·</span>
    </div>
  );
}

function Tie({ slot }: { slot: BracketSlot }) {
  return (
    <div className="tie">
      <div className="lbl">{slot.label}</div>
      <Row src={slot.home} which="home" result={slot.result} />
      <Row src={slot.away} which="away" result={slot.result} />
    </div>
  );
}

export default function BracketView({ slots }: { slots: BracketSlot[] }) {
  const byStage = (s: Stage) => slots.filter(x => x.stage === s);
  const finalSlot = byStage("FINAL")[0];
  const champion = finalSlot?.result?.winner
    ? finalSlot.result[finalSlot.result.winner]
    : null;

  return (
    <div className="bracket">
      {ROUND_ORDER.map(({ stage, title }) => (
        <div className="round" key={stage}>
          <div className="rtitle">{title}</div>
          <div className="ties">
            {stage === "FINAL" ? (
              <div className="final-wrap">
                <div className="final">
                  {finalSlot && <Tie slot={finalSlot} />}
                </div>
                <div className="champ">
                  <div className="lab">Champion</div>
                  <div className="who">{champion ? champion.name : "—"}</div>
                </div>
              </div>
            ) : (
              byStage(stage).map(s => <Tie key={s.id} slot={s} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
