import { db } from "@/db";
import { matches, users, matchPlayers, matchEvents } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    db
      .select()
      .from(matchPlayers)
      .where(eq(matchPlayers.matchId, numId)),
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

  if (!matchRows[0]) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json({
    match: matchRows[0],
    players,
    events,
  });
}
