import type {
  GroupId, Match, MatchEvent, MatchStatus, Stage, Team, TournamentData,
} from "./types";

type MatchEventType = MatchEvent["type"];

// Adapter for API-Football (api-sports.io). World Cup = league 1, season 2026.
// Docs: https://www.api-football.com/documentation-v3
// Free tier: 100 requests/day, live data refreshed every 15s.
//
// Swappable by design: if you prefer football-data.org, Sportmonks, or
// livescore-api, implement the same `fetchTournament()` contract and the rest
// of the app is unchanged.

const BASE = "https://v3.football.api-sports.io";
const LEAGUE = "1";
const SEASON = "2026";

function headers(key: string) {
  return { "x-apisports-key": key };
}

const STATUS: Record<string, MatchStatus> = {
  TBD: "SCHEDULED", NS: "SCHEDULED", PST: "SCHEDULED", CANC: "SCHEDULED",
  "1H": "LIVE", HT: "LIVE", "2H": "LIVE", ET: "LIVE", BT: "LIVE",
  P: "LIVE", SUSP: "LIVE", INT: "LIVE", LIVE: "LIVE",
  FT: "FINISHED", AET: "FINISHED", PEN: "FINISHED", AWD: "FINISHED", WO: "FINISHED",
};

function stageFromRound(round: string): Stage {
  const r = round.toLowerCase();
  if (r.includes("group")) return "GROUP";
  if (r.includes("32")) return "R32";
  if (r.includes("16")) return "R16";
  if (r.includes("quarter")) return "QF";
  if (r.includes("semi")) return "SF";
  if (r.includes("3rd") || r.includes("third")) return "THIRD_PLACE";
  if (r.includes("final")) return "FINAL";
  return "GROUP";
}

interface ApiFixture {
  fixture: { id: number; date: string; status: { short: string; elapsed: number | null }; venue: { name: string | null; city: string | null } };
  league: { round: string; country?: string };
  teams: { home: { id: number; name: string; logo: string }; away: { id: number; name: string; logo: string } };
  goals: { home: number | null; away: number | null };
  score: { penalty: { home: number | null; away: number | null } };
}

interface ApiStandingsTeam {
  team: { id: number; name: string; logo: string };
  group: string; // "Group A"
}

async function getJson(url: string, key: string) {
  const res = await fetch(url, { headers: headers(key), next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`API ${res.status} for ${url}`);
  return res.json();
}

// Map team id -> group letter from the standings endpoint.
async function fetchGroups(key: string): Promise<Map<number, GroupId>> {
  const data = await getJson(`${BASE}/standings?league=${LEAGUE}&season=${SEASON}`, key);
  const map = new Map<number, GroupId>();
  const standings = data?.response?.[0]?.league?.standings ?? [];
  for (const groupArr of standings) {
    for (const row of groupArr as ApiStandingsTeam[]) {
      const letter = (row.group || "").replace(/group\s*/i, "").trim().toUpperCase();
      if (letter && letter.length === 1) {
        map.set(row.team.id, letter as GroupId);
      }
    }
  }
  return map;
}

function shortCode(name: string): string {
  return name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

export async function fetchTournament(key: string): Promise<TournamentData> {
  const groupMap = await fetchGroups(key).catch(() => new Map<number, GroupId>());
  const data = await getJson(`${BASE}/fixtures?league=${LEAGUE}&season=${SEASON}`, key);
  const fixtures: ApiFixture[] = data?.response ?? [];

  const teamsById = new Map<string, Team>();
  const matches: Match[] = [];

  for (const f of fixtures) {
    const stage = stageFromRound(f.league.round);
    const status = STATUS[f.fixture.status.short] ?? "SCHEDULED";

    const home = toTeam(f.teams.home);
    const away = toTeam(f.teams.away);
    if (home) teamsById.set(home.id, home);
    if (away) teamsById.set(away.id, away);

    matches.push({
      id: String(f.fixture.id),
      stage,
      group: stage === "GROUP" && home
        ? groupMap.get(f.teams.home.id)
        : undefined,
      status,
      minute: f.fixture.status.elapsed,
      kickoff: f.fixture.date,
      stadium: f.fixture.venue.name ?? undefined,
      city: f.fixture.venue.city ?? undefined,
      venue: f.fixture.venue.name ?? undefined,
      home, away,
      homeScore: f.goals.home,
      awayScore: f.goals.away,
      homePens: f.score.penalty.home,
      awayPens: f.score.penalty.away,
    });
  }

  // Assign FIFA-style match numbers (1..104) by kickoff order. The provider
  // doesn't expose an official match number, and chronological order matches
  // the official numbering closely (group stage first, then knockouts).
  matches
    .slice()
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff) || a.id.localeCompare(b.id))
    .forEach((m, i) => { m.matchNumber = i + 1; });

  return {
    teams: [...teamsById.values()],
    matches,
    updatedAt: new Date().toISOString(),
    source: "api",
  };

  function toTeam(t: { id: number; name: string; logo: string } | null): Team | null {
    if (!t || !t.id) return null;
    return { id: String(t.id), name: t.name, code: shortCode(t.name), flag: t.logo };
  }
}

// ---------- box score (events) ----------
// Pulled per-fixture (on demand, when someone opens a match) so the main poll
// stays cheap on the free tier. `homeTeamId` lets us resolve each event to a
// side without an extra fixture lookup.

interface ApiEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number };
  player: { name: string | null };
  assist: { name: string | null };
  type: string;   // "Goal" | "Card" | "subst" | "Var"
  detail: string; // "Normal Goal" | "Yellow Card" | "Own Goal" | ...
}

function eventType(t: string): MatchEventType {
  const s = t.toLowerCase();
  if (s === "goal") return "GOAL";
  if (s === "card") return "CARD";
  if (s === "subst") return "SUBST";
  if (s === "var") return "VAR";
  return "OTHER";
}

export async function fetchMatchEvents(
  key: string, fixtureId: string, homeTeamId?: string,
): Promise<MatchEvent[]> {
  const data = await getJson(
    `${BASE}/fixtures/events?fixture=${encodeURIComponent(fixtureId)}`, key);
  const rows: ApiEvent[] = data?.response ?? [];
  const events: MatchEvent[] = rows.map((e) => ({
    minute: e.time.elapsed ?? 0,
    extra: e.time.extra,
    type: eventType(e.type),
    side: homeTeamId && String(e.team.id) === String(homeTeamId) ? "home" : "away",
    player: e.player?.name ?? undefined,
    assist: e.assist?.name ?? undefined,
    detail: e.detail,
  }));
  return events.sort((a, b) =>
    (a.minute + (a.extra ?? 0) / 100) - (b.minute + (b.extra ?? 0) / 100));
}
