import { db } from "@/db";
import { matches, users, matchPlayers } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: matches.id,
      matchId: matches.matchId,
      gameMode: matches.gameMode,
      status: matches.status,
      startedAt: matches.startedAt,
      durationS: matches.durationS,
      totalPackets: matches.totalPackets,
      userHandle: users.playerHandle,
      blueKills: sql<number>`coalesce(sum(case when ${matchPlayers.team} = 1 then ${matchPlayers.kills} else 0 end), 0)`.as("blue_kills"),
      redKills: sql<number>`coalesce(sum(case when ${matchPlayers.team} = 2 then ${matchPlayers.kills} else 0 end), 0)`.as("red_kills"),
    })
    .from(matches)
    .leftJoin(users, eq(matches.userId, users.id))
    .leftJoin(matchPlayers, eq(matches.id, matchPlayers.matchId))
    .groupBy(matches.id, users.playerHandle)
    .orderBy(
      sql`case when ${matches.status} = 'live' then 0 else 1 end`,
      desc(matches.startedAt)
    )
    .limit(50);

  return Response.json({ matches: rows });
}
