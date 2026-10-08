import type { FilterItem } from "@/lib/migration"

/** Toont de gekozen filters boven een ingebedde grafiek, zodat duidelijk is welke selectie wordt getoond. */
export function EmbedFilters({ items }: { items: FilterItem[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mb-4 flex flex-wrap gap-1.5 text-xs" aria-label="Gekozen filters">
      {items.map((item) => (
        <li key={`${item.label}:${item.value}`} className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-muted-foreground">
          {item.label}: <span className="font-medium text-foreground">{item.value}</span>
        </li>
      ))}
    </ul>
  )
}
