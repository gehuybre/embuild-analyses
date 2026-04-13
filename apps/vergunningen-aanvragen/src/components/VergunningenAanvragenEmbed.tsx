"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

type QuarterlyRow = { y: number; q: number; p: number; g: number; w: number; m2: number }
type YearlyRow = { y: number; p: number; g: number; w: number; m2: number }
type TypeRow = { y: number; t: string; p: number; g: number; w: number; m2: number }
type SloopQuarterlyRow = { y: number; q: number; p: number; g: number; m2: number; m3: number }
type SloopYearlyRow = { y: number; p: number; g: number; m2: number; m3: number }
type SloopBesluitRow = { y: number; b: string; p: number; g: number; m2: number; m3: number }
type HandelingCode = "nieuwbouw" | "verbouw" | "sloop"
type ApplicantCode = "natuurlijk_persoon" | "overheid_rechtspersoon" | "andere"
type ApplicantFunctionCode = "alle" | "eengezins" | "meergezins" | "kamer"
type ApplicantMetricCode = MetricCode | "dm2" | "m3"
type ApplicantRow = {
  y: number
  h: HandelingCode
  f: Exclude<ApplicantFunctionCode, "alle">
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

const APPLICANT_SLOOP_METRIC_LABELS = {
  p: "Projecten",
  g: "Gebouwen",
  dm2: "Gesloopte oppervlakte (m²)",
  m3: "Gesloopt volume (m³)",
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

const VISIBLE_APPLICANT_ORDER: ApplicantCode[] = ["natuurlijk_persoon", "overheid_rechtspersoon"]

const APPLICANT_LABELS: Record<ApplicantCode, string> = {
  natuurlijk_persoon: "Natuurlijk persoon",
  overheid_rechtspersoon: "Overheid / rechtspersoon",
  andere: "Andere / onbekend",
}

const APPLICANT_FUNCTION_LABELS: Record<ApplicantFunctionCode, string> = {
  alle: "Alle woningtypes",
  eengezins: "Eengezinswoning",
  meergezins: "Meergezinswoning",
  kamer: "Kamerwoning",
}

type ChartPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
  formattedValue?: string
}

type SectionType = "nieuwbouw" | "verbouw" | "sloop" | "aanvrager"
type ViewType = "chart" | "table"
type TimeRange = "quarterly" | "yearly"
type SubView = "total" | "type" | "besluit" | "aanvrager" | "share"

function formatInt(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
}

// Nieuwbouw data functions
function getNieuwbouwData(
  metric: MetricCode,
  timeRange: TimeRange,
  subView: SubView
): ChartPoint[] {
  if (subView === "type") {
    const years = [...new Set((nieuwbouwByType as TypeRow[]).map((r) => r.y))].sort()
    return years.flatMap((year) =>
      ["eengezins", "meergezins", "kamer"].map((t) => {
        const found = (nieuwbouwByType as TypeRow[]).find((r) => r.y === year && r.t === t)
        const value = found ? found[metric] : 0
        return {
          sortValue: year * 10 + ["eengezins", "meergezins", "kamer"].indexOf(t),
          periodCells: [year, TYPE_LABELS[t]],
          value,
          formattedValue: formatInt(value),
        }
      })
    )
  }

  if (timeRange === "yearly") {
    return (nieuwbouwYearly as YearlyRow[]).map((r) => {
      const value = r[metric]
      return {
        sortValue: r.y,
        periodCells: [r.y],
        value,
        formattedValue: formatInt(value),
      }
    })
  }

  return (nieuwbouwQuarterly as QuarterlyRow[]).map((r) => {
    const value = r[metric]
    return {
      sortValue: r.y * 10 + r.q,
      periodCells: [`${r.y} Q${r.q}`],
      value,
      formattedValue: formatInt(value),
    }
  })
}

// Verbouw data functions
function getVerbouwData(
  metric: MetricCode,
  timeRange: TimeRange,
  subView: SubView
): ChartPoint[] {
  if (subView === "type") {
    const years = [...new Set((verbouwByType as TypeRow[]).map((r) => r.y))].sort()
    return years.flatMap((year) =>
      ["eengezins", "meergezins", "kamer"].map((t) => {
        const found = (verbouwByType as TypeRow[]).find((r) => r.y === year && r.t === t)
        const value = found ? found[metric] : 0
        return {
          sortValue: year * 10 + ["eengezins", "meergezins", "kamer"].indexOf(t),
          periodCells: [year, TYPE_LABELS[t]],
          value,
          formattedValue: formatInt(value),
        }
      })
    )
  }

  if (timeRange === "yearly") {
    return (verbouwYearly as YearlyRow[]).map((r) => {
      const value = r[metric]
      return {
        sortValue: r.y,
        periodCells: [r.y],
        value,
        formattedValue: formatInt(value),
      }
    })
  }

  return (verbouwQuarterly as QuarterlyRow[]).map((r) => {
    const value = r[metric]
    return {
      sortValue: r.y * 10 + r.q,
      periodCells: [`${r.y} Q${r.q}`],
      value,
      formattedValue: formatInt(value),
    }
  })
}

// Sloop data functions
function getSloopData(
  metric: SloopMetricCode,
  timeRange: TimeRange,
  subView: SubView
): ChartPoint[] {
  if (subView === "besluit") {
    const years = [...new Set((sloopByBesluit as SloopBesluitRow[]).map((r) => r.y))].sort()
    return years.flatMap((year) =>
      ["Gemeente", "Provincie", "Onbekend"].map((b, idx) => {
        const found = (sloopByBesluit as SloopBesluitRow[]).find((r) => r.y === year && r.b === b)
        const value = found ? found[metric] : 0
        return {
          sortValue: year * 10 + idx,
          periodCells: [year, b],
          value,
          formattedValue: formatInt(value),
        }
      })
    )
  }

  if (timeRange === "yearly") {
    return (sloopYearly as SloopYearlyRow[]).map((r) => {
      const value = r[metric]
      return {
        sortValue: r.y,
        periodCells: [r.y],
        value,
        formattedValue: formatInt(value),
      }
    })
  }

  return (sloopQuarterly as SloopQuarterlyRow[]).map((r) => {
    const value = r[metric]
    return {
      sortValue: r.y * 10 + r.q,
      periodCells: [`${r.y} Q${r.q}`],
      value,
      formattedValue: formatInt(value),
    }
  })
}

function getAanvragerData(
  metric: ApplicantMetricCode,
  handeling: HandelingCode,
  functie: ApplicantFunctionCode,
  subView: SubView
): ChartPoint[] {
  const rows = (aanvragerYearly as ApplicantRow[]).filter(
    (row) => row.h === handeling && (functie === "alle" || row.f === functie)
  )
  const years = [...new Set(rows.map((row) => row.y))].sort((a, b) => a - b)

  if (subView === "share") {
    return years.flatMap((year) => {
      const yearRows = rows.filter((row) => row.y === year)
      const total = yearRows
        .filter((row) => VISIBLE_APPLICANT_ORDER.includes(row.a))
        .reduce((sum, row) => sum + row[metric], 0)
      return VISIBLE_APPLICANT_ORDER.map((applicant, idx) => {
        const found = yearRows.find((row) => row.a === applicant)
        const value = found ? found[metric] : 0
        const share = total > 0 ? (value / total) * 100 : 0
        return {
          sortValue: year * 10 + idx,
          periodCells: [year, APPLICANT_LABELS[applicant]],
          value: share,
          formattedValue: `${share.toFixed(1)}%`,
        }
      })
    })
  }

  return years.flatMap((year) =>
    VISIBLE_APPLICANT_ORDER.map((applicant, idx) => {
      const found = rows.find((row) => row.y === year && row.a === applicant)
      const value = found ? found[metric] : 0
      return {
        sortValue: year * 10 + idx,
        periodCells: [year, APPLICANT_LABELS[applicant]],
        value,
        formattedValue: formatInt(value),
      }
    })
  )
}

interface VergunningenAanvragenEmbedProps {
  section: SectionType
  viewType: ViewType
  metric?: string
  timeRange?: TimeRange
  subView?: SubView
  handeling?: HandelingCode
  functie?: ApplicantFunctionCode
}

export function VergunningenAanvragenEmbed({
  section,
  viewType,
  metric = "w",
  timeRange = "yearly",
  subView = "total",
  handeling = "nieuwbouw",
  functie = "alle",
}: VergunningenAanvragenEmbedProps) {
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

  if (bundle) {
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
  }

  const data = useMemo(() => {
    if (!bundle) return []
    switch (section) {
      case "nieuwbouw":
        return getNieuwbouwData(metric as MetricCode, timeRange, subView)
      case "verbouw":
        return getVerbouwData(metric as MetricCode, timeRange, subView)
      case "sloop":
        return getSloopData(metric as SloopMetricCode, timeRange, subView)
      case "aanvrager":
        return getAanvragerData(metric as ApplicantMetricCode, handeling, functie, subView)
    }
  }, [bundle, section, metric, timeRange, subView, handeling, functie])

  const title = useMemo(() => {
    const sectionName =
      section === "nieuwbouw"
        ? "Nieuwbouw"
        : section === "verbouw"
          ? "Verbouw"
          : section === "sloop"
            ? "Sloop"
            : "Project Aanvrager Type"
    const metricLabel =
      section === "sloop"
        ? SLOOP_METRIC_LABELS[metric as SloopMetricCode]
          : section === "aanvrager"
            ? handeling === "sloop"
              ? APPLICANT_SLOOP_METRIC_LABELS[metric as keyof typeof APPLICANT_SLOOP_METRIC_LABELS] ?? "Waarde"
              : APPLICANT_NON_SLOOP_METRIC_LABELS[metric as keyof typeof APPLICANT_NON_SLOOP_METRIC_LABELS] ?? "Waarde"
          : METRIC_LABELS[metric as MetricCode]
    const functieSuffix = section === "aanvrager" && functie !== "alle" ? ` - ${APPLICANT_FUNCTION_LABELS[functie]}` : ""

    if (subView === "type") return `${sectionName} per woningtype - ${metricLabel}`
    if (subView === "besluit") return `${sectionName} per besluitniveau - ${metricLabel}`
    if (subView === "aanvrager") return `${sectionName} - ${HANDELING_LABELS[handeling]}${functieSuffix} - ${metricLabel}`
    if (subView === "share") return `${sectionName} - ${HANDELING_LABELS[handeling]}${functieSuffix} - Aandeel (%)`

    const timeRangeLabel = timeRange === "yearly" ? "jaarlijks" : "per kwartaal"
    return `${sectionName} ${timeRangeLabel} - ${metricLabel}`
  }, [section, metric, timeRange, subView, handeling, functie])

  const periodHeaders = useMemo(() => {
    if (subView === "type") return ["Jaar", "Type"]
    if (subView === "besluit") return ["Jaar", "Besluit"]
    if (subView === "aanvrager" || subView === "share") return ["Jaar", "Aanvrager"]
    if (timeRange === "quarterly") return ["Periode"]
    return ["Jaar"]
  }, [timeRange, subView])

  if (loading) {
    return <div className="p-4">Data laden...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-4 text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      {viewType === "chart" && (
        <FilterableChart
          data={data}
          getLabel={(d) => {
            const point = d as ChartPoint
            return point.periodCells.length > 1
              ? point.periodCells.join(" - ")
              : String(point.periodCells[0])
          }}
          getValue={(d) => (d as ChartPoint).value}
          getSortValue={(d) => (d as ChartPoint).sortValue}
        />
      )}

      {viewType === "table" && (
        <FilterableTable
          data={data}
          label={
            section === "sloop"
              ? SLOOP_METRIC_LABELS[metric as SloopMetricCode]
              : section === "aanvrager"
                ? subView === "share"
                  ? "Aandeel (%)"
                  : handeling === "sloop"
                    ? APPLICANT_SLOOP_METRIC_LABELS[metric as keyof typeof APPLICANT_SLOOP_METRIC_LABELS] ?? "Waarde"
                    : APPLICANT_NON_SLOOP_METRIC_LABELS[metric as keyof typeof APPLICANT_NON_SLOOP_METRIC_LABELS] ?? "Waarde"
                : METRIC_LABELS[metric as MetricCode]
          }
          periodHeaders={periodHeaders}
        />
      )}

      <div className="mt-4 text-xs text-muted-foreground text-center">
        <span>Bron: Omgevingsloket Vlaanderen</span>
      </div>
    </div>
  )
}
