"use client";
import { useMemo, useState } from "react";
import type { Match, Team } from "@/lib/types";
import { Flag } from "./ui";

export interface MatchFilterState {
  groups: Set<string>;
  teams: Set<string>; // team ids
}

export const emptyFilter = (): MatchFilterState => ({ groups: new Set(), teams: new Set() });

export function filterActive(f: MatchFilterState): boolean {
  return f.groups.size > 0 || f.teams.size > 0;
}

/**
 * Match passes when it satisfies the active filters. Group and team selections
 * are combined with OR (show a match if it's in any selected group OR involves
 * any selected team), which is the intuitive behaviour for "filter by these".
 */
export function matchPasses(m: Match, f: MatchFilterState): boolean {
  if (!filterActive(f)) return true;
  if (m.group && f.groups.has(m.group)) return true;
  if (f.teams.has(m.home?.id ?? "") || f.teams.has(m.away?.id ?? "")) return true;
  return false;
}

export function MatchFilters({
  matches,
  value,
  onChange,
}: {
  matches: Match[];
  value: MatchFilterState;
  onChange: (next: MatchFilterState) => void;
}) {
  const [open, setOpen] = useState(false);

  // Groups present in the data, sorted A→L.
  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const m of matches) if (m.group) s.add(m.group);
    return [...s].sort();
  }, [matches]);

  // Distinct, *real* teams present in the data, sorted by name. Knockout
  // fixtures carry placeholder "teams" like "1A" or "2D/2G" before they're
  // resolved — those are excluded so only actual nations are selectable.
  const teams = useMemo(() => {
    const isReal = (t: Team) =>
      !!t.id
      && !/^[123][A-L]+(\/[123][A-L]+)?$/.test(t.name)   // "1A", "2D/2G"
      && !/^(winner|loser|w|l)\b/i.test(t.name);          // "Winner QF 1", "Loser SF 2"
    const map = new Map<string, Team>();
    for (const m of matches) {
      if (m.home && isReal(m.home)) map.set(m.home.id, m.home);
      if (m.away && isReal(m.away)) map.set(m.away.id, m.away);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [matches]);

  const toggle = (kind: "groups" | "teams", key: string) => {
    const next: MatchFilterState = {
      groups: new Set(value.groups),
      teams: new Set(value.teams),
    };
    if (next[kind].has(key)) next[kind].delete(key);
    else next[kind].add(key);
    onChange(next);
  };

  const count = value.groups.size + value.teams.size;

  return (
    <div className="mfilter">
      <div className="mfilter-bar">
        <button
          className={`fbtn ${count ? "on" : ""}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          Filter{count ? ` · ${count}` : ""}
        </button>
        {count > 0 && (
          <button className="fbtn clear" onClick={() => onChange(emptyFilter())}>
            Clear
          </button>
        )}
        {/* Active selection chips for quick removal */}
        {[...value.groups].sort().map((g) => (
          <button key={`g-${g}`} className="chip on" onClick={() => toggle("groups", g)}>
            Group {g} <span className="x">×</span>
          </button>
        ))}
        {[...value.teams].map((id) => {
          const t = teams.find((x) => x.id === id);
          if (!t) return null;
          return (
            <button key={`t-${id}`} className="chip on" onClick={() => toggle("teams", id)}>
              <Flag team={t} /> {t.name} <span className="x">×</span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="mfilter-panel">
          {groups.length > 0 && (
            <div className="mfilter-section">
              <div className="mfilter-label">Groups</div>
              <div className="mfilter-chips">
                {groups.map((g) => (
                  <button
                    key={g}
                    className={`chip ${value.groups.has(g) ? "on" : ""}`}
                    onClick={() => toggle("groups", g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mfilter-section">
            <div className="mfilter-label">Teams</div>
            <div className="mfilter-chips">
              {teams.map((t) => (
                <button
                  key={t.id}
                  className={`chip ${value.teams.has(t.id) ? "on" : ""}`}
                  onClick={() => toggle("teams", t.id)}
                >
                  <Flag team={t} /> {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
