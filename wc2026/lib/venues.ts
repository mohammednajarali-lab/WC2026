// The 16 host venues of the 2026 FIFA World Cup (USA, Canada, Mexico).
// Stadium names are the common/recognizable names; FIFA uses neutral
// "<City> Stadium" branding during the tournament. City + stadium are what
// fans actually search for, so we keep both.
//
// When the live API is connected, real per-fixture venue + city come straight
// from the provider. This table is used for the offline/seed view and as a
// lookup when a provider omits a venue.

export interface Venue {
  city: string;
  stadium: string;
  country: "USA" | "CAN" | "MEX";
}

export const VENUES: Venue[] = [
  { city: "Mexico City", stadium: "Estadio Azteca", country: "MEX" },
  { city: "Guadalajara", stadium: "Estadio Akron", country: "MEX" },
  { city: "Monterrey", stadium: "Estadio BBVA", country: "MEX" },
  { city: "Toronto", stadium: "BMO Field", country: "CAN" },
  { city: "Vancouver", stadium: "BC Place", country: "CAN" },
  { city: "Atlanta", stadium: "Mercedes-Benz Stadium", country: "USA" },
  { city: "Boston", stadium: "Gillette Stadium", country: "USA" },
  { city: "Dallas", stadium: "AT&T Stadium", country: "USA" },
  { city: "Houston", stadium: "NRG Stadium", country: "USA" },
  { city: "Kansas City", stadium: "Arrowhead Stadium", country: "USA" },
  { city: "Los Angeles", stadium: "SoFi Stadium", country: "USA" },
  { city: "Miami", stadium: "Hard Rock Stadium", country: "USA" },
  { city: "New York / New Jersey", stadium: "MetLife Stadium", country: "USA" },
  { city: "Philadelphia", stadium: "Lincoln Financial Field", country: "USA" },
  { city: "San Francisco Bay Area", stadium: "Levi's Stadium", country: "USA" },
  { city: "Seattle", stadium: "Lumen Field", country: "USA" },
];

// Deterministic venue for a given match number (used by the seed builder so
// the offline schedule spreads across all 16 host cities).
export function venueForNumber(n: number): Venue {
  return VENUES[(n - 1 + VENUES.length) % VENUES.length];
}

// Official FIFA knockout-stage venue assignments, keyed by FIFA match number
// (73–104). These are fixed by the published schedule regardless of which
// teams qualify, so we can show the stadium for every knockout tie up front.
export const KNOCKOUT_VENUES: Record<number, { stadium: string; city: string }> = {
  // Round of 32 (73–88)
  73: { stadium: "SoFi Stadium", city: "Los Angeles" },
  74: { stadium: "Gillette Stadium", city: "Boston" },
  75: { stadium: "Estadio BBVA", city: "Monterrey" },
  76: { stadium: "NRG Stadium", city: "Houston" },
  77: { stadium: "MetLife Stadium", city: "New York / New Jersey" },
  78: { stadium: "AT&T Stadium", city: "Dallas" },
  79: { stadium: "Estadio Azteca", city: "Mexico City" },
  80: { stadium: "Mercedes-Benz Stadium", city: "Atlanta" },
  81: { stadium: "Levi's Stadium", city: "San Francisco Bay Area" },
  82: { stadium: "Lumen Field", city: "Seattle" },
  83: { stadium: "BMO Field", city: "Toronto" },
  84: { stadium: "SoFi Stadium", city: "Los Angeles" },
  85: { stadium: "BC Place", city: "Vancouver" },
  86: { stadium: "Hard Rock Stadium", city: "Miami" },
  87: { stadium: "Arrowhead Stadium", city: "Kansas City" },
  88: { stadium: "AT&T Stadium", city: "Dallas" },
  // Round of 16 (89–96)
  89: { stadium: "Lincoln Financial Field", city: "Philadelphia" },
  90: { stadium: "NRG Stadium", city: "Houston" },
  91: { stadium: "MetLife Stadium", city: "New York / New Jersey" },
  92: { stadium: "Estadio Azteca", city: "Mexico City" },
  93: { stadium: "AT&T Stadium", city: "Dallas" },
  94: { stadium: "Lumen Field", city: "Seattle" },
  95: { stadium: "Mercedes-Benz Stadium", city: "Atlanta" },
  96: { stadium: "BC Place", city: "Vancouver" },
  // Quarter-finals (97–100)
  97: { stadium: "Gillette Stadium", city: "Boston" },
  98: { stadium: "SoFi Stadium", city: "Los Angeles" },
  99: { stadium: "Hard Rock Stadium", city: "Miami" },
  100: { stadium: "Arrowhead Stadium", city: "Kansas City" },
  // Semi-finals (101–102)
  101: { stadium: "AT&T Stadium", city: "Dallas" },
  102: { stadium: "Mercedes-Benz Stadium", city: "Atlanta" },
  // Third-place play-off (103) and Final (104)
  103: { stadium: "Hard Rock Stadium", city: "Miami" },
  104: { stadium: "MetLife Stadium", city: "New York / New Jersey" },
};

// ---------- Eastern-time display ----------
// America/New_York automatically resolves to EDT in summer (the World Cup runs
// June–July, so kickoffs display as EDT) and EST otherwise. We label it "ET"
// so it's correct year-round; the user asked for Eastern time.

const ET = "America/New_York";

export function formatET(iso?: string | null): string {
  const d = parse(iso);
  if (!d) return "TBD";
  const date = d.toLocaleDateString("en-US", {
    timeZone: ET, weekday: "short", month: "short", day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: ET, hour: "numeric", minute: "2-digit",
  });
  return `${date} · ${time} ET`;
}

export function formatETTime(iso?: string | null): string {
  const d = parse(iso);
  if (!d) return "TBD";
  return d.toLocaleTimeString("en-US", {
    timeZone: ET, hour: "numeric", minute: "2-digit",
  }) + " ET";
}

export function formatETShort(iso?: string | null): string {
  const d = parse(iso);
  if (!d) return "TBD";
  return d.toLocaleString("en-US", {
    timeZone: ET, weekday: "short", hour: "numeric", minute: "2-digit",
  });
}

// A stable, human key for grouping matches by their Eastern calendar day.
export function etDateKey(iso?: string | null): string {
  const d = parse(iso);
  if (!d) return "Date TBD";
  return d.toLocaleDateString("en-US", {
    timeZone: ET, weekday: "long", month: "long", day: "numeric",
  });
}

// Sortable yyyy-mm-dd key in Eastern time for ordering day groups.
export function etSortKey(iso?: string | null): string {
  const d = parse(iso);
  if (!d) return "9999";
  return d.toLocaleDateString("en-CA", { timeZone: ET }); // en-CA => YYYY-MM-DD
}

function parse(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(+d) ? null : d;
}

export function whereLabel(
  m: { city?: string; stadium?: string; venue?: string },
): string {
  if (m.city && m.stadium) return `${m.stadium} · ${m.city}`;
  if (m.stadium) return m.stadium;
  if (m.venue) return m.venue;
  return "";
}
