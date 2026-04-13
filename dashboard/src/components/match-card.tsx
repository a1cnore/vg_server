import Link from "next/link";
import StatusDot from "@/components/status-dot";
import { cn, formatDuration, timeAgo } from "@/lib/utils";

interface MatchCardProps {
  id: number;
  matchId: string;
  gameMode: string | null;
  status: string;
  userHandle: string | null;
  startedAt: string | null;
  durationS: number | null;
  blueKills: number;
  redKills: number;
  href?: string | null;
}

export function MatchCard(m: MatchCardProps) {
  const content = (
    <>
      <StatusDot status={m.status === "live" ? "live" : "completed"} />

      <span className="font-mono text-text-secondary text-xs shrink-0">
        {m.matchId.slice(0, 8)}
      </span>

      {m.gameMode && (
        <span className="rounded bg-panel px-1.5 py-0.5 text-[11px] text-text-dim border border-border shrink-0">
          {m.gameMode}
        </span>
      )}

      {m.userHandle && (
        <span className="text-xs text-text-primary truncate">{m.userHandle}</span>
      )}

      <div className="ml-auto flex items-center gap-3 shrink-0">
        <span className="font-mono text-xs">
          <span className="text-accent-cyan">{m.blueKills}</span>
          <span className="text-text-dim mx-1">-</span>
          <span className="text-accent-red">{m.redKills}</span>
        </span>

        <span className="font-mono text-xs text-text-dim w-12 text-right">
          {formatDuration(m.durationS)}
        </span>

        <span className="text-[11px] text-text-dim w-14 text-right">
          {timeAgo(m.startedAt)}
        </span>
      </div>
    </>
  );

  const href = m.href === undefined ? `/matches/${m.id}` : m.href;
  const className = cn(
    "flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2",
    href && "transition-colors hover:bg-panel"
  );

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}
