import type { GroupId, Match, MatchEvent, Team, TournamentData } from "./types";
import { venueForNumber } from "./venues";

// Offline fallback data so the site renders before an API key is added.
// Once NEXT_PUBLIC has a key and the API route returns live data, this is
// ignored. Treat the live API as the source of truth for real standings.

type Seed = { code: string; name: string; flag: string };

// 48 teams across 12 groups (A–L). Sample arrangement for the offline view.
const GROUP_TEAMS: Record<GroupId, Seed[]> = {
  A: [t("MEX","Mexico","🇲🇽"), t("KOR","South Korea","🇰🇷"), t("NOR","Norway","🇳🇴"), t("CIV","Côte d'Ivoire","🇨🇮")],
  B: [t("CAN","Canada","🇨🇦"), t("ECU","Ecuador","🇪🇨"), t("QAT","Qatar","🇶🇦"), t("UZB","Uzbekistan","🇺🇿")],
  C: [t("USA","United States","🇺🇸"), t("PAR","Paraguay","🇵🇾"), t("AUS","Australia","🇦🇺"), t("RSA","South Africa","🇿🇦")],
  D: [t("ARG","Argentina","🇦🇷"), t("JPN","Japan","🇯🇵"), t("SCO","Scotland","🇸🇨"), t("PAN","Panama","🇵🇦")],
  E: [t("FRA","France","🇫🇷"), t("SEN","Senegal","🇸🇳"), t("NZL","New Zealand","🇳🇿"), t("JOR","Jordan","🇯🇴")],
  F: [t("BRA","Brazil","🇧🇷"), t("MAR","Morocco","🇲🇦"), t("CRO","Croatia","🇭🇷"), t("CPV","Cabo Verde","🇨🇻")],
  G: [t("ENG","England","🏴󠁧󠁢󠁥󠁮󠁧󠁿"), t("COL","Colombia","🇨🇴"), t("EGY","Egypt","🇪🇬"), t("NCL","New Caledonia","🇳🇨")],
  H: [t("ESP","Spain","🇪🇸"), t("URU","Uruguay","🇺🇾"), t("IRN","Iran","🇮🇷"), t("HAI","Haiti","🇭🇹")],
  I: [t("POR","Portugal","🇵🇹"), t("TUN","Tunisia","🇹🇳"), t("CRC","Costa Rica","🇨🇷"), t("CUW","Curaçao","🇨🇼")],
  J: [t("NED","Netherlands","🇳🇱"), t("NGA","Nigeria","🇳🇬"), t("KSA","Saudi Arabia","🇸🇦"), t("GHA","Ghana","🇬🇭")],
  K: [t("GER","Germany","🇩🇪"), t("BEL","Belgium","🇧🇪"), t("ALG","Algeria","🇩🇿"), t("JAM","Jamaica","🇯🇲")],
  L: [t("ITA","Italy","🇮🇹"), t("SUI","Switzerland","🇨🇭"), t("PER","Peru","🇵🇪"), t("OMA","Oman","🇴🇲")],
};

function t(code: string, name: string, flag: string): Seed {
  return { code, name, flag };
}

const GROUPS: GroupId[] = ["A","B","C","D","E","F","G","H","I","J","K","L"];

function buildTeams(): Team[] {
  const teams: Team[] = [];
  for (const g of GROUPS) {
    for (const s of GROUP_TEAMS[g]) {
      teams.push({ id: s.code, name: s.name, code: s.code.slice(0,3), flag: s.flag });
    }
  }
  return teams;
}

// Round-robin fixtures per group (matchdays 1–3) with a deterministic mock
// scoreline so the offline standings look alive. Matchday timings are spread
// across the real group-stage window (June 11–27, 2026).
function buildMatches(teams: Team[]): Match[] {
  const byCode = new Map(teams.map(t => [t.code, t]));
  const matches: Match[] = [];
  let n = 1;

  GROUPS.forEach((g, gi) => {
    const codes = GROUP_TEAMS[g].map(s => s.code.slice(0,3));
    // standard 4-team round robin pairings
    const days: [number, number][][] = [
      [[0,1],[2,3]],
      [[0,2],[1,3]],
      [[0,3],[1,2]],
    ];
    days.forEach((day, d) => {
      day.forEach(([i, j]) => {
        const home = byCode.get(codes[i])!;
        const away = byCode.get(codes[j])!;
        const kickoff = new Date(Date.UTC(2026, 5, 11 + gi + d * 5, 18, 0)).toISOString();
        // Deterministic pseudo-result so the table isn't empty.
        const seedNum = (gi * 7 + d * 3 + i + j) % 5;
        const hs = (seedNum) % 4;
        const as = (seedNum + i) % 3;
        const finished = d < 2; // matchdays 1–2 done, matchday 3 upcoming
        matches.push({
          id: `G-${g}-${n++}`,
          stage: "GROUP",
          group: g,
          status: finished ? "FINISHED" : "SCHEDULED",
          kickoff,
          home, away,
          homeScore: finished ? hs : null,
          awayScore: finished ? as : null,
        });
      });
    });
  });

  // Number matches in kickoff order (1..72) and assign a host venue to each,
  // spreading across all 16 cities. Synthesize a goal timeline for finished
  // matches so the box-score view isn't empty before live data is connected.
  matches.sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
  matches.forEach((m, i) => {
    const num = i + 1;
    const v = venueForNumber(num);
    m.matchNumber = num;
    m.stadium = v.stadium;
    m.city = v.city;
    m.country = v.country;
    if (m.status === "FINISHED") {
      m.events = synthEvents(m.homeScore ?? 0, m.awayScore ?? 0, num);
    }
  });

  return matches;
}

// Build a plausible, deterministic goal timeline matching a scoreline.
// Player names are unknown offline, so goals are attributed to the side only;
// once the live provider is connected, real scorers and cards replace these.
function synthEvents(hs: number, as: number, seed: number): MatchEvent[] {
  const evs: MatchEvent[] = [];
  const mins: number[] = [];
  const total = hs + as;
  for (let i = 0; i < total; i++) {
    // spread goals across 5..88 deterministically
    mins.push(5 + ((seed * 17 + i * 23) % 84));
  }
  mins.sort((a, b) => a - b);
  let mi = 0;
  for (let i = 0; i < hs; i++) evs.push({ minute: mins[mi++] ?? 45, type: "GOAL", side: "home" });
  for (let i = 0; i < as; i++) evs.push({ minute: mins[mi++] ?? 60, type: "GOAL", side: "away" });
  return evs.sort((a, b) => a.minute - b.minute);
}

export function seedData(): TournamentData {
  const teams = buildTeams();
  const matches = buildMatches(teams);
  return { teams, matches, updatedAt: new Date().toISOString(), source: "seed" };
}
