import { db } from "@/db";
import { users, matches } from "@/db/schema";
import { eq, count, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [onlineUsers, liveCount, totalCount] = await Promise.all([
    db.select().from(users).where(eq(users.isOnline, true)),
    db
      .select({ value: count() })
      .from(matches)
      .where(eq(matches.status, "live")),
    db.select({ value: count() }).from(matches),
  ]);

  return Response.json({
    users: onlineUsers,
    liveMatches: liveCount[0]?.value ?? 0,
    totalMatches: totalCount[0]?.value ?? 0,
  });
}
