"use client"

import { useEffect, useState, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { GeoProvider, useGeo } from "@embuild/shared/components/shared/GeoContext"
import { GeoFilterInline } from "@embuild/shared/components/shared/GeoFilterInline"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { PROVINCES, type ProvinceCode } from "@embuild/shared/lib/geo-utils"
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

export function ArbeidersBediendenDashboard() {
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
    return <div className="p-8 text-center">Loading...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  return (
    <GeoProvider>
      <div className="space-y-12">
        {/* Section 1: Arbeiders vs Bedienden Evolution */}
        <Section1
          byType={bundle.byType}
          byProvince={bundle.byProvince}
        />

        {/* Section 2: Gender Breakdown */}
        <Section2
          detailed={bundle.detailed}
          byProvince={bundle.byProvince}
        />
      </div>
    </GeoProvider>
  )
}

/**
 * Section 1: Evolution of arbeiders vs bedienden
 */
function Section1({
  byType,
  byProvince,
}: {
  byType: TimeSeriesByType[]
  byProvince: TimeSeriesByProvince[]
}) {
  const [mounted, setMounted] = useState(false)
  const [viewType, setViewType] = useState<"chart" | "table">("chart")

  const {
    selectedRegion,
    setSelectedRegion,
    selectedProvince,
    setSelectedProvince,
  } = useGeo()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Map province names to province codes
  const provinceNameToCode: Record<string, ProvinceCode> = useMemo(() => {
    const mapping: Record<string, ProvinceCode> = {}
    PROVINCES.forEach((p) => {
      mapping[p.name] = p.code
      // Handle Brussels special case
      if (p.name === "Brussel") {
        mapping["Brussels Hoofdst. Gew."] = p.code
      }
    })
    return mapping
  }, [])

  // Filter time series data based on geo selection
  const filteredData = useMemo(() => {
    const provinceData = byProvince

    let filtered = provinceData

    // Apply geo filters
    if (selectedProvince) {
      filtered = provinceData.filter((d) =>
        provinceNameToCode[d.province] === selectedProvince
      )
    } else if (selectedRegion !== '1000') {
      // Filter by region
      const provincesInRegion = PROVINCES
        .filter(p => p.regionCode === selectedRegion)
        .map(p => p.code)

      filtered = provinceData.filter((d) => {
        const pCode = provinceNameToCode[d.province]
        return pCode && provincesInRegion.includes(pCode)
      })
    }

    return filtered
  }, [selectedProvince, selectedRegion, provinceNameToCode])

  // Prepare chart data from filtered data
  const data = useMemo(() => prepareMultiSeriesData(
    filteredData.length > 0 ? filteredData : byType
  ), [filteredData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Evolutie arbeiders vs bedienden (2013-2024)</h2>
        <ExportButtons
          data={data.map((d) => ({
            label: String(d.year),
            value: d.total,
            periodCells: [d.arbeiders, d.bedienden, d.total, `${d.pct_arbeiders.toFixed(1)}%`, `${d.pct_bedienden.toFixed(1)}%`]
          }))}
          title="Evolutie arbeiders vs bedienden"
          slug="arbeiders-bedienden"
          sectionId="evolution-by-type"
          viewType={viewType}
          periodHeaders={["Jaar", "Arbeiders", "Bedienden", "Totaal", "% Arbeiders", "% Bedienden"]}
          embedParams={{
            region: selectedProvince ? null : (selectedRegion !== '1000' ? selectedRegion : null),
            province: selectedProvince || null,
          }}
        />
      </div>

      {/* Geo filter */}
      <div className="flex items-center gap-4">
        <GeoFilterInline
          selectedRegion={selectedRegion}
          selectedProvince={selectedProvince}
          onSelectRegion={setSelectedRegion}
          onSelectProvince={setSelectedProvince}
        />
      </div>

      <Tabs value={viewType} onValueChange={(value) => setViewType(value as "chart" | "table")}>
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="space-y-4">
          {mounted && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(value) => value.toLocaleString("nl-BE")} />
                <Tooltip
                  formatter={(value) => typeof value === "number" ? value.toLocaleString("nl-BE") : String(value ?? "")}
                  labelFormatter={(label) => `Jaar: ${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="arbeiders"
                  stroke={CHART_SERIES_COLORS[0]}
                  strokeWidth={2}
                  name="Arbeiders"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="bedienden"
                  stroke={CHART_SERIES_COLORS[1]}
                  strokeWidth={2}
                  name="Bedienden"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="table">
          <div className="rounded-md border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left font-medium">Jaar</th>
                  <th className="p-2 text-right font-medium">Arbeiders</th>
                  <th className="p-2 text-right font-medium">Bedienden</th>
                  <th className="p-2 text-right font-medium">Totaal</th>
                  <th className="p-2 text-right font-medium">% Arbeiders</th>
                  <th className="p-2 text-right font-medium">% Bedienden</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.year} className="border-b last:border-0">
                    <td className="p-2">{row.year}</td>
                    <td className="p-2 text-right">{row.arbeiders.toLocaleString("nl-BE")}</td>
                    <td className="p-2 text-right">{row.bedienden.toLocaleString("nl-BE")}</td>
                    <td className="p-2 text-right font-medium">{row.total.toLocaleString("nl-BE")}</td>
                    <td className="p-2 text-right">{row.pct_arbeiders.toFixed(1)}%</td>
                    <td className="p-2 text-right">{row.pct_bedienden.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Section 2: Gender breakdown
 */
function Section2({
  detailed,
  byProvince,
}: {
  detailed: TimeSeriesDetailed[]
  byProvince: TimeSeriesByProvince[]
}) {
  const [mounted, setMounted] = useState(false)
  const [viewType, setViewType] = useState<"chart" | "table">("chart")

  const {
    selectedRegion,
    setSelectedRegion,
    selectedProvince,
    setSelectedProvince,
  } = useGeo()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Map province names to province codes
  const provinceNameToCode: Record<string, ProvinceCode> = useMemo(() => {
    const mapping: Record<string, ProvinceCode> = {}
    PROVINCES.forEach((p) => {
      mapping[p.name] = p.code
      // Handle Brussels special case
      if (p.name === "Brussel") {
        mapping["Brussels Hoofdst. Gew."] = p.code
      }
    })
    return mapping
  }, [])

  // Filter time series data based on geo selection
  const filteredData = useMemo(() => {
    const provinceData = byProvince

    let filtered: TimeSeriesDetailed[] = []

    // Apply geo filters to get relevant provinces
    let relevantProvinces: string[] = []

    if (selectedProvince) {
      // Find province name from code
      const provinceName = Object.entries(provinceNameToCode).find(
        ([_, code]) => code === selectedProvince
      )?.[0]
      if (provinceName) {
        relevantProvinces = [provinceName]
      }
    } else if (selectedRegion !== '1000') {
      // Get all provinces in the selected region
      const provincesInRegion = PROVINCES
        .filter(p => p.regionCode === selectedRegion)
        .map(p => p.name)

      relevantProvinces = provincesInRegion
    }

    if (relevantProvinces.length > 0) {
      // Aggregate province totals per year/type, then scale gender split once per year/type
      const provinceTotals = new Map<string, number>()
      provinceData
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

      // Convert back to TimeSeriesDetailed format
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
  }, [selectedProvince, selectedRegion, provinceNameToCode])

  // Prepare chart data from filtered data
  const data = useMemo(() => prepareDetailedData(
    filteredData.length > 0 ? filteredData : detailed
  ), [filteredData])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Verdeling naar geslacht</h2>
        <ExportButtons
          data={data.map((d) => ({
            label: String(d.year),
            value: d.total,
            periodCells: [
              d.arbeiders_mannen,
              d.arbeiders_vrouwen,
              d.bedienden_mannen,
              d.bedienden_vrouwen,
              d.total,
            ]
          }))}
          title="Verdeling naar geslacht"
          slug="arbeiders-bedienden"
          sectionId="evolution-by-gender"
          viewType={viewType}
          periodHeaders={["Jaar", "Arbeiders (M)", "Arbeiders (V)", "Bedienden (M)", "Bedienden (V)", "Totaal"]}
          embedParams={{
            region: selectedProvince ? null : (selectedRegion !== '1000' ? selectedRegion : null),
            province: selectedProvince || null,
          }}
        />
      </div>

      {/* Geo filter */}
      <div className="flex items-center gap-4">
        <GeoFilterInline
          selectedRegion={selectedRegion}
          selectedProvince={selectedProvince}
          onSelectRegion={setSelectedRegion}
          onSelectProvince={setSelectedProvince}
        />
      </div>

      <Tabs value={viewType} onValueChange={(value) => setViewType(value as "chart" | "table")}>
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="space-y-4">
          {mounted && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(value) => value.toLocaleString("nl-BE")} />
                <Tooltip
                  formatter={(value) => typeof value === "number" ? value.toLocaleString("nl-BE") : String(value ?? "")}
                  labelFormatter={(label) => `Jaar: ${label}`}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="arbeiders_mannen"
                  stroke={CHART_SERIES_COLORS[0]}
                  strokeWidth={2}
                  name="Arbeiders (mannen)"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="arbeiders_vrouwen"
                  stroke={CHART_SERIES_COLORS[1]}
                  strokeWidth={2}
                  name="Arbeiders (vrouwen)"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="bedienden_mannen"
                  stroke={CHART_SERIES_COLORS[2]}
                  strokeWidth={2}
                  name="Bedienden (mannen)"
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="bedienden_vrouwen"
                  stroke={CHART_SERIES_COLORS[3]}
                  strokeWidth={2}
                  name="Bedienden (vrouwen)"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </TabsContent>

        <TabsContent value="table">
          <div className="rounded-md border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left font-medium">Jaar</th>
                  <th className="p-2 text-right font-medium">Arbeiders (M)</th>
                  <th className="p-2 text-right font-medium">Arbeiders (V)</th>
                  <th className="p-2 text-right font-medium">Bedienden (M)</th>
                  <th className="p-2 text-right font-medium">Bedienden (V)</th>
                  <th className="p-2 text-right font-medium">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.year} className="border-b last:border-0">
                    <td className="p-2">{row.year}</td>
                    <td className="p-2 text-right">{row.arbeiders_mannen.toLocaleString("nl-BE")}</td>
                    <td className="p-2 text-right">{row.arbeiders_vrouwen.toLocaleString("nl-BE")}</td>
                    <td className="p-2 text-right">{row.bedienden_mannen.toLocaleString("nl-BE")}</td>
                    <td className="p-2 text-right">{row.bedienden_vrouwen.toLocaleString("nl-BE")}</td>
                    <td className="p-2 text-right font-medium">{row.total.toLocaleString("nl-BE")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/**
 * Prepare data for multi-series chart showing arbeiders vs bedienden
 */
function prepareMultiSeriesData(data: TimeSeriesByType[]) {
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
