import type {
  BracketSlot, GroupId, Match, MatchEvent, MatchStatus, SlotSource, Stage,
  StandingRow, Team, TournamentData,
} from "./types";

// ---------------------------------------------------------------------------
// FotMob adapter (the user's preferred source for results, stats and info).
//
// FotMob retired its public JSON API, so the reliable path now is to read the
// `__NEXT_DATA__` blob that FotMob embeds in its own pages. The World Cup lives
// at league id 77; the league page carries everything we need in one request:
//   • 12 live group tables  + an official "Best 3rd placed teams" table
//   • all 104 fixtures with live status and scores
//   • the official knockout bracket, with slots that fill in as results land
//
// No API key required. Everything below degrades to seed data upstream if the
// fetch fails, so the site never goes dark.
// ---------------------------------------------------------------------------

const LEAGUE_PAGE = "https://www.fotmob.com/leagues/77/overview/world-cup";
const FOTMOB_ORIGIN = "https://www.fotmob.com";

function teamLogo(id: string | number): string {
  return `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;
}

// Browser-like headers so FotMob serves the fully-rendered page.
function pageHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
}

// Pull and parse the Next.js data island from a FotMob page.
async function fetchNextData(url: string): Promise<any> {
  const res = await fetch(url, { headers: pageHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`FotMob ${res.status} for ${url}`);
  const html = await res.text();
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("FotMob: __NEXT_DATA__ not found");
  const json = JSON.parse(m[1]);
  const props = json?.props?.pageProps;
  if (!props) throw new Error("FotMob: pageProps missing");
  return props;
}

// ---------- stage / status mapping ----------

function stageFromRound(roundName: unknown): Stage {
  const r = String(roundName).toLowerCase();
  if (/^\d+$/.test(r)) return "GROUP";            // "1" | "2" | "3" => group matchdays
  if (r.includes("32")) return "R32";
  if (r.includes("16")) return "R16";
  if (r.includes("quarter")) return "QF";
  if (r.includes("semi")) return "SF";
  if (r.includes("bronze") || r.includes("third") || r.includes("3rd")) return "THIRD_PLACE";
  if (r.includes("final")) return "FINAL";
  return "GROUP";
}

function statusFromMatch(s: any): MatchStatus {
  if (s?.finished) return "FINISHED";
  if (s?.started) return "LIVE";
  return "SCHEDULED";
}

// "2 - 0" / "2-0" => [2, 0]
function parseScoreStr(str: unknown): [number | null, number | null] {
  if (typeof str !== "string") return [null, null];
  const m = str.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return [null, null];
  return [Number(m[1]), Number(m[2])];
}

function shortCode(name: string): string {
  return name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

function toTeam(t: { id: string | number; name: string; shortName?: string } | null): Team | null {
  if (!t || t.id == null) return null;
  const id = String(t.id);
  return {
    id,
    name: t.name,
    code: shortCode(t.shortName || t.name),
    flag: teamLogo(id),
  };
}

// ---------- group standings + third-place table ----------

interface FotmobRow {
  id: number; name: string; shortName?: string;
  played: number; wins: number; draws: number; losses: number;
  scoresStr: string; goalConDiff: number; pts: number; idx: number;
  qualColor?: string | null;
}

function rowToStanding(r: FotmobRow, group: GroupId, qualified?: boolean): StandingRow {
  const [gf, ga] = parseScoreStr(r.scoresStr);
  const team = toTeam({ id: r.id, name: r.name, shortName: r.shortName })!;
  return {
    team, group,
    played: r.played, won: r.wins, drawn: r.draws, lost: r.losses,
    goalsFor: gf ?? 0, goalsAgainst: ga ?? 0, goalDiff: r.goalConDiff,
    points: r.pts, rank: r.idx,
    qualified,
  };
}

function groupLetter(leagueName: unknown): GroupId | null {
  const m = String(leagueName).match(/grp\.?\s*([a-l])/i);
  return m ? (m[1].toUpperCase() as GroupId) : null;
}

// ---------- bracket from FotMob's official playoff tree ----------

const PLAYOFF_STAGE: Record<string, Stage> = {
  "1/16": "R32", "1/8": "R16", "1/4": "QF", "1/2": "SF",
  final: "FINAL", bronze: "THIRD_PLACE",
};

function slotSource(label: string, resolved: Team | null, tbd: boolean): SlotSource {
  if (!tbd && resolved) return { kind: "team", team: resolved };
  if (label && label.trim()) return { kind: "label", text: label.trim() };
  return { kind: "tbd" };
}

function matchupToSlot(mu: any, fallbackStage: Stage): BracketSlot {
  const stage = PLAYOFF_STAGE[String(mu.stage)] ?? fallbackStage;
  const game = mu.matches?.[0];
  const h = game?.home, a = game?.away;
  const homeTeam = !mu.tbdTeam1 && h ? toTeam({ id: h.id, name: h.name, shortName: h.shortName }) : null;
  const awayTeam = !mu.tbdTeam2 && a ? toTeam({ id: a.id, name: a.name, shortName: a.shortName }) : null;

  const slot: BracketSlot = {
    id: String(game?.matchId ?? mu.drawOrder ?? `${stage}-${Math.random()}`),
    stage,
    label: stageLabel(stage, mu.drawOrder),
    home: slotSource(mu.homeTeam, homeTeam, !!mu.tbdTeam1),
    away: slotSource(mu.awayTeam, awayTeam, !!mu.tbdTeam2),
  };

  // Record a result once the tie has been played out (or is in progress).
  const started = game?.status?.started || game?.status?.finished;
  if (started && homeTeam && awayTeam) {
    const hs = Number(h?.score ?? 0), as = Number(a?.score ?? 0);
    let winner: "home" | "away" | null = null;
    if (h?.winner) winner = "home";
    else if (a?.winner) winner = "away";
    else if (hs > as) winner = "home";
    else if (as > hs) winner = "away";
    slot.result = { home: homeTeam, away: awayTeam, homeScore: hs, awayScore: as, winner };
  }
  return slot;
}

function stageLabel(stage: Stage, order?: number): string {
  const n = order && order > 0 ? ` ${order}` : "";
  switch (stage) {
    case "R32": return `Round of 32${n}`;
    case "R16": return `Round of 16${n}`;
    case "QF": return `Quarter-final${n}`;
    case "SF": return `Semi-final${n}`;
    case "THIRD_PLACE": return "Third-place playoff";
    case "FINAL": return "Final";
    default: return stage;
  }
}

function buildBracketFromPlayoff(playoff: any): BracketSlot[] {
  const slots: BracketSlot[] = [];
  const rounds: any[] = Array.isArray(playoff?.rounds) ? playoff.rounds : [];
  for (const round of rounds) {
    const stage = PLAYOFF_STAGE[String(round.stage)] ?? "R32";
    const matchups: any[] = round.matchups || round.matches || [];
    // Keep a stable left-to-right draw order.
    matchups
      .slice()
      .sort((x, y) => (x.drawOrder ?? 0) - (y.drawOrder ?? 0))
      .forEach((mu) => slots.push(matchupToSlot(mu, stage)));
  }
  if (playoff?.bronzeFinal) {
    slots.push(matchupToSlot(playoff.bronzeFinal, "THIRD_PLACE"));
  }
  return slots;
}

// ---------- main entry point ----------

export async function fetchTournament(): Promise<TournamentData> {
  const props = await fetchNextData(LEAGUE_PAGE);

  // --- fixtures ---
  const all: any[] = props?.fixtures?.allMatches ?? [];
  const teamsById = new Map<string, Team>();
  const matches: Match[] = [];

  for (const f of all) {
    const stage = stageFromRound(f.roundName ?? f.round);
    const status = statusFromMatch(f.status);
    const [hs, as] = parseScoreStr(f.status?.scoreStr);
    const home = toTeam(f.home);
    const away = toTeam(f.away);
    if (home) teamsById.set(home.id, home);
    if (away) teamsById.set(away.id, away);

    matches.push({
      id: String(f.id),
      pageUrl: typeof f.pageUrl === "string" ? f.pageUrl : undefined,
      stage,
      group: stage === "GROUP" && f.group ? (String(f.group).toUpperCase() as GroupId) : undefined,
      status,
      minute: f.status?.liveTime?.short ? Number(String(f.status.liveTime.short).replace(/\D/g, "")) || null : null,
      kickoff: f.status?.utcTime ?? new Date().toISOString(),
      home, away,
      homeScore: hs,
      awayScore: as,
    });
  }

  // FIFA-style match numbers (1..104) by kickoff order.
  matches
    .slice()
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff) || a.id.localeCompare(b.id))
    .forEach((m, i) => { m.matchNumber = i + 1; });

  // --- standings + third-place race ---
  const tables: any[] = props?.table?.[0]?.data?.tables ?? [];
  const standings = {} as Record<GroupId, StandingRow[]>;
  const teamGroup = new Map<string, GroupId>();
  let thirdTable: any | null = null;

  for (const t of tables) {
    const letter = groupLetter(t.leagueName);
    const rows: FotmobRow[] = t.table?.all ?? t.table ?? [];
    if (letter) {
      standings[letter] = rows
        .map((r) => rowToStanding(r, letter))
        .sort((a, b) => a.rank - b.rank);
      for (const r of rows) teamGroup.set(String(r.id), letter);
    } else if (/3rd|third/i.test(String(t.leagueName))) {
      thirdTable = t;
    }
  }

  let thirdPlace: StandingRow[] | undefined;
  if (thirdTable) {
    const rows: FotmobRow[] = thirdTable.table?.all ?? thirdTable.table ?? [];
    thirdPlace = rows.map((r, i) => {
      const g = teamGroup.get(String(r.id)) ?? ("A" as GroupId);
      // The eight best third-placed teams advance. FotMob also colours the
      // qualifying rows green via qualColor — honour that when present.
      const qualified = r.qualColor ? r.qualColor.toUpperCase() !== "#FF0000" && i < 8 : i < 8;
      return rowToStanding(r, g, qualified);
    });
  }

  // --- bracket ---
  const bracket = props?.playoff ? buildBracketFromPlayoff(props.playoff) : undefined;

  return {
    teams: [...teamsById.values()],
    matches,
    standings: Object.keys(standings).length ? standings : undefined,
    thirdPlace,
    bracket: bracket && bracket.length ? bracket : undefined,
    updatedAt: new Date().toISOString(),
    source: "api",
  };
}

// ---------- per-match box score (events) ----------

function eventType(t: string): MatchEvent["type"] {
  const s = (t || "").toLowerCase();
  if (s === "goal") return "GOAL";
  if (s === "card") return "CARD";
  if (s.includes("substitution") || s === "subst") return "SUBST";
  if (s === "var") return "VAR";
  return "OTHER";
}

export interface MatchDetail {
  events: MatchEvent[];
  venue?: { stadium?: string; city?: string };
}

export async function fetchMatchEvents(pageUrlOrId: string): Promise<MatchDetail> {
  // We need the full FotMob match URL. Fixtures hand us a pageUrl; if only an
  // id is available we can still hit the matches route with a stub slug.
  const url = pageUrlOrId.startsWith("/")
    ? `${FOTMOB_ORIGIN}${pageUrlOrId}`
    : `${FOTMOB_ORIGIN}/matches/match/${pageUrlOrId}`;

  const props = await fetchNextData(url);
  const mf = props?.content?.matchFacts;
  const rows: any[] = Array.isArray(mf?.events?.events)
    ? mf.events.events
    : Array.isArray(mf?.events) ? mf.events : [];

  const events: MatchEvent[] = rows
    .filter((e) => e && e.type && e.time != null)
    .map((e) => ({
      minute: Number(e.time) || 0,
      extra: e.overloadTime != null ? Number(e.overloadTime) : null,
      type: eventType(e.type),
      side: e.isHome ? "home" : "away",
      player: e.player?.name ?? e.nameStr ?? e.fullName ?? undefined,
      assist: e.assistStr ?? e.assist?.name ?? undefined,
      detail: e.ownGoal ? "Own Goal"
        : e.card ? `${e.card} Card`
        : e.goalDescription ?? undefined,
    }))
    .sort((a, b) => (a.minute + (a.extra ?? 0) / 100) - (b.minute + (b.extra ?? 0) / 100));

  const st = mf?.infoBox?.Stadium;
  const venue = st ? { stadium: st.name, city: st.city } : undefined;

  return { events, venue };
}
