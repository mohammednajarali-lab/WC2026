import type { Stage } from "./types";

// Official FIFA 2026 knockout structure.
//
// FIFA fixes every knockout match NUMBER (73–104) to a specific bracket
// position, stadium and kickoff slot in advance — independent of which teams
// qualify. FotMob, however, numbers its own fixtures differently and its
// later-round propagation labels ("Winner QF n") don't line up with FIFA's
// official semifinal pairings. So we map FotMob's stable per-round draw order
// onto the official match numbers, then build the feeder tree ourselves from
// the published bracket. This keeps the bracket FIFA-accurate and lets it stay
// correct as the tournament progresses.
//
// Source: FIFA match schedule / 2026 FIFA World Cup knockout stage bracket.

// FotMob draw order within a round -> official FIFA match number.
// Verified against FotMob's placeholder labels (e.g. R32 draw 1 = "1E vs
// 3ABCDF" = official Match 74).
const R32_DRAW_TO_NUMBER: Record<number, number> = {
  1: 74, 2: 77, 3: 73, 4: 75, 5: 83, 6: 84, 7: 81, 8: 82,
  9: 76, 10: 78, 11: 79, 12: 80, 13: 86, 14: 88, 15: 85, 16: 87,
};
const R16_DRAW_TO_NUMBER: Record<number, number> = {
  1: 89, 2: 90, 3: 93, 4: 94, 5: 91, 6: 92, 7: 95, 8: 96,
};
const QF_DRAW_TO_NUMBER: Record<number, number> = {
  1: 97, 2: 99, 3: 98, 4: 100,
};
const SF_DRAW_TO_NUMBER: Record<number, number> = {
  1: 101, 2: 102,
};

/**
 * Official FIFA match number for a knockout tie, from its round and FotMob
 * draw order. Returns undefined if it can't be resolved.
 */
export function officialKnockoutNumber(stage: Stage, drawOrder: number | undefined): number | undefined {
  if (stage === "FINAL") return 104;
  if (stage === "THIRD_PLACE") return 103;
  if (drawOrder == null) return undefined;
  switch (stage) {
    case "R32": return R32_DRAW_TO_NUMBER[drawOrder];
    case "R16": return R16_DRAW_TO_NUMBER[drawOrder];
    case "QF": return QF_DRAW_TO_NUMBER[drawOrder];
    case "SF": return SF_DRAW_TO_NUMBER[drawOrder];
    default: return undefined;
  }
}

// Official feeder tree, keyed by match number. Each later-round tie is fed by
// the winners (or, for the third-place playoff, the losers) of two earlier
// ties, in official home/away order.
export interface OfficialFeeder { home: number; away: number; kind: "winner" | "loser"; }
export const OFFICIAL_FEEDERS: Record<number, OfficialFeeder> = {
  // Round of 16
  89: { home: 74, away: 77, kind: "winner" },
  90: { home: 73, away: 75, kind: "winner" },
  91: { home: 76, away: 78, kind: "winner" },
  92: { home: 79, away: 80, kind: "winner" },
  93: { home: 83, away: 84, kind: "winner" },
  94: { home: 81, away: 82, kind: "winner" },
  95: { home: 86, away: 88, kind: "winner" },
  96: { home: 85, away: 87, kind: "winner" },
  // Quarter-finals
  97: { home: 89, away: 90, kind: "winner" },
  98: { home: 93, away: 94, kind: "winner" },
  99: { home: 91, away: 92, kind: "winner" },
  100: { home: 95, away: 96, kind: "winner" },
  // Semi-finals
  101: { home: 97, away: 98, kind: "winner" },
  102: { home: 99, away: 100, kind: "winner" },
  // Third-place playoff (losers of the semi-finals)
  103: { home: 101, away: 102, kind: "loser" },
  // Final
  104: { home: 101, away: 102, kind: "winner" },
};
