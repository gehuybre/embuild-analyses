"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { FilterableChart, type ChartType } from "./FilterableChart"
import { FilterableTable } from "./FilterableTable"
import { ExportButtons } from "./ExportButtons"
import { GeoFilterInline } from "./GeoFilterInline"
import { MapSection } from "./MapSection"
import { useGeo } from "./GeoContext"
import { useEmbedFilters } from "../../lib/stores/embed-filters-store"
import { Municipality, getProvinceForMunicipality, getArrondissementForMunicipality, PROVINCES, ProvinceCode, RegionCode } from "../../lib/geo-utils"

type UnknownRecord = Record<string, any>

type PeriodTableConfig<TData> = {
  headers: string[]
  cells: (d: TData) => Array<string | number>
}

type PeriodConfig<TData> = {
  key?: (d: TData) => string
  sortValue?: (d: TData) => number
  label?: (d: TData) => string
  table?: PeriodTableConfig<TData>
}

interface AnalysisSectionProps<TData extends UnknownRecord = UnknownRecord> {
  title: string
  data: TData[]
  municipalities: Municipality[]
  metric: string
  label?: string
  /** Analysis slug for embed URLs (e.g., "vergunningen-goedkeuringen") */
  slug?: string
  /** Section ID for embed URLs (e.g., "renovatie") */
  sectionId?: string
  /** Data source description for CSV metadata */
  dataSource?: string
  /** Data source URL for CSV metadata */
  dataSourceUrl?: string
  getMunicipalityCode?: (d: TData) => number
  getMetricValue?: (d: TData, metric: string) => number
  period?: PeriodConfig<TData>
  /** Show map tab with municipality-level data (default: false) */
  showMap?: boolean
  /** Geographic level for map: municipality (581) or arrondissement (43) */
  mapGeoLevel?: "municipality" | "arrondissement"
  /** Optional template to load per-year map chunks (e.g., '/data/vergunningen-goedkeuringen/yearly/year_{year}.json') */
  mapYearlyPathTemplate?: string
  /** If mapYearlyPathTemplate is provided, supply available years */
  mapYearlyPeriods?: (number | string)[]
  /** Optional React node to render on the right side of the section header (next to GeoFilterInline) */
  rightControls?: React.ReactNode
  /** Optional node for period controls specifically (can be hidden on map view) */
  periodControls?: React.ReactNode
  /** Optional class name for the view tabs list */
  tabsListClassName?: string
  /** Chart type to render (composed, line, bar, area) */
  chartType?: ChartType
  /** Whether to show moving average overlay on chart */
  showMovingAverage?: boolean
  /** Whether to show province boundaries on map */
  showProvinceBoundaries?: boolean
  /** Color scheme for map (default: "blue") */
  mapColorScheme?: "blue" | "orange" | "orangeDecile" | "green" | "purple" | "red"
  /** Color scale mode for map (default: "positive") */
  mapColorScaleMode?: "positive" | "negative" | "all"
  /** If true, the Y-axis starts at 0. Default: false. */
  yAxisStartFromZero?: boolean
}

type AggregatedPoint = {
  label: string
  sortValue: number
  value: number
  periodCells: Array<string | number>
}

export function AnalysisSection<TData extends UnknownRecord = UnknownRecord>({
  title,
  data,
  municipalities,
  metric,
  label,
  slug,
  sectionId,
  dataSource,
  dataSourceUrl,
  getMunicipalityCode,
  getMetricValue,
  period,
  showMap = false,
  mapGeoLevel = "municipality",
  mapYearlyPathTemplate,
  mapYearlyPeriods,
  rightControls,
  periodControls,
  tabsListClassName,
  chartType = 'composed',
  showMovingAverage = true,
  showProvinceBoundaries = true,
  mapColorScheme = "blue",
  mapColorScaleMode = "positive",
  yAxisStartFromZero = false,
}: AnalysisSectionProps<TData>) {
  const {
    setLevel,
    selectedRegion,
    setSelectedRegion,
    selectedProvince,
    setSelectedProvince,
    selectedArrondissement,
    setSelectedArrondissement,
    selectedMunicipality,
    setSelectedMunicipality,
  } = useGeo()
  const storeView = useEmbedFilters((state) => state.currentView)
  const setView = useEmbedFilters((state) => state.setView)
  const setRegion = useEmbedFilters((state) => state.setRegion)
  const setProvince = useEmbedFilters((state) => state.setProvince)
  const setGeoLevel = useEmbedFilters((state) => state.setGeoLevel)
  const analysisSlug = useEmbedFilters((state) => state.analysisSlug)
  const setAnalysisContext = useEmbedFilters((state) => state.setAnalysisContext)

  const municipalityCodeGetter =
    getMunicipalityCode ?? ((d: any) => Number(d?.m))
  const metricGetter =
    getMetricValue ?? ((d: any, m: string) => Number(d?.[m] ?? 0))

  const periodKeyGetter =
    period?.key ?? ((d: any) => `${d?.y}-${d?.q}`)
  const periodSortGetter =
    period?.sortValue ?? ((d: any) => (Number(d?.y) || 0) * 10 + (Number(d?.q) || 0))
  const periodLabelGetter =
    period?.label ?? ((d: any) => `${d?.y} Q${d?.q}`)

  const periodTable =
    period?.table ??
    ({
      headers: ["Jaar", "Kwartaal"],
      cells: (d: any) => [d?.y, `Q${d?.q}`],
    } satisfies PeriodTableConfig<any>)

  useEffect(() => {
    if (slug && analysisSlug !== slug) {
      setAnalysisContext(slug)
    }
  }, [slug, analysisSlug, setAnalysisContext])

  // Aggregate data for Chart/Table
  const chartData = useMemo(() => {
    // Filter hierarchically: municipality > arrondissement > province > region
    let filtered = data

    if (selectedMunicipality) {
      // Filter by specific municipality
      filtered = data.filter((d) => municipalityCodeGetter(d) === Number(selectedMunicipality))
    } else if (selectedArrondissement) {
      // Filter by arrondissement
      filtered = data.filter((d) => {
        const munCode = municipalityCodeGetter(d)
        const arrCode = getArrondissementForMunicipality(munCode)
        return arrCode === selectedArrondissement
      })
    } else if (selectedProvince) {
      // Filter by province
      filtered = data.filter((d) => {
        const province = getProvinceForMunicipality(municipalityCodeGetter(d))
        return province ? province === selectedProvince : false
      })
    } else if (selectedRegion && selectedRegion !== '1000') {
      // Filter by region (only if not Belgium)
      filtered = data.filter((d) => {
        const munCode = municipalityCodeGetter(d)
        const province = getProvinceForMunicipality(munCode)
        if (!province) return false
        const prov = PROVINCES.find(p => p.code === province)
        return prov?.regionCode === selectedRegion
      })
    }

    const agg = new Map<string, AggregatedPoint>()
    filtered.forEach((d) => {
      const key = periodKeyGetter(d)
      const prev = agg.get(key)
      const inc = metricGetter(d, metric)
      if (!prev) {
        agg.set(key, {
          label: periodLabelGetter(d),
          sortValue: periodSortGetter(d),
          value: inc,
          periodCells: periodTable.cells(d),
        })
        return
      }
      prev.value += inc
    })

    return Array.from(agg.values()).sort((a, b) => a.sortValue - b.sortValue)
  }, [
    data,
    selectedRegion,
    selectedProvince,
    selectedArrondissement,
    selectedMunicipality,
    metric,
    municipalityCodeGetter,
    metricGetter,
    periodKeyGetter,
    periodLabelGetter,
    periodSortGetter,
    periodTable,
  ])

  const formatInt = useMemo(() => {
    return (n: number) => new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
  }, [])

  function handleSelectRegion(code: RegionCode) {
    setSelectedRegion(code)
    setSelectedProvince(null)
    setSelectedMunicipality(null)
    setLevel("region")
    setRegion(code)
    setProvince(null)
    setGeoLevel("region")
  }

  function handleSelectProvince(code: ProvinceCode | null) {
    if (code === null) {
      setSelectedProvince(null)
      setSelectedMunicipality(null)
      setProvince(null)
      setGeoLevel("region")
      return
    }
    setSelectedProvince(code)
    setSelectedMunicipality(null)
    const prov = PROVINCES.find((p) => String(p.code) === String(code))
    if (prov) {
      setSelectedRegion(prov.regionCode)
      setRegion(prov.regionCode)
    }
    setProvince(code)
    setLevel("province")
    setGeoLevel("province")
  }

  const latestPeriodLabel = useMemo(() => {
    if (!data?.length) return null
    const latest = data.reduce((prev, cur) => (periodSortGetter(cur) > periodSortGetter(prev) ? cur : prev), data[0])
    return periodLabelGetter(latest)
  }, [data, periodSortGetter, periodLabelGetter])

  // Get all unique periods for time slider
  const periods = useMemo(() => {
    const periodSet = new Set<string>()
    for (const row of data) {
      periodSet.add(periodKeyGetter(row))
    }
    return Array.from(periodSet).sort((a, b) => {
      const aSort = periodSortGetter(data.find(d => periodKeyGetter(d) === a)!)
      const bSort = periodSortGetter(data.find(d => periodKeyGetter(d) === b)!)
      return aSort - bSort
    })
  }, [data, periodKeyGetter, periodSortGetter])

  const hasLocalView = useRef(false)
  const [currentView, setCurrentView] = useState<"chart" | "table" | "map">(storeView)

  useEffect(() => {
    if (!hasLocalView.current) {
      setCurrentView(storeView)
    }
  }, [storeView])

  function handleViewChange(value: string) {
    const nextView = value as "chart" | "table" | "map"
    hasLocalView.current = true
    setCurrentView(nextView)
    setView(nextView)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{title}</h2>
        {slug && sectionId && (
          <ExportButtons
            data={chartData}
            title={title}
            slug={slug}
            sectionId={sectionId}
            viewType={currentView}
            periodHeaders={periodTable.headers}
            valueLabel={label}
            dataSource={dataSource}
            dataSourceUrl={dataSourceUrl}
          />
        )}
      </div>

      <Tabs value={currentView} onValueChange={handleViewChange}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList className={tabsListClassName}>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
            {showMap && <TabsTrigger value="map">Kaart</TabsTrigger>}
          </TabsList>
          <div className="flex items-center gap-2">
            {/** Optional right-side controls (metric selector, etc.) */}
            { rightControls && <div className="flex items-center gap-2">{rightControls}</div> }

            {currentView !== 'map' ? (
              periodControls && <div className="flex items-center gap-2">{periodControls}</div>
            ) : (
              <div className="text-sm text-muted-foreground">Kaart: alleen jaardata</div>
            )}

            <GeoFilterInline
              selectedRegion={selectedRegion}
              selectedProvince={selectedProvince}
              onSelectRegion={handleSelectRegion}
              onSelectProvince={handleSelectProvince}
              showRegions={true}
            />
          </div>
        </div>
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>Evolutie {title}</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterableChart
                data={chartData}
                yAxisLabelAbove={label ?? "Aantal"}
                chartType={chartType}
                showMovingAverage={showMovingAverage}
                yAxisStartFromZero={yAxisStartFromZero}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Data {title}</CardTitle>
            </CardHeader>
            <CardContent>
              <FilterableTable data={chartData} label={label} periodHeaders={periodTable.headers} />
            </CardContent>
          </Card>
        </TabsContent>
        {showMap && (
          <TabsContent value="map">
            <MapSection
              data={data}
              getGeoCode={municipalityCodeGetter}
              getValue={(d) => metricGetter(d, metric)}
              getPeriod={periodKeyGetter}
              periods={periods}
              showTimeSlider={periods.length > 1}
              formatValue={(v) => new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(v)}
              tooltipLabel={label}
              showProvinceBoundaries={showProvinceBoundaries}
              geoLevel={mapGeoLevel}
              colorScheme={mapColorScheme}
              colorScaleMode={mapColorScaleMode}
              height={500}
              yearlyDataPathTemplate={mapYearlyPathTemplate}
              yearlyPeriods={mapYearlyPeriods}
              showSearch={false}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
