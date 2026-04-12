"use client";
import { useState, useEffect } from "react";
import { Scoreboard } from "@/components/scoreboard";
import { PositionMap } from "@/components/position-map";
import { EventTimeline } from "@/components/event-timeline";
import StatusDot from "@/components/status-dot";
import { formatDuration, truncateUuid } from "@/lib/utils";

interface Player {
  id: number;
  slot: number;
  handle: string | null;
  team: number | null;
  entityId: number | null;
  kills: number;
  deaths: number;
  cs: number;
  level: number;
  gold: number;
  xp: number;
  posX: number;
  posY: number;
  itemsBought: number;
}

interface MatchEvent {
  id: number;
  timeS: number;
  eventType: string;
  text: string;
}

interface MatchInfo {
  id: number;
  matchId: string;
  gameMode: string | null;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationS: number | null;
  totalPackets: number;
  userHandle: string | null;
}

interface MatchDetailData {
  match: MatchInfo;
  players: Player[];
  events: MatchEvent[];
}

export default function MatchClient({
  initial,
  matchDbId,
}: {
  initial: MatchDetailData;
  matchDbId: number;
}) {
  const [data, setData] = useState(initial);

  const isLive = data.match.status === "live";

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/matches/${matchDbId}`);
      if (res.ok) setData(await res.json());
    }, 1000);
    return () => clearInterval(id);
  }, [isLive, matchDbId]);

  const m = data.match;

  const mapPlayers = data.players
    .filter((p) => p.entityId != null)
    .map((p) => ({
      handle: p.handle,
      team: p.team,
      posX: p.posX,
      posY: p.posY,
      entityId: p.entityId!,
    }));

  return (
    <div className="flex flex-col gap-5">
      {/* Top bar */}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <span className="font-mono text-base text-[#e5e5e5]">
          {truncateUuid(m.matchId)}
        </span>
        {m.gameMode && (
          <span className="px-2 py-0.5 text-xs rounded bg-[#1a1a1a] border border-[#2a2a2a] text-[#999]">
            {m.gameMode}
          </span>
        )}
        <span className="font-mono text-[#999]">
          {formatDuration(m.durationS)}
        </span>
        <StatusDot status={isLive ? "live" : "completed"} />
        <span className="text-[#666] text-xs font-mono">
          {m.totalPackets} pkts
        </span>
      </div>

      {/* Scoreboard */}
      <Scoreboard players={data.players} />

      {/* Two column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-[#2a2a2a] overflow-hidden">
          <PositionMap players={mapPlayers} />
        </div>
        <div className="rounded-lg border border-[#2a2a2a] overflow-hidden">
          <EventTimeline events={data.events} />
        </div>
      </div>
    </div>
  );
}
