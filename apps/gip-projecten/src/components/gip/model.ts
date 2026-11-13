import { getBasePath } from "@embuild/shared/lib/path-utils"
import type { InfrastructureFeature } from "../InfrastructureProjectMap"

export type Year = 2025 | 2026 | 2027
export type YearBudgetKey = "budget2025" | "budget2026" | "budget2027"
export type BudgetKey = YearBudgetKey | "budget_total"
export type GipTab = "overview" | "map" | "projects" | "reconciliation" | "large"
export type GipVersion = "2025" | "2026"
export type ReconciliationStatus =
  | "delayed_from_2025"
  | "pulled_forward"
  | "within_envelope"
  | "budget_increase"
  | "decrease_or_delay"
  | "new_or_renamed"
  | "removed_or_renamed"
  | "unchanged"

export type GipProject = {
  id: string
  programma: string
  subprogramma: string
  entiteit: string
  project: string
  deelproject: string
  locatie: string
  budget2025: number
  budget2026: number
  budget2027: number
  budget_total: number
  municipality_names: string[]
}

export type SummaryRow = {
  name: string
  allocation_count: number
  project_count: number
  budget2025: number
  budget2026: number
  budget2027: number
  budget_total: number
}

export type MunicipalitySummary = {
  m: string
  name: string
  allocation_count: number
  budget2025: number
  budget2026: number
  budget2027: number
  budget_total: number
}

export type BigProject = {
  project: string
  total_mio: number
  impact_mio: Record<string, number>
  level: "project" | "subproject"
}

export type GipBundle = {
  metadata: {
    version: GipVersion
    title: string
    source: string
    years?: Year[]
    period_label?: string
    allocation_count: number
    unique_project_count: number
    total_budget: number
    by_year: Record<string, number>
    mapped_allocation_count: number
    mapped_budget_total: number
    mapped_budget_share: number
    municipality_count: number
    infrastructure_feature_count: number
    infrastructure_line_count: number
    infrastructure_osm_line_count?: number
    infrastructure_point_count: number
  }
  projects: GipProject[]
  programSummary: SummaryRow[]
  subprogramSummary: SummaryRow[]
  entitySummary: SummaryRow[]
  municipalitySummary: MunicipalitySummary[]
  infrastructureFeatures: InfrastructureFeature[]
  bigProjects: BigProject[]
}

export const DATA_PATHS = {
  gip2025: "/data/gip_data_2025.json",
  gip2026: "/data/gip_data_2026.json",
} as const

export const YEARS: Year[] = [2025, 2026, 2027]
export const VERSION_OPTIONS: Array<{ value: GipVersion; label: string }> = [
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
]
export const ALL_PROGRAMS = "all"
export const MAP_PAGE_PATH = `${getBasePath()}/kaart/`
export const GIP_SLUG = "gip-projecten"
export const MONEY_EPSILON = 0.5
export const EXTERNAL_FINANCING_PROJECTS = new Set(["Oosterweel Kanaaltunnels & R1", "Leefbaarheid - fase II"])
export const RECONCILIATION_STATUS_ORDER: ReconciliationStatus[] = [
  "budget_increase",
  "new_or_renamed",
  "delayed_from_2025",
  "pulled_forward",
  "within_envelope",
  "decrease_or_delay",
  "removed_or_renamed",
  "unchanged",
]

export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  delayed_from_2025: "Doorgeschoven uit 2025",
  pulled_forward: "Naar voren uit 2027",
  within_envelope: "Binnen meerjarenbudget",
  budget_increase: "Extra budget of scope",
  decrease_or_delay: "Minder budget of later",
  new_or_renamed: "Nieuw in GIP 2026",
  removed_or_renamed: "Niet meer in GIP 2026",
  unchanged: "Ongewijzigd",
}

export const RECONCILIATION_STATUS_COLORS: Record<ReconciliationStatus, string> = {
  delayed_from_2025: "#3F6B72",
  pulled_forward: "#4F868F",
  within_envelope: "#4F868F",
  budget_increase: "#3F6B72",
  decrease_or_delay: "#3F6B72",
  new_or_renamed: "#C6C6C6",
  removed_or_renamed: "#C6C6C6",
  unchanged: "#EDEDED",
}

export const euroFormatter = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
})

export const compactFormatter = new Intl.NumberFormat("nl-BE", {
  maximumFractionDigits: 1,
})

export const integerFormatter = new Intl.NumberFormat("nl-BE", {
  maximumFractionDigits: 0,
})

export function budgetKeyForYear(year: Year): YearBudgetKey {
  return `budget${year}` as YearBudgetKey
}

export function yearsForMetadata(metadata?: GipBundle["metadata"]): Year[] {
  const years = metadata?.years?.filter((year): year is Year => YEARS.includes(year))
  return years?.length ? years : YEARS
}

export function periodLabel(years: Year[], metadata?: GipBundle["metadata"]) {
  if (metadata?.period_label) return metadata.period_label
  return years.length === 1 ? String(years[0]) : `${years[0]}-${years[years.length - 1]}`
}

export function isBudgetKey(value: string): value is BudgetKey {
  return value === "budget_total" || value === "budget2025" || value === "budget2026" || value === "budget2027"
}

export function formatEuro(value: number) {
  return euroFormatter.format(value)
}

export function formatEuroCompact(value: number) {
  if (Math.abs(value) >= 1_000_000_000) {
    return `€${compactFormatter.format(value / 1_000_000_000)} mld`
  }
  if (Math.abs(value) >= 1_000_000) {
    return `€${compactFormatter.format(value / 1_000_000)} mln`
  }
  return formatEuro(value)
}

export function formatSignedEuroCompact(value: number) {
  if (Math.abs(value) <= MONEY_EPSILON) return formatEuroCompact(0)
  const sign = value > 0 ? "+" : "-"
  return `${sign}${formatEuroCompact(Math.abs(value))}`
}

export function formatMio(value: number) {
  return `€${integerFormatter.format(value)} mln`
}

export function formatSignedMio(value: number) {
  if (Math.abs(value) <= MONEY_EPSILON) return formatMio(0)
  const sign = value > 0 ? "+" : "-"
  return `${sign}${formatMio(Math.abs(value))}`
}

// Nieuwe weergaven (3 in plaats van 5 tabbladen)
export type ViewId = "compare" | "projects" | "large"

export const VIEW_LABELS: Record<ViewId, string> = {
  compare: "Wat veranderde",
  projects: "Projecten",
  large: "Grote projecten",
}

// Bestaande embed-ids blijven werken en wijzen naar de nieuwe weergaven
export function viewForTab(tab: GipTab): ViewId {
  if (tab === "map" || tab === "projects") return "projects"
  if (tab === "large") return "large"
  return "compare"
}

export function tabForView(view: ViewId, layout: "list" | "map"): GipTab {
  if (view === "projects") return layout === "map" ? "map" : "projects"
  if (view === "large") return "large"
  return "overview"
}

// Merkpalet: neutrale tinten met een enkel accent (teal)
export const ACCENT = "#4F868F"
export const ACCENT_DARK = "#3F6B72"
export const NEUTRAL = "#C6C6C6"
export const TRACK = "#EDEDED"
