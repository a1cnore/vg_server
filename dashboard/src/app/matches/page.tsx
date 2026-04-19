import { db } from "@/db";
import { matches, users, matchPlayers } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { requireAdminPage } from "@/lib/auth";
import MatchesClient from "./_matches-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage("/matches");

  const rows = await db
    .select({
      id: matches.id,
      matchId: matches.matchId,
      gameMode: matches.gameMode,
      status: matches.status,
      startedAt: matches.startedAt,
      durationS: matches.durationS,
      totalPackets: matches.totalPackets,
      winningTeam: matches.winningTeam,
      userHandle: users.playerHandle,
      blueKills:
        sql<number>`coalesce(sum(case when ${matchPlayers.team} = 1 then ${matchPlayers.kills} else 0 end), 0)`.as(
          "blue_kills"
        ),
      redKills:
        sql<number>`coalesce(sum(case when ${matchPlayers.team} = 2 then ${matchPlayers.kills} else 0 end), 0)`.as(
          "red_kills"
        ),
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

  const serialized = rows.map((r) => ({
    ...r,
    startedAt: r.startedAt?.toISOString() ?? null,
  }));

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] p-6">
      <MatchesClient initial={{ matches: serialized }} />
    </main>
  );
}
