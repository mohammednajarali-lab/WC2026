import type {
  GroupId, Match, StandingRow, Team,
} from "./types";

const GROUPS: GroupId[] = ["A","B","C","D","E","F","G","H","I","J","K","L"];

/**
 * Compute the table for every group from the played matches.
 *
 * FIFA 2026 tiebreakers, applied in order (Regulations Art. for group ranking):
 *   1. Points
 *   2. Goal difference
 *   3. Goals scored
 *   4. (head-to-head points, then H2H GD, then H2H goals — among tied teams)
 *   5. Fair-play / conduct score   (not modelled: needs cards data)
 *   6. FIFA ranking draw            (not modelled)
 *
 * We implement 1-4 fully (4 is the head-to-head mini-table among the tied set),
 * which resolves the overwhelming majority of real cases. 5-6 fall back to a
 * stable order so output is deterministic.
 */
export function computeStandings(teams: Team[], matches: Match[]): Record<GroupId, StandingRow[]> {
  const byId = new Map(teams.map(t => [t.id, t]));
  const out = {} as Record<GroupId, StandingRow[]>;

  for (const g of GROUPS) {
    const groupTeams = teams.filter(t => teamGroup(t, matches) === g);
    const rows = new Map<string, StandingRow>();
    for (const t of groupTeams) {
      rows.set(t.id, blankRow(t, g));
    }

    const groupMatches = matches.filter(
      m => m.stage === "GROUP" && m.group === g && m.status === "FINISHED"
      && m.home && m.away && m.homeScore != null && m.awayScore != null,
    );

    for (const m of groupMatches) {
      const h = rows.get(m.home!.id);
      const a = rows.get(m.away!.id);
      if (!h || !a) continue;
      applyResult(h, a, m.homeScore!, m.awayScore!);
    }

    const ordered = rankGroup([...rows.values()], groupMatches, byId);
    ordered.forEach((r, i) => (r.rank = i + 1));
    out[g] = ordered;
  }
  return out;
}

function blankRow(team: Team, group: GroupId): StandingRow {
  return {
    team, group, played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0, rank: 0,
  };
}

function applyResult(h: StandingRow, a: StandingRow, hs: number, as: number) {
  h.played++; a.played++;
  h.goalsFor += hs; h.goalsAgainst += as;
  a.goalsFor += as; a.goalsAgainst += hs;
  if (hs > as) { h.won++; a.lost++; h.points += 3; }
  else if (hs < as) { a.won++; h.lost++; a.points += 3; }
  else { h.drawn++; a.drawn++; h.points += 1; a.points += 1; }
  h.goalDiff = h.goalsFor - h.goalsAgainst;
  a.goalDiff = a.goalsFor - a.goalsAgainst;
}

function rankGroup(
  rows: StandingRow[],
  groupMatches: Match[],
  _byId: Map<string, Team>,
): StandingRow[] {
  return rows.sort((x, y) => {
    const overall = compareOverall(x, y);
    if (overall !== 0) return overall;
    // Tied on points/GD/goals -> head-to-head mini table among the tied set.
    const tiedIds = rows
      .filter(r => compareOverall(r, x) === 0)
      .map(r => r.team.id);
    const h2h = headToHead(tiedIds, groupMatches);
    const hx = h2h.get(x.team.id);
    const hy = h2h.get(y.team.id);
    if (hx && hy) {
      if (hy.points !== hx.points) return hy.points - hx.points;
      if (hy.gd !== hx.gd) return hy.gd - hx.gd;
      if (hy.gf !== hx.gf) return hy.gf - hx.gf;
    }
    // Deterministic final fallback (stands in for conduct score + FIFA ranking).
    return x.team.code.localeCompare(y.team.code);
  });
}

function compareOverall(x: StandingRow, y: StandingRow): number {
  if (y.points !== x.points) return y.points - x.points;
  if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
  if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
  return 0;
}

function headToHead(ids: string[], matches: Match[]) {
  const set = new Set(ids);
  const table = new Map(ids.map(id => [id, { points: 0, gd: 0, gf: 0 }]));
  for (const m of matches) {
    if (!m.home || !m.away) continue;
    if (!set.has(m.home.id) || !set.has(m.away.id)) continue;
    const h = table.get(m.home.id)!;
    const a = table.get(m.away.id)!;
    const hs = m.homeScore!, as = m.awayScore!;
    h.gf += hs; a.gf += as; h.gd += hs - as; a.gd += as - hs;
    if (hs > as) h.points += 3; else if (hs < as) a.points += 3;
    else { h.points++; a.points++; }
  }
  return table;
}

/**
 * Rank the twelve third-placed teams against each other and return the best 8.
 * Same metric order as group ranking: points, GD, goals scored.
 */
export function bestThirdPlaced(standings: Record<GroupId, StandingRow[]>): StandingRow[] {
  const thirds = GROUPS
    .map(g => standings[g]?.[2])
    .filter(Boolean) as StandingRow[];
  const ranked = thirds.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.goalDiff !== x.goalDiff) return y.goalDiff - x.goalDiff;
    if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
    return x.team.code.localeCompare(y.team.code);
  });
  return ranked.slice(0, 8);
}

// Helper: which group a team plays in, inferred from its group matches.
const groupCache = new WeakMap<Match[], Map<string, GroupId>>();
function teamGroup(team: Team, matches: Match[]): GroupId | undefined {
  let cache = groupCache.get(matches);
  if (!cache) {
    cache = new Map();
    for (const m of matches) {
      if (m.stage === "GROUP" && m.group) {
        if (m.home) cache.set(m.home.id, m.group);
        if (m.away) cache.set(m.away.id, m.group);
      }
    }
    groupCache.set(matches, cache);
  }
  return cache.get(team.id);
}

export function groupComplete(g: GroupId, matches: Match[]): boolean {
  const gm = matches.filter(m => m.stage === "GROUP" && m.group === g);
  return gm.length > 0 && gm.every(m => m.status === "FINISHED");
}

export function allGroupsComplete(matches: Match[]): boolean {
  return GROUPS.every(g => groupComplete(g, matches));
}

export { GROUPS };
