"use client"

import { useState, useEffect, useMemo } from "react"
import { MunicipalityMap } from "./MunicipalityMap"
import { ArrondissementMap } from "./ArrondissementMap"
import { MunicipalitySearch } from "./MunicipalitySearch"
import { loadMunicipalities, aggregateMunicipalityToArrondissement } from "../../lib/map-utils"

type UnknownRecord = Record<string, unknown>

interface MapSectionProps<TData extends UnknownRecord = UnknownRecord> {
  /** Data array - MUST contain municipality-level data with NIS codes */
  data: TData[]

  /** Accessor for municipality NIS code (5-digit code) */
  getGeoCode?: (d: TData) => string | number | null | undefined

  /** Accessor for metric value */
  getValue?: (d: TData) => number | null | undefined

  /** Accessor for period (year, quarter, etc.) */
  getPeriod?: (d: TData) => number | string

  /** Available periods for time slider */
  periods?: (number | string)[]

  /** Initial period to display */
  initialPeriod?: number | string

  /** Show time slider */
  showTimeSlider?: boolean

  /**
   * Optional: path template to per-year chunk files (e.g., '/data/vergunningen-goedkeuringen/yearly/year_{year}.json')
   * When provided, MapSection will lazy-load the per-year file and use it as the data for the map.
   */
  yearlyDataPathTemplate?: string

  /** If yearlyDataPathTemplate is provided, supply the list of available years */
  yearlyPeriods?: (number | string)[]

  /** Format function for values */
  formatValue?: (value: number) => string

  /** Show municipality search/autocomplete above the map (default: true) */
  showSearch?: boolean

  /** Label for tooltips */
  tooltipLabel?: string

  /** Map height in pixels */
  height?: number

  /** Color scheme */
  colorScheme?: "blue" | "orange" | "orangeDecile" | "green" | "purple" | "red"

  /** Color scale mode */
  colorScaleMode?: "positive" | "negative" | "all"

  /** Show province boundaries as overlay */
  showProvinceBoundaries?: boolean

  /** Geographic level: municipality (581) or arrondissement (43) */
  geoLevel?: "municipality" | "arrondissement"

  /** Optional class name */
  className?: string
}

/**
 * MapSection - Simplified map component for MUNICIPALITY-LEVEL data only
 *
 * IMPORTANT: This component requires municipality-level data with NIS codes.
 * - Do NOT pass province or region data
 * - Data must have a municipality code field (5-digit NIS code)
 * - If you don't have municipality data, don't show a map
 *
 * Note on fusions & Flanders-only datasets:
 * - If your dataset uses pre-fusion NIS codes, normalize or aggregate codes
 *   (see `normalizeNisCode` / `aggregateByNormalizedNis` in
 *   `src/lib/nis-fusion-utils.ts`) so values map to current municipalities.
 * - When a dataset contains only Flemish municipalities, the map will
 *   automatically use a Flanders-focused viewport and hide non-Flemish
 *   municipalities to avoid showing irrelevant empty borders.
 *
 * Features:
 * - Municipality search/autocomplete
 * - Auto-zoom to selected municipality
 * - Province boundary overlay
 *
 * @example
 * ```tsx
 * // CORRECT: Municipality-level data
 * const municipalityData = [
 *   { m: '11001', value: 100, y: 2024 },  // Aartselaar
 *   { m: '12002', value: 200, y: 2024 },  // Antwerpen
 * ]
 *
 * <MapSection
 *   data={municipalityData}
 *   getGeoCode={(d) => d.m}
 *   getValue={(d) => d.value}
 *   showProvinceBoundaries={true}
 * />
 * ```
 */
export function MapSection<TData extends UnknownRecord = UnknownRecord>({
  data,
  getGeoCode,
  getValue,
  getPeriod,
  periods = [],
  initialPeriod,
  showTimeSlider = false,
  formatValue,
  tooltipLabel,
  height = 500,
  colorScheme = "blue",
  colorScaleMode = "positive",
  showProvinceBoundaries = true,
  geoLevel = "municipality",
  className,
  yearlyDataPathTemplate,
  yearlyPeriods,
  showSearch = true,
}: MapSectionProps<TData>) {
  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null)
  const [municipalities, setMunicipalities] = useState<Array<{ code: string; name: string }>>([])

  // If yearlyDataPathTemplate is provided, we'll fetch per-year files lazily
  // Start with empty array if using yearly mode, otherwise use provided data
  const [yearlyModeData, setYearlyModeData] = useState<TData[]>(
    yearlyDataPathTemplate && yearlyPeriods && yearlyPeriods.length > 0 ? [] : data
  )
  // Only use yearly-specific periods when explicitly provided. Avoid falling back to `periods`
  // (which may contain month/quarter keys like "1996-01") as that would incorrectly
  // substitute non-year values into yearly file path templates.
  const yearPeriods = yearlyPeriods ?? null
  // Initialize currentYear only from yearlyPeriods when in yearly mode, otherwise use initialPeriod
  const [currentYear, setCurrentYear] = useState<number | string | null>(
    yearlyDataPathTemplate && yearPeriods && yearPeriods.length > 0
      ? yearPeriods[yearPeriods.length - 1]
      : initialPeriod ?? (periods?.[0] ?? null)
  )
  const currentYearIndex = useMemo(() => {
    if (!yearPeriods || yearPeriods.length === 0) return 0
    const idx = yearPeriods.findIndex((y) => String(y) === String(currentYear))
    return idx >= 0 ? idx : Math.max(0, yearPeriods.length - 1)
  }, [yearPeriods, currentYear])

  // Load municipality list for search
  useEffect(() => {
    loadMunicipalities().then((data) => {
      setMunicipalities(data)
    })
  }, [])

  // Filter available municipalities based on data availability (uses currently active data)
  const activeData = yearlyDataPathTemplate ? yearlyModeData : data

  // Aggregate municipality data to arrondissement level if needed
  const displayData = useMemo(() => {
    if (geoLevel === "arrondissement" && getGeoCode && getValue) {
      return aggregateMunicipalityToArrondissement(
        activeData,
        (d) => Number(getGeoCode(d)),
        (d) => getValue(d) ?? 0
      ) as any[] // Type assertion for arrondissement aggregated data
    }
    return activeData
  }, [geoLevel, activeData, getGeoCode, getValue])

  const availableMunicipalities = useMemo(() => {
    if (!getGeoCode) return municipalities

    // Get all municipality codes that have data
    const codes = activeData.map((d) => String(getGeoCode(d) ?? ""))

    // Validate format: we expect 5-digit NIS codes
    const invalidCodes = codes.filter((c) => c !== "" && c.length !== 5)
    if (invalidCodes.length > 0) {
      // Warn the developer during runtime that data does not use 5-digit NIS codes
      // eslint-disable-next-line no-console
      console.warn(
        `[MapSection] Detected ${invalidCodes.length} municipality codes that are not 5 digits (examples: ${invalidCodes.slice(0,5).join(', ')}). Data used with MapSection must contain current 5-digit NIS municipality codes.`
      )
    }

    const codesWithData = new Set(
      codes.filter((code) => code !== "" && code.length === 5) // Must be 5-digit NIS code
    )

    // Only show municipalities that have data
    return municipalities.filter((m) => codesWithData.has(m.code))
  }, [municipalities, activeData, getGeoCode])

  // If yearly mode is enabled, render map with yearlyPeriods and lazy-loaded data
  useEffect(() => {
    if (!yearlyDataPathTemplate || !yearPeriods || yearPeriods.length === 0) return
    // Default to latest year if currentYear not set
    const initial = currentYear ?? yearPeriods[yearPeriods.length - 1]
    setCurrentYear(initial)
  }, [yearlyDataPathTemplate, yearPeriods])

  useEffect(() => {
    let isMounted = true
    async function fetchYear() {
      // Only attempt to fetch yearly chunks when we have an explicit list of yearly periods.
      if (!yearlyDataPathTemplate || !currentYear || !yearPeriods || yearPeriods.length === 0) return
      try {
        const path = yearlyDataPathTemplate.replace('{year}', String(currentYear))
        const res = await fetch(path)
        if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
        const json = await res.json()
        if (!isMounted) return
        setYearlyModeData(json as TData[])
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[MapSection] Failed to load yearly data file:', err)
      }
    }
    fetchYear()
    return () => {
      isMounted = false
    }
  }, [yearlyDataPathTemplate, currentYear, yearPeriods])

  return (
    <div className={className}>
      {/* Municipality Search (can be hidden when map is used in a header context) */}
      {showSearch !== false && (
        <div className="mb-4">
          <MunicipalitySearch
            selectedMunicipality={selectedMunicipality}
            onSelect={setSelectedMunicipality}
            municipalities={availableMunicipalities}
            placeholder="Zoek een gemeente..."
          />
        </div>
      )}

      {/* Map */}
      {/* Determine if we should use yearly mode (requires explicit yearlyPeriods) */}
      {
        (() => {
          const usingYearlyMode = Boolean(yearlyDataPathTemplate && yearPeriods && yearPeriods.length > 0)

          if (geoLevel === "arrondissement") {
            // Arrondissement map with aggregated data
            // In yearly mode: displayData only contains currentYear (no periods/time slider needed)
            // Not in yearly mode: displayData contains all periods (use getPeriod for filtering)
            return (
              <ArrondissementMap
                data={displayData}
                getGeoCode={(d: any) => d.arrondissementCode}
                getValue={(d: any) => d.value}
                getPeriod={undefined}
                periods={[]}
                initialPeriod={undefined}
                showTimeSlider={false}
                formatValue={formatValue}
                tooltipLabel={tooltipLabel}
                height={height}
                colorScheme={colorScheme}
                colorScaleMode={colorScaleMode}
                showMunicipalityBoundaries={false}
              />
            )
          }

          // Default: municipality map
          return (
            <MunicipalityMap
              data={usingYearlyMode ? yearlyModeData : data}
              getGeoCode={getGeoCode}
              getValue={getValue}
              getPeriod={usingYearlyMode ? (() => String(currentYear)) : getPeriod}
              periods={usingYearlyMode ? (yearPeriods as any) : periods}
              initialPeriod={initialPeriod}
              showTimeSlider={usingYearlyMode || showTimeSlider}
              selectedMunicipality={selectedMunicipality}
              onSelectMunicipality={setSelectedMunicipality}
              formatValue={formatValue}
              tooltipLabel={tooltipLabel}
              height={height}
              colorScheme={colorScheme}
              showProvinceBoundaries={showProvinceBoundaries}
            />
          )
        })()
      }

      {yearlyDataPathTemplate && yearPeriods && yearPeriods.length > 0 && (
        <div className="flex items-center gap-3 mt-2">
          <label className="text-sm text-muted-foreground">Jaar:</label>
          <input
            aria-label="Jaar selectie"
            type="range"
            min={0}
            max={Math.max(0, yearPeriods.length - 1)}
            step={1}
            value={currentYearIndex}
            onChange={(e) => setCurrentYear(yearPeriods[Number(e.target.value)])}
            className="w-48"
          />
          <span className="text-sm tabular-nums">{String(yearPeriods[currentYearIndex] ?? "")}</span>
        </div>
      )}
    </div>
  )
}
