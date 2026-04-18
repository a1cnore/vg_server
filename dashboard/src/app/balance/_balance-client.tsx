"use client";

import { useState, useEffect, Fragment } from "react";
import { cn } from "@/lib/utils";

interface HeroStats {
  health_base: number;
  health_per_level: number;
  health_regen: number;
  health_regen_per_level: number;
  energy_base: number;
  energy_per_level: number;
  energy_regen: number;
  energy_regen_per_level: number;
  weapon_base: number;
  weapon_per_level: number;
  armor_base: number;
  armor_per_level: number;
  shield_base: number;
  shield_per_level: number;
  range: number;
  atk_speed_ratio: number;
  atk_speed_per_level: number;
  perk_crystal_ratio: number;
  move_speed: number;
}

interface HeroLevel12 {
  health: number;
  energy: number;
  weapon: number;
  armor: number;
  shield: number;
  atk_speed_pct: number;
}

interface AbilityFloat {
  offset: number;
  value: number;
}

interface Hero {
  name: string;
  stats: HeroStats;
  level_12: HeroLevel12;
  ability_region_floats?: AbilityFloat[];
}

interface Item {
  name: string;
  tier: number;
  recipe_cost: number;
  sell_value: number;
  total_cost_estimate: number;
}

interface Talent {
  name: string;
  data_size: number;
  floats: Record<string, number> | null;
}

interface GameMode {
  name: string;
  data_size: number;
  floats: Record<string, number> | null;
}

interface BalanceDB {
  heroes: Record<string, Hero>;
  items: Record<string, Item>;
  talents: Record<string, Talent>;
  game_modes: Record<string, GameMode>;
}

const HERO_BLACKLIST = new Set([
  "FortressMinion",
  "Kraken_RaidBoss",
  "HeroPLU",
  "LanceBall_Lance",
]);
const HERO_CODE_RE = /^Hero\d{3}$/;

const ITEM_BLACKLIST = new Set([
  "Item_Cheater",
  "Item_CheaterImmortality",
  "Item_Template",
  "Item_VideoHelper",
  "Item_CooldownDamageSelf",
  "Item_ImmortalStunSelf",
  "Item_RefundAbilityPoint",
  "Item_MinionCandy",
]);

function stripItemPrefix(name: string): string {
  return name.replace(/^Item_/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function stripTalentPrefix(name: string): string {
  return name.replace(/^Talent_/, "").replace(/_/g, " / ");
}

function stripGameModePrefix(name: string): string {
  return name.replace(/^GameMode_/, "").replace(/_/g, " ");
}

function FloatGrid({ floats }: { floats: Record<string, number> }) {
  const entries = Object.entries(floats);
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-x-3 gap-y-0.5">
      {entries.map(([offset, value]) => (
        <div key={offset} className="flex items-baseline gap-1 text-[11px]">
          <span className="text-text-dim font-mono">{offset}:</span>
          <span className="text-text-primary font-mono">{value}</span>
        </div>
      ))}
    </div>
  );
}

type SortDir = "asc" | "desc";

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
  className,
}: {
  label: string;
  field: string;
  current: string;
  dir: SortDir;
  onSort: (field: string) => void;
  className?: string;
}) {
  const active = current === field;
  return (
    <th
      className={cn(
        "px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider cursor-pointer select-none transition-colors",
        active ? "text-text-primary" : "text-text-dim hover:text-text-secondary",
        className,
      )}
      onClick={() => onSort(field)}
    >
      {label}
      {active && (
        <span className="ml-0.5">{dir === "asc" ? "\u25B2" : "\u25BC"}</span>
      )}
    </th>
  );
}

function HeroDetail({ hero }: { hero: Hero }) {
  const s = hero.stats;
  const rows: [string, string, string][] = [
    ["Health", `${s.health_base}`, `+${s.health_per_level}/lvl`],
    ["Health Regen", `${s.health_regen}`, `+${s.health_regen_per_level}/lvl`],
    ["Energy", `${s.energy_base}`, `+${s.energy_per_level}/lvl`],
    ["Energy Regen", `${s.energy_regen}`, `+${s.energy_regen_per_level}/lvl`],
    ["Weapon", `${s.weapon_base}`, `+${s.weapon_per_level}/lvl`],
    ["Armor", `${s.armor_base}`, `+${s.armor_per_level}/lvl`],
    ["Shield", `${s.shield_base}`, `+${s.shield_per_level}/lvl`],
    ["Range", `${s.range}`, ""],
    ["Move Speed", `${s.move_speed}`, ""],
    ["Atk Speed Ratio", `${s.atk_speed_ratio}`, `+${s.atk_speed_per_level}/lvl`],
    ["Crystal Ratio", `${s.perk_crystal_ratio}`, ""],
  ];

  const l = hero.level_12;
  const abilityFloats = hero.ability_region_floats ?? [];

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] text-text-dim uppercase tracking-wider mb-1.5">
            Base Stats &amp; Growth
          </div>
          <div className="flex flex-col gap-0.5">
            {rows.map(([label, base, growth]) => (
              <div key={label} className="flex items-baseline gap-2 text-xs">
                <span className="text-text-secondary w-28 shrink-0">{label}</span>
                <span className="font-mono text-text-primary">{base}</span>
                {growth && (
                  <span className="font-mono text-text-dim text-[11px]">{growth}</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-text-dim uppercase tracking-wider mb-1.5">
            Level 12 Values
          </div>
          <div className="flex flex-col gap-0.5">
            {([
              ["Health", l.health],
              ["Energy", l.energy],
              ["Weapon", l.weapon],
              ["Armor", l.armor],
              ["Shield", l.shield],
              ["Atk Speed", `${l.atk_speed_pct}%`],
            ] as [string, number | string][]).map(([label, val]) => (
              <div key={label} className="flex items-baseline gap-2 text-xs">
                <span className="text-text-secondary w-28 shrink-0">{label}</span>
                <span className="font-mono text-accent-cyan">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {abilityFloats.length > 0 && (
        <div>
          <div className="text-[11px] text-text-dim uppercase tracking-wider mb-1.5">
            Ability Data (raw offsets)
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-x-3 gap-y-0.5">
            {abilityFloats.map((af) => (
              <div key={af.offset} className="flex items-baseline gap-1 text-[11px]">
                <span className="text-text-dim font-mono">{af.offset}:</span>
                <span className="text-text-primary font-mono">{af.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type HeroSortField =
  | "name"
  | "health_base"
  | "health_l12"
  | "energy_base"
  | "weapon_base"
  | "armor_base"
  | "shield_base"
  | "range"
  | "move_speed"
  | "atk_speed_ratio";

type ItemSortField =
  | "name"
  | "tier"
  | "recipe_cost"
  | "sell_value"
  | "total_cost_estimate";

function getHeroSortValue(hero: Hero, field: HeroSortField): number | string {
  switch (field) {
    case "name": return hero.name;
    case "health_base": return hero.stats.health_base;
    case "health_l12": return hero.level_12.health;
    case "energy_base": return hero.stats.energy_base;
    case "weapon_base": return hero.stats.weapon_base;
    case "armor_base": return hero.stats.armor_base;
    case "shield_base": return hero.stats.shield_base;
    case "range": return hero.stats.range;
    case "move_speed": return hero.stats.move_speed;
    case "atk_speed_ratio": return hero.stats.atk_speed_ratio;
  }
}

function getItemSortValue(item: Item, field: ItemSortField): number | string {
  switch (field) {
    case "name": return item.name;
    case "tier": return item.tier;
    case "recipe_cost": return item.recipe_cost;
    case "sell_value": return item.sell_value;
    case "total_cost_estimate": return item.total_cost_estimate;
  }
}

function sortList<T>(list: T[], getValue: (item: T) => number | string, dir: SortDir): T[] {
  return [...list].sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    if (typeof va === "string" && typeof vb === "string") {
      return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return dir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });
}

export default function BalanceClient() {
  const [data, setData] = useState<BalanceDB | null>(null);
  const [tab, setTab] = useState<"heroes" | "items" | "talents" | "game_modes">("heroes");

  const [heroSort, setHeroSort] = useState<HeroSortField>("name");
  const [heroDir, setHeroDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [itemSort, setItemSort] = useState<ItemSortField>("name");
  const [itemDir, setItemDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch("/vainglory_balance_db.json")
      .then((r) => r.json())
      .then((d) => setData(d));
  }, []);

  if (!data) {
    return <p className="text-sm text-text-dim">Loading balance data...</p>;
  }

  const heroes = Object.values(data.heroes).filter(
    (h) => !HERO_BLACKLIST.has(h.name) && !HERO_CODE_RE.test(h.name),
  );

  const items = Object.values(data.items).filter(
    (i) => !ITEM_BLACKLIST.has(i.name),
  );

  const talents = Object.values(data.talents);
  const gameModes = Object.values(data.game_modes);

  const sortedHeroes = sortList(heroes, (h) => getHeroSortValue(h, heroSort), heroDir);
  const sortedItems = sortList(items, (i) => getItemSortValue(i, itemSort), itemDir);

  function toggleHeroSort(field: string) {
    const f = field as HeroSortField;
    if (heroSort === f) {
      setHeroDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setHeroSort(f);
      setHeroDir(field === "name" ? "asc" : "desc");
    }
  }

  function toggleItemSort(field: string) {
    const f = field as ItemSortField;
    if (itemSort === f) {
      setItemDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setItemSort(f);
      setItemDir(field === "name" ? "asc" : "desc");
    }
  }

  const heroCols: { label: string; field: HeroSortField; className?: string }[] = [
    { label: "Hero", field: "name", className: "text-left" },
    { label: "HP L1", field: "health_base" },
    { label: "HP L12", field: "health_l12" },
    { label: "Energy", field: "energy_base" },
    { label: "Weapon", field: "weapon_base" },
    { label: "Armor", field: "armor_base" },
    { label: "Shield", field: "shield_base" },
    { label: "Range", field: "range" },
    { label: "Move Spd", field: "move_speed" },
    { label: "Atk Spd", field: "atk_speed_ratio" },
  ];

  const itemCols: { label: string; field: ItemSortField; className?: string }[] = [
    { label: "Item", field: "name", className: "text-left" },
    { label: "Tier", field: "tier" },
    { label: "Recipe Cost", field: "recipe_cost" },
    { label: "Sell Value", field: "sell_value" },
    { label: "Total Cost", field: "total_cost_estimate" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Balance Database</h1>
        <span className="text-xs text-text-dim">
          v{(data as unknown as { _meta: { version: string } })._meta.version}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {([
          ["heroes", `Heroes (${heroes.length})`],
          ["items", `Items (${items.length})`],
          ["talents", `Talents (${talents.length})`],
          ["game_modes", `Game Modes (${gameModes.length})`],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1 text-xs rounded-md transition-colors",
              tab === t
                ? "bg-panel text-text-primary border border-border-light"
                : "text-text-dim hover:text-text-secondary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "heroes" && (
        <div className="overflow-x-auto border border-border rounded-md bg-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                {heroCols.map((col) => (
                  <SortHeader
                    key={col.field}
                    label={col.label}
                    field={col.field}
                    current={heroSort}
                    dir={heroDir}
                    onSort={toggleHeroSort}
                    className={col.className}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedHeroes.map((hero) => {
                const isOpen = expanded === hero.name;
                return (
                  <Fragment key={hero.name}>
                    <tr
                      className={cn(
                        "border-b border-border cursor-pointer transition-colors",
                        isOpen ? "bg-panel/50" : "hover:bg-panel/50",
                      )}
                      onClick={() => setExpanded(isOpen ? null : hero.name)}
                    >
                      <td className="px-2 py-1 text-xs text-text-primary font-medium">
                        <span className="mr-1.5 text-text-dim text-[11px] inline-block w-3">
                          {isOpen ? "\u25BC" : "\u25B6"}
                        </span>
                        {hero.name}
                      </td>
                      <td className="px-2 py-1 font-mono text-xs text-text-primary">{hero.stats.health_base}</td>
                      <td className="px-2 py-1 font-mono text-xs text-accent-cyan">{hero.level_12.health}</td>
                      <td className="px-2 py-1 font-mono text-xs text-text-primary">{hero.stats.energy_base}</td>
                      <td className="px-2 py-1 font-mono text-xs text-text-primary">{hero.stats.weapon_base}</td>
                      <td className="px-2 py-1 font-mono text-xs text-text-primary">{hero.stats.armor_base}</td>
                      <td className="px-2 py-1 font-mono text-xs text-text-primary">{hero.stats.shield_base}</td>
                      <td className="px-2 py-1 font-mono text-xs text-text-primary">{hero.stats.range}</td>
                      <td className="px-2 py-1 font-mono text-xs text-text-primary">{hero.stats.move_speed}</td>
                      <td className="px-2 py-1 font-mono text-xs text-text-primary">{hero.stats.atk_speed_ratio}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border bg-panel/30">
                        <td colSpan={heroCols.length}>
                          <HeroDetail hero={hero} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "items" && (
        <div className="overflow-x-auto border border-border rounded-md bg-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                {itemCols.map((col) => (
                  <SortHeader
                    key={col.field}
                    label={col.label}
                    field={col.field}
                    current={itemSort}
                    dir={itemDir}
                    onSort={toggleItemSort}
                    className={col.className}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr
                  key={item.name}
                  className="border-b border-border last:border-b-0 hover:bg-panel/50"
                >
                  <td className="px-2 py-1 text-xs text-text-primary font-medium">
                    {stripItemPrefix(item.name)}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-text-primary">
                    <span
                      className={cn(
                        "inline-block rounded px-1 py-0.5 text-[11px] border border-border",
                        item.tier === 3
                          ? "bg-accent-gold/10 text-accent-gold"
                          : item.tier === 2
                            ? "bg-accent-blue/10 text-accent-blue"
                            : "bg-panel text-text-dim",
                      )}
                    >
                      T{item.tier}
                    </span>
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-text-primary">
                    {item.recipe_cost.toLocaleString()}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-text-primary">
                    {item.sell_value.toLocaleString()}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-accent-gold">
                    {item.total_cost_estimate.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "talents" && (
        <div className="border border-border rounded-md bg-card divide-y divide-border">
          {talents.map((talent) => (
            <div key={talent.name} className="px-4 py-2.5">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-xs text-text-primary font-medium">
                  {stripTalentPrefix(talent.name)}
                </span>
                <span className="text-[11px] text-text-dim font-mono">
                  {talent.data_size} bytes
                </span>
              </div>
              {talent.floats && Object.keys(talent.floats).length > 0 ? (
                <FloatGrid floats={talent.floats} />
              ) : (
                <span className="text-[11px] text-text-dim">No float data</span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "game_modes" && (
        <div className="border border-border rounded-md bg-card divide-y divide-border">
          {gameModes.map((gm) => (
            <div key={gm.name} className="px-4 py-2.5">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-xs text-text-primary font-medium">
                  {stripGameModePrefix(gm.name)}
                </span>
                <span className="text-[11px] text-text-dim font-mono">
                  {gm.data_size} bytes
                </span>
              </div>
              {gm.floats && Object.keys(gm.floats).length > 0 ? (
                <FloatGrid floats={gm.floats} />
              ) : (
                <span className="text-[11px] text-text-dim">No float data</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

