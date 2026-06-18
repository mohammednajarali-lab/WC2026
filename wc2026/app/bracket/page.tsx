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
        The road to MetLife Stadium on July 19. Slots fill automatically — group winners and
        runners-up the moment a group finishes, the eight best third-placed teams once every
        group is done, then each knockout winner as the final whistle blows.
      </p>

      <div className="predict-note">
        {groupsDone
          ? "Group stage complete — knockout matchups are set and advancing live."
          : "Group stage in progress. Winner / runner-up slots resolve as groups finish; third-place slots lock once all 12 groups are done."}
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
