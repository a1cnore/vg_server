import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { UserCard } from "@/components/user-card";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage("/users");

  const allUsers = await db
    .select()
    .from(users)
    .orderBy(desc(users.lastSeenAt));

  const online = allUsers.filter((u) => u.isOnline);
  const offline = allUsers.filter((u) => !u.isOnline);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] p-6">
      <h1 className="text-xl font-semibold mb-4">Users</h1>

      {online.length > 0 && (
        <>
          <div className="text-xs text-[#666] uppercase tracking-wider mb-2">
            Online ({online.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {online.map((u) => (
              <UserCard
                key={u.id}
                {...u}
                connectedAt={u.connectedAt?.toISOString() ?? null}
                lastSeenAt={u.lastSeenAt?.toISOString() ?? null}
              />
            ))}
          </div>
        </>
      )}

      {offline.length > 0 && (
        <>
          <div className="text-xs text-[#666] uppercase tracking-wider mb-2">
            Offline ({offline.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {offline.map((u) => (
              <UserCard
                key={u.id}
                {...u}
                connectedAt={u.connectedAt?.toISOString() ?? null}
                lastSeenAt={u.lastSeenAt?.toISOString() ?? null}
              />
            ))}
          </div>
        </>
      )}

      {allUsers.length === 0 && (
        <p className="text-[#666] text-sm">No users yet.</p>
      )}
    </main>
  );
}
