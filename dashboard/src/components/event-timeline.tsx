import { cn } from "@/lib/utils";

interface TimelineEvent {
  timeS: number;
  eventType: string;
  text: string;
}

const typeColor: Record<string, string> = {
  kill: "text-accent-green",
  death: "text-accent-red",
  level: "text-accent-gold",
  item: "text-text-dim",
  respawn: "text-accent-blue",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function deduplicateEvents(events: TimelineEvent[]): TimelineEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${Math.floor(e.timeS)}:${e.text.slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function EventTimeline({ events }: { events: TimelineEvent[] }) {
  const sorted = deduplicateEvents(
    [...events].sort((a, b) => b.timeS - a.timeS)
  );

  return (
    <div className="max-h-80 overflow-y-auto border border-border rounded-md bg-card">
      {sorted.length === 0 && (
        <div className="px-3 py-4 text-xs text-text-dim text-center">
          No events
        </div>
      )}
      {sorted.map((event, i) => (
        <div
          key={i}
          className="flex items-start gap-2 px-3 py-1 border-b border-border last:border-b-0"
        >
          <span className="font-mono text-xs text-text-dim shrink-0 w-10">
            {formatTime(event.timeS)}
          </span>
          <span
            className={cn(
              "text-xs",
              typeColor[event.eventType] ?? "text-text-secondary"
            )}
          >
            {event.text}
          </span>
        </div>
      ))}
    </div>
  );
}
