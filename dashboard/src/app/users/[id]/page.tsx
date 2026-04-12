import { db } from "@/db";
import { users, matches } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import UserDetailClient from "./_user-client";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);

  const [userRows, userMatches] = await Promise.all([
    db.select().from(users).where(eq(users.id, numId)).limit(1),
    db
      .select({
        id: matches.id,
        matchId: matches.matchId,
        gameMode: matches.gameMode,
        status: matches.status,
        startedAt: matches.startedAt,
        durationS: matches.durationS,
      })
      .from(matches)
      .where(eq(matches.userId, numId))
      .orderBy(desc(matches.startedAt)),
  ]);

  if (!userRows[0]) notFound();

  const u = userRows[0];

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] p-6">
      <UserDetailClient
        user={{
          ...u,
          connectedAt: u.connectedAt?.toISOString() ?? null,
          lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        }}
        initialMatches={userMatches.map((m) => ({
          ...m,
          startedAt: m.startedAt?.toISOString() ?? null,
        }))}
        userId={numId}
      />
    </main>
  );
}
