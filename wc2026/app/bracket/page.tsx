"use client";
import { useTournament } from "@/lib/useTournament";
import BracketView from "@/components/BracketView";
import { LiveStamp } from "@/components/LiveStamp";

export default function BracketPage() {
  const { bracket, groupsDone, data } = useTournament();

  return (
    <>
      <div className="pagehead">
        <h1 className="page">Bracket</h1>
        <LiveStamp updatedAt={data?.updatedAt} live={data?.source === "api"} />
      </div>
      <p className="sub">
        The road to MetLife Stadium on July 19. The Round of 32 is seeded live from the current
        group standings, so it always shows who would advance right now — then locks in as each
        group finishes and updates with every knockout result.
      </p>

      <div className="predict-note">
        {groupsDone
          ? "Group stage complete — knockout matchups are set and advancing live."
          : "Group stage in progress. Teams tagged with a seed badge (e.g. 1E, 2A, 3) are the current live projection from the standings and will shift as results change."}
      </div>

      {bracket.length
        ? <BracketView slots={bracket} />
        : <p className="empty">Building bracket…</p>}

      {data?.source === "seed" && (
        <p className="foot">
          Showing the bracket structure with sample qualifiers. The exact third-place slot
          allocation follows FIFA&apos;s Annex C table and is taken from the live API once the
          group stage completes.
        </p>
      )}
    </>
  );
}
