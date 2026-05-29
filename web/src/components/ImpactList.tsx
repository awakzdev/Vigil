import type { ImpactItem } from "../lib/historyPresentation";

const numTone: Record<ImpactItem["tone"], string> = {
  bad: "text-rose-600",
  good: "text-emerald-600",
  neutral: "text-zinc-900",
};

export function ImpactList({ items, size = "md" }: { items: ImpactItem[]; size?: "sm" | "md" }) {
  if (items.length === 0) return null;
  const numCls = size === "sm" ? "text-lg" : "text-2xl";
  return (
    <ul className={size === "sm" ? "space-y-1" : "space-y-2"}>
      {items.map((it) => (
        <li key={`${it.label}-${it.value}`} className="flex items-baseline gap-2">
          <span className={`font-semibold tabular-nums leading-none ${numCls} ${numTone[it.tone]}`}>
            {it.tone === "bad" && it.direction === "up" ? "+" : ""}
            {it.value}
          </span>
          <span className="text-sm text-zinc-500">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}
