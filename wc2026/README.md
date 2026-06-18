# World Cup 2026 — Live Tracker

A live site for the 48-team 2026 FIFA World Cup: live scores, group standings,
a third-place qualification race, tournament stats, and a knockout bracket that
fills itself in as results come in. Built with Next.js (App Router), deploys to
Vercel in a few minutes, and ships with sample data so it works the moment it's
running — before you even add an API key.

## Deploy to Vercel (≈5 minutes)

1. Push this folder to a new GitHub repo:
   ```bash
   git init && git add . && git commit -m "World Cup 2026 tracker"
   git branch -M main
   git remote add origin https://github.com/<you>/worldcup-2026.git
   git push -u origin main
   ```
2. Go to vercel.com → **Add New → Project** → import the repo. Framework
   auto-detects as **Next.js**. Click **Deploy**. It goes live on sample data.
3. To switch to live data, add one environment variable in
   **Vercel → Project → Settings → Environment Variables**:
   - `API_FOOTBALL_KEY` = your key from https://www.api-football.com/
     (free tier: 100 requests/day; the app caches for 30s so that's plenty for
     a personal site).
   Redeploy. That's it — the site is now live.

## Run locally

```bash
npm install
cp .env.example .env.local   # paste your key (optional)
npm run dev                   # http://localhost:3000
```

Without a key it serves the sample dataset; with a key it serves live data.

## How the live data + key stay safe

The browser never sees your API key. Pages poll `/api/data` (a Vercel
serverless route) every 30 seconds. That route holds the key server-side,
fetches from the provider, caches the response for 30s to protect your quota,
and falls back to the last good response (or sample data) if the provider
hiccups. Swap providers by reimplementing `fetchTournament()` in `lib/api.ts` —
nothing else changes.

## How the bracket auto-advances

Everything is derived live from the match list (`lib/standings.ts`,
`lib/bracket.ts`):

- **Group tables** apply the real FIFA tiebreakers in order: points → goal
  difference → goals scored → head-to-head mini-table among tied teams.
- **Top two** of each group fill their knockout slots the moment that group
  finishes.
- **Third-place race** ranks all 12 third-placed teams against each other; the
  best 8 advance and slot into the Round of 32.
- **Knockout winners** propagate through R16 → QF → SF → Final automatically,
  including penalty-shootout results when a knockout match is level.

One honest caveat: FIFA's exact mapping of *which* third-placed group fills
*which* R32 slot follows the **Annex C** table (495 possible combinations). The
engine implements a working allocation, but for the official wall-chart slotting
the app defers to the live API, which assigns the real fixtures once the group
stage is complete. The `R32` table and `thirdFrom` constraints in
`lib/bracket.ts` are isolated and commented so you can pin them to the official
chart if you want the predictor to match it exactly.

## What's inside

```
app/
  page.tsx          Live + today + latest + upcoming
  groups/           12 group tables + per-group results + live third-place race
  results/          Every match by date, filterable, tap-through to box scores
  match/[id]/       Match detail: number, ET time, venue, and box-score timeline
  bracket/          Auto-advancing knockout bracket
  stats/            Tournament-wide stats (live)
  api/data/route.ts      Serverless data route (hides key, caches, falls back)
  api/match/[id]/route.ts Per-match box score (events), fetched on demand
lib/
  types.ts          Shared shapes (Match now carries number, city/stadium, events)
  standings.ts      Tables, tiebreakers, best-third ranking
  bracket.ts        R32 build + Annex-C-style allocation + propagation
  api.ts            API-Football adapter (swappable) + events fetcher
  seed.ts           Offline sample dataset (numbers, venues, synthesized goals)
  venues.ts         16 host venues + Eastern-time (ET) formatting helpers
  useTournament.ts  Client hook (30s polling + live computation)
components/         Nav, match cards, ticker, bracket, shared UI
```

Every match — on the home page, results hub, group pages and bracket — shows its
**match number (#1–104)**, **kickoff in Eastern time (ET)**, and **stadium + host
city**, and is tappable to a **box score** (goal/card/sub timeline). Eastern time
uses `America/New_York`, so kickoffs render as EDT during the tournament and EST
otherwise — labelled "ET" so it's always correct. When the live key is connected,
venues, scorers and cards come straight from the provider; offline, the sample
data supplies plausible venues and a synthesized goal timeline so nothing is blank.

The bracket engine is covered by quick checks during development — it builds 32
distinct R32 teams with no duplicates, resolves all six stages, and runs cleanly
from kickoff to a champion.

## Ideas to extend (low effort, high value)

- **Player leaders**: wire `/players/topscorers?league=1&season=2026` into a new
  Stats card (the provider already exposes it).
- **Predictor mode**: let visitors click winners to fork their own bracket —
  the engine already accepts hypothetical results; just feed user picks into
  `buildBracket` instead of (or alongside) live results.
- **Match detail pages**: lineups, events, and shot stats per fixture via the
  provider's `/fixtures?id=` embedded objects.
- **Notifications**: a goal-alert webhook or PWA push for a favourite team.
- **Timezone toggle**: kickoff times currently render in the visitor's local
  zone; add an explicit selector if you want venue-local or a fixed zone.
```
```
