"use client"

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { TableHead } from "@embuild/shared/components/ui/table"

export interface Sort {
  key: string
  dir: "asc" | "desc"
}

export function nextSort(cur: Sort, key: string, numeric: boolean): Sort {
  if (cur.key !== key) return { key, dir: numeric ? "desc" : "asc" }
  return { key, dir: cur.dir === "asc" ? "desc" : "asc" }
}

export function SortableHead({ label, k, sort, onSort, align = "left", title }: {
  label: string
  k: string
  sort: Sort
  onSort: (k: string) => void
  align?: "left" | "right"
  title?: string
}) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead
      className={align === "right" ? "text-right" : ""}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      title={title}
    >
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 font-medium hover:text-foreground ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  )
}

export function compare(a: string | number | null, b: string | number | null, dir: "asc" | "desc"): number {
  const f = dir === "asc" ? 1 : -1
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === "number" && typeof b === "number") return (a - b) * f
  return String(a).localeCompare(String(b), "nl", { sensitivity: "base" }) * f
}
