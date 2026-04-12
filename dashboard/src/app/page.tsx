import { db } from "@/db";
import { users, matches } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import HomeClient from "./_home-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [onlineUsers, liveCount, totalCount] = await Promise.all([
    db.select().from(users).where(eq(users.isOnline, true)),
    db
      .select({ value: count() })
      .from(matches)
      .where(eq(matches.status, "live")),
    db.select({ value: count() }).from(matches),
  ]);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] p-6">
      <HomeClient
        initial={{
          users: onlineUsers.map((u) => ({
            ...u,
            connectedAt: u.connectedAt?.toISOString() ?? null,
            lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
          })),
          liveMatches: liveCount[0]?.value ?? 0,
          totalMatches: totalCount[0]?.value ?? 0,
        }}
      />
    </main>
  );
}
