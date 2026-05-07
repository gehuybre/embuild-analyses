"use client"

import { useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@embuild/shared/components/ui/select"
import { getBasePath } from "@embuild/shared/lib/path-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import {
  InfrastructureProjectMap,
  type InfrastructureFeature,
} from "./InfrastructureProjectMap"

type Year = 2025 | 2026 | 2027
type YearBudgetKey = "budget2025" | "budget2026" | "budget2027"
type BudgetKey = YearBudgetKey | "budget_total"

type SummaryRow = {
  name: string
  budget_total: number
}

type GipBundle = {
  programSummary: SummaryRow[]
  infrastructureFeatures: InfrastructureFeature[]
}

const YEARS: Year[] = [2025, 2026, 2027]
const ALL_PROGRAMS = "all"
const DATA_PATHS = {
  gip: "/data/gip_data.json",
} as const

const compactFormatter = new Intl.NumberFormat("nl-BE", {
  maximumFractionDigits: 1,
})

function budgetKeyForYear(year: Year): YearBudgetKey {
  return `budget${year}` as YearBudgetKey
}

function formatEuroCompact(value: number) {
  if (Math.abs(value) >= 1_000_000_000) {
    return `€${compactFormatter.format(value / 1_000_000_000)} mld`
  }
  if (Math.abs(value) >= 1_000_000) {
    return `€${compactFormatter.format(value / 1_000_000)} mln`
  }
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value)
}

export function GIPMapStandalone() {
  const { data: bundle, loading, error } = useJsonBundle<{ gip: GipBundle }>(DATA_PATHS)
  const [selectedProgram, setSelectedProgram] = useState(ALL_PROGRAMS)
  const [selectedBudgetKey, setSelectedBudgetKey] = useState<BudgetKey>("budget_total")
  const gip = bundle?.gip

  const programs = useMemo(() => gip?.programSummary ?? [], [gip])

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Kaart laden...</div>
  }

  if (error || !gip) {
    return (
      <div className="p-6 text-sm text-destructive">
        Fout bij het laden van de GIP-data: {error ?? "onbekende fout"}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-normal">GIP-projectkaart</h1>
            <p className="text-sm text-muted-foreground">
              Projecten gekleurd volgens het eerste investeringsjaar met positief budget.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={selectedProgram} onValueChange={setSelectedProgram}>
              <SelectTrigger className="w-full sm:w-[280px]">
                <SelectValue placeholder="Programma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROGRAMS}>Alle programma's</SelectItem>
                {programs.map((program) => (
                  <SelectItem key={program.name} value={program.name}>
                    {program.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedBudgetKey} onValueChange={(value) => setSelectedBudgetKey(value as BudgetKey)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Budget" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="budget_total">2025-2027</SelectItem>
                {YEARS.map((year) => (
                  <SelectItem key={year} value={budgetKeyForYear(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={getBasePath() || "/"}>
                <ArrowLeft className="h-4 w-4" />
                Terug
              </a>
            </Button>
          </div>
        </div>

        <InfrastructureProjectMap
          features={gip.infrastructureFeatures}
          selectedProgram={selectedProgram}
          selectedBudgetKey={selectedBudgetKey}
          formatBudget={formatEuroCompact}
          large
        />
      </div>
    </main>
  )
}
