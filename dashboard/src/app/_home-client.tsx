"use client";
import { useState, useEffect, lazy, Suspense } from "react";
import { UserCard } from "@/components/user-card";

const Globe = lazy(() =>
  import("@/components/globe").then((m) => ({ default: m.Globe }))
);

interface User {
  id: number;
  playerHandle: string;
  playerUuid: string;
  clientIp: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  isOnline: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
}

interface OverviewData {
  users: User[];
  liveMatches: number;
  totalMatches: number;
}

export default function HomeClient({ initial }: { initial: OverviewData }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      const res = await fetch("/api/overview");
      if (res.ok) setData(await res.json());
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const globeUsers = data.users
    .filter((u) => u.lat != null && u.lng != null)
    .map((u) => ({
      lat: u.lat!,
      lng: u.lng!,
      playerHandle: u.playerHandle,
      country: u.country,
    }));

  return (
    <div className="flex flex-col gap-6">
      {/* Stats bar */}
      <div className="flex gap-6 text-sm">
        <div>
          <span className="font-mono text-lg text-[#e5e5e5]">
            {data.users.length}
          </span>{" "}
          <span className="text-[#666]">users online</span>
        </div>
        <div>
          <span className="font-mono text-lg text-[#e5e5e5]">
            {data.liveMatches}
          </span>{" "}
          <span className="text-[#666]">live matches</span>
        </div>
        <div>
          <span className="font-mono text-lg text-[#e5e5e5]">
            {data.totalMatches}
          </span>{" "}
          <span className="text-[#666]">total matches</span>
        </div>
      </div>

      {/* Globe */}
      <div className="w-full h-[420px] rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] overflow-hidden">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-[#666] text-sm">
              Loading globe...
            </div>
          }
        >
          <Globe users={globeUsers} />
        </Suspense>
      </div>

      {/* Connected users grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.users.map((u) => (
          <UserCard key={u.id} {...u} />
        ))}
      </div>
    </div>
  );
}
