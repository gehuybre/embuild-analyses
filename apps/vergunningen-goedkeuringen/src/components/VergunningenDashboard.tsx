"use client"

import * as React from "react"
import { Tabs, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@embuild/shared/components/ui/select"
import { AnalysisSection } from "@embuild/shared/components/shared/AnalysisSection"
import { GeoProviderWithDefaults } from "@embuild/shared/components/shared/GeoContext"
import { PeriodComparisonSection, type PeriodComparisonRow } from "@embuild/shared/components/shared/PeriodComparisonSection"
import { getDataPath } from "@embuild/shared/lib/path-utils"
import { normalizeNisCode } from "@embuild/shared/lib/nis-fusion-utils"
import { aggregateMunicipalityToArrondissement } from "@embuild/shared/lib/map-utils"
import { ARRONDISSEMENTS } from "@embuild/shared/lib/geo-utils"
import { getAnalysisConstraints, applyDataConstraints } from "@embuild/shared/lib/embed-data-constraints"
import { useEmbedFilters, useInitializeFiltersWithDefaults } from "@embuild/shared/lib/stores/embed-filters-store"

// Data is now lazy-loaded from public/data/
// Static imports replaced to reduce JavaScript bundle size by 3.8 MB

type PeriodType = "year" | "quarter" | "month"

type DataRow = {
  y: number
  q?: number
  mo?: number
  m: number | string
  ren: number
  dwell: number  // Total dwellings
  apt: number    // Apartments
  house: number  // Single houses
}

type MunicipalityData = {
  code: number
  name: string
}

type PeriodLabels = {
  period1: string
  period2: string
  period1Start: { y: number; q: number }
  period1End: { y: number; q: number }
  period2Start: { y: number; q: number }
  period2End: { y: number; q: number }
}

// Period configuration: 35 months per period
const PERIOD1_START_YEAR = 2019
const PERIOD_MONTHS = 35

/**
 * Convert year and quarter to a comparable month number (0-based)
 * E.g., 2019 Q1 = 0, 2019 Q2 = 3, 2020 Q1 = 12, etc.
 */
function yearQuarterToMonths(year: number, quarter: number = 1): number {
  return (year - PERIOD1_START_YEAR) * 12 + (quarter - 1) * 3
}

/**
 * Convert month number back to year and quarter
 */
function monthsToYearQuarter(months: number): { year: number; quarter: number } {
  const year = PERIOD1_START_YEAR + Math.floor(months / 12)
  const quarter = Math.floor((months % 12) / 3) + 1
  return { year, quarter: Math.min(quarter, 4) }
}

export function VergunningenDashboard() {
  // Initialize filters from URL with analysis-specific defaults
  useInitializeFiltersWithDefaults('vergunningen-goedkeuringen')

  const [quarterlyData, setQuarterlyData] = React.useState<DataRow[] | null>(null)
  const [monthlyData, setMonthlyData] = React.useState<DataRow[] | null>(null)
  const [yearlyData, setYearlyData] = React.useState<DataRow[] | null>(null)
  const [municipalities, setMunicipalities] = React.useState<MunicipalityData[] | null>(null)
  const [yearlyPeriods, setYearlyPeriods] = React.useState<number[] | null>(null)
  const [periodLabels, setPeriodLabels] = React.useState<PeriodLabels | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Sync filters to embed store for URL generation
  const timeRange = useEmbedFilters((state) => state.timeRange)
  const setTimeRangeStore = useEmbedFilters((state) => state.setTimeRange)
  const nieuwbouwMetric = useEmbedFilters((state) => state.selectedCategory) as 'dwell' | 'apt' | 'house' | null
  const setNieuwbouwMetricStore = useEmbedFilters((state) => state.setCategory)

  // Chart display filters
  const currentChartType = useEmbedFilters((state) => state.currentChartType)
  const setChartType = useEmbedFilters((state) => state.setChartType)
  const showMovingAverage = useEmbedFilters((state) => state.showMovingAverage)
  const toggleMovingAverage = useEmbedFilters((state) => state.toggleMovingAverage)
  const showProvinceBoundaries = useEmbedFilters((state) => state.showProvinceBoundaries)
  const toggleProvinceBoundaries = useEmbedFilters((state) => state.toggleProvinceBoundaries)

  // Convert timeRange to PeriodType for UI
  const periodType: PeriodType =
    timeRange === "monthly" ? "month" :
    timeRange === "yearly" ? "year" :
    "quarter"

  // Initialize filters if not set
  React.useEffect(() => {
    if (!timeRange) {
      setTimeRangeStore("quarterly")
    }
    if (!nieuwbouwMetric) {
      setNieuwbouwMetricStore('dwell')
    }
  }, [timeRange, nieuwbouwMetric, setTimeRangeStore, setNieuwbouwMetricStore])

  const setNieuwbouwMetric = React.useCallback((value: 'dwell' | 'apt' | 'house') => {
    setNieuwbouwMetricStore(value)
  }, [setNieuwbouwMetricStore])

  const setPeriodType = React.useCallback((value: PeriodType) => {
    setTimeRangeStore(value === "month" ? "monthly" : value === "year" ? "yearly" : "quarterly")
  }, [setTimeRangeStore])

  React.useEffect(() => {
    let isMounted = true
    const abortController = new AbortController()

    async function loadData() {
      try {
        const [dataQuarterly, dataMonthly, municipalitiesData, yearlyIndex] = await Promise.all([
          fetch(getDataPath("/data/data_quarterly.json"), { signal: abortController.signal }).then(r => r.json()),
          fetch(getDataPath("/data/data_monthly.json"), { signal: abortController.signal }).then(r => r.json()).catch(() => null),
          fetch(getDataPath("/data/municipalities.json"), { signal: abortController.signal }).then(r => r.json()),
          fetch(getDataPath("/data/yearly_index.json"), { signal: abortController.signal }).then(r => r.json()).catch(() => null),
        ])

        if (!isMounted) return

        // Normalize municipality codes and aggregate per period so the map
        // receives post-fusion, zero-padded 5-digit NIS codes (see nis-fusion-utils)
        // Aggregate counts when multiple pre-fusion codes map to the same current code
        const aggregatedQuarter = new Map<string, { y: number; q: number; m: number; ren: number; dwell: number; apt: number; house: number }>()

        for (const row of (dataQuarterly as DataRow[])) {
          const normStr = normalizeNisCode(row.m) || String(row.m).padStart(5, "0")
          const normNum = Number(normStr)
          const key = `${row.y}-${row.q}|${normStr}`
          const prev = aggregatedQuarter.get(key)
          if (!prev) {
            aggregatedQuarter.set(key, {
              y: row.y, q: row.q!, m: normNum,
              ren: Number(row.ren) || 0,
              dwell: Number(row.dwell) || 0,
              apt: Number(row.apt) || 0,
              house: Number(row.house) || 0
            })
          } else {
            prev.ren += Number(row.ren) || 0
            prev.dwell += Number(row.dwell) || 0
            prev.apt += Number(row.apt) || 0
            prev.house += Number(row.house) || 0
          }
        }

        const normalizedQuarterly = Array.from(aggregatedQuarter.values())

        // Aggregate yearly data from the normalized quarterly records
        const aggregatedYear = new Map<string, { y: number; m: number; ren: number; dwell: number; apt: number; house: number }>()
        for (const row of normalizedQuarterly) {
          const key = `${row.y}|${String(row.m).padStart(5, '0')}`
          const prev = aggregatedYear.get(key)
          if (!prev) {
            aggregatedYear.set(key, {
              y: row.y,
              m: Number(String(row.m).padStart(5, '0')),
              ren: Number(row.ren) || 0,
              dwell: Number(row.dwell) || 0,
              apt: Number(row.apt) || 0,
              house: Number(row.house) || 0
            })
          } else {
            prev.ren += Number(row.ren) || 0
            prev.dwell += Number(row.dwell) || 0
            prev.apt += Number(row.apt) || 0
            prev.house += Number(row.house) || 0
          }
        }
        const normalizedYearly = Array.from(aggregatedYear.values())

        // Monthly data, if present
        let normalizedMonthly: DataRow[] | null = null
        if (dataMonthly) {
          const aggregatedMonth = new Map<string, { y: number; mo: number; m: number; ren: number; dwell: number; apt: number; house: number }>()
          for (const row of (dataMonthly as DataRow[])) {
            const normStr = normalizeNisCode(row.m) || String(row.m).padStart(5, "0")
            const normNum = Number(normStr)
            const key = `${row.y}-${row.mo}|${normStr}`
            const prev = aggregatedMonth.get(key)
            if (!prev) {
              aggregatedMonth.set(key, {
                y: row.y, mo: row.mo!, m: normNum,
                ren: Number(row.ren) || 0,
                dwell: Number(row.dwell) || 0,
                apt: Number(row.apt) || 0,
                house: Number(row.house) || 0
              })
            } else {
              prev.ren += Number(row.ren) || 0
              prev.dwell += Number(row.dwell) || 0
              prev.apt += Number(row.apt) || 0
              prev.house += Number(row.house) || 0
            }
          }
          normalizedMonthly = Array.from(aggregatedMonth.values())
        }

        // Keep municipalities list as-is (numbers). They will be matched via numeric NIS codes.
        setQuarterlyData(normalizedQuarterly)
        setYearlyData(normalizedYearly)
        setMonthlyData(normalizedMonthly)
        setMunicipalities(municipalitiesData)

        // Calculate period labels based on actual data
        if (normalizedQuarterly.length > 0) {
          const periods = new Map<string, { y: number; q: number }>()
          for (const row of normalizedQuarterly) {
            const key = `${row.y}-${row.q}`
            if (!periods.has(key)) {
              periods.set(key, { y: row.y, q: row.q! })
            }
          }

          const sortedPeriods = Array.from(periods.values()).sort((a, b) =>
            a.y !== b.y ? a.y - b.y : a.q - b.q
          )

          // Find the max data month
          let maxYear = 0
          let maxQuarter = 0
          for (const row of normalizedQuarterly) {
            if (row.y > maxYear || (row.y === maxYear && (row.q || 0) > maxQuarter)) {
              maxYear = row.y
              maxQuarter = row.q || 1
            }
          }

          // Period 1: Fixed 35 months starting from 2019 Q1
          const period1StartMonths = 0 // 2019 Q1
          const period1EndMonths = PERIOD_MONTHS - 1 // 35 months = months 0-34

          // Period 2: Dynamic 35 months ending at the latest data month
          const maxDataMonths = yearQuarterToMonths(maxYear, maxQuarter)
          const period2EndMonths = maxDataMonths
          const period2StartMonths = maxDataMonths - PERIOD_MONTHS + 1

          const p1StartMonthsObj = monthsToYearQuarter(period1StartMonths)
          const p1EndMonthsObj = monthsToYearQuarter(period1EndMonths)
          const p2StartMonthsObj = monthsToYearQuarter(period2StartMonths)
          const p2EndMonthsObj = monthsToYearQuarter(period2EndMonths)

          const p1Start = { y: p1StartMonthsObj.year, q: p1StartMonthsObj.quarter }
          const p1End = { y: p1EndMonthsObj.year, q: p1EndMonthsObj.quarter }
          const p2Start = { y: p2StartMonthsObj.year, q: p2StartMonthsObj.quarter }
          const p2End = { y: p2EndMonthsObj.year, q: p2EndMonthsObj.quarter }

          setPeriodLabels({
            period1: `${p1Start.y} Q${p1Start.q} - ${p1End.y} Q${p1End.q}`,
            period2: `${p2Start.y} Q${p2Start.q} - ${p2End.y} Q${p2End.q}`,
            period1Start: p1Start,
            period1End: p1End,
            period2Start: p2Start,
            period2End: p2End,
          })
        }

        // Prepare yearlyPeriods list (if available)
        if (yearlyIndex && Array.isArray(yearlyIndex)) {
          const yrs = yearlyIndex.map((e: any) => e.year).sort((a: number, b: number) => a - b)
          setYearlyPeriods(yrs)
        }

        setLoading(false)
      } catch (err) {
        if (!isMounted) return
        console.error("Failed to load vergunningen data:", err)
        setError(err instanceof Error ? err.message : "Failed to load data")
        setLoading(false)
      }
    }

    loadData()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [])

  // Helper to select the correct dataset based on a per-section period selection
  // Uses centralized constraints to ensure consistency with embeds
  const makeCurrentData = React.useCallback((pt: PeriodType) => {
    let filtered = pt === "month" ? monthlyData :
                   pt === "year" ? yearlyData :
                   quarterlyData

    // Apply centralized data constraints (defined in embed-data-constraints.ts)
    // This ensures the main blog and embeds show the same date range
    const constraints = getAnalysisConstraints("vergunningen-goedkeuringen")
    if ((pt === "month" || pt === "quarter") && filtered && constraints?.minYear) {
      filtered = applyDataConstraints(filtered, constraints)
    }

    return filtered ?? []
  }, [quarterlyData, monthlyData, yearlyData])

  const currentData = React.useMemo(() => makeCurrentData(periodType), [makeCurrentData, periodType])

  const makePeriodConfig = React.useCallback((pt: PeriodType) => {
    if (pt === "year") {
      return {
        key: (d: DataRow) => `${d.y}`,
        sortValue: (d: DataRow) => d.y,
        label: (d: DataRow) => `${d.y}`,
        table: {
          headers: ["Jaar"],
          cells: (d: DataRow) => [d.y],
        },
      }
    }

    if (pt === "month") {
      return {
        key: (d: DataRow) => `${d.y}-${String(d.mo).padStart(2, "0")}`,
        sortValue: (d: DataRow) => d.y * 100 + (d.mo || 0),
        label: (d: DataRow) => `${d.y}-${String(d.mo).padStart(2, "0")}`,
        table: {
          headers: ["Jaar", "Maand"],
          cells: (d: DataRow) => [d.y, String(d.mo).padStart(2, "0")],
        },
      }
    }

    // quarter (default)
    return {
      key: (d: DataRow) => `${d.y}-${d.q}`,
      sortValue: (d: DataRow) => d.y * 10 + (d.q || 0),
      label: (d: DataRow) => `${d.y} Q${d.q}`,
      table: {
        headers: ["Jaar", "Kwartaal"],
        cells: (d: DataRow) => [d.y, `Q${d.q}`],
      },
    }
  }, [])

  const periodConfig = React.useMemo(() => makePeriodConfig(periodType), [makePeriodConfig, periodType])

  // Helper function to calculate period comparison data
  const calculatePeriodComparison = React.useCallback(
    (data: DataRow[], metric: 'ren' | 'dwell' | 'apt' | 'house'): PeriodComparisonRow[] => {
      if (data.length === 0) return []

      // Find max data month
      let maxYear = 0
      let maxQuarter = 0
      for (const row of data) {
        if (row.y > maxYear || (row.y === maxYear && (row.q || 0) > maxQuarter)) {
          maxYear = row.y
          maxQuarter = row.q || 1
        }
      }

      // Period 1: Fixed 35 months starting from 2019 Q1
      const period1StartMonths = 0 // 2019 Q1
      const period1EndMonths = PERIOD_MONTHS - 1 // 35 months = months 0-34

      // Period 2: Dynamic 35 months ending at the latest data month
      const maxDataMonths = yearQuarterToMonths(maxYear, maxQuarter)
      const period2EndMonths = maxDataMonths
      const period2StartMonths = maxDataMonths - PERIOD_MONTHS + 1

      // Helper to check if a data row is in a month range
      const isInRange = (row: DataRow, startMonths: number, endMonths: number) => {
        const rowMonths = yearQuarterToMonths(row.y, row.q || 1)
        return rowMonths >= startMonths && rowMonths <= endMonths
      }

      // Filter Period 1
      const period1Data = data.filter(d => isInRange(d, period1StartMonths, period1EndMonths))

      // Filter Period 2
      const period2Data = data.filter(d => isInRange(d, period2StartMonths, period2EndMonths))

      // Aggregate to arrondissement level
      const period1Agg = aggregateMunicipalityToArrondissement(
        period1Data,
        d => d.m,
        d => Number(d[metric]) || 0
      )

      const period2Agg = aggregateMunicipalityToArrondissement(
        period2Data,
        d => d.m,
        d => Number(d[metric]) || 0
      )

      // Build lookup maps
      const period1Map = new Map(period1Agg.map(a => [a.arrondissementCode, a.value]))
      const period2Map = new Map(period2Agg.map(a => [a.arrondissementCode, a.value]))

      // Get all arrondissement codes from ARRONDISSEMENTS constant
      const allArrCodes = ARRONDISSEMENTS.map(arr => arr.code)

      // Build comparison rows
      const comparisonRows: PeriodComparisonRow[] = []
      for (const arrCode of allArrCodes) {
        const p1 = period1Map.get(arrCode) || 0
        const p2 = period2Map.get(arrCode) || 0

        // Skip arrondissements with no data in both periods
        if (p1 === 0 && p2 === 0) continue

        const verschil = p2 - p1
        const percentageChange = p1 === 0 ? (p2 > 0 ? Infinity : 0) : (verschil / p1) * 100

        const arr = ARRONDISSEMENTS.find(a => a.code === arrCode)

        comparisonRows.push({
          arrondissementCode: arrCode,
          arrondissementName: arr?.name || arrCode,
          period1: p1,
          period2: p2,
          verschil,
          percentageChange: Number.isFinite(percentageChange) ? percentageChange : 0
        })
      }

      // Sort by name
      return comparisonRows.sort((a, b) =>
        a.arrondissementName.localeCompare(b.arrondissementName, 'nl-BE')
      )
    },
    []
  )

  // Calculate period comparison data for renovatie and nieuwbouw
  const renovatieComparisonData = React.useMemo(() =>
    quarterlyData ? calculatePeriodComparison(quarterlyData, 'ren') : [],
    [quarterlyData, calculatePeriodComparison]
  )

  const nieuwbouwComparisonData = React.useMemo(() =>
    quarterlyData ? calculatePeriodComparison(quarterlyData, 'dwell') : [],
    [quarterlyData, calculatePeriodComparison]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Data laden...</p>
        </div>
      </div>
    )
  }

  // Require core datasets and municipalities for the dashboard to function
  if (error || !municipalities || !quarterlyData || !yearlyData) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <p className="text-sm text-destructive mb-2">Fout bij het laden van de data</p>
          {error && <p className="text-xs text-muted-foreground">{error}</p>}
        </div>
      </div>
    )
  }

  // Get basePath for yearly map data
  const yearlyPathTemplate = getDataPath("/data/yearly/year_{year}.json")

  return (
    <GeoProviderWithDefaults initialLevel="province" initialRegion="1000" initialProvince={null} initialMunicipality={null}>
      <div className="space-y-8">
        {/* Chart Visualization Controls */}
        <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Grafiektype:</span>
            <Select value={currentChartType} onValueChange={(v) => setChartType(v as any)}>
              <SelectTrigger className="w-40 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="composed">Gemengd (Staaf + Lijn)</SelectItem>
                <SelectItem value="bar">Staafdiagram</SelectItem>
                <SelectItem value="line">Lijndiagram</SelectItem>
                <SelectItem value="area">Vlakdiagram</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            onClick={toggleMovingAverage}
            className={`h-9 px-4 text-sm rounded-md border transition-colors ${
              showMovingAverage
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-accent'
            }`}
          >
            Voortschrijdend gemiddelde
          </button>

          <button
            type="button"
            onClick={toggleProvinceBoundaries}
            className={`h-9 px-4 text-sm rounded-md border transition-colors ${
              showProvinceBoundaries
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input hover:bg-accent'
            }`}
          >
            Provinciegrenzen
          </button>
        </div>

        <AnalysisSection
          title="Renovatie (gebouwen)"
          data={currentData}
          municipalities={municipalities}
          metric="ren"
          label="Aantal"
          slug="vergunningen-goedkeuringen"
          sectionId="renovatie"
          dataSource="Statbel - Bouwvergunningen"
          dataSourceUrl="https://statbel.fgov.be/nl/themas/bouwen-wonen/bouwvergunningen"
          showMap={true}
          mapGeoLevel="arrondissement"
          mapColorScheme="orangeDecile"
          mapColorScaleMode="positive"
          period={periodConfig}
          getMunicipalityCode={(d) => Number(d.m)}
          mapYearlyPathTemplate={yearlyPathTemplate}
          mapYearlyPeriods={yearlyPeriods ?? undefined}
          chartType={currentChartType}
          showMovingAverage={showMovingAverage}
          showProvinceBoundaries={showProvinceBoundaries}
          periodControls={
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground hidden sm:inline">Periode:</span>
              <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                <TabsList className="h-9">
                  <TabsTrigger value="year" className="text-xs px-3">Per jaar</TabsTrigger>
                  <TabsTrigger value="quarter" className="text-xs px-3">Per kwartaal</TabsTrigger>
                  {monthlyData && <TabsTrigger value="month" className="text-xs px-3">Per maand</TabsTrigger>}
                </TabsList>
              </Tabs>
            </div>
          }
        />
        {/* Nieuwbouw section */}
        <div className="space-y-4">
          <AnalysisSection
            title={`Nieuwbouw (${
              (nieuwbouwMetric || 'dwell') === 'dwell' ? 'woningen totaal' :
              (nieuwbouwMetric || 'dwell') === 'apt' ? 'appartementen' :
              'eengezinswoningen'
            })`}
            data={currentData}
            municipalities={municipalities}
            metric={(nieuwbouwMetric || 'dwell') as string}
            label="Aantal"
            slug="vergunningen-goedkeuringen"
            sectionId={`nieuwbouw-${nieuwbouwMetric || 'dwell'}`}
            dataSource="Statbel - Bouwvergunningen"
            dataSourceUrl="https://statbel.fgov.be/nl/themas/bouwen-wonen/bouwvergunningen"
            showMap={true}
            mapGeoLevel="arrondissement"
            mapColorScheme="orangeDecile"
            mapColorScaleMode="positive"
            period={periodConfig}
            getMunicipalityCode={(d) => Number(d.m)}
            mapYearlyPathTemplate={yearlyPathTemplate}
            mapYearlyPeriods={yearlyPeriods ?? undefined}
            chartType={currentChartType}
            showMovingAverage={showMovingAverage}
            showProvinceBoundaries={showProvinceBoundaries}
            tabsListClassName="flex-nowrap whitespace-nowrap"
            rightControls={
              <div className="flex items-center gap-3">
                <Select value={nieuwbouwMetric || 'dwell'} onValueChange={(v) => setNieuwbouwMetric(v as 'dwell' | 'apt' | 'house')}>
                  <SelectTrigger className="w-44 h-9 text-sm">
                    <SelectValue>{(nieuwbouwMetric || 'dwell') === 'dwell' ? 'Woningen' : (nieuwbouwMetric || 'dwell') === 'apt' ? 'Appartementen' : 'Eengezinswoningen'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dwell">Woningen</SelectItem>
                    <SelectItem value="apt">Appartementen</SelectItem>
                    <SelectItem value="house">Eengezinswoningen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
            periodControls={
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground hidden sm:inline">Periode:</span>
                <Tabs value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                  <TabsList className="h-9">
                    <TabsTrigger value="year" className="text-xs px-3">Per jaar</TabsTrigger>
                    <TabsTrigger value="quarter" className="text-xs px-3">Per kwartaal</TabsTrigger>
                    {monthlyData && <TabsTrigger value="month" className="text-xs px-3">Per maand</TabsTrigger>}
                  </TabsList>
                </Tabs>
              </div>
            }
          />
        </div>

        {/* Period Comparison Sections */}
        <div className="space-y-8 mt-12 pt-12 border-t">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold">Periode vergelijking {periodLabels ? `${periodLabels.period1Start.y}-${periodLabels.period1End.y} vs ${periodLabels.period2Start.y}-${periodLabels.period2End.y}` : 'wordt geladen...'}</h2>
            <p className="text-muted-foreground">
              {periodLabels ? (
                <>Vergelijking van twee periodes van 3 jaar: {periodLabels.period1} (Periode 1) versus {periodLabels.period2} (Periode 2)</>
              ) : (
                'Periodegegevens worden berekend...'
              )}
            </p>
          </div>

          {/* Renovatie Comparison */}
          <PeriodComparisonSection
            title={`Renovatie - vergelijking ${periodLabels ? `${periodLabels.period1Start.y}-${periodLabels.period1End.y} vs ${periodLabels.period2Start.y}-${periodLabels.period2End.y}` : 'laden...'}`}
            data={renovatieComparisonData}
            metric="ren"
            slug="vergunningen-goedkeuringen"
            sectionId="renovatie-vergelijking"
            period1Label={periodLabels?.period1 || "Periode 1"}
            period2Label={periodLabels?.period2 || "Periode 2"}
            mapColorScheme="orangeDecile"
            mapColorScaleMode="negative"
            mapNeutralFill="#ffffff"
          />

          {/* Nieuwbouw Comparison */}
          <PeriodComparisonSection
            title={`Nieuwbouw - vergelijking ${periodLabels ? `${periodLabels.period1Start.y}-${periodLabels.period1End.y} vs ${periodLabels.period2Start.y}-${periodLabels.period2End.y}` : 'laden...'}`}
            data={nieuwbouwComparisonData}
            metric="dwell"
            slug="vergunningen-goedkeuringen"
            sectionId="nieuwbouw-vergelijking"
            period1Label={periodLabels?.period1 || "Periode 1"}
            period2Label={periodLabels?.period2 || "Periode 2"}
            mapColorScheme="orangeDecile"
            mapColorScaleMode="negative"
            mapNeutralFill="#ffffff"
          />
        </div>
      </div>
    </GeoProviderWithDefaults>
  )
}
