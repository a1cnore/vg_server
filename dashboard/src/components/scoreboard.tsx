import { cn } from "@/lib/utils";

interface Player {
  slot: number;
  handle: string | null;
  team: number | null;
  kills: number;
  deaths: number;
  cs: number;
  level: number;
  gold: number;
  xp: number;
  posX: number;
  posY: number;
  itemsBought: number;
  inCombat: boolean;
}

const cols = ["Player", "K", "D", "CS", "LVL", "Gold", "XP", "Items", "Pos"];

function TeamSection({
  label,
  color,
  bgTint,
  players,
}: {
  label: string;
  color: string;
  bgTint: string;
  players: Player[];
}) {
  return (
    <>
      <tr>
        <td colSpan={cols.length} className={cn("px-2 py-1 text-xs font-semibold", bgTint, color)}>
          {label}
        </td>
      </tr>
      {players.map((p) => (
        <tr key={p.slot} className="border-b border-border last:border-b-0 hover:bg-panel/50">
          <td className={cn("px-2 py-1 text-xs truncate max-w-[120px]", color)}>
            <span
              className={cn(
                "inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle",
                p.inCombat ? "bg-accent-red shadow-[0_0_4px_theme(colors.accent-red)]" : "bg-text-dim"
              )}
            />
            {p.handle ?? `Player ${p.slot}`}
          </td>
          <td className="px-2 py-1 font-mono text-xs text-text-primary">{p.kills}</td>
          <td className="px-2 py-1 font-mono text-xs text-text-primary">{p.deaths}</td>
          <td className="px-2 py-1 font-mono text-xs text-text-primary">{p.cs}</td>
          <td className="px-2 py-1 font-mono text-xs text-text-primary">{p.level}</td>
          <td className="px-2 py-1 font-mono text-xs text-text-primary">{p.gold.toLocaleString()}</td>
          <td className="px-2 py-1 font-mono text-xs text-text-primary">{p.xp.toLocaleString()}</td>
          <td className="px-2 py-1 font-mono text-xs text-text-primary">{p.itemsBought}</td>
          <td className="px-2 py-1 font-mono text-xs text-text-dim">
            {p.posX.toFixed(0)},{p.posY.toFixed(0)}
          </td>
        </tr>
      ))}
    </>
  );
}

export function Scoreboard({ players }: { players: Player[] }) {
  const blue = players.filter((p) => p.team === 1).sort((a, b) => a.slot - b.slot);
  const red = players.filter((p) => p.team === 2).sort((a, b) => a.slot - b.slot);

  return (
    <div className="overflow-x-auto border border-border rounded-md bg-card">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border">
            {cols.map((col) => (
              <th
                key={col}
                className="px-2 py-1.5 text-[11px] font-medium text-text-dim uppercase tracking-wider"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <TeamSection
            label="Blue Team"
            color="text-accent-cyan"
            bgTint="bg-accent-cyan/5"
            players={blue}
          />
          <TeamSection
            label="Red Team"
            color="text-accent-red"
            bgTint="bg-accent-red/5"
            players={red}
          />
        </tbody>
      </table>
    </div>
  );
}
