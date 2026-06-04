"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  BarChart3,
  Check,
  Code,
  Copy,
  Download,
  Euro,
  Landmark,
  ListTree,
  Maximize2,
  MapPin,
  Search,
  TableProperties,
} from "lucide-react"
import { Badge } from "@embuild/shared/components/ui/badge"
import { Button } from "@embuild/shared/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Input } from "@embuild/shared/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@embuild/shared/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@embuild/shared/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@embuild/shared/components/ui/table"
import { getChartSeriesColor } from "@embuild/shared/lib/chart-theme"
import { getBasePath, getDataPath } from "@embuild/shared/lib/path-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import {
  InfrastructureProjectMap,
  type InfrastructureFeature,
} from "./InfrastructureProjectMap"

type Year = 2025 | 2026 | 2027
type YearBudgetKey = "budget2025" | "budget2026" | "budget2027"
type BudgetKey = YearBudgetKey | "budget_total"
type GipTab = "overview" | "map" | "projects" | "reconciliation" | "large"
type GipVersion = "2025" | "2026"
type ReconciliationStatus =
  | "delayed_from_2025"
  | "pulled_forward"
  | "within_envelope"
  | "budget_increase"
  | "decrease_or_delay"
  | "new_or_renamed"
  | "removed_or_renamed"
  | "unchanged"

type GipProject = {
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

type SummaryRow = {
  name: string
  allocation_count: number
  project_count: number
  budget2025: number
  budget2026: number
  budget2027: number
  budget_total: number
}

type MunicipalitySummary = {
  m: string
  name: string
  allocation_count: number
  budget2025: number
  budget2026: number
  budget2027: number
  budget_total: number
}

type BigProject = {
  project: string
  total_mio: number
  impact_mio: Record<string, number>
  level: "project" | "subproject"
}

type GipBundle = {
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

const DATA_PATHS = {
  gip2025: "/data/gip_data_2025.json",
  gip2026: "/data/gip_data_2026.json",
} as const

const YEARS: Year[] = [2025, 2026, 2027]
const VERSION_OPTIONS: Array<{ value: GipVersion; label: string }> = [
  { value: "2025", label: "2025" },
  { value: "2026", label: "2026" },
]
const ALL_PROGRAMS = "all"
const MAP_PAGE_PATH = `${getBasePath()}/kaart/`
const GIP_SLUG = "gip-projecten"
const MONEY_EPSILON = 0.5
const EXTERNAL_FINANCING_PROJECTS = new Set(["Oosterweel Kanaaltunnels & R1", "Leefbaarheid - fase II"])
const RECONCILIATION_STATUS_ORDER: ReconciliationStatus[] = [
  "budget_increase",
  "new_or_renamed",
  "delayed_from_2025",
  "pulled_forward",
  "within_envelope",
  "decrease_or_delay",
  "removed_or_renamed",
  "unchanged",
]

const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  delayed_from_2025: "Doorgeschoven uit 2025",
  pulled_forward: "Naar voren uit 2027",
  within_envelope: "Binnen meerjarenbudget",
  budget_increase: "Extra budget of scope",
  decrease_or_delay: "Minder budget of later",
  new_or_renamed: "Nieuw in GIP 2026",
  removed_or_renamed: "Niet meer in GIP 2026",
  unchanged: "Ongewijzigd",
}

const RECONCILIATION_STATUS_COLORS: Record<ReconciliationStatus, string> = {
  delayed_from_2025: "#ca8a04",
  pulled_forward: "#16a34a",
  within_envelope: "#0d9488",
  budget_increase: "#7c3aed",
  decrease_or_delay: "#dc2626",
  new_or_renamed: "#2563eb",
  removed_or_renamed: "#f97316",
  unchanged: "#64748b",
}

const euroFormatter = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
})

const compactFormatter = new Intl.NumberFormat("nl-BE", {
  maximumFractionDigits: 1,
})

const integerFormatter = new Intl.NumberFormat("nl-BE", {
  maximumFractionDigits: 0,
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

function isBudgetKey(value: string): value is BudgetKey {
  return value === "budget_total" || value === "budget2025" || value === "budget2026" || value === "budget2027"
}

function formatEuro(value: number) {
  return euroFormatter.format(value)
}

function formatEuroCompact(value: number) {
  if (Math.abs(value) >= 1_000_000_000) {
    return `€${compactFormatter.format(value / 1_000_000_000)} mld`
  }
  if (Math.abs(value) >= 1_000_000) {
    return `€${compactFormatter.format(value / 1_000_000)} mln`
  }
  return formatEuro(value)
}

function formatSignedEuroCompact(value: number) {
  if (Math.abs(value) <= MONEY_EPSILON) return formatEuroCompact(0)
  const sign = value > 0 ? "+" : "-"
  return `${sign}${formatEuroCompact(Math.abs(value))}`
}

function formatMio(value: number) {
  return `€${integerFormatter.format(value)} mln`
}

function formatSignedMio(value: number) {
  if (Math.abs(value) <= MONEY_EPSILON) return formatMio(0)
  const sign = value > 0 ? "+" : "-"
  return `${sign}${formatMio(Math.abs(value))}`
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Euro
  label: string
  value: string
  detail: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md border bg-muted/40 p-2">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-normal">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionHeading({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

function VersionSelector({
  value,
  onValueChange,
}: {
  value: GipVersion
  onValueChange: (value: GipVersion) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium">GIP-versie</div>
      </div>
      <div className="inline-flex overflow-hidden rounded-md border bg-background">
        {VERSION_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange(option.value)}
            className={`px-4 py-2 text-sm font-medium ${
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function tabLabel(tab: GipTab) {
  if (tab === "overview") return "Overzicht"
  if (tab === "map") return "Projectkaart"
  if (tab === "projects") return "Projectlijnen"
  if (tab === "reconciliation") return "Budgetvergelijking"
  return "Grote projecten"
}

function GipEmbedButton({
  section,
  selectedVersion,
  selectedProgram,
  selectedBudgetKey,
}: {
  section: GipTab
  selectedVersion: GipVersion
  selectedProgram: string
  selectedBudgetKey: BudgetKey
}) {
  const [copied, setCopied] = useState(false)

  const getEmbedCode = useCallback(() => {
    const baseUrl = typeof window !== "undefined"
      ? window.location.origin + getBasePath()
      : ""
    const params = new URLSearchParams()
    params.set("version", selectedVersion)
    params.set("program", selectedProgram)
    params.set("budget", selectedBudgetKey)

    const title = `GIP-projecten - ${tabLabel(section)}`
    const embedUrl = `${baseUrl}/embed/${GIP_SLUG}/${section}/?${params.toString()}`
    const height = section === "map" ? 920 : section === "reconciliation" ? 920 : section === "projects" ? 760 : 680

    return `<iframe
  src="${embedUrl}"
  data-data-blog-embed="true"
  width="100%"
  height="${height}"
  style="border: 0;"
  title="${escapeHtmlAttribute(title)}"
  loading="lazy"
></iframe>
<script>
(function () {
  if (window.__DATA_BLOG_EMBED_RESIZER__) return;
  window.__DATA_BLOG_EMBED_RESIZER__ = true;

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "data-blog-embed:resize") return;
    var height = Number(data.height);
    if (!isFinite(height) || height <= 0) return;

    var iframes = document.querySelectorAll('iframe[data-data-blog-embed="true"]');
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      if (iframe.contentWindow === event.source) {
        var previousScrollY = window.scrollY || window.pageYOffset || 0;
        var previousTop = iframe.getBoundingClientRect().top;
        iframe.style.height = Math.ceil(height) + "px";
        var nextTop = iframe.getBoundingClientRect().top;
        var scrollDelta = nextTop - previousTop;
        if (Math.abs(scrollDelta) > 1) {
          window.scrollTo(0, previousScrollY + scrollDelta);
        }
        return;
      }
    }
  });
})();
</script>`
  }, [section, selectedBudgetKey, selectedProgram, selectedVersion])

  const copyEmbedCode = useCallback(async () => {
    const code = getEmbedCode()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textArea = document.createElement("textarea")
      textArea.value = code
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [getEmbedCode])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title="Embed code" className="shrink-0 gap-2">
          <Code className="h-4 w-4" />
          <span className="hidden sm:inline">Embed</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-3">
          <div className="font-medium text-sm">Embed deze visualisatie</div>
          <p className="text-xs text-muted-foreground">
            Kopieer de onderstaande code om deze sectie in je website te integreren.
          </p>
          <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all">
            {getEmbedCode()}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={copyEmbedCode}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Gekopieerd!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Kopieer code
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TabSectionHeader({
  section,
  title,
  description,
  selectedVersion,
  selectedProgram,
  selectedBudgetKey,
  embedded,
  actions,
}: {
  section: GipTab
  title: string
  description?: string
  selectedVersion: GipVersion
  selectedProgram: string
  selectedBudgetKey: BudgetKey
  embedded: boolean
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <SectionHeading title={title} description={description} />
      {!embedded && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <GipEmbedButton
            section={section}
            selectedVersion={selectedVersion}
            selectedProgram={selectedProgram}
            selectedBudgetKey={selectedBudgetKey}
          />
        </div>
      )}
    </div>
  )
}

function ProgramBars({ rows }: { rows: SummaryRow[] }) {
  const max = Math.max(...rows.map((row) => row.budget_total), 1)

  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const width = (row.budget_total / max) * 100
        return (
          <div key={row.name} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{row.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatEuroCompact(row.budget_total)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${width}%`, background: getChartSeriesColor(index) }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {integerFormatter.format(row.allocation_count)} (deel)projecten
            </div>
          </div>
        )
      })}
    </div>
  )
}

function YearlyBudgetChart({
  rows,
  selectedProgram,
  years,
}: {
  rows: SummaryRow[]
  selectedProgram: string
  years: Year[]
}) {
  const visibleRows =
    selectedProgram === ALL_PROGRAMS
      ? rows.slice(0, 5)
      : rows.filter((row) => row.name === selectedProgram)

  const remainder =
    selectedProgram === ALL_PROGRAMS
      ? rows.slice(5).reduce(
          (acc, row) => {
            years.forEach((year) => {
              acc[budgetKeyForYear(year)] += row[budgetKeyForYear(year)]
            })
            return acc
          },
          { name: "Overige", budget2025: 0, budget2026: 0, budget2027: 0 } as Pick<
            SummaryRow,
            "name" | "budget2025" | "budget2026" | "budget2027"
          >
        )
      : null

  const series = remainder ? [...visibleRows, remainder] : visibleRows
  const data = years.map((year) => {
    const point: Record<string, string | number> = { year: String(year) }
    series.forEach((row) => {
      point[row.name] = row[budgetKeyForYear(year)] / 1_000_000
    })
    return point
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(value) => `${integerFormatter.format(Number(value))} mln`}
        />
        <RechartsTooltip
          formatter={(value, name) => [formatMio(Number(value)), String(name)]}
          labelFormatter={(label) => `Budget ${label}`}
        />
        {series.map((row, index) => (
          <Bar
            key={row.name}
            dataKey={row.name}
            stackId="budget"
            fill={getChartSeriesColor(index)}
            radius={index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function LongTermImpactChart({ projects }: { projects: BigProject[] }) {
  const topLevel = projects.filter((project) => project.level === "project")
  const years = Object.keys(topLevel[0]?.impact_mio ?? {})
  const data = years.map((year) => ({
    year,
    impact: topLevel.reduce((sum, project) => sum + (project.impact_mio[year] ?? 0), 0),
  }))

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" tickLine={false} axisLine={false} interval={1} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(value) => `${integerFormatter.format(Number(value))} mln`}
        />
        <RechartsTooltip
          formatter={(value) => [formatMio(Number(value)), "Investeringsimpact"]}
          labelFormatter={(label) => `Jaar ${label}`}
        />
        <Line
          type="monotone"
          dataKey="impact"
          stroke="var(--color-chart-2)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function BigProjectBars({ projects }: { projects: BigProject[] }) {
  const rows = projects
    .filter((project) => project.level === "project")
    .sort((a, b) => b.total_mio - a.total_mio)
    .slice(0, 8)
  const max = Math.max(...rows.map((row) => row.total_mio), 1)

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.project} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{row.project}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatMio(row.total_mio)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.total_mio / max) * 100}%`,
                background: getChartSeriesColor(index),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

type ProjectAccumulator = Pick<
  GipProject,
  "id" | "programma" | "subprogramma" | "entiteit" | "project" | "deelproject" | "locatie"
> & {
  budget2025: number
  budget2026: number
  budget2027: number
  budget_total: number
}

type ReconciledProject = {
  key: string
  id: string
  oldProgramma: string
  newProgramma: string
  programma: string
  subprogramma: string
  entiteit: string
  project: string
  deelproject: string
  oldProjectName: string
  oldDeelproject: string
  newProjectName: string
  newDeelproject: string
  locatie: string
  old2025: number
  old2026: number
  old2027: number
  oldTotal: number
  new2026: number
  delta2026: number
  envelopeDelta: number
  status: ReconciliationStatus
}

type ReconciliationCategoryRow = {
  status: ReconciliationStatus
  label: string
  count: number
  old2026: number
  new2026: number
  delta2026: number
  deltaMio: number
}

function normalizeForReconciliation(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function tokenSetForReconciliation(value: string) {
  return new Set(
    normalizeForReconciliation(value)
      .split(" ")
      .filter((token) => token.length > 1)
  )
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = tokenSetForReconciliation(left)
  const rightTokens = tokenSetForReconciliation(right)
  if (!leftTokens.size || !rightTokens.size) return 0

  let intersection = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1
  })

  return intersection / (leftTokens.size + rightTokens.size - intersection)
}

function containsNormalizedName(left: string, right: string) {
  const normalizedLeft = normalizeForReconciliation(left)
  const normalizedRight = normalizeForReconciliation(right)
  if (normalizedLeft.length < 8 || normalizedRight.length < 8) return false
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
}

function reconciliationKey(project: GipProject) {
  return [project.entiteit, project.project, project.deelproject]
    .map((value) => normalizeForReconciliation(value ?? ""))
    .join("||")
}

function groupProjectsForReconciliation(projects: GipProject[]) {
  const grouped = new Map<string, ProjectAccumulator>()

  projects.forEach((project) => {
    const key = reconciliationKey(project)
    const existing = grouped.get(key)
    const row =
      existing ??
      {
        id: project.id,
        programma: project.programma,
        subprogramma: project.subprogramma,
        entiteit: project.entiteit,
        project: project.project,
        deelproject: project.deelproject,
        locatie: project.locatie,
        budget2025: 0,
        budget2026: 0,
        budget2027: 0,
        budget_total: 0,
      }

    row.budget2025 += project.budget2025
    row.budget2026 += project.budget2026
    row.budget2027 += project.budget2027
    row.budget_total += project.budget_total
    if (!row.locatie && project.locatie) row.locatie = project.locatie
    grouped.set(key, row)
  })

  return grouped
}

function sameMoney(left: number, right: number) {
  return Math.abs(left - right) <= MONEY_EPSILON
}

function renameCandidateScore(oldProject: ProjectAccumulator, newProject: ProjectAccumulator) {
  if (!sameMoney(oldProject.budget2026, newProject.budget2026)) return 0

  const oldName = `${oldProject.project} ${oldProject.deelproject}`
  const newName = `${newProject.project} ${newProject.deelproject}`
  const nameScore = containsNormalizedName(oldName, newName) ? 1 : tokenSimilarity(oldName, newName)
  const contextScore = tokenSimilarity(
    `${oldProject.programma} ${oldProject.subprogramma} ${oldProject.entiteit} ${oldProject.locatie}`,
    `${newProject.programma} ${newProject.subprogramma} ${newProject.entiteit} ${newProject.locatie}`
  )
  const sameEntity = normalizeForReconciliation(oldProject.entiteit) === normalizeForReconciliation(newProject.entiteit)
  const sameProgram =
    normalizeForReconciliation(oldProject.programma) === normalizeForReconciliation(newProject.programma)

  if (nameScore >= 0.5) return nameScore + contextScore * 0.25
  if (nameScore >= 0.32 && (sameEntity || sameProgram)) return nameScore + contextScore * 0.25 + 0.1
  return 0
}

function classifyMatchedProject(oldProject: ProjectAccumulator, newProject: ProjectAccumulator): ReconciliationStatus {
  const old2025 = oldProject.budget2025
  const old2026 = oldProject.budget2026
  const old2027 = oldProject.budget2027
  const oldTotal = old2025 + old2026 + old2027
  const new2026 = newProject.budget2026
  const delta = new2026 - old2026

  if (Math.abs(delta) <= MONEY_EPSILON) return "unchanged"
  if (delta < 0) return "decrease_or_delay"
  if (new2026 <= old2026 + old2025 + MONEY_EPSILON) return "delayed_from_2025"
  if (new2026 <= old2026 + old2027 + MONEY_EPSILON) return "pulled_forward"
  if (new2026 <= oldTotal + MONEY_EPSILON) return "within_envelope"
  return "budget_increase"
}

function buildReconciledProject(
  key: string,
  oldProject: ProjectAccumulator | undefined,
  newProject: ProjectAccumulator | undefined,
  status: ReconciliationStatus
): ReconciledProject {
  const old2025 = oldProject?.budget2025 ?? 0
  const old2026 = oldProject?.budget2026 ?? 0
  const old2027 = oldProject?.budget2027 ?? 0
  const oldTotal = old2025 + old2026 + old2027
  const new2026 = newProject?.budget2026 ?? 0
  const source = newProject ?? oldProject

  return {
    key,
    id: source?.id ?? key,
    oldProgramma: oldProject?.programma ?? "",
    newProgramma: newProject?.programma ?? "",
    programma: newProject?.programma || oldProject?.programma || "",
    subprogramma: newProject?.subprogramma || oldProject?.subprogramma || "",
    entiteit: newProject?.entiteit || oldProject?.entiteit || "",
    project: newProject?.project || oldProject?.project || "",
    deelproject: newProject?.deelproject || oldProject?.deelproject || "",
    oldProjectName: oldProject?.project ?? "",
    oldDeelproject: oldProject?.deelproject ?? "",
    newProjectName: newProject?.project ?? "",
    newDeelproject: newProject?.deelproject ?? "",
    locatie: newProject?.locatie || oldProject?.locatie || "",
    old2025,
    old2026,
    old2027,
    oldTotal,
    new2026,
    delta2026: new2026 - old2026,
    envelopeDelta: new2026 - oldTotal,
    status,
  }
}

function buildBudgetReconciliation(gip2025: GipBundle, gip2026: GipBundle) {
  const oldProjects = groupProjectsForReconciliation(gip2025.projects)
  const newProjects = groupProjectsForReconciliation(gip2026.projects)
  const rows: ReconciledProject[] = []
  const oldOnly = new Map<string, ProjectAccumulator>()
  const newOnly = new Map<string, ProjectAccumulator>()

  oldProjects.forEach((oldProject, key) => {
    const newProject = newProjects.get(key)
    if (newProject) {
      if (oldProject.budget2026 > MONEY_EPSILON || newProject.budget2026 > MONEY_EPSILON) {
        rows.push(buildReconciledProject(key, oldProject, newProject, classifyMatchedProject(oldProject, newProject)))
      }
      return
    }

    if (oldProject.budget2026 > MONEY_EPSILON) {
      oldOnly.set(key, oldProject)
    }
  })

  newProjects.forEach((newProject, key) => {
    if (!oldProjects.has(key) && newProject.budget2026 > MONEY_EPSILON) {
      newOnly.set(key, newProject)
    }
  })

  const pairedOldKeys = new Set<string>()
  const pairedNewKeys = new Set<string>()

  oldOnly.forEach((oldProject, oldKey) => {
    let bestKey = ""
    let bestProject: ProjectAccumulator | null = null
    let bestScore = 0

    newOnly.forEach((newProject, newKey) => {
      if (pairedNewKeys.has(newKey)) return
      const score = renameCandidateScore(oldProject, newProject)
      if (score > bestScore) {
        bestScore = score
        bestKey = newKey
        bestProject = newProject
      }
    })

    if (bestProject && bestScore >= 0.42) {
      pairedOldKeys.add(oldKey)
      pairedNewKeys.add(bestKey)
      rows.push(buildReconciledProject(`renamed:${oldKey}:${bestKey}`, oldProject, bestProject, "unchanged"))
    }
  })

  oldOnly.forEach((oldProject, key) => {
    if (!pairedOldKeys.has(key)) {
      rows.push(buildReconciledProject(key, oldProject, undefined, "removed_or_renamed"))
    }
  })

  newOnly.forEach((newProject, key) => {
    if (!pairedNewKeys.has(key)) {
      rows.push(buildReconciledProject(key, undefined, newProject, "new_or_renamed"))
    }
  })

  return rows.sort((a, b) => Math.abs(b.delta2026) - Math.abs(a.delta2026))
}

function filterReconciliationByProgram(rows: ReconciledProject[], selectedProgram: string) {
  if (selectedProgram === ALL_PROGRAMS) return rows
  return rows.filter(
    (row) =>
      row.programma === selectedProgram ||
      row.oldProgramma === selectedProgram ||
      row.newProgramma === selectedProgram
  )
}

function buildReconciliationCategoryRows(rows: ReconciledProject[]): ReconciliationCategoryRow[] {
  return RECONCILIATION_STATUS_ORDER.map((status) => {
    const statusRows = rows.filter((row) => row.status === status)
    const old2026 = statusRows.reduce((sum, row) => sum + row.old2026, 0)
    const new2026 = statusRows.reduce((sum, row) => sum + row.new2026, 0)
    const delta2026 = new2026 - old2026

    return {
      status,
      label: RECONCILIATION_STATUS_LABELS[status],
      count: statusRows.length,
      old2026,
      new2026,
      delta2026,
      deltaMio: delta2026 / 1_000_000,
    }
  }).filter((row) => row.count > 0)
}

function isExternalFinancingRow(row: ReconciledProject) {
  return EXTERNAL_FINANCING_PROJECTS.has(row.project)
}

function truncateLabel(value: string, maxLength = 56) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

function reconciliationStatusClass(status: ReconciliationStatus) {
  if (status === "budget_increase") return "border-purple-200 bg-purple-50 text-purple-950"
  if (status === "new_or_renamed") return "border-blue-200 bg-blue-50 text-blue-950"
  if (status === "delayed_from_2025") return "border-yellow-200 bg-yellow-50 text-yellow-950"
  if (status === "pulled_forward") return "border-green-200 bg-green-50 text-green-950"
  if (status === "within_envelope") return "border-teal-200 bg-teal-50 text-teal-950"
  if (status === "decrease_or_delay") return "border-red-200 bg-red-50 text-red-950"
  if (status === "removed_or_renamed") return "border-orange-200 bg-orange-50 text-orange-950"
  return "border-slate-200 bg-slate-50 text-slate-900"
}

function ReconciliationCategoryChart({ rows }: { rows: ReconciliationCategoryRow[] }) {
  const data = rows

  if (!data.length) {
    return <div className="p-4 text-sm text-muted-foreground">Geen budgetverschillen voor deze selectie.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 48)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${integerFormatter.format(Number(value))} mln`}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={188}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
        />
        <ReferenceLine x={0} stroke="var(--border)" />
        <RechartsTooltip
          formatter={(value) => [formatSignedMio(Number(value)), "Netto verschil"]}
          labelFormatter={(label) => String(label)}
        />
        <Bar dataKey="deltaMio" radius={[4, 4, 4, 4]}>
          {data.map((row) => (
            <Cell key={row.status} fill={RECONCILIATION_STATUS_COLORS[row.status]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ReconciliationDeltaChart({ rows }: { rows: ReconciledProject[] }) {
  const data = rows
    .filter((row) => Math.abs(row.delta2026) > MONEY_EPSILON)
    .slice(0, 12)
    .map((row) => ({
      ...row,
      label: truncateLabel(row.project || row.deelproject || row.entiteit, 42),
      deltaMio: row.delta2026 / 1_000_000,
    }))

  if (!data.length) {
    return <div className="p-4 text-sm text-muted-foreground">Geen projectverschillen voor deze selectie.</div>
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(460, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${integerFormatter.format(Number(value))} mln`}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={260}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          interval={0}
        />
        <ReferenceLine x={0} stroke="var(--border)" />
        <RechartsTooltip
          formatter={(value) => [formatSignedMio(Number(value)), "Verschil 2026"]}
          labelFormatter={(_, payload) => {
            const row = payload?.[0]?.payload as ReconciledProject | undefined
            return row?.project ?? ""
          }}
        />
        <Bar dataKey="deltaMio" radius={[4, 4, 4, 4]}>
          {data.map((row) => (
            <Cell key={row.key} fill={row.delta2026 >= 0 ? "#2563eb" : "#dc2626"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function ReconciliationSection({
  gip2025,
  gip2026,
  selectedProgram,
  selectedVersion,
  selectedBudgetKey,
  embedded,
}: {
  gip2025: GipBundle
  gip2026: GipBundle
  selectedProgram: string
  selectedVersion: GipVersion
  selectedBudgetKey: BudgetKey
  embedded: boolean
}) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ReconciliationStatus | "all">("all")

  const rows = useMemo(() => buildBudgetReconciliation(gip2025, gip2026), [gip2025, gip2026])
  const programRows = useMemo(
    () => filterReconciliationByProgram(rows, selectedProgram),
    [rows, selectedProgram]
  )
  const externalFundingRows = useMemo(() => programRows.filter(isExternalFinancingRow), [programRows])
  const comparisonRows = useMemo(
    () => programRows.filter((row) => !isExternalFinancingRow(row)),
    [programRows]
  )
  const categoryRows = useMemo(() => buildReconciliationCategoryRows(comparisonRows), [comparisonRows])
  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return comparisonRows
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => {
        if (!normalizedQuery) return true
        return [
          row.project,
          row.deelproject,
          row.oldProjectName,
          row.oldDeelproject,
          row.newProjectName,
          row.newDeelproject,
          row.entiteit,
          row.locatie,
          row.programma,
          RECONCILIATION_STATUS_LABELS[row.status],
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      })
      .sort((a, b) => Math.abs(b.delta2026) - Math.abs(a.delta2026))
      .slice(0, 40)
  }, [comparisonRows, query, statusFilter])

  const old2026 = comparisonRows.reduce((sum, row) => sum + row.old2026, 0)
  const new2026 = comparisonRows.reduce((sum, row) => sum + row.new2026, 0)
  const delta2026 = new2026 - old2026
  const matchedCount = comparisonRows.filter(
    (row) => row.status !== "new_or_renamed" && row.status !== "removed_or_renamed"
  ).length
  const possibleDelayFrom2025 = comparisonRows
    .filter((row) => row.status === "delayed_from_2025")
    .reduce((sum, row) => sum + Math.max(row.delta2026, 0), 0)
  const possiblePullForwardFrom2027 = comparisonRows
    .filter((row) => row.status === "pulled_forward")
    .reduce((sum, row) => sum + Math.max(row.delta2026, 0), 0)
  const possibleYearShift = possibleDelayFrom2025 + possiblePullForwardFrom2027
  const externalOld2026 = externalFundingRows.reduce((sum, row) => sum + row.old2026, 0)
  const externalNew2026 = externalFundingRows.reduce((sum, row) => sum + row.new2026, 0)
  const externalDelta2026 = externalNew2026 - externalOld2026

  return (
    <div className="space-y-8">
      <TabSectionHeader
        section="reconciliation"
        title="Budgetvergelijking 2026"
        description="Vergelijking van de oude GIP 2025-kolommen voor budgetjaren 2025, 2026 en 2027 met de nieuwe GIP 2026-tabel."
        selectedVersion={selectedVersion}
        selectedProgram={selectedProgram}
        selectedBudgetKey={selectedBudgetKey}
        embedded={embedded}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Euro}
          label="Oud budget 2026"
          value={formatEuroCompact(old2026)}
          detail="Vergelijkbare basis, zonder aparte financieringsposten"
        />
        <StatCard
          icon={Euro}
          label="Nieuw budget 2026"
          value={formatEuroCompact(new2026)}
          detail="Vergelijkbare basis, zonder aparte financieringsposten"
        />
        <StatCard
          icon={Euro}
          label="Netto verschil"
          value={formatSignedEuroCompact(delta2026)}
          detail={`${integerFormatter.format(matchedCount)} gematchte projecten`}
        />
        <StatCard
          icon={ListTree}
          label="Mogelijke jaarverschuiving"
          value={formatEuroCompact(possibleYearShift)}
          detail={`${formatEuroCompact(possibleDelayFrom2025)} uit 2025 · ${formatEuroCompact(possiblePullForwardFrom2027)} uit 2027`}
        />
      </div>

      {externalFundingRows.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <div className="text-sm font-medium">Belangrijk voor de interpretatie</div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                De GIP 2026-mededeling vermeldt dat er ook investeringen in de GIP-tabel staan die
                via andere financieringsbronnen worden voorzien. Daardoor geeft de tabel een
                totaalbedrag van 3,6 miljard euro weer in plaats van ongeveer 2 miljard euro. Het gaat
                vooral om meer dan 1 miljard euro voor de hoofdwerken van Oosterweel, gefinancierd
                met tolinkomsten, en 638 miljoen euro voor leefbaarheidsprojecten, gefinancierd vanuit
                het overkappingsfonds.
              </p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="text-xs text-muted-foreground">Afzonderlijk gehouden in de grafieken</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {formatSignedEuroCompact(externalDelta2026)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Oud 2026 {formatEuroCompact(externalOld2026)} {"->"} nieuw 2026{" "}
                {formatEuroCompact(externalNew2026)}
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {externalFundingRows.map((row) => (
                <div key={`external-funding-${row.key}`} className="rounded-md bg-muted/45 p-3">
                  <div className="text-sm font-medium leading-snug">{row.project}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Oud 2026 {formatEuroCompact(row.old2026)} {"->"} nieuw 2026{" "}
                    {formatEuroCompact(row.new2026)}
                  </div>
                  <div className="mt-2 text-sm font-semibold tabular-nums text-blue-700">
                    {formatSignedEuroCompact(row.delta2026)}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Deze posten worden hieronder uit de vergelijkende grafieken gehouden. Zo blijft zichtbaar
              welke budgetbewegingen binnen de overige GIP-projectlijnen zitten en welke stijging uit
              andere financieringsbronnen komt. Het schrappen van deze budgetten zou volgens de
              mededeling niet automatisch budget vrijmaken voor andere GIP-projecten.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Netto-impact per classificatie, excl. aparte financiering
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ReconciliationCategoryChart rows={categoryRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Grootste projectverschillen (excl. verschuiving vanuit Oosterweel)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <ReconciliationDeltaChart rows={comparisonRows} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Zoek project, locatie of entiteit"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ReconciliationStatus | "all")}
            >
              <SelectTrigger className="w-full lg:w-[280px]">
                <SelectValue placeholder="Classificatie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle classificaties</SelectItem>
                {RECONCILIATION_STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {RECONCILIATION_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {visibleRows.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Geen projecten voor deze selectie.
              </div>
            ) : (
              visibleRows.map((row) => (
                <div
                  key={row.key}
                  className="grid gap-4 rounded-md border bg-background p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-start gap-2">
                      <Badge variant="outline" className={`whitespace-normal ${reconciliationStatusClass(row.status)}`}>
                        {RECONCILIATION_STATUS_LABELS[row.status]}
                      </Badge>
                    </div>
                    <div>
                      <div className="font-medium leading-snug">{row.project}</div>
                      {row.deelproject && (
                        <div className="mt-1 text-sm leading-snug text-muted-foreground">{row.deelproject}</div>
                      )}
                    </div>
                    <div className="text-xs leading-snug text-muted-foreground">
                      {row.entiteit}
                      {row.locatie ? ` · ${row.locatie}` : ""}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-md bg-muted/45 p-3">
                        <div className="text-xs text-muted-foreground">Oud 2026</div>
                        <div className="mt-1 font-medium tabular-nums">{formatEuroCompact(row.old2026)}</div>
                      </div>
                      <div className="rounded-md bg-muted/45 p-3">
                        <div className="text-xs text-muted-foreground">Nieuw 2026</div>
                        <div className="mt-1 font-medium tabular-nums">{formatEuroCompact(row.new2026)}</div>
                      </div>
                      <div className="rounded-md bg-muted/45 p-3">
                        <div className="text-xs text-muted-foreground">Verschil</div>
                        <div
                          className={`mt-1 font-semibold tabular-nums ${
                            row.delta2026 > MONEY_EPSILON
                              ? "text-blue-700"
                              : row.delta2026 < -MONEY_EPSILON
                                ? "text-red-700"
                                : "text-muted-foreground"
                          }`}
                        >
                          {formatSignedEuroCompact(row.delta2026)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Oud 2025: {formatEuroCompact(row.old2025)}</span>
                      <span>Oud 2027: {formatEuroCompact(row.old2027)}</span>
                      <span>Oude enveloppe: {formatEuroCompact(row.oldTotal)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ProgramSelect({
  value,
  onValueChange,
  programs,
}: {
  value: string
  onValueChange: (value: string) => void
  programs: SummaryRow[]
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full sm:w-[260px]">
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
  )
}

function ProjectTable({
  projects,
  selectedVersion,
  selectedProgram,
  selectedBudgetKey,
  embedded = false,
}: {
  projects: GipProject[]
  selectedVersion: GipVersion
  selectedProgram: string
  selectedBudgetKey: BudgetKey
  embedded?: boolean
}) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return projects
      .filter((project) => selectedProgram === ALL_PROGRAMS || project.programma === selectedProgram)
      .filter((project) => {
        if (!normalizedQuery) return true
        return [
          project.project,
          project.deelproject,
          project.locatie,
          project.programma,
          project.subprogramma,
          project.entiteit,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      })
      .sort((a, b) => b[selectedBudgetKey] - a[selectedBudgetKey])
      .slice(0, 30)
  }, [projects, query, selectedBudgetKey, selectedProgram])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Zoek project, locatie of entiteit"
            className="pl-9"
          />
        </div>
        {!embedded && (
          <Button asChild variant="outline" size="sm">
            <a href={getDataPath(`/data/projects_${selectedVersion}.csv`)}>
              <Download className="h-4 w-4" />
              CSV
            </a>
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[42%]">Project</TableHead>
            <TableHead>Programma</TableHead>
            <TableHead>Locatie</TableHead>
            <TableHead className="text-right">Budget</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((project) => (
            <TableRow key={project.id}>
              <TableCell className="whitespace-normal">
                <div className="font-medium leading-snug">{project.project}</div>
                {project.deelproject && (
                  <div className="mt-1 text-xs leading-snug text-muted-foreground">{project.deelproject}</div>
                )}
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="leading-snug">{project.programma}</div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">{project.entiteit}</div>
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="leading-snug">{project.locatie}</div>
                {project.municipality_names.length > 0 && (
                  <div className="mt-1 text-xs leading-snug text-muted-foreground">
                    {project.municipality_names.slice(0, 3).join(", ")}
                    {project.municipality_names.length > 3 ? " ..." : ""}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatEuroCompact(project[selectedBudgetKey])}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function GIPDashboard({
  embeddedSection,
  initialProgram = ALL_PROGRAMS,
  initialBudgetKey = "budget_total",
  initialVersion = "2026",
}: {
  embeddedSection?: GipTab
  initialProgram?: string
  initialBudgetKey?: BudgetKey
  initialVersion?: GipVersion
} = {}) {
  const [selectedVersion, setSelectedVersion] = useState<GipVersion>(initialVersion)
  const [selectedProgram, setSelectedProgram] = useState(initialProgram)
  const [selectedBudgetKey, setSelectedBudgetKey] = useState<BudgetKey>(initialBudgetKey)
  const { data: bundle, loading, error } = useJsonBundle<{ gip2025: GipBundle; gip2026: GipBundle }>(DATA_PATHS)

  useEffect(() => {
    if (!embeddedSection || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const version = params.get("version")
    const program = params.get("program")
    const budget = params.get("budget")
    if (version === "2025" || version === "2026") {
      setSelectedVersion(version)
    }
    if (program?.trim()) {
      setSelectedProgram(program)
    }
    if (budget && isBudgetKey(budget)) {
      setSelectedBudgetKey(budget)
    }
  }, [embeddedSection])

  const gip = selectedVersion === "2025" ? bundle?.gip2025 : bundle?.gip2026
  const visibleYears = yearsForMetadata(gip?.metadata)
  const activePeriodLabel = periodLabel(visibleYears, gip?.metadata)

  const selectedProgramSummary = useMemo(() => {
    if (!gip || selectedProgram === ALL_PROGRAMS) return null
    return gip.programSummary.find((program) => program.name === selectedProgram) ?? null
  }, [gip, selectedProgram])

  useEffect(() => {
    if (!gip || selectedProgram === ALL_PROGRAMS) return
    if (!gip.programSummary.some((program) => program.name === selectedProgram)) {
      setSelectedProgram(ALL_PROGRAMS)
    }
  }, [gip, selectedProgram])

  useEffect(() => {
    if (selectedBudgetKey === "budget_total") return
    const visibleBudgetKeys = visibleYears.map(budgetKeyForYear)
    if (!visibleBudgetKeys.includes(selectedBudgetKey)) {
      setSelectedBudgetKey("budget_total")
    }
  }, [selectedBudgetKey, visibleYears])

  if (loading) {
    return <div className="not-prose rounded-md border p-6 text-sm text-muted-foreground">Data laden...</div>
  }

  if (error || !gip) {
    return (
      <div className="not-prose rounded-md border border-destructive/30 p-6 text-sm text-destructive">
        Fout bij het laden van de GIP-data: {error ?? "onbekende fout"}
      </div>
    )
  }

  const metadata = gip.metadata
  const activeTotal = selectedProgramSummary?.budget_total ?? metadata.total_budget
  const activeAllocations = selectedProgramSummary?.allocation_count ?? metadata.allocation_count
  const embedded = Boolean(embeddedSection)

  return (
    <div className={`not-prose ${embedded ? "space-y-6 p-4" : "space-y-10"}`}>
      {!embedded && (
        <div className="space-y-4">
          <VersionSelector value={selectedVersion} onValueChange={setSelectedVersion} />
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              icon={Euro}
              label="Totaal budget"
              value={formatEuroCompact(activeTotal)}
              detail={`Budget ${activePeriodLabel}`}
            />
            <StatCard
              icon={ListTree}
              label="(Deel)projecten"
              value={integerFormatter.format(activeAllocations)}
              detail={`${integerFormatter.format(metadata.unique_project_count)} unieke projectnamen`}
            />
            <StatCard
              icon={MapPin}
              label="Gekarteerd budget"
              value={formatEuroCompact(metadata.mapped_budget_total)}
              detail={`${integerFormatter.format(metadata.mapped_budget_share * 100)}% van het totaal`}
            />
            <StatCard
              icon={Landmark}
              label="Grootste programma"
              value={formatEuroCompact(gip.programSummary[0]?.budget_total ?? 0)}
              detail={gip.programSummary[0]?.name ?? ""}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ProgramSelect
          value={selectedProgram}
          onValueChange={setSelectedProgram}
          programs={gip.programSummary}
        />
        <Select value={selectedBudgetKey} onValueChange={(value) => setSelectedBudgetKey(value as BudgetKey)}>
          <SelectTrigger className="w-full sm:w-[180px]">
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
      </div>

      <Tabs defaultValue={embeddedSection ?? "overview"} value={embeddedSection} className="space-y-6">
        {!embedded && <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Overzicht</span>
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-2">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">Kaart</span>
          </TabsTrigger>
          <TabsTrigger value="projects" className="gap-2">
            <TableProperties className="h-4 w-4" />
            <span className="hidden sm:inline">Projecten</span>
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-2">
            <ListTree className="h-4 w-4" />
            <span className="hidden lg:inline">Budgetvergelijking</span>
          </TabsTrigger>
          <TabsTrigger value="large" className="gap-2">
            <Landmark className="h-4 w-4" />
            <span className="hidden sm:inline">Grote projecten</span>
          </TabsTrigger>
        </TabsList>}

        <TabsContent value="overview" className="space-y-8">
          <section className="space-y-4">
            <TabSectionHeader
              section="overview"
              title="Budget per jaar"
              description={`De brontabel bevat de goedgekeurde (deel)projecten voor ${activePeriodLabel}.`}
              selectedVersion={selectedVersion}
              selectedProgram={selectedProgram}
              selectedBudgetKey={selectedBudgetKey}
              embedded={embedded}
            />
            <Card>
              <CardContent className="p-4">
                <YearlyBudgetChart rows={gip.programSummary} selectedProgram={selectedProgram} years={visibleYears} />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHeading title="Verdeling per programma" />
            <Card>
              <CardContent className="p-4">
                <ProgramBars rows={gip.programSummary} />
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="map" className="space-y-5">
          <TabSectionHeader
            section="map"
            title="Projectkaart"
            description="Deze kaart werd opgemaakt op basis van de GIP-projecten tabel van MOW. Deze tabel bevat niet altijd voldoende geografische informatie op de werken correct op kaart weer te geven. Projecten kunnen ontbreken op de kaart of niet correct weergegeven zijn."
            selectedVersion={selectedVersion}
            selectedProgram={selectedProgram}
            selectedBudgetKey={selectedBudgetKey}
            embedded={embedded}
            actions={
              <Button asChild variant="outline" size="sm" className="shrink-0 gap-2">
                <a href={MAP_PAGE_PATH} target="_blank" rel="noreferrer">
                  <Maximize2 className="h-4 w-4" />
                  Groot formaat
                </a>
              </Button>
            }
          />
          <p className="text-sm text-muted-foreground">
            Raadpleeg voor de laatste beschikbare informatie steeds:{" "}
            <a
              href="https://www.vlaanderen.be/departement-mobiliteit-en-openbare-werken/mobiliteitsinfrastructuur-in-vlaanderen/geintegreerd-investeringsprogramma-mobiliteit-en-openbare-werken"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Geïntegreerd Investeringsprogramma Mobiliteit en Openbare Werken
            </a>
            .
          </p>
          {embedded && (
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-2">
              <a href={MAP_PAGE_PATH} target="_blank" rel="noreferrer">
                <Maximize2 className="h-4 w-4" />
                Groot formaat
              </a>
            </Button>
          )}
          <Card>
            <CardContent className="p-4">
              <InfrastructureProjectMap
                features={gip.infrastructureFeatures}
                selectedProgram={selectedProgram}
                selectedBudgetKey={selectedBudgetKey}
                formatBudget={formatEuroCompact}
                years={visibleYears}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-5">
          <TabSectionHeader
            section="projects"
            title="Projectlijnen"
            description={`De tabel is opgebouwd uit de (deel)projecten van ${metadata.source}.`}
            selectedVersion={selectedVersion}
            selectedProgram={selectedProgram}
            selectedBudgetKey={selectedBudgetKey}
            embedded={embedded}
          />
          <ProjectTable
            projects={gip.projects}
            selectedVersion={selectedVersion}
            selectedProgram={selectedProgram}
            selectedBudgetKey={selectedBudgetKey}
            embedded={embedded}
          />
        </TabsContent>

        <TabsContent value="reconciliation" className="space-y-5">
          {bundle && (
            <ReconciliationSection
              gip2025={bundle.gip2025}
              gip2026={bundle.gip2026}
              selectedProgram={selectedProgram}
              selectedVersion={selectedVersion}
              selectedBudgetKey={selectedBudgetKey}
              embedded={embedded}
            />
          )}
        </TabsContent>

        <TabsContent value="large" className="space-y-8">
          <section className="space-y-4">
            <TabSectionHeader
              section="large"
              title={gip.bigProjects.length ? "Grote projecten 2025-2040" : "Grote projecten"}
              description={gip.bigProjects.length ? "Capex en langetermijninvesteringsimpact uit de aparte bijlage grote projecten." : "De GIP 2026-mededeling bevat geen aparte meerjarige capextabel voor deze visualisatie."}
              selectedVersion={selectedVersion}
              selectedProgram={selectedProgram}
              selectedBudgetKey={selectedBudgetKey}
              embedded={embedded}
            />
            {gip.bigProjects.length ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Totaalbudget per groot project</CardTitle>
                </CardHeader>
                <CardContent>
                  <BigProjectBars projects={gip.bigProjects} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Voor deze versie worden de grote projecten meegenomen in de GIP 2026-projecttabel zelf. Een aparte tabel met investeringsimpact per jaar is niet meegeleverd in de nieuwe bronbestanden.
                </CardContent>
              </Card>
            )}
          </section>

          {gip.bigProjects.length > 0 && (
            <section className="space-y-4">
              <SectionHeading title="Investeringsimpact per jaar" />
              <Card>
                <CardContent className="p-4">
                  <LongTermImpactChart projects={gip.bigProjects} />
                </CardContent>
              </Card>
            </section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
