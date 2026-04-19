import { cn } from "@/lib/utils";

interface Player {
  slot: number;
  handle: string | null;
  team: number | null;
  energyRegen: number;
  energyDelta: number;
  hpDelta: number;
  abilityCd: number;
  moveSpeed: number;
}

const stats = [
  { key: "energyRegen" as const, label: "Enrg" },
  { key: "energyDelta" as const, label: "E.Dlt" },
  { key: "hpDelta" as const, label: "HP", abs: true },
  { key: "abilityCd" as const, label: "CD" },
  { key: "moveSpeed" as const, label: "Spd" },
];

function StatBar({
  label,
  value,
  max,
  teamColor,
}: {
  label: string;
  value: number;
  max: number;
  teamColor: string;
}) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-text-dim w-8 text-right shrink-0 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex-1 h-1.5 bg-white/[.04] rounded-sm overflow-hidden">
        <div
          className={cn("h-full rounded-sm", teamColor)}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-text-dim w-10 text-right shrink-0">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export function PlayerStats({ players }: { players: Player[] }) {
  const active = players.filter((p) => p.handle);
  if (!active.length) return null;

  const maxes = {
    energyRegen: Math.max(1, ...active.map((p) => Math.abs(p.energyRegen))),
    energyDelta: Math.max(1, ...active.map((p) => Math.abs(p.energyDelta))),
    hpDelta: Math.max(1, ...active.map((p) => Math.abs(p.hpDelta))),
    abilityCd: Math.max(1, ...active.map((p) => Math.abs(p.abilityCd))),
    moveSpeed: Math.max(1, ...active.map((p) => Math.abs(p.moveSpeed))),
  };

  return (
    <div className="border border-border rounded-md bg-card overflow-hidden">
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-widest text-text-dim bg-panel border-b border-border">
        Player Stats
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
        {active.map((p) => {
          const tc =
            p.team === 1
              ? "bg-gradient-to-r from-accent-cyan to-accent-cyan/40"
              : "bg-gradient-to-r from-accent-red to-accent-red/40";
          const nameColor =
            p.team === 1 ? "text-accent-cyan" : p.team === 2 ? "text-accent-red" : "";
          return (
            <div key={p.slot} className="flex flex-col gap-0.5">
              <span className={cn("text-xs font-semibold mb-0.5", nameColor)}>
                {p.handle ?? `Player ${p.slot}`}
              </span>
              {stats.map((s) => (
                <StatBar
                  key={s.key}
                  label={s.label}
                  value={s.abs ? Math.abs(p[s.key]) : p[s.key]}
                  max={maxes[s.key]}
                  teamColor={tc}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
