"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Button } from "@embuild/shared/components/ui/button"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@embuild/shared/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { cn } from "@embuild/shared/lib/utils"
import { GeoProvider } from "@embuild/shared/components/shared/GeoContext"
import { TimeSeriesSection } from "@embuild/shared/components/shared/TimeSeriesSection"
import { CHART_THEME } from "@embuild/shared/lib/chart-theme"
import { createYAxisLabelConfig } from "@embuild/shared/lib/number-formatters"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
  AreaChart,
  Area,
} from "recharts"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@embuild/shared/components/ui/table"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

type QuarterlyRow = { y: number; q: number; p: number; g: number; w: number; m2: number }
type YearlyRow = { y: number; p: number; g: number; w: number; m2: number }
type TypeRow = { y: number; t: string; p: number; g: number; w: number; m2: number }
type SloopQuarterlyRow = { y: number; q: number; p: number; g: number; m2: number; m3: number }
type SloopYearlyRow = { y: number; p: number; g: number; m2: number; m3: number }
type SloopBesluitRow = { y: number; b: string; p: number; g: number; m2: number; m3: number }
type HandelingCode = "nieuwbouw" | "verbouw" | "sloop"
type ApplicantCode = "natuurlijk_persoon" | "overheid_rechtspersoon" | "andere"
type ApplicantMetricCode = MetricCode | "dm2" | "m3"
type ApplicantRow = {
  y: number
  h: HandelingCode
  a: ApplicantCode
  p: number
  g: number
  w: number
  m2: number
  dm2: number
  m3: number
}

type MetricCode = "p" | "g" | "w" | "m2"
type SloopMetricCode = "p" | "g" | "m2" | "m3"

const METRIC_LABELS: Record<MetricCode, string> = {
  p: "Projecten",
  g: "Gebouwen",
  w: "Wooneenheden",
  m2: "Oppervlakte (m²)",
}

const SLOOP_METRIC_LABELS: Record<SloopMetricCode, string> = {
  p: "Projecten",
  g: "Gebouwen",
  m2: "Gesloopte oppervlakte (m²)",
  m3: "Gesloopt volume (m³)",
}

const APPLICANT_NON_SLOOP_METRIC_LABELS = {
  p: "Projecten",
  g: "Gebouwen",
  w: "Wooneenheden",
  m2: "Nuttige woonoppervlakte (m²)",
} as const

let nieuwbouwQuarterly: QuarterlyRow[] = []
let nieuwbouwYearly: YearlyRow[] = []
let nieuwbouwByType: TypeRow[] = []
let verbouwQuarterly: QuarterlyRow[] = []
let verbouwYearly: YearlyRow[] = []
let verbouwByType: TypeRow[] = []
let sloopQuarterly: SloopQuarterlyRow[] = []
let sloopYearly: SloopYearlyRow[] = []
let sloopByBesluit: SloopBesluitRow[] = []
let aanvragerYearly: ApplicantRow[] = []

// Standardized colors using CSS variables
const TYPE_COLORS: Record<string, string> = {
  eengezins: "var(--color-chart-1)",
  meergezins: "var(--color-chart-2)",
  kamer: "var(--color-chart-3)",
}

const TYPE_LABELS: Record<string, string> = {
  eengezins: "Eengezinswoning",
  meergezins: "Meergezinswoning",
  kamer: "Kamerwoning",
}

const HANDELING_LABELS: Record<HandelingCode, string> = {
  nieuwbouw: "Nieuwbouw",
  verbouw: "Verbouw",
  sloop: "Sloop",
}

const AANVRAGER_HANDELING_LABELS = {
  nieuwbouw: "Nieuwbouw",
  verbouw: "Verbouw",
} as const

const APPLICANT_ORDER: ApplicantCode[] = ["natuurlijk_persoon", "overheid_rechtspersoon", "andere"]
const VISIBLE_APPLICANT_ORDER: ApplicantCode[] = ["natuurlijk_persoon", "overheid_rechtspersoon"]

const APPLICANT_COLORS: Record<ApplicantCode, string> = {
  natuurlijk_persoon: "var(--color-chart-1)",
  overheid_rechtspersoon: "var(--color-chart-2)",
  andere: "var(--color-chart-4)",
}

const APPLICANT_LABELS: Record<ApplicantCode, string> = {
  natuurlijk_persoon: "Natuurlijk persoon",
  overheid_rechtspersoon: "Overheid / rechtspersoon",
  andere: "Andere / onbekend",
}

function formatInt(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number) {
  const sign = n >= 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}%`
}

function formatShare(n: number) {
  return `${n.toFixed(1)}%`
}

// Metric selector component
function MetricSelector<T extends string>({
  selected,
  onChange,
  labels,
}: {
  selected: T
  onChange: (m: T) => void
  labels: Record<T, string>
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1 min-w-[130px]">
          <span className="truncate">{labels[selected]}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <Command>
          <CommandList>
            <CommandGroup>
              {(Object.keys(labels) as T[]).map((code) => (
                <CommandItem
                  key={code}
                  value={labels[code]}
                  onSelect={() => {
                    onChange(code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === code ? "opacity-100" : "opacity-0")} />
                  {labels[code]}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// NIEUWBOUW SECTION
// ============================================================================

function NieuwbouwSection() {
  const [metric, setMetric] = React.useState<MetricCode>("w")

  // Summary stats
  const currentYear = 2025
  const current = (nieuwbouwYearly as YearlyRow[]).find((r) => r.y === currentYear)
  const prev = (nieuwbouwYearly as YearlyRow[]).find((r) => r.y === currentYear - 1)
  const change = current && prev ? ((current[metric] - prev[metric]) / prev[metric]) * 100 : 0

  // Yearly chart data
  const yearlyData = React.useMemo(() => {
    return (nieuwbouwYearly as YearlyRow[]).map((r) => ({
      jaar: r.y,
      waarde: r[metric],
    }))
  }, [metric])

  // Quarterly chart data
  const quarterlyData = React.useMemo(() => {
    return (nieuwbouwQuarterly as QuarterlyRow[]).map((r) => ({
      label: `${r.y} Q${r.q}`,
      waarde: r[metric],
    }))
  }, [metric])

  // By type data
  const typeData = React.useMemo(() => {
    const years = [...new Set((nieuwbouwByType as TypeRow[]).map((r) => r.y))].sort()
    return years.map((year) => {
      const row: Record<string, number | string> = { jaar: year }
      for (const t of ["eengezins", "meergezins", "kamer"]) {
        const found = (nieuwbouwByType as TypeRow[]).find((r) => r.y === year && r.t === t)
        row[TYPE_LABELS[t]] = found ? found[metric] : 0
      }
      return row
    })
  }, [metric])

  // Trend data (index 2018 = 100)
  const trendData = React.useMemo(() => {
    const baseValue = (nieuwbouwYearly as YearlyRow[]).find((r) => r.y === 2018)?.[metric] ?? 1
    return (nieuwbouwYearly as YearlyRow[]).map((r) => ({
      jaar: r.y,
      waarde: r[metric],
      index: (r[metric] / baseValue) * 100,
    }))
  }, [metric])

  const yearlyExportData = React.useMemo(() => {
    return yearlyData.map((r) => ({ label: String(r.jaar), value: r.waarde, periodCells: [r.jaar] }))
  }, [yearlyData])

  const quarterlyExportData = React.useMemo(() => {
    return quarterlyData.map((r) => ({ label: r.label, value: r.waarde, periodCells: [r.label] }))
  }, [quarterlyData])

  const typeExportData = React.useMemo(() => {
    return typeData.flatMap((r) =>
      Object.entries(r)
        .filter(([key]) => key !== "jaar")
        .map(([type, value]) => ({
          label: `${r.jaar} - ${type}`,
          value: value as number,
          periodCells: [r.jaar, type],
        }))
    )
  }, [typeData])

  const trendExportData = React.useMemo(() => {
    return trendData.map((r) => ({ label: String(r.jaar), value: r.index, periodCells: [r.jaar] }))
  }, [trendData])

  const valueLabel = METRIC_LABELS[metric]
  const trendValueLabel = "Index (2018 = 100)"
  const yearlyYAxis = React.useMemo(() => {
    const cfg = createYAxisLabelConfig(yearlyData.map((r) => r.waarde), valueLabel, false)
    // For nieuwbouw wooneenheden we display values in duizenden for clarity
    if (metric === "w") {
      return {
        formatter: (v: number) => {
          if (!Number.isFinite(v)) return ""
          const scaled = Number(v) / 1000
          return scaled.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        },
        label: { text: `${valueLabel} `, boldText: "(duizenden)" },
      }
    }
    return cfg
  }, [yearlyData, valueLabel, metric])

  const quarterlyYAxis = React.useMemo(() => {
    const cfg = createYAxisLabelConfig(quarterlyData.map((r) => r.waarde), valueLabel, false)
    if (metric === "w") {
      return {
        formatter: (v: number) => {
          if (!Number.isFinite(v)) return ""
          const scaled = Number(v) / 1000
          return scaled.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        },
        label: { text: `${valueLabel} `, boldText: "(duizenden)" },
      }
    }
    return cfg
  }, [quarterlyData, valueLabel, metric])

  const typeYAxis = React.useMemo(() => {
    const values = typeData.flatMap((row) =>
      Object.entries(row)
        .filter(([key]) => key !== "jaar")
        .map(([, value]) => Number(value))
    )
    const cfg = createYAxisLabelConfig(values, valueLabel, false)
    if (metric === "w") {
      return {
        formatter: (v: number) => {
          if (!Number.isFinite(v)) return ""
          const scaled = Number(v) / 1000
          return scaled.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        },
        label: { text: `${valueLabel} `, boldText: "(duizenden)" },
      }
    }
    return cfg
  }, [typeData, valueLabel, metric])

  const trendYAxis = React.useMemo(() => {
    const cfg = createYAxisLabelConfig(trendData.map((r) => r.waarde), valueLabel, false)
    if (metric === "w") {
      return {
        formatter: (v: number) => {
          if (!Number.isFinite(v)) return ""
          const scaled = Number(v) / 1000
          return scaled.toLocaleString("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        },
        label: { text: `${valueLabel} `, boldText: "(duizenden)" },
      }
    }
    return cfg
  }, [trendData, valueLabel, metric])

  // Table data
  const tableData = React.useMemo(() => {
    return (nieuwbouwYearly as YearlyRow[]).map((r) => ({
      jaar: r.y,
      projecten: r.p,
      gebouwen: r.g,
      wooneenheden: r.w,
      oppervlakte: r.m2,
    }))
  }, [])

  const tableExportData = React.useMemo(() => {
    const metricMap = {
      p: "projecten" as const,
      g: "gebouwen" as const,
      w: "wooneenheden" as const,
      m2: "oppervlakte" as const,
    }
    const metricKey = metricMap[metric]

    return tableData.map((r) => ({
      label: String(r.jaar),
      value: r[metricKey],
      periodCells: [r.jaar],
    }))
  }, [tableData, metric])

  return (
    <TimeSeriesSection
      title="Nieuwbouw"
      slug="vergunningen-aanvragen"
      sectionId="nieuwbouw"
      dataSource="Omgevingsloket Vlaanderen"
      dataSourceUrl="https://omgevingsloketrapportering.omgeving.vlaanderen.be/wonen"
      defaultView="yearly"
      headerContent={
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{METRIC_LABELS[metric]} {currentYear}</div>
              <div className="text-2xl font-bold">{current ? formatInt(current[metric]) : "-"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">vs {currentYear - 1}</div>
              <div className={cn("text-2xl font-bold", change >= 0 ? "text-green-600" : "text-red-600")}>
                {formatPct(change)}
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Totaal 2018-2025</div>
              <div className="text-2xl font-bold">
                {formatInt((nieuwbouwYearly as YearlyRow[]).filter((r) => r.y <= 2025).reduce((sum, r) => sum + r[metric], 0))}
              </div>
            </CardContent>
          </Card>
        </div>
      }
      rightControls={<MetricSelector selected={metric} onChange={setMetric} labels={METRIC_LABELS} />}
      views={[
        {
          value: "yearly",
          label: "Per jaar",
          exportData: yearlyExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Jaarlijkse evolutie nieuwbouw</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {yearlyYAxis.label.text}
                  <span className="font-bold">{yearlyYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={yearlyData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={yearlyYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => {
                        if (v === undefined) return ""
                        if (metric === 'w') {
                          const scaled = Number(v) / 1000
                          return scaled.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                        }
                        return formatInt(Number(v))
                      }}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Bar dataKey="waarde" name={METRIC_LABELS[metric]} fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "quarterly",
          label: "Per kwartaal",
          exportData: quarterlyExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Periode"], valueLabel, embedParams: { metric, timeRange: "quarterly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Kwartaalevolutie nieuwbouw</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {quarterlyYAxis.label.text}
                  <span className="font-bold">{quarterlyYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={quarterlyData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={quarterlyYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => {
                        if (v === undefined) return ""
                        if (metric === 'w') {
                          const scaled = Number(v) / 1000
                          return scaled.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                        }
                        return formatInt(Number(v))
                      }}
                      contentStyle={CHART_THEME.tooltip}
                    />
                    <Area type="monotone" dataKey="waarde" name={METRIC_LABELS[metric]} fill="var(--color-chart-1)" stroke="var(--color-chart-1)" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "type",
          label: "Per type",
          exportData: typeExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar", "Type"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "type" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Nieuwbouw per woningtype</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {typeYAxis.label.text}
                  <span className="font-bold">{typeYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={typeData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={typeYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => {
                        if (v === undefined) return ""
                        if (metric === 'w') {
                          const scaled = Number(v) / 1000
                          return scaled.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                        }
                        return formatInt(Number(v))
                      }}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Legend iconType="circle" />
                    <Bar dataKey="Eengezinswoning" fill={TYPE_COLORS.eengezins} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Meergezinswoning" fill={TYPE_COLORS.meergezins} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Kamerwoning" fill={TYPE_COLORS.kamer} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "trend",
          label: "Trend",
          exportData: trendExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar"], valueLabel: trendValueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Trend nieuwbouw (index 2018 = 100)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {trendYAxis.label.text}
                  <span className="font-bold">{trendYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trendData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tickFormatter={trendYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 150]} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v, name) => {
                        if (v === undefined) return ""
                        if (name === "Index") return Number(v).toFixed(1)
                        if (metric === 'w') {
                          const scaled = Number(v) / 1000
                          return scaled.toLocaleString('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                        }
                        return formatInt(Number(v))
                      }}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Legend iconType="circle" />
                    <Bar yAxisId="left" dataKey="waarde" name={METRIC_LABELS[metric]} fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="index" name="Index" stroke="var(--color-chart-5)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "table",
          label: "Tabel",
          exportData: tableExportData,
          exportMeta: { viewType: "table", periodHeaders: ["Jaar"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Nieuwbouw per jaar (alle metrieken)</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Jaar</TableHead>
                        <TableHead className="text-right">Projecten</TableHead>
                        <TableHead className="text-right">Gebouwen</TableHead>
                        <TableHead className="text-right">Wooneenheden</TableHead>
                        <TableHead className="text-right">Oppervlakte (m²)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((row) => (
                        <TableRow key={row.jaar}>
                          <TableCell className="font-medium">{row.jaar}</TableCell>
                          <TableCell className="text-right">{formatInt(row.projecten)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.gebouwen)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.wooneenheden)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.oppervlakte)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ),
        },
      ]}
    />
  )
}

// ============================================================================
// VERBOUW SECTION
// ============================================================================

function VerbouwSection() {
  const [metric, setMetric] = React.useState<MetricCode>("w")

  const currentYear = 2025
  const current = (verbouwYearly as YearlyRow[]).find((r) => r.y === currentYear)
  const prev = (verbouwYearly as YearlyRow[]).find((r) => r.y === currentYear - 1)
  const change = current && prev ? ((current[metric] - prev[metric]) / prev[metric]) * 100 : 0

  const yearlyData = React.useMemo(() => {
    return (verbouwYearly as YearlyRow[]).map((r) => ({ jaar: r.y, waarde: r[metric] }))
  }, [metric])

  const quarterlyData = React.useMemo(() => {
    return (verbouwQuarterly as QuarterlyRow[]).map((r) => ({ label: `${r.y} Q${r.q}`, waarde: r[metric] }))
  }, [metric])

  const typeData = React.useMemo(() => {
    const years = [...new Set((verbouwByType as TypeRow[]).map((r) => r.y))].sort()
    return years.map((year) => {
      const row: Record<string, number | string> = { jaar: year }
      for (const t of ["eengezins", "meergezins", "kamer"]) {
        const found = (verbouwByType as TypeRow[]).find((r) => r.y === year && r.t === t)
        row[TYPE_LABELS[t]] = found ? found[metric] : 0
      }
      return row
    })
  }, [metric])

  const trendData = React.useMemo(() => {
    const baseValue = (verbouwYearly as YearlyRow[]).find((r) => r.y === 2018)?.[metric] ?? 1
    return (verbouwYearly as YearlyRow[]).map((r) => ({
      jaar: r.y,
      waarde: r[metric],
      index: (r[metric] / baseValue) * 100,
    }))
  }, [metric])

  const yearlyExportData = React.useMemo(() => {
    return yearlyData.map((r) => ({ label: String(r.jaar), value: r.waarde, periodCells: [r.jaar] }))
  }, [yearlyData])

  const quarterlyExportData = React.useMemo(() => {
    return quarterlyData.map((r) => ({ label: r.label, value: r.waarde, periodCells: [r.label] }))
  }, [quarterlyData])

  const typeExportData = React.useMemo(() => {
    return typeData.flatMap((r) =>
      Object.entries(r)
        .filter(([key]) => key !== "jaar")
        .map(([type, value]) => ({
          label: `${r.jaar} - ${type}`,
          value: value as number,
          periodCells: [r.jaar, type],
        }))
    )
  }, [typeData])

  const trendExportData = React.useMemo(() => {
    return trendData.map((r) => ({ label: String(r.jaar), value: r.index, periodCells: [r.jaar] }))
  }, [trendData])

  const valueLabel = METRIC_LABELS[metric]
  const trendValueLabel = "Index (2018 = 100)"

  // Y-axis config for charts
  const yearlyYAxis = React.useMemo(() => {
    return createYAxisLabelConfig(yearlyData.map((r) => r.waarde), valueLabel, false)
  }, [yearlyData, valueLabel])

  const quarterlyYAxis = React.useMemo(() => {
    return createYAxisLabelConfig(quarterlyData.map((r) => r.waarde), valueLabel, false)
  }, [quarterlyData, valueLabel])

  const typeYAxis = React.useMemo(() => {
    const values = typeData.flatMap((row) =>
      Object.entries(row)
        .filter(([key]) => key !== "jaar")
        .map(([, value]) => Number(value))
    )
    return createYAxisLabelConfig(values, valueLabel, false)
  }, [typeData, valueLabel])

  const trendYAxis = React.useMemo(() => {
    return createYAxisLabelConfig(trendData.map((r) => r.waarde), valueLabel, false)
  }, [trendData, valueLabel])

  // Table data
  const tableData = React.useMemo(() => {
    return (verbouwYearly as YearlyRow[]).map((r) => ({
      jaar: r.y,
      projecten: r.p,
      gebouwen: r.g,
      wooneenheden: r.w,
      oppervlakte: r.m2,
    }))
  }, [])

  const tableExportData = React.useMemo(() => {
    const metricMap = {
      p: "projecten" as const,
      g: "gebouwen" as const,
      w: "wooneenheden" as const,
      m2: "oppervlakte" as const,
    }
    const metricKey = metricMap[metric]

    return tableData.map((r) => ({
      label: String(r.jaar),
      value: r[metricKey],
      periodCells: [r.jaar],
    }))
  }, [tableData, metric])

  return (
    <TimeSeriesSection
      title="Verbouwen"
      slug="vergunningen-aanvragen"
      sectionId="verbouw"
      dataSource="Omgevingsloket Vlaanderen"
      dataSourceUrl="https://omgevingsloketrapportering.omgeving.vlaanderen.be/wonen"
      defaultView="yearly"
      headerContent={
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{METRIC_LABELS[metric]} {currentYear}</div>
              <div className="text-2xl font-bold">{current ? formatInt(current[metric]) : "-"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">vs {currentYear - 1}</div>
              <div className={cn("text-2xl font-bold", change >= 0 ? "text-green-600" : "text-red-600")}>
                {formatPct(change)}
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Totaal 2018-2025</div>
              <div className="text-2xl font-bold">
                {formatInt((verbouwYearly as YearlyRow[]).filter((r) => r.y <= 2025).reduce((sum, r) => sum + r[metric], 0))}
              </div>
            </CardContent>
          </Card>
        </div>
      }
      rightControls={<MetricSelector selected={metric} onChange={setMetric} labels={METRIC_LABELS} />}
      views={[
        {
          value: "yearly",
          label: "Per jaar",
          exportData: yearlyExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Jaarlijkse evolutie verbouw</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {yearlyYAxis.label.text}
                  <span className="font-bold">{yearlyYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={yearlyData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={yearlyYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => v !== undefined ? formatInt(Number(v)) : ""}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Bar dataKey="waarde" name={METRIC_LABELS[metric]} fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "quarterly",
          label: "Per kwartaal",
          exportData: quarterlyExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Periode"], valueLabel, embedParams: { metric, timeRange: "quarterly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Kwartaalevolutie verbouw</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {quarterlyYAxis.label.text}
                  <span className="font-bold">{quarterlyYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={quarterlyData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={quarterlyYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => v !== undefined ? formatInt(Number(v)) : ""}
                      contentStyle={CHART_THEME.tooltip}
                    />
                    <Area type="monotone" dataKey="waarde" name={METRIC_LABELS[metric]} fill="var(--color-chart-2)" stroke="var(--color-chart-2)" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "type",
          label: "Per type",
          exportData: typeExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar", "Type"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "type" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Verbouw per woningtype</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {typeYAxis.label.text}
                  <span className="font-bold">{typeYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={typeData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={typeYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => v !== undefined ? formatInt(Number(v)) : ""}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Legend iconType="circle" />
                    <Bar dataKey="Eengezinswoning" fill={TYPE_COLORS.eengezins} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Meergezinswoning" fill={TYPE_COLORS.meergezins} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Kamerwoning" fill={TYPE_COLORS.kamer} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "trend",
          label: "Trend",
          exportData: trendExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar"], valueLabel: trendValueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Trend verbouw (index 2018 = 100)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {trendYAxis.label.text}
                  <span className="font-bold">{trendYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trendData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tickFormatter={trendYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 150]} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v, name) => v !== undefined ? (name === "Index" ? Number(v).toFixed(1) : formatInt(Number(v))) : ""}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Legend iconType="circle" />
                    <Bar yAxisId="left" dataKey="waarde" name={METRIC_LABELS[metric]} fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="index" name="Index" stroke="var(--color-chart-5)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "table",
          label: "Tabel",
          exportData: tableExportData,
          exportMeta: { viewType: "table", periodHeaders: ["Jaar"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Verbouw per jaar (alle metrieken)</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Jaar</TableHead>
                        <TableHead className="text-right">Projecten</TableHead>
                        <TableHead className="text-right">Gebouwen</TableHead>
                        <TableHead className="text-right">Wooneenheden</TableHead>
                        <TableHead className="text-right">Oppervlakte (m²)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((row) => (
                        <TableRow key={row.jaar}>
                          <TableCell className="font-medium">{row.jaar}</TableCell>
                          <TableCell className="text-right">{formatInt(row.projecten)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.gebouwen)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.wooneenheden)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.oppervlakte)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ),
        },
      ]}
    />
  )
}

// ============================================================================
// PROJECT AANVRAGER TYPE SECTION
// ============================================================================

function AanvragerSection() {
  const [handeling, setHandeling] = React.useState<keyof typeof AANVRAGER_HANDELING_LABELS>("nieuwbouw")
  const [metric, setMetric] = React.useState<ApplicantMetricCode>("w")

  const rows = React.useMemo(
    () => (aanvragerYearly as ApplicantRow[]).filter((row) => row.h === handeling),
    [handeling]
  )
  const visibleRows = React.useMemo(
    () => rows.filter((row) => VISIBLE_APPLICANT_ORDER.includes(row.a)),
    [rows]
  )

  const years = React.useMemo(
    () => [...new Set(rows.map((row) => row.y))].sort((a, b) => a - b),
    [rows]
  )

  const currentYear = years[years.length - 1] ?? 0
  const previousYear = years[years.length - 2] ?? currentYear - 1

  const currentRows = visibleRows.filter((row) => row.y === currentYear)
  const previousRows = visibleRows.filter((row) => row.y === previousYear)

  const currentTotal = currentRows.reduce((sum, row) => sum + row[metric], 0)
  const previousTotal = previousRows.reduce((sum, row) => sum + row[metric], 0)
  const change = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0

  const dominantApplicant = currentRows.reduce<ApplicantRow | null>((best, row) => {
    if (!best || row[metric] > best[metric]) return row
    return best
  }, null)
  const dominantShare = dominantApplicant && currentTotal > 0 ? (dominantApplicant[metric] / currentTotal) * 100 : 0

  const valueLabel = React.useMemo(() => {
    return APPLICANT_NON_SLOOP_METRIC_LABELS[metric as keyof typeof APPLICANT_NON_SLOOP_METRIC_LABELS] ?? "Waarde"
  }, [metric])

  const yearlyData = React.useMemo(() => {
    return years.map((year) => {
      const row: Record<string, string | number> = { jaar: year }
      for (const applicant of APPLICANT_ORDER) {
        const found = rows.find((entry) => entry.y === year && entry.a === applicant)
        row[APPLICANT_LABELS[applicant]] = found ? found[metric] : 0
      }
      return row
    })
  }, [years, rows, metric])

  const shareData = React.useMemo(() => {
    return yearlyData.map((row) => {
      const total = VISIBLE_APPLICANT_ORDER.reduce(
        (sum, applicant) => sum + Number(row[APPLICANT_LABELS[applicant]] ?? 0),
        0
      )
      const shareRow: Record<string, string | number> = { jaar: row.jaar }
      for (const applicant of VISIBLE_APPLICANT_ORDER) {
        const value = Number(row[APPLICANT_LABELS[applicant]] ?? 0)
        shareRow[APPLICANT_LABELS[applicant]] = total > 0 ? (value / total) * 100 : 0
      }
      return shareRow
    })
  }, [yearlyData])

  const yearlyExportData = React.useMemo(() => {
    return yearlyData.flatMap((row) =>
      VISIBLE_APPLICANT_ORDER.map((applicant) => ({
        label: `${row.jaar} - ${APPLICANT_LABELS[applicant]}`,
        value: Number(row[APPLICANT_LABELS[applicant]] ?? 0),
        periodCells: [row.jaar as number, APPLICANT_LABELS[applicant]],
      }))
    )
  }, [yearlyData])

  const shareExportData = React.useMemo(() => {
    return shareData.flatMap((row) =>
      VISIBLE_APPLICANT_ORDER.map((applicant) => ({
        label: `${row.jaar} - ${APPLICANT_LABELS[applicant]}`,
        value: Number(row[APPLICANT_LABELS[applicant]] ?? 0),
        periodCells: [row.jaar as number, APPLICANT_LABELS[applicant]],
      }))
    )
  }, [shareData])

  const yearlyTotals = React.useMemo(() => {
    return yearlyData.map((row) =>
      VISIBLE_APPLICANT_ORDER.reduce((sum, applicant) => sum + Number(row[APPLICANT_LABELS[applicant]] ?? 0), 0)
    )
  }, [yearlyData])

  const yearlyYAxis = React.useMemo(() => {
    return createYAxisLabelConfig(yearlyTotals, valueLabel, false)
  }, [yearlyTotals, valueLabel])

  const tableData = React.useMemo(() => {
    return yearlyData.map((row) => ({
      jaar: row.jaar as number,
      natuurlijkPersoon: Number(row[APPLICANT_LABELS.natuurlijk_persoon] ?? 0),
      overheidRechtspersoon: Number(row[APPLICANT_LABELS.overheid_rechtspersoon] ?? 0),
      andere: Number(row[APPLICANT_LABELS.andere] ?? 0),
    }))
  }, [yearlyData])

  const shareTableData = React.useMemo(() => {
    return shareData.map((row) => ({
      jaar: row.jaar as number,
      natuurlijkPersoon: Number(row[APPLICANT_LABELS.natuurlijk_persoon] ?? 0),
      overheidRechtspersoon: Number(row[APPLICANT_LABELS.overheid_rechtspersoon] ?? 0),
    }))
  }, [shareData])

  return (
    <TimeSeriesSection
      title="Project Aanvrager Type"
      slug="vergunningen-aanvragen"
      sectionId="aanvrager"
      dataSource="Omgevingsloket Vlaanderen"
      dataSourceUrl="https://omgevingsloketrapportering.omgeving.vlaanderen.be/wonen"
      defaultView="yearly"
      headerContent={
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Combinaties van aanvragertypes komen voor, bijvoorbeeld natuurlijk persoon en rechtspersoon samen. Dat wijst
            vaak op een natuurlijke persoon die in naam van een rechtspersoon indiende, maar dat niet volledig correct in
            het loket registreerde. Omgekeerd kunnen sommige overheidsinstanties enkel als rechtspersoon geregistreerd
            zijn. Deze informatie wordt dus weergegeven zoals ze door de aanvragers in het loket werd geregistreerd. De
            cijfers zijn actueel tot 1 maart 2026.
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{valueLabel} {currentYear}</div>
                <div className="text-2xl font-bold">{currentYear ? formatInt(currentTotal) : "-"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">vs {previousYear}</div>
                <div className={cn("text-2xl font-bold", change >= 0 ? "text-green-600" : "text-red-600")}>
                  {formatPct(change)}
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Dominant type {currentYear}</div>
                <div className="text-lg font-bold">
                  {dominantApplicant ? APPLICANT_LABELS[dominantApplicant.a] : "-"}
                </div>
                <div className="text-sm text-muted-foreground">{dominantApplicant ? formatPct(dominantShare) : "-"}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      }
      rightControls={
        <>
          <MetricSelector selected={handeling} onChange={setHandeling} labels={AANVRAGER_HANDELING_LABELS} />
          <MetricSelector
            selected={metric as keyof typeof APPLICANT_NON_SLOOP_METRIC_LABELS}
            onChange={(value) => setMetric(value as ApplicantMetricCode)}
            labels={APPLICANT_NON_SLOOP_METRIC_LABELS}
          />
        </>
      }
      views={[
        {
          value: "yearly",
          label: "Per jaar",
          exportData: yearlyExportData,
          exportMeta: {
            viewType: "chart",
            periodHeaders: ["Jaar", "Aanvrager"],
            valueLabel,
            embedParams: { handeling, metric, timeRange: "yearly", subView: "aanvrager" },
          },
          content: (
            <Card>
              <CardHeader><CardTitle>{HANDELING_LABELS[handeling]} per project aanvrager type</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {yearlyYAxis.label.text}
                  <span className="font-bold">{yearlyYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={yearlyData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={yearlyYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value) => value !== undefined ? formatInt(Number(value)) : ""}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Legend iconType="circle" />
                    <Bar dataKey={APPLICANT_LABELS.natuurlijk_persoon} fill={APPLICANT_COLORS.natuurlijk_persoon} stackId="a" />
                    <Bar
                      dataKey={APPLICANT_LABELS.overheid_rechtspersoon}
                      fill={APPLICANT_COLORS.overheid_rechtspersoon}
                      stackId="a"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "share",
          label: "Aandeel",
          exportData: shareExportData,
          exportMeta: {
            viewType: "chart",
            periodHeaders: ["Jaar", "Aanvrager"],
            valueLabel: "Aandeel (%)",
            embedParams: { handeling, metric, timeRange: "yearly", subView: "share" },
          },
          content: (
            <Card>
              <CardHeader><CardTitle>Aandeel per project aanvrager type</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">Aandeel <span className="font-bold">(%)</span></div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={shareData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(value: number) => `${value}%`}
                      fontSize={CHART_THEME.fontSize}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      formatter={(value) => value !== undefined ? `${Number(value).toFixed(1)}%` : ""}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Legend iconType="circle" />
                    <Bar dataKey={APPLICANT_LABELS.natuurlijk_persoon} fill={APPLICANT_COLORS.natuurlijk_persoon} stackId="a" />
                    <Bar
                      dataKey={APPLICANT_LABELS.overheid_rechtspersoon}
                      fill={APPLICANT_COLORS.overheid_rechtspersoon}
                      stackId="a"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "table",
          label: "Tabel",
          exportData: yearlyExportData,
          exportMeta: {
            viewType: "table",
            periodHeaders: ["Jaar", "Aanvrager"],
            valueLabel,
            embedParams: { handeling, metric, timeRange: "yearly", subView: "aanvrager" },
          },
          content: (
            <Card>
              <CardHeader><CardTitle>{HANDELING_LABELS[handeling]} per aanvragertype</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 text-sm font-medium text-muted-foreground">Absolute waarden</div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Jaar</TableHead>
                            <TableHead className="text-right">Natuurlijk persoon</TableHead>
                            <TableHead className="text-right">Overheid / rechtspersoon</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.map((row) => (
                            <TableRow key={row.jaar}>
                              <TableCell className="font-medium">{row.jaar}</TableCell>
                              <TableCell className="text-right">{formatInt(row.natuurlijkPersoon)}</TableCell>
                              <TableCell className="text-right">{formatInt(row.overheidRechtspersoon)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium text-muted-foreground">Aandeel (%)</div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Jaar</TableHead>
                            <TableHead className="text-right">Natuurlijk persoon</TableHead>
                            <TableHead className="text-right">Overheid / rechtspersoon</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shareTableData.map((row) => (
                            <TableRow key={row.jaar}>
                              <TableCell className="font-medium">{row.jaar}</TableCell>
                              <TableCell className="text-right">{formatShare(row.natuurlijkPersoon)}</TableCell>
                              <TableCell className="text-right">{formatShare(row.overheidRechtspersoon)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ),
        },
      ]}
    />
  )
}

// ============================================================================
// SLOOP SECTION
// ============================================================================

function SloopSection() {
  const [metric, setMetric] = React.useState<SloopMetricCode>("m2")

  const currentYear = 2025
  const current = (sloopYearly as SloopYearlyRow[]).find((r) => r.y === currentYear)
  const prev = (sloopYearly as SloopYearlyRow[]).find((r) => r.y === currentYear - 1)
  const change = current && prev ? ((current[metric] - prev[metric]) / prev[metric]) * 100 : 0

  const yearlyData = React.useMemo(() => {
    return (sloopYearly as SloopYearlyRow[]).map((r) => ({ jaar: r.y, waarde: r[metric] }))
  }, [metric])

  const quarterlyData = React.useMemo(() => {
    return (sloopQuarterly as SloopQuarterlyRow[]).map((r) => ({ label: `${r.y} Q${r.q}`, waarde: r[metric] }))
  }, [metric])

  // By besluit type data
  const besluitData = React.useMemo(() => {
    const years = [...new Set((sloopByBesluit as SloopBesluitRow[]).map((r) => r.y))].sort()
    const besluitTypes = ["Gemeente", "Provincie", "Onbekend"]
    return years.map((year) => {
      const row: Record<string, number | string> = { jaar: year }
      for (const b of besluitTypes) {
        const found = (sloopByBesluit as SloopBesluitRow[]).find((r) => r.y === year && r.b === b)
        row[b] = found ? found[metric] : 0
      }
      return row
    })
  }, [metric])

  const trendData = React.useMemo(() => {
    const baseValue = (sloopYearly as SloopYearlyRow[]).find((r) => r.y === 2018)?.[metric] ?? 1
    return (sloopYearly as SloopYearlyRow[]).map((r) => ({
      jaar: r.y,
      waarde: r[metric],
      index: (r[metric] / baseValue) * 100,
    }))
  }, [metric])

  const yearlyExportData = React.useMemo(() => {
    return yearlyData.map((r) => ({ label: String(r.jaar), value: r.waarde, periodCells: [r.jaar] }))
  }, [yearlyData])

  const quarterlyExportData = React.useMemo(() => {
    return quarterlyData.map((r) => ({ label: r.label, value: r.waarde, periodCells: [r.label] }))
  }, [quarterlyData])

  const besluitExportData = React.useMemo(() => {
    return besluitData.flatMap((r) =>
      Object.entries(r)
        .filter(([key]) => key !== "jaar")
        .map(([besluit, value]) => ({
          label: `${r.jaar} - ${besluit}`,
          value: value as number,
          periodCells: [r.jaar, besluit],
        }))
    )
  }, [besluitData])

  const trendExportData = React.useMemo(() => {
    return trendData.map((r) => ({ label: String(r.jaar), value: r.index, periodCells: [r.jaar] }))
  }, [trendData])

  const valueLabel = SLOOP_METRIC_LABELS[metric]
  const trendValueLabel = "Index (2018 = 100)"
  const yearlyYAxis = React.useMemo(() => {
    return createYAxisLabelConfig(yearlyData.map((r) => r.waarde), valueLabel, false)
  }, [yearlyData, valueLabel])
  const quarterlyYAxis = React.useMemo(() => {
    return createYAxisLabelConfig(quarterlyData.map((r) => r.waarde), valueLabel, false)
  }, [quarterlyData, valueLabel])
  const besluitYAxis = React.useMemo(() => {
    const values = besluitData.flatMap((row) =>
      Object.entries(row)
        .filter(([key]) => key !== "jaar")
        .map(([, value]) => Number(value))
    )
    return createYAxisLabelConfig(values, valueLabel, false)
  }, [besluitData, valueLabel])
  const trendYAxis = React.useMemo(() => {
    return createYAxisLabelConfig(trendData.map((r) => r.waarde), valueLabel, false)
  }, [trendData, valueLabel])

  // Table data
  const tableData = React.useMemo(() => {
    return (sloopYearly as SloopYearlyRow[]).map((r) => ({
      jaar: r.y,
      projecten: r.p,
      gebouwen: r.g,
      oppervlakte: r.m2,
      volume: r.m3,
    }))
  }, [])

  const tableExportData = React.useMemo(() => {
    const metricMap = {
      p: "projecten" as const,
      g: "gebouwen" as const,
      m2: "oppervlakte" as const,
      m3: "volume" as const,
    }
    const metricKey = metricMap[metric]

    return tableData.map((r) => ({
      label: String(r.jaar),
      value: r[metricKey],
      periodCells: [r.jaar],
    }))
  }, [tableData, metric])

  return (
    <TimeSeriesSection
      title="Sloop"
      slug="vergunningen-aanvragen"
      sectionId="sloop"
      dataSource="Omgevingsloket Vlaanderen"
      dataSourceUrl="https://omgevingsloketrapportering.omgeving.vlaanderen.be/wonen"
      defaultView="yearly"
      headerContent={
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">{SLOOP_METRIC_LABELS[metric]} {currentYear}</div>
              <div className="text-2xl font-bold">{current ? formatInt(current[metric]) : "-"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">vs {currentYear - 1}</div>
              <div className={cn("text-2xl font-bold", change >= 0 ? "text-green-600" : "text-red-600")}>
                {formatPct(change)}
              </div>
            </CardContent>
          </Card>
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Totaal 2018-2025</div>
              <div className="text-2xl font-bold">
                {formatInt((sloopYearly as SloopYearlyRow[]).filter((r) => r.y <= 2025).reduce((sum, r) => sum + r[metric], 0))}
              </div>
            </CardContent>
          </Card>
        </div>
      }
      rightControls={<MetricSelector selected={metric} onChange={setMetric} labels={SLOOP_METRIC_LABELS} />}
      views={[
        {
          value: "yearly",
          label: "Per jaar",
          exportData: yearlyExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Jaarlijkse evolutie sloop</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {yearlyYAxis.label.text}
                  <span className="font-bold">{yearlyYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={yearlyData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={yearlyYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => v !== undefined ? formatInt(Number(v)) : ""}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Bar dataKey="waarde" name={SLOOP_METRIC_LABELS[metric]} fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "quarterly",
          label: "Per kwartaal",
          exportData: quarterlyExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Periode"], valueLabel, embedParams: { metric, timeRange: "quarterly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Kwartaalevolutie sloop</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {quarterlyYAxis.label.text}
                  <span className="font-bold">{quarterlyYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={quarterlyData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={quarterlyYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => v !== undefined ? formatInt(Number(v)) : ""}
                      contentStyle={CHART_THEME.tooltip}
                    />
                    <Area type="monotone" dataKey="waarde" name={SLOOP_METRIC_LABELS[metric]} fill="var(--color-chart-4)" stroke="var(--color-chart-4)" fillOpacity={0.2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "besluit",
          label: "Per besluit",
          exportData: besluitExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar", "Besluit"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "besluit" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Sloop per besluitniveau</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {besluitYAxis.label.text}
                  <span className="font-bold">{besluitYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={besluitData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={besluitYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v) => v !== undefined ? formatInt(Number(v)) : ""}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Legend iconType="circle" />
                    <Bar dataKey="Gemeente" fill="var(--color-chart-1)" stackId="a" />
                    <Bar dataKey="Provincie" fill="var(--color-chart-2)" stackId="a" />
                    <Bar dataKey="Onbekend" fill="var(--color-chart-3)" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "trend",
          label: "Trend",
          exportData: trendExportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar"], valueLabel: trendValueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Trend sloop (index 2018 = 100)</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-medium ml-16 mb-1">
                  {trendYAxis.label.text}
                  <span className="font-bold">{trendYAxis.label.boldText}</span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trendData} margin={CHART_THEME.margin}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                    <XAxis dataKey="jaar" fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tickFormatter={trendYAxis.formatter} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 150]} fontSize={CHART_THEME.fontSize} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v, name) => v !== undefined ? (name === "Index" ? Number(v).toFixed(1) : formatInt(Number(v))) : ""}
                      contentStyle={CHART_THEME.tooltip}
                      cursor={{ fill: "var(--muted)", opacity: 0.2 }}
                    />
                    <Legend iconType="circle" />
                    <Bar yAxisId="left" dataKey="waarde" name={SLOOP_METRIC_LABELS[metric]} fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="index" name="Index" stroke="var(--color-chart-5)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "table",
          label: "Tabel",
          exportData: tableExportData,
          exportMeta: { viewType: "table", periodHeaders: ["Jaar"], valueLabel, embedParams: { metric, timeRange: "yearly", subView: "total" } },
          content: (
            <Card>
              <CardHeader><CardTitle>Sloop per jaar (alle metrieken)</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Jaar</TableHead>
                        <TableHead className="text-right">Projecten</TableHead>
                        <TableHead className="text-right">Gebouwen</TableHead>
                        <TableHead className="text-right">Oppervlakte (m²)</TableHead>
                        <TableHead className="text-right">Volume (m³)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.map((row) => (
                        <TableRow key={row.jaar}>
                          <TableCell className="font-medium">{row.jaar}</TableCell>
                          <TableCell className="text-right">{formatInt(row.projecten)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.gebouwen)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.oppervlakte)}</TableCell>
                          <TableCell className="text-right">{formatInt(row.volume)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ),
        },
      ]}
    />
  )
}

// ============================================================================
// MAIN DASHBOARD
// ============================================================================

function InnerDashboard() {
  const { data: bundle, loading, error } = useJsonBundle<{
    nieuwbouwQuarterly: QuarterlyRow[]
    nieuwbouwYearly: YearlyRow[]
    nieuwbouwByType: TypeRow[]
    verbouwQuarterly: QuarterlyRow[]
    verbouwYearly: YearlyRow[]
    verbouwByType: TypeRow[]
    sloopQuarterly: SloopQuarterlyRow[]
    sloopYearly: SloopYearlyRow[]
    sloopByBesluit: SloopBesluitRow[]
    aanvragerYearly: ApplicantRow[]
  }>({
    nieuwbouwQuarterly: "/data/nieuwbouw_quarterly.json",
    nieuwbouwYearly: "/data/nieuwbouw_yearly.json",
    nieuwbouwByType: "/data/nieuwbouw_by_type.json",
    verbouwQuarterly: "/data/verbouw_quarterly.json",
    verbouwYearly: "/data/verbouw_yearly.json",
    verbouwByType: "/data/verbouw_by_type.json",
    sloopQuarterly: "/data/sloop_quarterly.json",
    sloopYearly: "/data/sloop_yearly.json",
    sloopByBesluit: "/data/sloop_by_besluit.json",
    aanvragerYearly: "/data/aanvrager_yearly.json",
  })

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  nieuwbouwQuarterly = bundle.nieuwbouwQuarterly
  nieuwbouwYearly = bundle.nieuwbouwYearly
  nieuwbouwByType = bundle.nieuwbouwByType
  verbouwQuarterly = bundle.verbouwQuarterly
  verbouwYearly = bundle.verbouwYearly
  verbouwByType = bundle.verbouwByType
  sloopQuarterly = bundle.sloopQuarterly
  sloopYearly = bundle.sloopYearly
  sloopByBesluit = bundle.sloopByBesluit
  aanvragerYearly = bundle.aanvragerYearly

  return (
    <div className="space-y-12">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          Deze analyse toont de vergunningsaanvragen voor woningen in Vlaanderen, gebaseerd op
          data van het Omgevingsloket. De cijfers zijn opgedeeld in drie categorieën: nieuwbouw,
          verbouw (renovatie/hergebruik), en sloop, aangevuld met een jaarlijkse uitsplitsing
          naar project aanvrager type. Selecteer een metriek per sectie om de data te verkennen.
        </p>
      </div>

      <AanvragerSection />

      <div className="border-t pt-8">
        <NieuwbouwSection />
      </div>

      <div className="border-t pt-8">
        <VerbouwSection />
      </div>

      <div className="border-t pt-8">
        <SloopSection />
      </div>
    </div>
  )
}

export function VergunningenDashboard() {
  return (
    <GeoProvider>
      <InnerDashboard />
    </GeoProvider>
  )
}
