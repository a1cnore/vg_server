import Link from "next/link";
import StatusDot from "@/components/status-dot";
import { truncateUuid, timeAgo } from "@/lib/utils";

interface UserCardProps {
  id: number;
  playerHandle: string;
  playerUuid: string;
  clientIp: string;
  country: string | null;
  isOnline: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
}

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

export function UserCard(u: UserCardProps) {
  return (
    <Link
      href={`/users/${u.id}`}
      className="flex flex-col gap-1.5 border border-border rounded-md bg-card px-3 py-2 transition-colors hover:bg-panel"
    >
      <div className="flex items-center gap-2">
        <StatusDot status={u.isOnline ? "online" : "offline"} />
        <span className="text-sm font-medium text-text-primary truncate">
          {u.playerHandle}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-text-dim">
        <span className="font-mono">{truncateUuid(u.playerUuid)}</span>
        {u.country && (
          <span>
            {countryFlag(u.country)} {u.country}
          </span>
        )}
        <span className="font-mono">{u.clientIp}</span>
      </div>

      <div className="text-[11px] text-text-dim">
        {u.isOnline
          ? `connected ${timeAgo(u.connectedAt)}`
          : `last seen ${timeAgo(u.lastSeenAt)}`}
      </div>
    </Link>
  );
}
