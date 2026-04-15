import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchPlayers, matches, users } from "@/db/schema";

export interface ConnectedUserSummary {
  id: number;
  playerHandle: string;
  playerUuid: string;
  country: string | null;
  lat: number | null;
  lng: number | null;
  isOnline: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
}

export interface RecentMatchSummary {
  id: number;
  matchId: string;
  gameMode: string | null;
  status: string;
  startedAt: string | null;
  durationS: number | null;
  userHandle: string | null;
  blueKills: number;
  redKills: number;
}

export interface OverviewData {
  users: ConnectedUserSummary[];
  recentMatches: RecentMatchSummary[];
  totalPlayers: number;
  totalMatches: number;
}

export async function getOverviewData(): Promise<OverviewData> {
  const [onlineUsers, recentMatches, totalPlayersRow, totalMatchesRow] = await Promise.all([
    db
      .select({
        id: users.id,
        playerHandle: users.playerHandle,
        playerUuid: users.playerUuid,
        country: users.country,
        lat: users.lat,
        lng: users.lng,
        isOnline: users.isOnline,
        connectedAt: users.connectedAt,
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .where(eq(users.isOnline, true))
      .orderBy(desc(users.connectedAt)),
    db
      .select({
        id: matches.id,
        matchId: matches.matchId,
        gameMode: matches.gameMode,
        status: matches.status,
        startedAt: matches.startedAt,
        durationS: matches.durationS,
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
      .limit(10),
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(matches),
  ]);

  return {
    users: onlineUsers.map((user) => ({
      ...user,
      connectedAt: user.connectedAt?.toISOString() ?? null,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    })),
    recentMatches: recentMatches.map((match) => ({
      ...match,
      startedAt: match.startedAt?.toISOString() ?? null,
    })),
    totalPlayers: Number(totalPlayersRow[0]?.value ?? 0),
    totalMatches: Number(totalMatchesRow[0]?.value ?? 0),
  };
}
