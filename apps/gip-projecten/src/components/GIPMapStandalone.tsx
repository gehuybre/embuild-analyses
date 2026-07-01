"use client"

import { useEffect, useMemo, useState } from "react"
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
type GipVersion = "2025" | "2026"

type SummaryRow = {
  name: string
  budget_total: number
}

type GipBundle = {
  metadata: {
    years?: Year[]
    period_label?: string
  }
  programSummary: SummaryRow[]
  infrastructureFeatures: InfrastructureFeature[]
}

const YEARS: Year[] = [2025, 2026, 2027]
const VERSION_OPTIONS: GipVersion[] = ["2025", "2026"]
const ALL_PROGRAMS = "all"
const DATA_PATHS = {
  gip2025: "/data/gip_data_2025.json",
  gip2026: "/data/gip_data_2026.json",
} as const

const compactFormatter = new Intl.NumberFormat("nl-BE", {
  maximumFractionDigits: 1,
})

function budgetKeyForYear(year: Year): YearBudgetKey {
  return `budget${year}` as YearBudgetKey
}

function yearsForMetadata(metadata?: GipBundle["metadata"]): Year[] {
  const years = metadata?.years?.filter((year): year is Year => YEARS.includes(year))
  return years?.length ? years : YEARS
}

function periodLabel(years: Year[], metadata?: GipBundle["metadata"]) {
  if (metadata?.period_label) return metadata.period_label
  return years.length === 1 ? String(years[0]) : `${years[0]}-${years[years.length - 1]}`
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
  const { data: bundle, loading, error } = useJsonBundle<{ gip2025: GipBundle; gip2026: GipBundle }>(DATA_PATHS)
  const basePath = getBasePath()
  const [selectedVersion, setSelectedVersion] = useState<GipVersion>("2026")
  const [selectedProgram, setSelectedProgram] = useState(ALL_PROGRAMS)
  const [selectedBudgetKey, setSelectedBudgetKey] = useState<BudgetKey>("budget_total")
  const gip = selectedVersion === "2025" ? bundle?.gip2025 : bundle?.gip2026
  const visibleYears = yearsForMetadata(gip?.metadata)
  const activePeriodLabel = periodLabel(visibleYears, gip?.metadata)

  const programs = useMemo(() => gip?.programSummary ?? [], [gip])

  useEffect(() => {
    if (selectedBudgetKey === "budget_total") return
    const visibleBudgetKeys = visibleYears.map(budgetKeyForYear)
    if (!visibleBudgetKeys.includes(selectedBudgetKey)) {
      setSelectedBudgetKey("budget_total")
    }
  }, [selectedBudgetKey, visibleYears])

  useEffect(() => {
    if (selectedProgram === ALL_PROGRAMS) return
    if (!programs.some((program) => program.name === selectedProgram)) {
      setSelectedProgram(ALL_PROGRAMS)
    }
  }, [programs, selectedProgram])

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
            <div className="inline-flex overflow-hidden rounded-md border bg-background">
              {VERSION_OPTIONS.map((version) => (
                <button
                  key={version}
                  type="button"
                  onClick={() => setSelectedVersion(version)}
                  className={`px-3 py-2 text-sm font-medium ${
                    selectedVersion === version
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-pressed={selectedVersion === version}
                >
                  {version}
                </button>
              ))}
            </div>
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
                <SelectItem value="budget_total">{activePeriodLabel}</SelectItem>
                {visibleYears.length > 1 && visibleYears.map((year) => (
                  <SelectItem key={year} value={budgetKeyForYear(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {basePath && (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={basePath}>
                  <ArrowLeft className="h-4 w-4" />
                  Terug
                </a>
              </Button>
            )}
          </div>
        </div>

        <InfrastructureProjectMap
          features={gip.infrastructureFeatures}
          selectedProgram={selectedProgram}
          selectedBudgetKey={selectedBudgetKey}
          formatBudget={formatEuroCompact}
          years={visibleYears}
          large
        />
      </div>
    </main>
  )
}
