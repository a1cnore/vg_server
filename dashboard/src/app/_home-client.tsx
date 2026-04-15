"use client";
import { useState, useEffect, lazy, Suspense } from "react";
import { MatchCard } from "@/components/match-card";
import { UserCard } from "@/components/user-card";
import { DownloadWidget } from "@/components/download-widget";
import type { OverviewData } from "@/lib/overview";

const Globe = lazy(() =>
  import("@/components/globe").then((m) => ({ default: m.Globe }))
);

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
      <div className="-mx-6 h-[620px] bg-[#0a0a0a] overflow-hidden relative">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-[#666] text-sm">
              Loading globe...
            </div>
          }
        >
          <Globe users={globeUsers} />
        </Suspense>
        <div className="absolute top-4 right-4 z-10">
          <DownloadWidget />
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#e5e5e5]">
            Recent Matches
          </h2>
          <span className="text-xs text-[#666]">
            {data.recentMatches.length} tracked
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {data.recentMatches.map((match) => (
            <MatchCard key={match.id} {...match} href={null} />
          ))}
          {data.recentMatches.length === 0 && (
            <p className="text-sm text-[#666]">No recent matches yet.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[#e5e5e5]">
            Connected Players
          </h2>
          <span className="text-xs text-[#666]">{data.users.length} online</span>
        </div>

        {data.users.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.users.map((u) => (
              <UserCard key={u.id} {...u} href={null} showIp={false} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#666]">No connected players.</p>
        )}
      </section>
    </div>
  );
}
