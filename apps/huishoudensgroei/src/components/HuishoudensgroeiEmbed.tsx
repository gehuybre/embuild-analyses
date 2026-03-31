"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

type MunicipalityRow = {
  y: number
  nis: string
  n: number
  name: string | null
  p: string | null
  gr: number | null
}

type ProvinceRow = {
  y: number
  p: string
  n: number
  gr: number | null
}

type RegionRow = {
  y: number
  r: string
  n: number
  gr: number | null
}

type SizeRow = {
  y: number
  hh: string
  n: number
  r?: string
  p?: string
}

type HouseholdSize = {
  code: string
  nl: string
}

type YearPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
}

type SectionType = "evolutie" | "ranking" | "size-breakdown"
type ViewType = "chart" | "table"

const BASE_YEAR = 2023

let municipalitiesRaw: MunicipalityRow[] = []
let provincesRaw: ProvinceRow[] = []
let regionRaw: RegionRow[] = []
let regionBySizeRaw: SizeRow[] = []
let provincesBySizeRaw: SizeRow[] = []
let lookups: { household_sizes?: HouseholdSize[] } | null = null

function getYearSeries(
  level: "vlaanderen" | "province" | "municipality",
  code: string | null,
  maxYear: number
): YearPoint[] {
  let data: Array<{ y: number; n: number }>

  if (level === "municipality" && code) {
    data = (municipalitiesRaw as MunicipalityRow[]).filter((r) => r.nis === code && r.y <= maxYear)
  } else if (level === "province" && code) {
    data = (provincesRaw as ProvinceRow[]).filter((r) => r.p === code && r.y <= maxYear)
  } else {
    data = (regionRaw as RegionRow[]).filter((r) => r.y <= maxYear)
  }

  return data
    .map((r) => ({
      sortValue: r.y,
      periodCells: [r.y],
      value: r.n,
    }))
    .sort((a, b) => a.sortValue - b.sortValue)
}

function getMunicipalityRanking(
  year: number,
  limit: number = 10,
  ascending: boolean = false
): Array<{ name: string; gr: number; n: number }> {
  const data = (municipalitiesRaw as MunicipalityRow[]).filter(
    (r) => r.y === year && r.gr !== null && r.name !== null
  )

  return data
    .map((r) => ({
      name: r.name!,
      gr: r.gr!,
      n: r.n,
    }))
    .sort((a, b) => (ascending ? a.gr - b.gr : b.gr - a.gr))
    .slice(0, limit)
}

function getSizeBreakdown(
  level: "vlaanderen" | "province",
  code: string | null,
  year: number
): Array<{ label: string; value: number }> {
  const householdSizes = (lookups as { household_sizes: HouseholdSize[] }).household_sizes ?? []

  let data: SizeRow[]
  if (level === "province" && code) {
    data = (provincesBySizeRaw as SizeRow[]).filter((r) => r.p === code && r.y === year)
  } else {
    data = (regionBySizeRaw as SizeRow[]).filter((r) => r.y === year)
  }

  return data.map((r) => ({
    label: householdSizes.find((h) => h.code === r.hh)?.nl ?? r.hh,
    value: r.n,
  }))
}

interface HuishoudensgroeiEmbedProps {
  section: SectionType
  viewType: ViewType
  geo?: string | null
  horizonYear?: number
  showDecline?: boolean
}

export function HuishoudensgroeiEmbed({
  section,
  viewType,
  geo = null,
  horizonYear = 2033,
  showDecline = false,
}: HuishoudensgroeiEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    municipalities: MunicipalityRow[]
    provinces: ProvinceRow[]
    region: RegionRow[]
    regionBySize: SizeRow[]
    provincesBySize: SizeRow[]
    lookups: { household_sizes?: HouseholdSize[] }
  }>({
    municipalities: "/data/municipalities.json",
    provinces: "/data/provinces.json",
    region: "/data/region.json",
    regionBySize: "/data/region_by_size.json",
    provincesBySize: "/data/provinces_by_size.json",
    lookups: "/data/lookups.json",
  })

  if (bundle) {
    municipalitiesRaw = bundle.municipalities
    provincesRaw = bundle.provinces
    regionRaw = bundle.region
    regionBySizeRaw = bundle.regionBySize
    provincesBySizeRaw = bundle.provincesBySize
    lookups = bundle.lookups
  }

  const data = useMemo(() => {
    if (!bundle) return []
    switch (section) {
      case "evolutie":
        return getYearSeries("vlaanderen", null, horizonYear)
      case "ranking": {
        const ranking = getMunicipalityRanking(horizonYear, 10, showDecline)
        return ranking.map((r, i) => ({
          sortValue: i,
          periodCells: [r.name],
          value: r.gr,
        }))
      }
      case "size-breakdown": {
        const breakdown = getSizeBreakdown("vlaanderen", null, horizonYear)
        return breakdown.map((item, i) => ({
          sortValue: i,
          periodCells: [item.label],
          value: item.value,
        }))
      }
    }
  }, [bundle, section, horizonYear, showDecline])

  const title = useMemo(() => {
    switch (section) {
      case "evolutie":
        return `Evolutie aantal huishoudens (tot ${horizonYear})`
      case "ranking":
        return showDecline
          ? "Gemeenten met sterkste afname"
          : "Snelst groeiende gemeenten"
      case "size-breakdown":
        return "Samenstelling huishoudens"
    }
  }, [section, horizonYear, showDecline])

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

  const label = section === "evolutie"
    ? "Huishoudens"
    : section === "ranking"
      ? "Groei (%)"
      : "Aantal"

  const periodHeaders = section === "evolutie" ? ["Jaar"] : ["Categorie"]

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      {viewType === "chart" && section === "evolutie" && (
        <FilterableChart
          data={data}
          getLabel={(d) => String((d as YearPoint).periodCells[0])}
          getValue={(d) => (d as YearPoint).value}
          getSortValue={(d) => (d as YearPoint).sortValue}
        />
      )}

      {viewType === "chart" && section !== "evolutie" && (
        <div className="p-8 text-center text-muted-foreground">
          <p>Grafiekweergave is alleen beschikbaar voor de evolutie-sectie.</p>
          <p className="text-sm mt-2">Schakel over naar tabelweergave om de data te bekijken.</p>
        </div>
      )}

      {viewType === "table" && (
        <FilterableTable data={data} label={label} periodHeaders={periodHeaders} />
      )}

      <div className="mt-4 text-xs text-muted-foreground text-center">
        <span>Bron: Statistiek Vlaanderen</span>
      </div>
    </div>
  )
}
