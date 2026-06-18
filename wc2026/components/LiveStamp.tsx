"use client";
import { useEffect, useState } from "react";

// A small, always-ticking "updated Xs ago" badge. It re-renders every second
// so the page visibly feels live even between data refreshes.
export function LiveStamp({ updatedAt, live = true }: { updatedAt?: string; live?: boolean }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const ago = relative(updatedAt);

  return (
    <span className={`livestamp ${live ? "on" : "off"}`} aria-live="polite">
      <span className="dot" />
      {live ? "Live" : "Sample"}
      {updatedAt && <span className="ago">· updated {ago}</span>}
    </span>
  );
}

function relative(iso?: string): string {
  if (!iso) return "just now";
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}
