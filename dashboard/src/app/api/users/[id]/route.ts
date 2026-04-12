import { db } from "@/db";
import { users, matches } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  if (!userRows[0]) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json({
    user: userRows[0],
    matches: userMatches,
  });
}
