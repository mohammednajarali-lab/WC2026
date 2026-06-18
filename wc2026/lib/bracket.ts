import type {
  BracketSlot, GroupId, Match, SlotSource, StandingRow, Stage, Team,
} from "./types";
import {
  GROUPS, allGroupsComplete, bestThirdPlaced, computeStandings,
} from "./standings";

/**
 * The 16 Round-of-32 fixtures.
 *
 * Eight of them pit a group winner against one of the eight best third-placed
 * teams. FIFA's Annex C defines exactly which third-placed group fills which
 * slot, keyed by the *set* of eight groups that produced a qualifier (495
 * possible combinations). We capture the structure here and resolve the actual
 * third-placed occupant in `allocateThirds` below.
 *
 * IMPORTANT: the winner/runner pairings below follow the published 2026
 * structure, but you should treat the live API's knockout fixtures as the
 * source of truth once the group stage finishes (it assigns the official
 * matchups). This table powers the *predictor* and the pre-resolution view.
 */
interface R32Def {
  id: string;
  label: string;       // FIFA match number
  home: SlotSource;
  away: SlotSource;
  // For the "winner vs third" slots, which groups this third slot draws from.
  thirdFrom?: GroupId[];
}

const wg = (group: GroupId): SlotSource => ({ kind: "winner-group", group });
const rg = (group: GroupId): SlotSource => ({ kind: "runner-group", group });
const third = (bucket: string): SlotSource => ({ kind: "third", bucket });

// A valid arrangement of the R32: each group winner appears exactly once, each
// runner-up exactly once, and eight third-placed slots. Eight matches are
// "winner vs third"; the rest distribute the remaining winners and all runners.
// Edit pairings here to mirror the official wall chart exactly — the engine
// only requires that each 1X/2X reference appears once.
const R32: R32Def[] = [
  // winner vs third (8)
  { id: "R32-1",  label: "73", home: wg("A"), away: third("t1"), thirdFrom: ["C","D","E","F"] },
  { id: "R32-2",  label: "74", home: wg("B"), away: third("t2"), thirdFrom: ["A","D","E","G"] },
  { id: "R32-3",  label: "75", home: wg("C"), away: third("t3"), thirdFrom: ["B","E","F","H"] },
  { id: "R32-4",  label: "76", home: wg("D"), away: third("t4"), thirdFrom: ["A","B","F","I"] },
  { id: "R32-5",  label: "77", home: wg("E"), away: third("t5"), thirdFrom: ["A","G","H","I"] },
  { id: "R32-6",  label: "78", home: wg("F"), away: third("t6"), thirdFrom: ["B","E","J","K"] },
  { id: "R32-7",  label: "79", home: wg("G"), away: third("t7"), thirdFrom: ["C","E","H","L"] },
  { id: "R32-8",  label: "80", home: wg("H"), away: third("t8"), thirdFrom: ["A","B","J","K"] },
  // remaining winners vs runners (4)
  { id: "R32-9",  label: "81", home: wg("I"), away: rg("A") },
  { id: "R32-10", label: "82", home: wg("J"), away: rg("B") },
  { id: "R32-11", label: "83", home: wg("K"), away: rg("C") },
  { id: "R32-12", label: "84", home: wg("L"), away: rg("D") },
  // runner vs runner (4)
  { id: "R32-13", label: "85", home: rg("E"), away: rg("F") },
  { id: "R32-14", label: "86", home: rg("G"), away: rg("H") },
  { id: "R32-15", label: "87", home: rg("I"), away: rg("J") },
  { id: "R32-16", label: "88", home: rg("K"), away: rg("L") },
];

// Knockout tree: which two R32 winners feed each R16, etc. Final + 3rd place.
const TREE: Record<string, [string, string]> = {
  "R16-1": ["R32-1", "R32-2"],
  "R16-2": ["R32-3", "R32-4"],
  "R16-3": ["R32-5", "R32-6"],
  "R16-4": ["R32-7", "R32-8"],
  "R16-5": ["R32-9", "R32-10"],
  "R16-6": ["R32-11", "R32-12"],
  "R16-7": ["R32-13", "R32-14"],
  "R16-8": ["R32-15", "R32-16"],
  "QF-1": ["R16-1", "R16-2"],
  "QF-2": ["R16-3", "R16-4"],
  "QF-3": ["R16-5", "R16-6"],
  "QF-4": ["R16-7", "R16-8"],
  "SF-1": ["QF-1", "QF-2"],
  "SF-2": ["QF-3", "QF-4"],
  "FINAL": ["SF-1", "SF-2"],
  "THIRD_PLACE": ["SF-1", "SF-2"], // losers
};

const STAGE_OF = (id: string): Stage =>
  id.startsWith("R32") ? "R32"
  : id.startsWith("R16") ? "R16"
  : id.startsWith("QF") ? "QF"
  : id.startsWith("SF") ? "SF"
  : id === "THIRD_PLACE" ? "THIRD_PLACE" : "FINAL";

/**
 * Assign the eight best third-placed teams to the eight "third" slots.
 *
 * Each R32 third-slot lists the four groups it may draw from (`thirdFrom`).
 * We greedily place each qualifying third-placed team into a compatible,
 * still-empty slot, preferring slots with the fewest remaining options
 * (a constraint-propagation step that mirrors how Annex C resolves uniquely).
 */
function allocateThirds(qualifyingThirds: StandingRow[]): Map<string, StandingRow> {
  const slots = R32.filter(r => r.thirdFrom);
  const byGroup = new Map<GroupId, StandingRow>();
  for (const t of qualifyingThirds) byGroup.set(t.group, t);
  const qualifyingGroups = qualifyingThirds.map(t => t.group);

  // Find a perfect matching of qualifying groups -> third-slots respecting each
  // slot's allowed groups. Most-constrained-slot-first with backtracking, so we
  // never dead-end when a complete assignment exists.
  const assignmentByGroup = new Map<GroupId, string>(); // group -> slotId
  const used = new Set<GroupId>();

  const slotOptions = (slot: R32Def): GroupId[] =>
    (slot.thirdFrom ?? []).filter(g => qualifyingGroups.includes(g));

  const ordered = [...slots].sort(
    (a, b) => slotOptions(a).length - slotOptions(b).length);

  const solve = (i: number): boolean => {
    if (i === ordered.length) return true;
    const slot = ordered[i];
    for (const g of slotOptions(slot)) {
      if (used.has(g)) continue;
      used.add(g);
      assignmentByGroup.set(g, slot.id);
      if (solve(i + 1)) return true;
      used.delete(g);
      assignmentByGroup.delete(g);
    }
    return false;
  };
  solve(0);

  // Fallback: if the constrained matching couldn't place everyone (can happen
  // for combinations our editable thirdFrom table doesn't cover), fill any
  // leftover slots with any leftover thirds so the bracket always resolves.
  const placedGroups = new Set(assignmentByGroup.keys());
  const placedSlots = new Set(assignmentByGroup.values());
  const leftoverGroups = qualifyingGroups.filter(g => !placedGroups.has(g));
  const leftoverSlots = ordered.filter(s => !placedSlots.has(s.id));
  leftoverSlots.forEach((slot, i) => {
    const g = leftoverGroups[i];
    if (g) assignmentByGroup.set(g, slot.id);
  });

  const assignment = new Map<string, StandingRow>();
  for (const [g, slotId] of assignmentByGroup) {
    const row = byGroup.get(g);
    if (row) assignment.set(slotId, row);
  }
  return assignment;
}

/**
 * Build the full bracket (all stages) from current matches.
 * Resolves as much as the data allows: group winners/runners once a group is
 * done, third-placed teams once every group is done, and knockout winners as
 * those matches finish.
 */
export function buildBracket(teams: Team[], matches: Match[]): BracketSlot[] {
  const standings = computeStandings(teams, matches);
  const groupsDone = allGroupsComplete(matches);
  const thirds = groupsDone ? bestThirdPlaced(standings) : [];
  const thirdAssign = groupsDone ? allocateThirds(thirds) : new Map<string, StandingRow>();

  // Index knockout results from played matches (API or seed may include them).
  const koResult = new Map<string, Match>();
  for (const m of matches) {
    if (m.stage !== "GROUP" && m.status === "FINISHED") {
      koResult.set(m.id, m);
    }
  }

  const slots: BracketSlot[] = [];
  const slotById = new Map<string, BracketSlot>();

  const resolveSource = (src: SlotSource, slotIdForThird?: string): Team | null => {
    switch (src.kind) {
      case "team": return src.team;
      case "winner-group": {
        const row = standings[src.group]?.[0];
        return row ? row.team : null;
      }
      case "runner-group": {
        const row = standings[src.group]?.[1];
        return row ? row.team : null;
      }
      case "third": {
        const a = slotIdForThird ? thirdAssign.get(slotIdForThird) : undefined;
        return a ? a.team : null;
      }
      case "winner-match": return winnerOf(src.matchId);
      case "loser-match": return loserOf(src.matchId);
      default: return null;
    }
  };

  function winnerOf(matchId: string): Team | null {
    const s = slotById.get(matchId);
    if (s?.result?.winner) return s.result[s.result.winner];
    return null;
  }
  function loserOf(matchId: string): Team | null {
    const s = slotById.get(matchId);
    if (s?.result?.winner) {
      return s.result.winner === "home" ? s.result.away : s.result.home;
    }
    return null;
  }

  // 1) R32 from group results + third allocation.
  for (const def of R32) {
    const home = resolveSource(def.home);
    const away = def.away.kind === "third"
      ? resolveSource(def.away, def.id)
      : resolveSource(def.away);
    const slot = makeSlot(def.id, "R32", `Match ${def.label}`, def.home, def.away, home, away, koResult.get(def.id));
    slots.push(slot); slotById.set(slot.id, slot);
  }

  // 2) Remaining rounds via the tree, in dependency order.
  const order = ["R16-1","R16-2","R16-3","R16-4","R16-5","R16-6","R16-7","R16-8",
    "QF-1","QF-2","QF-3","QF-4","SF-1","SF-2","THIRD_PLACE","FINAL"];
  for (const id of order) {
    const [a, b] = TREE[id];
    const src = id === "THIRD_PLACE"
      ? [{ kind: "loser-match", matchId: a } as SlotSource,
         { kind: "loser-match", matchId: b } as SlotSource]
      : [{ kind: "winner-match", matchId: a } as SlotSource,
         { kind: "winner-match", matchId: b } as SlotSource];
    const home = resolveSource(src[0]);
    const away = resolveSource(src[1]);
    const slot = makeSlot(id, STAGE_OF(id), labelFor(id), src[0], src[1], home, away, koResult.get(id));
    slots.push(slot); slotById.set(slot.id, slot);
  }

  return slots;
}

function makeSlot(
  id: string, stage: Stage, label: string,
  homeSrc: SlotSource, awaySrc: SlotSource,
  home: Team | null, away: Team | null,
  played?: Match,
): BracketSlot {
  const slot: BracketSlot = {
    id, stage, label,
    home: home ? { kind: "team", team: home } : homeSrc,
    away: away ? { kind: "team", team: away } : awaySrc,
  };
  if (played && played.home && played.away
      && played.homeScore != null && played.awayScore != null) {
    const hs = played.homeScore, as = played.awayScore;
    const hp = played.homePens ?? null, ap = played.awayPens ?? null;
    let winner: "home" | "away" | null = null;
    if (hs > as) winner = "home";
    else if (as > hs) winner = "away";
    else if (hp != null && ap != null) winner = hp > ap ? "home" : "away";
    slot.result = {
      home: played.home, away: played.away,
      homeScore: hs, awayScore: as,
      homePens: hp ?? undefined, awayPens: ap ?? undefined,
      winner,
    };
  }
  return slot;
}

function labelFor(id: string): string {
  if (id === "FINAL") return "Final";
  if (id === "THIRD_PLACE") return "Third-place playoff";
  if (id.startsWith("SF")) return `Semi-final ${id.split("-")[1]}`;
  if (id.startsWith("QF")) return `Quarter-final ${id.split("-")[1]}`;
  if (id.startsWith("R16")) return `Round of 16 — ${id.split("-")[1]}`;
  return id;
}

export { R32, TREE };
