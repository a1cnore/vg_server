import { cn } from "@/lib/utils";

export default function StatusDot({ status }: { status: string }) {
  const alive = status === "online" || status === "live";
  return (
    <span className="relative inline-flex h-2 w-2">
      {alive && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75"
        />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          alive ? "bg-accent-green" : "bg-text-dim"
        )}
      />
    </span>
  );
}
