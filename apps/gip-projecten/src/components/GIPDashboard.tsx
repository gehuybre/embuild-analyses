"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
type GipTab = "overview" | "map" | "projects" | "large"

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
  gip: "/data/gip_data.json",
} as const

const YEARS: Year[] = [2025, 2026, 2027]
const ALL_PROGRAMS = "all"
const MAP_PAGE_PATH = `${getBasePath()}/kaart/`
const GIP_SLUG = "gip-projecten"

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

function formatMio(value: number) {
  return `€${integerFormatter.format(value)} mln`
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
  return "Grote projecten"
}

function GipEmbedButton({
  section,
  selectedProgram,
  selectedBudgetKey,
}: {
  section: GipTab
  selectedProgram: string
  selectedBudgetKey: BudgetKey
}) {
  const [copied, setCopied] = useState(false)

  const getEmbedCode = useCallback(() => {
    const baseUrl = typeof window !== "undefined"
      ? window.location.origin + getBasePath()
      : ""
    const params = new URLSearchParams()
    params.set("program", selectedProgram)
    params.set("budget", selectedBudgetKey)

    const title = `GIP-projecten - ${tabLabel(section)}`
    const embedUrl = `${baseUrl}/embed/${GIP_SLUG}/${section}/?${params.toString()}`
    const height = section === "map" ? 920 : section === "projects" ? 760 : 680

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
  }, [section, selectedBudgetKey, selectedProgram])

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
  selectedProgram,
  selectedBudgetKey,
  embedded,
  actions,
}: {
  section: GipTab
  title: string
  description?: string
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
}: {
  rows: SummaryRow[]
  selectedProgram: string
}) {
  const visibleRows =
    selectedProgram === ALL_PROGRAMS
      ? rows.slice(0, 5)
      : rows.filter((row) => row.name === selectedProgram)

  const remainder =
    selectedProgram === ALL_PROGRAMS
      ? rows.slice(5).reduce(
          (acc, row) => {
            YEARS.forEach((year) => {
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
  const data = YEARS.map((year) => {
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
  selectedProgram,
  selectedBudgetKey,
  embedded = false,
}: {
  projects: GipProject[]
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
            <a href={getDataPath("/data/projects.csv")}>
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
}: {
  embeddedSection?: GipTab
  initialProgram?: string
  initialBudgetKey?: BudgetKey
} = {}) {
  const [selectedProgram, setSelectedProgram] = useState(initialProgram)
  const [selectedBudgetKey, setSelectedBudgetKey] = useState<BudgetKey>(initialBudgetKey)
  const { data: bundle, loading, error } = useJsonBundle<{ gip: GipBundle }>(DATA_PATHS)

  useEffect(() => {
    if (!embeddedSection || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const program = params.get("program")
    const budget = params.get("budget")
    if (program?.trim()) {
      setSelectedProgram(program)
    }
    if (budget && isBudgetKey(budget)) {
      setSelectedBudgetKey(budget)
    }
  }, [embeddedSection])

  const gip = bundle?.gip

  const selectedProgramSummary = useMemo(() => {
    if (!gip || selectedProgram === ALL_PROGRAMS) return null
    return gip.programSummary.find((program) => program.name === selectedProgram) ?? null
  }, [gip, selectedProgram])

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
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            icon={Euro}
            label="Totaal budget"
            value={formatEuroCompact(activeTotal)}
            detail="Som 2025, 2026 en 2027"
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
            <SelectItem value="budget_total">2025-2027</SelectItem>
            {YEARS.map((year) => (
              <SelectItem key={year} value={budgetKeyForYear(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue={embeddedSection ?? "overview"} value={embeddedSection} className="space-y-6">
        {!embedded && <TabsList className="grid w-full grid-cols-4">
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
              description="De brontabel bevat de goedgekeurde (deel)projecten voor 2025, 2026 en 2027."
              selectedProgram={selectedProgram}
              selectedBudgetKey={selectedBudgetKey}
              embedded={embedded}
            />
            <Card>
              <CardContent className="p-4">
                <YearlyBudgetChart rows={gip.programSummary} selectedProgram={selectedProgram} />
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
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="space-y-5">
          <TabSectionHeader
            section="projects"
            title="Projectlijnen"
            description="De tabel is opgebouwd uit de (deel)projecten van bijlage 4BIS."
            selectedProgram={selectedProgram}
            selectedBudgetKey={selectedBudgetKey}
            embedded={embedded}
          />
          <ProjectTable
            projects={gip.projects}
            selectedProgram={selectedProgram}
            selectedBudgetKey={selectedBudgetKey}
            embedded={embedded}
          />
        </TabsContent>

        <TabsContent value="large" className="space-y-8">
          <section className="space-y-4">
            <TabSectionHeader
              section="large"
              title="Grote projecten 2025-2040"
              description="Capex en langetermijninvesteringsimpact uit de aparte bijlage grote projecten."
              selectedProgram={selectedProgram}
              selectedBudgetKey={selectedBudgetKey}
              embedded={embedded}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Totaalbudget per groot project</CardTitle>
              </CardHeader>
              <CardContent>
                <BigProjectBars projects={gip.bigProjects} />
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHeading title="Investeringsimpact per jaar" />
            <Card>
              <CardContent className="p-4">
                <LongTermImpactChart projects={gip.bigProjects} />
              </CardContent>
            </Card>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
