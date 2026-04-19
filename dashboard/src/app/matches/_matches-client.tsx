"use client";
import { useState, useEffect } from "react";
import { MatchCard } from "@/components/match-card";

interface Match {
  id: number;
  matchId: string;
  gameMode: string | null;
  status: string;
  startedAt: string | null;
  durationS: number | null;
  totalPackets: number;
  winningTeam: number;
  userHandle: string | null;
  blueKills: number;
  redKills: number;
}

interface MatchesData {
  matches: Match[];
}

export default function MatchesClient({ initial }: { initial: MatchesData }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch("/api/matches");
      if (res.ok) setData(await res.json());
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const liveCount = data.matches.filter((m) => m.status === "live").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-[#e5e5e5]">Matches</h1>
        {liveCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-mono rounded bg-green-900/40 text-green-400 border border-green-800/50">
            {liveCount} live
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {data.matches.map((m) => (
          <MatchCard key={m.id} {...m} />
        ))}
        {data.matches.length === 0 && (
          <p className="text-[#666] text-sm">No matches yet.</p>
        )}
      </div>
    </div>
  );
}
