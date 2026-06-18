import type { BracketSlot, GroupId, SlotSource, StandingRow, Team } from "./types";

// Projects the knockout bracket from the *current* live group standings, so the
// Round of 32 shows who would advance right now instead of waiting for every
// group game to finish. FotMob seeds the first round with placeholder labels:
//   "1E"      -> winner of group E
//   "2A"      -> runner-up of group A
//   "3ABCDF"  -> one of the qualifying third-placed teams, from one of these groups
// Later rounds depend on knockout results, so we leave those untouched.

const LABEL_RE = /^([123])([A-L]+)$/;

/** A team that is real (not a provider placeholder). */
function realTeam(t: Team | undefined | null): t is Team {
  return !!t && !!t.id && !/^[123][A-L]+$/.test(t.name);
}

function placeFromGroup(
  standings: Record<GroupId, StandingRow[]>, group: string, rank: number,
): Team | null {
  const rows = standings[group as GroupId];
  const row = rows?.[rank];
  return realTeam(row?.team) ? row!.team : null;
}

/**
 * Assigns the qualifying third-placed teams to the "3XXXXX" slots.
 * Each slot allows thirds from a specific set of groups; we match the
 * most-constrained slots first and hand each the best-ranked compatible third.
 */
function assignThirds(
  thirdSlots: { ref: string; allowed: Set<string> }[],
  thirds: StandingRow[],
): Map<string, Team> {
  const ranked = thirds
    .filter((t) => (t.qualified ?? false) && realTeam(t.team))
    .sort((a, b) => (a.rank || 0) - (b.rank || 0)); // best thirds first
  const out = new Map<string, Team>();
  const usedGroup = new Set<string>();

  for (const slot of [...thirdSlots].sort((a, b) => a.allowed.size - b.allowed.size)) {
    const pick = ranked.find((t) => slot.allowed.has(t.group) && !usedGroup.has(t.group));
    if (pick) { out.set(slot.ref, pick.team); usedGroup.add(pick.group); }
  }
  return out;
}

export function projectBracket(
  bracket: BracketSlot[],
  standings: Record<GroupId, StandingRow[]> | null | undefined,
  thirds: StandingRow[] | null | undefined,
): BracketSlot[] {
  if (!standings || !Object.keys(standings).length) return bracket;

  // First pass: collect every third-place label slot so we can match them as a set.
  const thirdSlots: { ref: string; allowed: Set<string> }[] = [];
  const noteThird = (ref: string, src: SlotSource) => {
    if (src.kind === "label") {
      const m = LABEL_RE.exec(src.text);
      if (m && m[1] === "3") thirdSlots.push({ ref, allowed: new Set(m[2].split("")) });
    }
  };
  for (const slot of bracket) {
    if (slot.stage !== "R32") continue;
    noteThird(`${slot.id}:home`, slot.home);
    noteThird(`${slot.id}:away`, slot.away);
  }
  const thirdAssign = assignThirds(thirdSlots, thirds ?? []);

  const resolve = (ref: string, src: SlotSource): SlotSource => {
    if (src.kind !== "label") return src;
    const m = LABEL_RE.exec(src.text);
    if (!m) return src;
    const [, pos, groups] = m;
    let team: Team | null = null;
    if (pos === "1") team = placeFromGroup(standings, groups, 0);
    else if (pos === "2") team = placeFromGroup(standings, groups, 1);
    else team = thirdAssign.get(ref) ?? null;
    return team ? { kind: "projected", team, from: src.text } : src;
  };

  return bracket.map((slot) =>
    slot.stage === "R32" && !slot.result
      ? { ...slot, home: resolve(`${slot.id}:home`, slot.home), away: resolve(`${slot.id}:away`, slot.away) }
      : slot,
  );
}
