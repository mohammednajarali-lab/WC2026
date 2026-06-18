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
 *
 * Each slot accepts a third from a specific set of groups, and each qualifying
 * third (one per group) must fill exactly one slot. A greedy pick can dead-end
 * and leave a slot empty, so we solve it as a bipartite matching (Kuhn's
 * augmenting-path algorithm), which always finds a complete assignment when one
 * exists. Slots are processed most-constrained-first for stability.
 */
function assignThirds(
  thirdSlots: { ref: string; allowed: Set<string> }[],
  thirds: StandingRow[],
): Map<string, Team> {
  const ranked = thirds
    .filter((t) => (t.qualified ?? false) && realTeam(t.team))
    .sort((a, b) => (a.rank || 0) - (b.rank || 0)); // best thirds first

  // group letter -> qualifying third team
  const thirdByGroup = new Map<string, Team>();
  for (const t of ranked) if (!thirdByGroup.has(t.group)) thirdByGroup.set(t.group, t.team);

  const slots = [...thirdSlots].sort((a, b) => a.allowed.size - b.allowed.size);

  // groupTaken: group letter -> slot ref currently holding that group's third.
  const groupToSlot = new Map<string, string>();

  const tryAssign = (slotIdx: number, seen: Set<string>): boolean => {
    const slot = slots[slotIdx];
    // Prefer better-ranked thirds first for a stable, sensible projection.
    const candidates = ranked
      .map((t) => t.group)
      .filter((g) => slot.allowed.has(g) && thirdByGroup.has(g));
    for (const g of candidates) {
      if (seen.has(g)) continue;
      seen.add(g);
      const holder = groupToSlot.get(g);
      if (holder === undefined || tryAssign(slots.findIndex((s) => s.ref === holder), seen)) {
        groupToSlot.set(g, slot.ref);
        return true;
      }
    }
    return false;
  };

  for (let i = 0; i < slots.length; i++) tryAssign(i, new Set());

  const out = new Map<string, Team>();
  for (const [group, ref] of groupToSlot) {
    const team = thirdByGroup.get(group);
    if (team) out.set(ref, team);
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

  let out = bracket.map((slot) =>
    slot.stage === "R32" && !slot.result
      ? { ...slot, home: resolve(`${slot.id}:home`, slot.home), away: resolve(`${slot.id}:away`, slot.away) }
      : slot,
  );

  // Propagate actual knockout results up the official feeder tree, so once a
  // tie is decided, the next round shows the team that advanced instead of a
  // "Winner Match N" placeholder. Only real results propagate (not R32
  // projections), and we iterate so multi-round chains resolve in one pass.
  const winners = new Map<string, Team>();
  const losers = new Map<string, Team>();
  const indexResults = () => {
    for (const s of out) {
      if (!s.result?.winner) continue;
      const win = s.result.winner === "home" ? s.result.home : s.result.away;
      const lose = s.result.winner === "home" ? s.result.away : s.result.home;
      if (win) winners.set(s.id, win);
      if (lose) losers.set(s.id, lose);
    }
  };
  const advance = (src: SlotSource): SlotSource => {
    if (src.kind === "winner-match") {
      const t = winners.get(src.matchId);
      if (t) return { kind: "team", team: t };
    } else if (src.kind === "loser-match") {
      const t = losers.get(src.matchId);
      if (t) return { kind: "team", team: t };
    }
    return src;
  };

  for (let pass = 0; pass < 5; pass++) {
    winners.clear(); losers.clear();
    indexResults();
    let changed = false;
    out = out.map((slot) => {
      if (slot.result) return slot; // tie already played — keep its own teams
      const home = advance(slot.home);
      const away = advance(slot.away);
      if (home !== slot.home || away !== slot.away) { changed = true; return { ...slot, home, away }; }
      return slot;
    });
    if (!changed) break;
  }

  return out;
}
