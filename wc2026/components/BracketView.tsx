import type { BracketSlot, SlotSource, Stage, Team } from "@/lib/types";
import { Flag } from "./ui";
import { formatET, whereLabel } from "@/lib/venues";

const ROUND_ORDER: { stage: Stage; title: string }[] = [
  { stage: "R32", title: "Round of 32" },
  { stage: "R16", title: "Round of 16" },
  { stage: "QF", title: "Quarter-finals" },
  { stage: "SF", title: "Semi-finals" },
  { stage: "FINAL", title: "Final" },
];

function sourceTeam(src: SlotSource): Team | null {
  if (src.kind === "team") return src.team;
  if (src.kind === "projected") return src.team;
  return null;
}

function sourceLabel(src: SlotSource): string {
  switch (src.kind) {
    case "label": return src.text;
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
    const projected = src.kind === "projected";
    return (
      <div className={`row${projected ? " proj" : ""}`}>
        <span className="nm">
          <Flag team={team} />{team.name}
          {projected && <span className="seed" title={`Currently ${src.from}`}>{src.from}</span>}
        </span>
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
  const where = whereLabel({ stadium: slot.stadium, city: slot.city, venue: slot.venue });
  const when = slot.kickoff ? formatET(slot.kickoff) : null;
  return (
    <div className="tie">
      <div className="lbl">
        {slot.matchNumber ? <span className="mno">Match {slot.matchNumber}</span> : null}
        <span>{slot.label}</span>
      </div>
      <Row src={slot.home} which="home" result={slot.result} />
      <Row src={slot.away} which="away" result={slot.result} />
      {(when || where) && (
        <div className="tmeta">
          {when && <span className="tw">{when}</span>}
          {where && <span className="tv">{where}</span>}
        </div>
      )}
    </div>
  );
}

export default function BracketView({ slots }: { slots: BracketSlot[] }) {
  const byStage = (s: Stage) => slots.filter(x => x.stage === s);
  const finalSlot = byStage("FINAL")[0];
  const bronzeSlot = byStage("THIRD_PLACE")[0];
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
                {bronzeSlot && (
                  <div className="bronze">
                    <div className="rtitle">Third place</div>
                    <Tie slot={bronzeSlot} />
                  </div>
                )}
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
