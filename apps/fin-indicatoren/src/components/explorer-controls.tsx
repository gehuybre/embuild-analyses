"use client"

import * as React from "react"
import { ChevronsUpDown, Search, X } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Checkbox } from "@embuild/shared/components/ui/checkbox"
import { Input } from "@embuild/shared/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { cn } from "@embuild/shared/lib/utils"

export type PickerItem = { key: string; label: string; color?: string; hint?: string }
export type PickerGroup = { key: string; label: string; items: PickerItem[] }
export type Preset = { key: string; label: string; keys: string[] }

// Extra kleuren voor als twee gekozen reeksen dezelfde kleur zouden krijgen.
const FALLBACK_COLORS = [
  "#0f4c81", "#e07a5f", "#2a9d8f", "#8c6d31", "#6d597a", "#b56576",
  "#457b9d", "#6b8f71", "#c08497", "#7f5539", "#4d908e", "#5c677d",
  "#d4a017", "#9b2226", "#3d405b", "#81b29a",
]

/** Geef elke gekozen reeks een eigen kleur: voorkeurskleur indien vrij, anders een alternatief. */
export function assignColors(items: PickerItem[]): Record<string, string> {
  const used = new Set<string>()
  const result: Record<string, string> = {}
  for (const item of items) {
    if (item.color && !used.has(item.color)) {
      result[item.key] = item.color
      used.add(item.color)
    }
  }
  let cycle = 0
  for (const item of items) {
    if (result[item.key]) continue
    const free = FALLBACK_COLORS.find((color) => !used.has(color))
    const color = free ?? FALLBACK_COLORS[cycle++ % FALLBACK_COLORS.length]
    result[item.key] = color
    used.add(color)
  }
  return result
}

export function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </p>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function PresetChips({
  presets,
  selected,
  onPick,
}: {
  presets: Preset[]
  selected: string[]
  onPick: (keys: string[]) => void
}) {
  const selectedSet = new Set(selected)
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((preset) => {
        const active =
          preset.keys.length === selectedSet.size && preset.keys.every((key) => selectedSet.has(key))
        return (
          <Button
            key={preset.key}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className="h-8 rounded-full px-3"
            aria-pressed={active}
            onClick={() => onPick(preset.keys)}
          >
            {preset.label}
          </Button>
        )
      })}
    </div>
  )
}

export function SeriesPicker({
  groups,
  selected,
  onChange,
  colors,
  triggerLabel = "Reeksen kiezen",
}: {
  groups: PickerGroup[]
  selected: string[]
  onChange: (keys: string[]) => void
  colors: Record<string, string>
  triggerLabel?: string
}) {
  const [query, setQuery] = React.useState("")
  const selectedSet = React.useMemo(() => new Set(selected), [selected])
  const needle = query.trim().toLowerCase()

  const toggle = (key: string) => {
    onChange(selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }
  const setGroup = (group: PickerGroup, on: boolean) => {
    const groupKeys = new Set(group.items.map((item) => item.key))
    const rest = selected.filter((key) => !groupKeys.has(key))
    onChange(on ? [...rest, ...group.items.map((item) => item.key)] : rest)
  }

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 min-w-[220px] justify-between gap-2">
          <span className="truncate">
            {triggerLabel}
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {selected.length}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Zoek een reeks"
            className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[360px] overflow-y-auto p-2">
          {groups.map((group) => {
            const items = needle
              ? group.items.filter((item) => item.label.toLowerCase().includes(needle))
              : group.items
            if (items.length === 0) return null
            const allOn = group.items.every((item) => selectedSet.has(item.key))
            return (
              <div key={group.key} className="mb-3 last:mb-0">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setGroup(group, !allOn)}
                  >
                    {allOn ? "Geen" : "Alle"}
                  </button>
                </div>
                {items.map((item) => (
                  <label
                    key={item.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox checked={selectedSet.has(item.key)} onCheckedChange={() => toggle(item.key)} />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: selectedSet.has(item.key) ? colors[item.key] : "transparent",
                        border: selectedSet.has(item.key) ? "none" : "1px solid var(--border)",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint ? <span className="text-xs text-muted-foreground">{item.hint}</span> : null}
                  </label>
                ))}
              </div>
            )
          })}
        </div>
        <div className="flex justify-between border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => onChange([])} disabled={selected.length === 0}>
            Wis selectie
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function SelectedChips({
  items,
  colors,
  onRemove,
}: {
  items: PickerItem[]
  colors: Record<string, string>
  onRemove: (key: string) => void
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Kies minstens één reeks om de grafiek te tonen.</p>
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            onClick={() => onRemove(item.key)}
            className="group inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted"
            aria-label={`Verwijder ${item.label}`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[item.key] }} />
            {item.label}
            <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
          </button>
        </li>
      ))}
    </ul>
  )
}
