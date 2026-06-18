// Shared types for the World Cup 2026 tracker.
// Kept deliberately minimal so the API adapter and the seed data can both
// produce the same shapes without friction.

export type GroupId =
  | "A" | "B" | "C" | "D" | "E" | "F"
  | "G" | "H" | "I" | "J" | "K" | "L";

export type MatchStatus =
  | "SCHEDULED"
  | "LIVE"       // 1H, HT, 2H, ET, P all collapse to LIVE for the UI
  | "FINISHED";

export interface Team {
  id: string;        // stable id (API team id or ISO code)
  name: string;
  code: string;      // 3-letter code, e.g. "BRA"
  flag?: string;     // emoji or URL; emoji keeps us dependency-free
}

export interface Match {
  id: string;
  matchNumber?: number;   // FIFA-style match number (1–104), by kickoff order
  pageUrl?: string;       // provider match page path, for fetching the box score
  stage: Stage;
  group?: GroupId;       // only for group-stage matches
  status: MatchStatus;
  minute?: number | null; // live clock if available
  kickoff: string;        // ISO timestamp (UTC)
  venue?: string;         // legacy single-string venue (fallback)
  stadium?: string;       // e.g. "MetLife Stadium"
  city?: string;          // e.g. "New York / New Jersey"
  country?: string;       // "USA" | "CAN" | "MEX"
  home: Team | null;      // null in knockout slots not yet decided
  away: Team | null;
  homeScore: number | null;
  awayScore: number | null;
  // Penalty shootout result for knockout draws after extra time.
  homePens?: number | null;
  awayPens?: number | null;
  // Box-score timeline (goals, cards, subs). May be empty until fetched.
  events?: MatchEvent[];
}

// A single box-score event. `side` is resolved relative to this match's
// home/away so the UI never has to re-match team ids.
export interface MatchEvent {
  minute: number;
  extra?: number | null;   // stoppage-time minutes, e.g. 90+3 -> extra: 3
  type: "GOAL" | "CARD" | "SUBST" | "VAR" | "OTHER";
  side: "home" | "away";
  player?: string;
  assist?: string;
  detail?: string;         // "Yellow Card", "Penalty", "Own Goal", ...
}

export type Stage =
  | "GROUP"
  | "R32"
  | "R16"
  | "QF"
  | "SF"
  | "THIRD_PLACE"
  | "FINAL";

export interface StandingRow {
  team: Team;
  group: GroupId;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  rank: number;       // 1..4 within the group
  qualified?: boolean; // provider's official qualification flag (e.g. 3rd-place race)
}

// A knockout slot is filled either by a concrete team or by a reference
// that resolves once earlier results are known.
export interface BracketSlot {
  id: string;            // e.g. "R32-1"
  stage: Stage;
  label: string;         // human label, e.g. "Match 73"
  home: SlotSource;
  away: SlotSource;
  kickoff?: string;
  venue?: string;
  // resolved result once played
  result?: {
    home: Team;
    away: Team;
    homeScore: number;
    awayScore: number;
    homePens?: number;
    awayPens?: number;
    winner: "home" | "away" | null;
  };
}

// Where a slot's occupant comes from.
export type SlotSource =
  | { kind: "winner-group"; group: GroupId }      // "1A"
  | { kind: "runner-group"; group: GroupId }      // "2B"
  | { kind: "third"; bucket: string }             // "3rd from group set {A/B/C/D}"
  | { kind: "winner-match"; matchId: string }     // winner of R32-1
  | { kind: "loser-match"; matchId: string }      // for third-place playoff
  | { kind: "team"; team: Team }                  // fully resolved
  | { kind: "label"; text: string }               // provider placeholder, e.g. "1E", "3ABCDF"
  | { kind: "tbd" };

export interface TournamentData {
  teams: Team[];
  matches: Match[];
  // Official, provider-supplied tables and bracket. Present when live data is
  // connected; absent for seed data (the client computes those locally instead).
  standings?: Record<GroupId, StandingRow[]>;
  thirdPlace?: StandingRow[];   // the 12 third-placed teams, ranked, with qualified flag
  bracket?: BracketSlot[];      // official knockout bracket, slots filled as results land
  updatedAt: string;
  source: "api" | "seed";
  error?: string;
}
