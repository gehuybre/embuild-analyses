"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { PROVINCES, type ProvinceCode, type RegionCode } from "@embuild/shared/lib/geo-utils"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

interface TimeSeriesByType {
  year: number
  type: string
  count: number
}

interface TimeSeriesDetailed {
  year: number
  type: string
  gender: string
  count: number
}

interface TimeSeriesByProvince {
  year: number
  province: string
  type: string
  count: number
}

type ViewType = "chart" | "table"

interface ArbeidersBediendenEmbedProps {
  section: "evolution-by-type" | "evolution-by-gender"
  viewType: ViewType
  region: RegionCode | null
  province: ProvinceCode | null
}

export function ArbeidersBediendenEmbed({
  section,
  viewType,
  region,
  province,
}: ArbeidersBediendenEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    byType: TimeSeriesByType[]
    detailed: TimeSeriesDetailed[]
    byProvince: TimeSeriesByProvince[]
  }>({
    byType: "/data/time_series_by_type.json",
    detailed: "/data/time_series_detailed.json",
    byProvince: "/data/time_series_by_province.json",
  })

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

  if (section === "evolution-by-type") {
    return (
      <EvolutionByTypeEmbed
        viewType={viewType}
        region={region}
        province={province}
        byType={bundle.byType}
        byProvince={bundle.byProvince}
      />
    )
  }

  if (section === "evolution-by-gender") {
    return (
      <EvolutionByGenderEmbed
        viewType={viewType}
        region={region}
        province={province}
        detailed={bundle.detailed}
        byProvince={bundle.byProvince}
      />
    )
  }

  return null
}

/**
 * Embed for evolution-by-type section
 */
function EvolutionByTypeEmbed({
  viewType,
  region,
  province,
  byType,
  byProvince,
}: {
  viewType: ViewType
  region: RegionCode | null
  province: ProvinceCode | null
  byType: TimeSeriesByType[]
  byProvince: TimeSeriesByProvince[]
}) {
  // Map province names to province codes
  const provinceNameToCode: Record<string, ProvinceCode> = useMemo(() => {
    const mapping: Record<string, ProvinceCode> = {}
    PROVINCES.forEach((p) => {
      mapping[p.name] = p.code
      if (p.name === "Brussel") {
        mapping["Brussels Hoofdst. Gew."] = p.code
      }
    })
    return mapping
  }, [])

  // Filter time series data based on geo selection
  const filteredData = useMemo(() => {
    let filtered = byProvince

    // Apply geo filters
    if (province) {
      filtered = byProvince.filter((d) =>
        provinceNameToCode[d.province] === province
      )
    } else if (region && region !== '1000') {
      const provincesInRegion = PROVINCES
        .filter(p => p.regionCode === region)
        .map(p => p.code)

      filtered = byProvince.filter((d) => {
        const pCode = provinceNameToCode[d.province]
        return pCode && provincesInRegion.includes(pCode)
      })
    }

    return filtered
  }, [province, region, provinceNameToCode, byProvince])

  // Prepare chart data from filtered data
  const data = useMemo(() => prepareMultiSeriesData(
    filteredData.length > 0 ? filteredData : byType
  ), [filteredData])

  if (viewType === "table") {
    const tableData = data.map((row) => ({
      periodCells: [
        row.year,
        row.arbeiders.toLocaleString("nl-BE"),
        row.bedienden.toLocaleString("nl-BE"),
        row.total.toLocaleString("nl-BE"),
        `${row.pct_arbeiders.toFixed(1)}%`,
        `${row.pct_bedienden.toFixed(1)}%`,
      ],
    }))

    return (
      <FilterableTable
        data={tableData}
        periodHeaders={["Jaar", "Arbeiders", "Bedienden", "Totaal", "% Arbeiders", "% Bedienden"]}
      />
    )
  }

  return (
    <FilterableChart
      data={data}
      chartType="line"
      getLabel={(d) => String(d.year)}
      series={[
        { key: "arbeiders", label: "Arbeiders", color: CHART_SERIES_COLORS[0] },
        { key: "bedienden", label: "Bedienden", color: CHART_SERIES_COLORS[1] },
      ]}
      yAxisLabel="Aantal"
    />
  )
}

/**
 * Embed for evolution-by-gender section
 */
function EvolutionByGenderEmbed({
  viewType,
  region,
  province,
  detailed,
  byProvince,
}: {
  viewType: ViewType
  region: RegionCode | null
  province: ProvinceCode | null
  detailed: TimeSeriesDetailed[]
  byProvince: TimeSeriesByProvince[]
}) {
  // Map province names to province codes
  const provinceNameToCode: Record<string, ProvinceCode> = useMemo(() => {
    const mapping: Record<string, ProvinceCode> = {}
    PROVINCES.forEach((p) => {
      mapping[p.name] = p.code
      if (p.name === "Brussel") {
        mapping["Brussels Hoofdst. Gew."] = p.code
      }
    })
    return mapping
  }, [])

  // Filter time series data based on geo selection
  const filteredData = useMemo(() => {
    let filtered: TimeSeriesDetailed[] = []

    // Apply geo filters to get relevant provinces
    let relevantProvinces: string[] = []

    if (province) {
      const provinceName = Object.entries(provinceNameToCode).find(
        ([_, code]) => code === province
      )?.[0]
      if (provinceName) {
        relevantProvinces = [provinceName]
      }
    } else if (region && region !== '1000') {
      const provincesInRegion = PROVINCES
        .filter(p => p.regionCode === region)
        .map(p => p.name)

      relevantProvinces = provincesInRegion
    }

    if (relevantProvinces.length > 0) {
      const provinceTotals = new Map<string, number>()
      byProvince
        .filter(d => relevantProvinces.includes(d.province))
        .forEach(item => {
          const key = `${item.year}_${item.type}`
          provinceTotals.set(key, (provinceTotals.get(key) || 0) + item.count)
        })

      const aggregated = new Map<string, number>()
      provinceTotals.forEach((provinceTotal, key) => {
        const [yearStr, type] = key.split("_")
        const year = parseInt(yearStr)
        const detailedItems = detailed
          .filter(d => d.year === year && d.type === type)

        const totalForYear = detailedItems.reduce((sum, d) => sum + d.count, 0)
        const ratio = totalForYear > 0 ? provinceTotal / totalForYear : 0

        detailedItems.forEach(detailItem => {
          const detailKey = `${year}_${type}_${detailItem.gender}`
          aggregated.set(detailKey, detailItem.count * ratio)
        })
      })

      filtered = Array.from(aggregated.entries()).map(([key, count]) => {
        const [year, type, gender] = key.split('_')
        return {
          year: parseInt(year),
          type,
          gender,
          count: Math.round(count)
        }
      })
    }

    return filtered
  }, [province, region, provinceNameToCode, byProvince, detailed])

  // Prepare chart data from filtered data
  const data = useMemo(() => prepareDetailedData(
    filteredData.length > 0 ? filteredData : detailed
  ), [filteredData, detailed])

  if (viewType === "table") {
    const tableData = data.map((row) => ({
      periodCells: [
        row.year,
        row.arbeiders_mannen.toLocaleString("nl-BE"),
        row.arbeiders_vrouwen.toLocaleString("nl-BE"),
        row.bedienden_mannen.toLocaleString("nl-BE"),
        row.bedienden_vrouwen.toLocaleString("nl-BE"),
        row.total.toLocaleString("nl-BE"),
      ],
    }))

    return (
      <FilterableTable
        data={tableData}
        periodHeaders={["Jaar", "Arbeiders (M)", "Arbeiders (V)", "Bedienden (M)", "Bedienden (V)", "Totaal"]}
      />
    )
  }

  return (
    <FilterableChart
      data={data}
      chartType="line"
      getLabel={(d) => String(d.year)}
      series={[
        { key: "arbeiders_mannen", label: "Arbeiders (mannen)", color: CHART_SERIES_COLORS[0] },
        { key: "arbeiders_vrouwen", label: "Arbeiders (vrouwen)", color: CHART_SERIES_COLORS[1] },
        { key: "bedienden_mannen", label: "Bedienden (mannen)", color: CHART_SERIES_COLORS[2] },
        { key: "bedienden_vrouwen", label: "Bedienden (vrouwen)", color: CHART_SERIES_COLORS[3] },
      ]}
      yAxisLabel="Aantal"
    />
  )
}

/**
 * Prepare data for multi-series chart showing arbeiders vs bedienden
 */
function prepareMultiSeriesData(data: TimeSeriesByType[] | TimeSeriesByProvince[]) {
  // Group by year
  const byYear = new Map<number, { arbeiders?: number; bedienden?: number }>()

  data.forEach((item) => {
    if (!byYear.has(item.year)) {
      byYear.set(item.year, {})
    }
    const yearData = byYear.get(item.year)!
    if (item.type === "arbeiders") {
      yearData.arbeiders = (yearData.arbeiders || 0) + item.count
    } else if (item.type === "bedienden") {
      yearData.bedienden = (yearData.bedienden || 0) + item.count
    }
  })

  // Convert to array format
  return Array.from(byYear.entries())
    .map(([year, values]) => {
      const arbeiders = values.arbeiders || 0
      const bedienden = values.bedienden || 0
      const total = arbeiders + bedienden

      return {
        year,
        arbeiders,
        bedienden,
        total,
        pct_arbeiders: total > 0 ? (arbeiders / total) * 100 : 0,
        pct_bedienden: total > 0 ? (bedienden / total) * 100 : 0,
      }
    })
    .sort((a, b) => a.year - b.year)
}

/**
 * Prepare data for detailed chart with gender breakdown
 */
function prepareDetailedData(data: TimeSeriesDetailed[]) {
  // Group by year
  const byYear = new Map<
    number,
    {
      arbeiders_mannen?: number
      arbeiders_vrouwen?: number
      bedienden_mannen?: number
      bedienden_vrouwen?: number
    }
  >()

  data.forEach((item) => {
    if (!byYear.has(item.year)) {
      byYear.set(item.year, {})
    }
    const yearData = byYear.get(item.year)!
    const key = `${item.type}_${item.gender}` as keyof typeof yearData
    yearData[key] = (yearData[key] || 0) + item.count
  })

  // Convert to array format
  return Array.from(byYear.entries())
    .map(([year, values]) => ({
      year,
      arbeiders_mannen: values.arbeiders_mannen || 0,
      arbeiders_vrouwen: values.arbeiders_vrouwen || 0,
      bedienden_mannen: values.bedienden_mannen || 0,
      bedienden_vrouwen: values.bedienden_vrouwen || 0,
      total:
        (values.arbeiders_mannen || 0) +
        (values.arbeiders_vrouwen || 0) +
        (values.bedienden_mannen || 0) +
        (values.bedienden_vrouwen || 0),
    }))
    .sort((a, b) => a.year - b.year)
}
