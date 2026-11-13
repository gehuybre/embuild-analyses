"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@embuild/shared/components/ui/select"
import {
  ALL_PROGRAMS,
  budgetKeyForYear,
  type BudgetKey,
  type GipVersion,
  type ViewId,
  type Year,
} from "./model"
import { Segmented } from "./ui"

// Toont alleen de filters die in de gekozen weergave iets doen
export function FilterBar({
  view,
  programs,
  program,
  onProgramChange,
  version,
  onVersionChange,
  years,
  periodLabel,
  budgetKey,
  onBudgetKeyChange,
}: {
  view: ViewId
  programs: string[]
  program: string
  onProgramChange: (program: string) => void
  version: GipVersion
  onVersionChange: (version: GipVersion) => void
  years: Year[]
  periodLabel: string
  budgetKey: BudgetKey
  onBudgetKeyChange: (key: BudgetKey) => void
}) {
  if (view === "large") return null
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {view === "projects" && (
        <Segmented<GipVersion>
          label="GIP-versie"
          value={version}
          onChange={onVersionChange}
          options={[
            { value: "2025", label: "GIP 2025" },
            { value: "2026", label: "GIP 2026" },
          ]}
        />
      )}
      <Select value={program} onValueChange={onProgramChange}>
        <SelectTrigger className="w-full sm:w-[280px]">
          <SelectValue placeholder="Programma" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PROGRAMS}>Alle programma's</SelectItem>
          {programs.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {view === "projects" && years.length > 1 && (
        <Select value={budgetKey} onValueChange={(value) => onBudgetKeyChange(value as BudgetKey)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Budgetjaar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="budget_total">{periodLabel}</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={budgetKeyForYear(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
