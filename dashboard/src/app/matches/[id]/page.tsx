import { db } from "@/db";
import { matches, users, matchPlayers, matchEvents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import MatchClient from "./_match-client";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);

  const [matchRows, players, events] = await Promise.all([
    db
      .select({
        id: matches.id,
        matchId: matches.matchId,
        gameMode: matches.gameMode,
        status: matches.status,
        startedAt: matches.startedAt,
        endedAt: matches.endedAt,
        durationS: matches.durationS,
        totalPackets: matches.totalPackets,
        userHandle: users.playerHandle,
      })
      .from(matches)
      .leftJoin(users, eq(matches.userId, users.id))
      .where(eq(matches.id, numId))
      .limit(1),
    db.select().from(matchPlayers).where(eq(matchPlayers.matchId, numId)),
    db
      .select({
        id: matchEvents.id,
        timeS: matchEvents.timeS,
        eventType: matchEvents.eventType,
        text: matchEvents.text,
      })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, numId))
      .orderBy(desc(matchEvents.timeS)),
  ]);

  if (!matchRows[0]) notFound();

  const m = matchRows[0];

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] p-6">
      <MatchClient
        initial={{
          match: {
            ...m,
            startedAt: m.startedAt?.toISOString() ?? null,
            endedAt: m.endedAt?.toISOString() ?? null,
          },
          players,
          events,
        }}
        matchDbId={numId}
      />
    </main>
  );
}
