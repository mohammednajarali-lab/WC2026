import type {
  BracketSlot, GroupId, Match, MatchDetailData, MatchEvent, MatchStat, MatchStatGroup,
  MatchStatus, PlayerStats, SlotSource, Stage,
  StandingRow, StatCategory, StatLeader, Team, TournamentData,
} from "./types";
import { KNOCKOUT_VENUES } from "./venues";

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

function playerImage(id: string | number): string {
  return `https://images.fotmob.com/image_resources/playerimages/${id}.png`;
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

// Parse FotMob's live clock into a structured, tickable form.
// `liveTime.long` is precise "mm:ss" elapsed; `maxTime` is the current period
// boundary (45/90/105/120); `addedTime` is announced stoppage minutes.
function parseClock(s: any): Match["clock"] {
  const lt = s?.liveTime;
  if (!lt) return null;
  let elapsed = 0;
  const long = String(lt.long ?? "");
  const mmss = long.match(/(\d+):(\d+)/);
  if (mmss) elapsed = Number(mmss[1]) * 60 + Number(mmss[2]);
  else {
    const min = String(lt.short ?? "").match(/\d+/);
    if (min) elapsed = Number(min[0]) * 60;
  }
  return {
    elapsed,
    max: Number(lt.maxTime) || 90,
    added: Number(lt.addedTime) || 0,
    // The clock advances only while the match is actually ongoing (not at the
    // half-time break or other stoppages).
    running: s?.ongoing === true,
  };
}

// A best-effort minute snapshot (used as a fallback where ticking isn't wired).
function clockMinute(clock: Match["clock"]): number | null {
  if (!clock) return null;
  return Math.min(clock.max, Math.floor(clock.elapsed / 60) + 1);
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
    drawOrder: mu.drawOrder != null ? Number(mu.drawOrder) : undefined,
    kickoff: game?.status?.utcTime ?? undefined,
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

// Replace cryptic provider placeholders ("1E/3ABCDF", "Winner EF 5", "Loser
// SF 1") with accurate feeder references tied to each tie's FIFA match number.
// We use FotMob's own authoritative labels rather than naive index pairing, so
// the official knockout "crossing" structure (e.g. QF2 takes the winners of
// R16 matches 5 & 6, not 3 & 4) is preserved exactly. Runs after match numbers
// are attached.
function linkBracketFeeders(bracket: BracketSlot[]): void {
  // Round code used in "Winner/Loser <code> <n>" -> feeding stage.
  const CODE_STAGE: Record<string, Stage> = { EF: "R16", QF: "QF", SF: "SF" };

  // Per-stage lookup of slot by its draw order.
  const orderMap = (st: Stage) => {
    const map = new Map<number, BracketSlot>();
    for (const s of bracket) if (s.stage === st && s.drawOrder != null) map.set(s.drawOrder, s);
    return map;
  };
  const maps: Partial<Record<Stage, Map<number, BracketSlot>>> = {
    R16: orderMap("R16"), QF: orderMap("QF"), SF: orderMap("SF"),
  };

  // R32 producer lookup: a winning R32 slot is referenced by "<home>/<away>",
  // e.g. "1E/3ABCDF".
  const r32Producers = new Map<string, BracketSlot>();
  for (const s of bracket) {
    if (s.stage !== "R32") continue;
    const h = s.home.kind === "label" ? s.home.text : null;
    const a = s.away.kind === "label" ? s.away.text : null;
    if (h && a) r32Producers.set(`${h}/${a}`, s);
  }

  const resolveFeeder = (src: SlotSource): SlotSource => {
    if (src.kind !== "label") return src; // already a team / projected / tbd
    const text = src.text.trim();

    const wl = text.match(/^(winner|loser)\s+(EF|QF|SF)\s+(\d+)$/i);
    if (wl) {
      const feeder = maps[CODE_STAGE[wl[2].toUpperCase()]]?.get(Number(wl[3]));
      if (feeder) {
        const kind = wl[1].toLowerCase() === "loser" ? "loser-match" : "winner-match";
        return { kind, matchId: feeder.id, matchNumber: feeder.matchNumber };
      }
    }

    const r32 = r32Producers.get(text);
    if (r32) return { kind: "winner-match", matchId: r32.id, matchNumber: r32.matchNumber };

    return src; // leave anything unrecognised untouched
  };

  for (const s of bracket) {
    if (s.stage === "R32") continue;
    s.home = resolveFeeder(s.home);
    s.away = resolveFeeder(s.away);
  }
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

    const clock = status === "LIVE" ? parseClock(f.status) : null;

    matches.push({
      id: String(f.id),
      pageUrl: typeof f.pageUrl === "string" ? f.pageUrl : undefined,
      stage,
      group: stage === "GROUP" && f.group ? (String(f.group).toUpperCase() as GroupId) : undefined,
      status,
      clock,
      minute: clockMinute(clock),
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
  let bracket = props?.playoff ? buildBracketFromPlayoff(props.playoff) : undefined;
  if (bracket?.length) {
    // The playoff slots and the fixtures share FotMob's matchId, so we can
    // attach each tie's FIFA match number and kickoff, then resolve the
    // official (fixed) host stadium from the published knockout schedule.
    const byId = new Map(matches.map((m) => [m.id, m]));
    bracket = bracket.map((slot) => {
      const m = byId.get(slot.id);
      const matchNumber = m?.matchNumber;
      const venue = matchNumber ? KNOCKOUT_VENUES[matchNumber] : undefined;
      return {
        ...slot,
        matchNumber,
        kickoff: slot.kickoff ?? m?.kickoff,
        stadium: venue?.stadium,
        city: venue?.city,
      };
    });
    // Link later-round placeholders to their feeding ties (match numbers).
    linkBracketFeeders(bracket);
  }

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

// ---------- per-match box score (events + key match facts) ----------
// Mirrors FotMob's match "Facts" tab: a timeline of events plus the team-stat
// comparison ("Key match facts"), match info, and Player of the Match.

function eventType(t: string): MatchEvent["type"] {
  const s = (t || "").toLowerCase();
  if (s === "goal") return "GOAL";
  if (s === "card") return "CARD";
  if (s.includes("substitution") || s === "subst") return "SUBST";
  if (s === "var") return "VAR";
  if (s === "half") return "PERIOD";
  if (s === "addedtime") return "ADDED";
  return "OTHER";
}

// Title text for a half marker, based on the minute it sits at.
function periodText(minute: number): string {
  if (minute >= 120) return "Full time (AET)";
  if (minute >= 105) return "End of extra time";
  if (minute >= 90) return "Full time";
  if (minute >= 45) return "Half time";
  return "Kick off";
}

function mapEvent(e: any): MatchEvent | null {
  const type = eventType(e.type);
  const minute = Number(e.time) || 0;
  const extra = e.overloadTime != null ? Number(e.overloadTime) : null;
  const side: MatchEvent["side"] =
    type === "PERIOD" || type === "ADDED" ? "none" : e.isHome ? "home" : "away";

  if (type === "ADDED") {
    const n = String(e.minutesAddedStr ?? "").match(/\d+/)?.[0];
    return { minute, extra, type, side, text: n ? `+${n} min added` : "Added time" };
  }
  if (type === "PERIOD") {
    return { minute, extra, type, side, text: periodText(minute) };
  }

  const base: MatchEvent = {
    minute, extra, type, side,
    player: e.player?.name ?? e.nameStr ?? e.fullName ?? undefined,
  };

  if (type === "GOAL") {
    base.assist = e.assistInput ?? e.assist?.name ?? undefined;
    base.ownGoal = !!e.ownGoal;
    base.detail = e.ownGoal ? "Own goal"
      : e.goalDescription
      ?? (e.goalDescriptionKey === "header" ? "Header" : undefined);
    if (Array.isArray(e.newScore) && e.newScore.length === 2) {
      base.score = [Number(e.newScore[0]), Number(e.newScore[1])];
    }
  } else if (type === "CARD") {
    base.card = e.card === "Red" ? "Red" : "Yellow";
    base.detail = e.cardDescription ?? `${base.card} card`;
  } else if (type === "SUBST" && Array.isArray(e.swap) && e.swap.length === 2) {
    // swap[0] is the player coming on, swap[1] the player going off.
    base.player = e.swap[0]?.name ?? base.player;
    base.playerOut = e.swap[1]?.name ?? undefined;
  }
  return base;
}

// Build the comparison bar fraction from FotMob's display strings, e.g.
// "60", "467 (90%)", "1.46" -> a leading number we can scale.
function leadingNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  const m = String(v ?? "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

function mapStatGroups(periods: any): MatchStatGroup[] {
  const groups: any[] = periods?.All?.stats;
  if (!Array.isArray(groups)) return [];
  return groups.map((g): MatchStatGroup => ({
    title: String(g.title ?? ""),
    stats: (g.stats ?? [])
      // Drop the "title"-type spacer rows that only repeat the group name.
      .filter((s: any) => s.type !== "title" && Array.isArray(s.stats))
      .map((s: any): MatchStat => {
        const [h, a] = s.stats;
        return {
          label: String(s.title ?? ""),
          home: h == null ? "-" : String(h),
          away: a == null ? "-" : String(a),
          homeNum: leadingNumber(h),
          awayNum: leadingNumber(a),
        };
      }),
  })).filter((g) => g.stats.length > 0);
}

export async function fetchMatchEvents(pageUrlOrId: string): Promise<MatchDetailData> {
  // We need the full FotMob match URL. Fixtures hand us a pageUrl; if only an
  // id is available we can still hit the matches route with a stub slug.
  const url = pageUrlOrId.startsWith("/")
    ? `${FOTMOB_ORIGIN}${pageUrlOrId}`
    : `${FOTMOB_ORIGIN}/matches/match/${pageUrlOrId}`;

  const props = await fetchNextData(url);
  const content = props?.content ?? {};
  const mf = content.matchFacts ?? {};

  const rows: any[] = Array.isArray(mf?.events?.events)
    ? mf.events.events
    : Array.isArray(mf?.events) ? mf.events : [];

  const events: MatchEvent[] = rows
    .filter((e) => e && e.type && e.time != null)
    .map(mapEvent)
    .filter((e): e is MatchEvent => e !== null)
    .sort((a, b) => (a.minute + (a.extra ?? 0) / 100) - (b.minute + (b.extra ?? 0) / 100));

  const statGroups = mapStatGroups(content.stats?.Periods);

  const ib = mf.infoBox ?? {};
  const st = ib.Stadium;
  const info: MatchDetailData["info"] = {
    stadium: st?.name,
    city: st?.city,
    referee: ib.Referee?.text,
    attendance: typeof ib.Attendance === "number" ? ib.Attendance : undefined,
    kickoff: ib["Match Date"]?.utcTime,
  };

  let motm: MatchDetailData["motm"];
  const p = mf.playerOfTheMatch;
  if (p?.name) {
    motm = {
      name: p.name.fullName ?? `${p.name.firstName ?? ""} ${p.name.lastName ?? ""}`.trim(),
      teamName: p.teamName,
      rating: p.rating?.num,
    };
  }

  return { events, statGroups, info, motm, source: "api" };
}

// ---------------------------------------------------------------------------
// Player & team leaderboards (the FotMob "Stats" tab).
//
// The league page embeds 30+ stat categories under stats.players / stats.teams.
// Each carries a `topThree` preview plus a `fetchAllUrl` to the full ranked
// list (gzipped JSON on data.fotmob.com). We surface the categories that match
// FotMob's headline stats and expand the most important ones to full tables.
// ---------------------------------------------------------------------------

// Categories we expand to a full leaderboard, in display order. Keys match
// FotMob's stat `name`. Anything else still shows via its top-three preview.
const PLAYER_STAT_ORDER = [
  "goals", "goal_assist", "_goals_and_goal_assist", "rating",
  "expected_goals", "expected_assists", "big_chance_created",
  "total_att_assist", "clean_sheet", "saves",
  "yellow_card", "red_card", "mins_played",
];
const TEAM_STAT_ORDER = [
  "rating_team", "goals_team_match", "goals_conceded_team_match",
  "possession_percentage_team", "clean_sheet_team", "big_chance_team",
  "expected_goals_team", "total_yel_card_team", "total_red_card_team",
];

const LEADER_LIMIT = 25;

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": pageHeaders()["User-Agent"], Accept: "application/json" },
      // Slightly longer cache; leaderboards move less often than the live clock.
      next: { revalidate: 0 },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function previewLeaders(topThree: any[], isPlayer: boolean): StatLeader[] {
  return (topThree || []).map((p) => ({
    rank: Number(p.rank) || 0,
    id: String(p.id ?? p.participantId ?? ""),
    name: p.name ?? p.participantName ?? "",
    ccode: p.ccode ?? p.countryCode,
    teamId: p.teamId != null ? String(p.teamId) : undefined,
    teamName: p.teamName,
    value: Number(p.value ?? p.stat?.value ?? 0),
    sub: p.subStatValue != null ? Number(p.subStatValue) : null,
    image: isPlayer && p.id != null ? playerImage(p.id) : undefined,
  }));
}

function fullLeaders(json: any, isPlayer: boolean): StatLeader[] | null {
  const list: any[] =
    json?.TopLists?.[0]?.StatList ?? json?.TopLists?.[0]?.statList ?? [];
  if (!Array.isArray(list) || !list.length) return null;
  return list.slice(0, LEADER_LIMIT).map((p) => {
    const id = String(p.ParticiantId ?? p.ParticipantId ?? p.id ?? "");
    return {
      rank: Number(p.Rank) || 0,
      id,
      name: p.ParticipantName ?? p.name ?? "",
      ccode: p.ParticipantCountryCode ?? p.ccode,
      teamId: p.TeamId != null ? String(p.TeamId) : undefined,
      teamName: p.TeamName,
      value: Number(p.StatValue ?? 0),
      sub: p.SubStatValue != null ? Number(p.SubStatValue) : null,
      matches: p.MatchesPlayed != null ? Number(p.MatchesPlayed) : undefined,
      minutes: p.MinutesPlayed != null ? Number(p.MinutesPlayed) : undefined,
      image: isPlayer && id ? playerImage(id) : undefined,
    };
  });
}

async function buildCategories(
  raw: any[], order: string[], kind: "player" | "team",
): Promise<StatCategory[]> {
  if (!Array.isArray(raw)) return [];
  const isPlayer = kind === "player";
  const byKey = new Map<string, any>();
  for (const c of raw) byKey.set(String(c.name), c);

  // Expand the prioritised categories with their full leaderboards in parallel.
  const wanted = order.map((k) => byKey.get(k)).filter(Boolean);
  const full = await Promise.all(
    wanted.map((c) => (c.fetchAllUrl ? fetchJson(c.fetchAllUrl) : Promise.resolve(null))),
  );

  return wanted.map((c, i) => {
    const leaders = fullLeaders(full[i], isPlayer) ?? previewLeaders(c.topThree, isPlayer);
    return {
      key: String(c.name),
      title: String(c.header ?? c.name),
      fractions: c.topThree?.[0]?.stat?.fractions ?? 0,
      kind,
      leaders,
    } as StatCategory;
  }).filter((c) => c.leaders.length > 0);
}

export async function fetchPlayerStats(): Promise<PlayerStats> {
  const props = await fetchNextData(LEAGUE_PAGE);
  const stats = props?.stats ?? {};
  const [players, teams] = await Promise.all([
    buildCategories(stats.players ?? [], PLAYER_STAT_ORDER, "player"),
    buildCategories(stats.teams ?? [], TEAM_STAT_ORDER, "team"),
  ]);
  return {
    categories: [...players, ...teams],
    updatedAt: new Date().toISOString(),
    source: "api",
  };
}
