"use client";
import { useEffect, useState } from "react";
import type { Match } from "./types";

// A shared 1-second ticker. Every consumer re-renders together each second so
// live clocks across the page stay in lock-step and feel genuinely live.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Compute the live minute label (e.g. "37'", "45+2'", "90+4'") for a match,
// ticking forward from the captured clock. Because we anchor to the capture
// time and add the elapsed wall-clock delta, the value stays accurate even if
// the underlying data is a few seconds stale, and it advances every second.
export function liveClockLabel(clock: Match["clock"], nowMs: number): string {
  if (!clock) return "LIVE";
  const anchor = clock.anchorMs ?? nowMs;
  const delta = clock.running ? Math.max(0, (nowMs - anchor) / 1000) : 0;

  const maxSec = clock.max * 60;
  const addedSec = Math.max(0, clock.added) * 60;
  // Never run past the announced added time during a pause or while waiting for
  // the next data refresh — cap with a small buffer so we don't show a minute
  // that hasn't happened yet.
  const cap = maxSec + addedSec + 59;
  const elapsed = Math.min(clock.elapsed + delta, cap);

  if (elapsed >= maxSec) {
    const extra = Math.max(1, Math.ceil((elapsed - maxSec) / 60));
    return `${clock.max}+${extra}'`;
  }
  const minute = Math.min(clock.max, Math.floor(elapsed / 60) + 1);
  return `${minute}'`;
}
