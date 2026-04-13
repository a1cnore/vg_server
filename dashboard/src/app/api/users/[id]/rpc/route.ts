import { db } from "@/db";
import { rpcLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { isAdminAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdminAuthenticated())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const numId = Number(id);

  const logs = await db
    .select({
      id: rpcLogs.id,
      ts: rpcLogs.ts,
      method: rpcLogs.method,
      category: rpcLogs.category,
      status: rpcLogs.status,
      url: rpcLogs.url,
      req: rpcLogs.req,
      res: rpcLogs.res,
    })
    .from(rpcLogs)
    .where(eq(rpcLogs.userId, numId))
    .orderBy(desc(rpcLogs.ts))
    .limit(200);

  return Response.json({ logs });
}
