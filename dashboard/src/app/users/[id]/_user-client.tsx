"use client";
import { useState, useEffect } from "react";
import { MatchCard } from "@/components/match-card";
import { RpcStream } from "@/components/rpc-stream";
import StatusDot from "@/components/status-dot";
import { truncateUuid, timeAgo } from "@/lib/utils";

interface UserInfo {
  id: number;
  playerHandle: string;
  playerUuid: string;
  clientIp: string;
  country: string | null;
  isOnline: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
}

interface UserMatch {
  id: number;
  matchId: string;
  gameMode: string | null;
  status: string;
  startedAt: string | null;
  durationS: number | null;
}

interface RpcLog {
  id: number;
  ts: string;
  method: string;
  category: string | null;
  status: number | null;
  url: string | null;
  req: unknown;
  res: unknown;
}

export default function UserDetailClient({
  user,
  initialMatches,
  userId,
}: {
  user: UserInfo;
  initialMatches: UserMatch[];
  userId: number;
}) {
  const [tab, setTab] = useState<"matches" | "rpc">("matches");
  const [rpcLogs, setRpcLogs] = useState<RpcLog[]>([]);
  const [rpcLoaded, setRpcLoaded] = useState(false);

  useEffect(() => {
    if (tab !== "rpc") return;
    const load = async () => {
      const res = await fetch(`/api/users/${userId}/rpc`);
      if (res.ok) {
        const data = await res.json();
        setRpcLogs(data.logs);
        setRpcLoaded(true);
      }
    };
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [tab, userId]);

  return (
    <div className="flex flex-col h-[calc(100vh-40px)]">
      {/* User header */}
      <div className="flex flex-col gap-2 px-6 pt-6 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <StatusDot status={user.isOnline ? "online" : "offline"} />
          <h1 className="text-xl font-semibold">{user.playerHandle}</h1>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#666]">
          <span className="font-mono">{truncateUuid(user.playerUuid)}</span>
          <span className="font-mono">{user.clientIp}</span>
          {user.country && <span>{user.country}</span>}
          <span>
            {user.isOnline
              ? `connected ${timeAgo(user.connectedAt)}`
              : `last seen ${timeAgo(user.lastSeenAt)}`}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#2a2a2a] px-6 shrink-0">
        <button
          onClick={() => setTab("matches")}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            tab === "matches"
              ? "border-[#e5e5e5] text-[#e5e5e5]"
              : "border-transparent text-[#666] hover:text-[#999]"
          }`}
        >
          Matches ({initialMatches.length})
        </button>
        <button
          onClick={() => setTab("rpc")}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            tab === "rpc"
              ? "border-[#e5e5e5] text-[#e5e5e5]"
              : "border-transparent text-[#666] hover:text-[#999]"
          }`}
        >
          RPC Stream
        </button>
      </div>

      {/* Tab content — fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "matches" && (
          <div className="flex flex-col gap-2 p-6 overflow-y-auto h-full">
            {initialMatches.map((m) => (
              <MatchCard
                key={m.id}
                id={m.id}
                matchId={m.matchId}
                gameMode={m.gameMode}
                status={m.status}
                startedAt={m.startedAt}
                durationS={m.durationS}
                userHandle={null}
                winningTeam={0}
                blueKills={0}
                redKills={0}
              />
            ))}
            {initialMatches.length === 0 && (
              <p className="text-[#666] text-sm">No matches yet.</p>
            )}
          </div>
        )}

        {tab === "rpc" && (
          <div className="h-full">
            {!rpcLoaded ? (
              <p className="text-[#666] text-sm p-6">Loading...</p>
            ) : (
              <RpcStream logs={rpcLogs} fullHeight />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
