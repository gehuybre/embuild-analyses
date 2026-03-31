"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { scaleQuantile } from "d3-scale"
import { geoBounds } from "d3-geo"
import { Loader2, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "../../lib/utils"
import { getSharedAssetPath } from "../../lib/path-utils"
import { isFlemishMunicipality, getArrondissementForMunicipality } from "../../lib/geo-utils"
import { TimeSlider } from "./TimeSlider"
import { MapLegend, NoDataIndicator } from "./MapLegend"
import { MapControls } from "./MapControls"
import { MAP_COLOR_SCHEMES } from "../../lib/chart-theme"

// Types
type UnknownRecord = Record<string, unknown>

interface TooltipState {
  visible: boolean
  x: number
  y: number
  name: string
  value: number | null
  formattedValue: string
  previousValue: number | null
  changePercent: number | null
  period: string
}

export type ColorScheme = keyof typeof MAP_COLOR_SCHEMES
export type ColorScaleMode = "positive" | "negative" | "all"

interface ArrondissementMapProps<TData extends UnknownRecord = UnknownRecord> {
  /** Data array containing geographic values across periods */
  data: TData[]

  /** Accessor for arrondissement code */
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

  /** Selected arrondissement */
  selectedArrondissement?: string | null

  /** Callback when arrondissement is selected */
  onSelectArrondissement?: (code: string | null) => void

  /** Format function for values */
  formatValue?: (value: number) => string

  /** Label for tooltips */
  tooltipLabel?: string

  /** Map height in pixels */
  height?: number

  /** Color scheme */
  colorScheme?: ColorScheme

  /** Which values drive the color scale */
  colorScaleMode?: ColorScaleMode

  /** Fill color for neutral/filtered-out values */
  neutralFill?: string

  /** Show municipality boundaries as overlay (light gray lines) */
  showMunicipalityBoundaries?: boolean

  /** Optional override for arrondissements GeoJSON */
  arrondissementsGeoOverride?: any

  /** Optional override for municipalities GeoJSON (for boundary overlay) */
  municipalitiesGeoOverride?: any

  /** Optional callback to get clear name for a geography code */
  getGeoName?: (code: string) => string | null

  /** Optional class name */
  className?: string
}

// GeoJSON URLs
const ARRONDISSEMENTS_GEO_URL = getSharedAssetPath("/maps/belgium_arrondissements.json")
const MUNICIPALITIES_GEO_URL = getSharedAssetPath("/maps/belgium_municipalities.json")

// Default formatters
const defaultFormatValue = (n: number) =>
  new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)

export function ArrondissementMap<TData extends UnknownRecord = UnknownRecord>({
  data,
  getGeoCode,
  getValue,
  getPeriod,
  periods = [],
  initialPeriod,
  showTimeSlider = false,
  selectedArrondissement = null,
  onSelectArrondissement,
  formatValue = defaultFormatValue,
  tooltipLabel = "Waarde",
  height = 450,
  colorScheme = "blue",
  colorScaleMode = "positive",
  neutralFill = "hsl(var(--muted) / 0.3)",
  showMunicipalityBoundaries = false,
  arrondissementsGeoOverride,
  municipalitiesGeoOverride,
  getGeoName,
  className,
}: ArrondissementMapProps<TData>) {
  // GeoJSON state
  const [arrondissementsGeo, setArrondissementsGeo] = useState<any>(null)
  const [municipalitiesGeo, setMunicipalitiesGeo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Zoom/pan state
  const [zoom, setZoom] = useState(1)
  const [center, setCenter] = useState<[number, number]>([4.4, 50.5])

  // Time state
  const [currentPeriod, setCurrentPeriod] = useState<number | string>(
    initialPeriod ?? periods[periods.length - 1] ?? ""
  )
  const [isPlaying, setIsPlaying] = useState(false)

  // Tooltip state
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    name: "",
    value: null,
    formattedValue: "",
    previousValue: null,
    changePercent: null,
    period: "",
  })

  // Load arrondissement GeoJSON
  useEffect(() => {
    if (arrondissementsGeoOverride) {
      setArrondissementsGeo(arrondissementsGeoOverride)
      setLoading(false)
      return
    }

    setLoading(true)
    fetch(ARRONDISSEMENTS_GEO_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch arrondissement map data")
        return res.json()
      })
      .then((data) => {
        setArrondissementsGeo(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Failed to load arrondissement map data", err)
        setLoading(false)
      })
  }, [arrondissementsGeoOverride])

  // Load municipality GeoJSON if needed for boundaries overlay
  useEffect(() => {
    if (!showMunicipalityBoundaries && !municipalitiesGeoOverride) {
      setMunicipalitiesGeo(null)
      return
    }

    if (municipalitiesGeoOverride) {
      setMunicipalitiesGeo(municipalitiesGeoOverride)
      return
    }

    fetch(MUNICIPALITIES_GEO_URL)
      .then((res) => res.json())
      .then((data) => setMunicipalitiesGeo(data))
      .catch((err) => console.error("Failed to load municipality boundaries", err))
  }, [showMunicipalityBoundaries, municipalitiesGeoOverride])

  // Detect if data is Flanders-only
  const isFlandersOnly = useMemo(() => {
    if (!getGeoCode) return false

    const codes = data
      .map(getGeoCode)
      .filter((c): c is string | number => c != null)
      .map((c) => String(c))

    if (codes.length === 0) return false

    // Check if all arrondissements are Flemish (by checking their first municipality)
    return codes.every((code) => {
      // For arrondissement code like '11000', check if first digit indicates Flanders
      const firstDigit = code.charAt(0)
      // Flanders: 1,3,4,7,2(23/24)  Wallonia: 5,6,8,9  Brussels: 21
      if (['5', '6', '8', '9'].includes(firstDigit)) return false
      if (code.startsWith('21')) return false
      if (firstDigit === '2' && !code.startsWith('23') && !code.startsWith('24')) return false
      return true
    })
  }, [data, getGeoCode])

  // Bounds calculation for Flanders-only viewport
  const mapBounds = useMemo(() => {
    if (!arrondissementsGeo || !isFlandersOnly) return null

    const flemishFeatures = arrondissementsGeo.features.filter((f: any) => {
      const code = String(f.properties?.code ?? "")
      const firstDigit = code.charAt(0)
      if (['5', '6', '8', '9'].includes(firstDigit)) return false
      if (code.startsWith('21')) return false
      if (firstDigit === '2' && !code.startsWith('23') && !code.startsWith('24')) return false
      return true
    })

    if (flemishFeatures.length === 0) return null

    try {
      const bounds = geoBounds({
        type: "FeatureCollection",
        features: flemishFeatures,
      })
      return bounds
    } catch {
      return null
    }
  }, [arrondissementsGeo, isFlandersOnly])

  // Auto-adjust center and zoom for Flanders-only
  useEffect(() => {
    if (!mapBounds) return

    const [[minLng, minLat], [maxLng, maxLat]] = mapBounds
    const centerLng = (minLng + maxLng) / 2
    const centerLat = (minLat + maxLat) / 2

    setCenter([centerLng, centerLat])
    setZoom(1.8)
  }, [mapBounds])

  // Filter data for current period
  const currentData = useMemo(() => {
    if (!getPeriod) return data
    return data.filter((d) => getPeriod(d) === currentPeriod)
  }, [data, currentPeriod, getPeriod])

  // Build value map
  const valueMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!getGeoCode || !getValue) return map

    for (const d of currentData) {
      const code = getGeoCode(d)
      const value = getValue(d)
      if (code != null && value != null) {
        map.set(String(code), value)
      }
    }
    return map
  }, [currentData, getGeoCode, getValue])

  // Build previous period value map (for change calculation)
  const previousValueMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!getPeriod || !getGeoCode || !getValue || periods.length === 0) return map

    const currentIndex = periods.indexOf(currentPeriod)
    if (currentIndex <= 0) return map

    const previousPeriod = periods[currentIndex - 1]
    const previousData = data.filter((d) => getPeriod(d) === previousPeriod)

    for (const d of previousData) {
      const code = getGeoCode(d)
      const value = getValue(d)
      if (code != null && value != null) {
        map.set(String(code), value)
      }
    }
    return map
  }, [data, currentPeriod, periods, getPeriod, getGeoCode, getValue])

  // Color scale
  const colorScale = useMemo(() => {
    const values = Array.from(valueMap.values()).filter((v) => Number.isFinite(v))
    const filteredValues =
      colorScaleMode === "negative"
        ? values.filter((v) => v < 0)
        : colorScaleMode === "all"
          ? values
          : values.filter((v) => v > 0)

    if (filteredValues.length === 0) return null

    const scheme = MAP_COLOR_SCHEMES[colorScheme]
    const range = colorScaleMode === "negative" ? [...scheme].reverse() : scheme
    return scaleQuantile<string>().domain(filteredValues).range(range)
  }, [valueMap, colorScheme, colorScaleMode])

  // Period slider data
  const periodItems = useMemo(
    () => periods.map((p) => ({ value: p, label: String(p) })),
    [periods]
  )

  // Time slider handlers
  const handlePeriodChange = useCallback((period: number | string) => {
    setCurrentPeriod(period)
    setIsPlaying(false)
  }, [])

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying || periods.length === 0) return

    const currentIndex = periods.indexOf(currentPeriod)
    if (currentIndex >= periods.length - 1) {
      setIsPlaying(false)
      return
    }

    const timer = setTimeout(() => {
      setCurrentPeriod(periods[currentIndex + 1])
    }, 1000)

    return () => clearTimeout(timer)
  }, [isPlaying, currentPeriod, periods])

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev * 1.5, 8))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev / 1.5, 1))
  }, [])

  const handleResetView = useCallback(() => {
    setZoom(1)
    setCenter([4.4, 50.5])
  }, [])

  // Geography click handler
  const handleClick = useCallback(
    (geo: any) => {
      const code = String(geo.properties?.code ?? "")
      if (!code) return

      if (onSelectArrondissement) {
        onSelectArrondissement(selectedArrondissement === code ? null : code)
      }
    },
    [selectedArrondissement, onSelectArrondissement]
  )

  // Mouse handlers
  const handleMouseEnter = useCallback(
    (geo: any, evt: any) => {
      const code = String(geo.properties?.code ?? "")
      const name = getGeoName?.(code) ?? geo.properties?.name ?? "Onbekend"
      const value = valueMap.get(code) ?? null
      const previousValue = previousValueMap.get(code) ?? null

      let changePercent: number | null = null
      if (value != null && previousValue != null && previousValue !== 0) {
        changePercent = ((value - previousValue) / previousValue) * 100
      }

      const rect = evt.currentTarget.getBoundingClientRect()
      setTooltip({
        visible: true,
        x: rect.left + rect.width / 2,
        y: rect.top,
        name,
        value,
        formattedValue: value != null ? formatValue(value) : "Geen data",
        previousValue,
        changePercent,
        period: String(currentPeriod),
      })
    },
    [valueMap, previousValueMap, currentPeriod, formatValue, getGeoName]
  )

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }, [])

  // Loading state
  if (loading || !arrondissementsGeo) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ height: `${height}px` }}
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      {/* Map */}
      <div className="relative" style={{ height: `${height}px` }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{
            center: center,
            scale: 8000 * zoom,
          }}
          width={800}
          height={height}
          className="w-full"
        >
          <ZoomableGroup center={center} zoom={zoom}>
            {/* Main arrondissement layer */}
            <Geographies geography={arrondissementsGeo}>
              {({ geographies }: any) =>
                geographies.map((geo: any) => {
                  const code = String(geo.properties?.code ?? "")
                  const value = valueMap.get(code)
                  const isSelected = selectedArrondissement === code

                  // Hide non-Flemish arrondissements if Flanders-only
                  const isFlemish =
                    code.charAt(0) !== '5' &&
                    code.charAt(0) !== '6' &&
                    code.charAt(0) !== '8' &&
                    code.charAt(0) !== '9' &&
                    !code.startsWith('21') &&
                    !(code.charAt(0) === '2' && !code.startsWith('23') && !code.startsWith('24'))

                  if (isFlandersOnly && !isFlemish) {
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="transparent"
                        stroke="transparent"
                        style={{
                          default: { outline: "none" },
                          hover: { outline: "none" },
                          pressed: { outline: "none" },
                        }}
                      />
                    )
                  }

                  const fill =
                    value != null && colorScale
                      ? (colorScaleMode === "negative" && value >= 0
                          ? neutralFill
                          : colorScale(value))
                      : neutralFill

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke={isSelected ? "hsl(var(--primary))" : "hsl(var(--border))"}
                      strokeWidth={isSelected ? 2.5 : 0.8}
                      onClick={() => handleClick(geo)}
                      onMouseEnter={(evt: any) => handleMouseEnter(geo, evt)}
                      onMouseLeave={handleMouseLeave}
                      style={{
                        default: {
                          outline: "none",
                          transition: "all 0.2s ease-in-out",
                        },
                        hover: {
                          fill: value != null ? fill : "hsl(var(--muted) / 0.5)",
                          stroke: "hsl(var(--primary))",
                          strokeWidth: 2,
                          cursor: "pointer",
                          outline: "none",
                        },
                        pressed: {
                          fill,
                          outline: "none",
                        },
                      }}
                    />
                  )
                })
              }
            </Geographies>

            {/* Optional municipality boundaries overlay */}
            {showMunicipalityBoundaries && municipalitiesGeo && (
              <Geographies geography={municipalitiesGeo}>
                {({ geographies }: any) =>
                  geographies.map((geo: any) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="transparent"
                      stroke="hsl(var(--border) / 0.2)"
                      strokeWidth={0.2}
                      style={{
                        default: { outline: "none", pointerEvents: "none" },
                        hover: { outline: "none", pointerEvents: "none" },
                        pressed: { outline: "none", pointerEvents: "none" },
                      }}
                    />
                  ))
                }
              </Geographies>
            )}
          </ZoomableGroup>
        </ComposableMap>

        {/* Map controls */}
        <MapControls
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleResetView}
          className="absolute top-3 right-3 z-10"
        />

        {/* Legend */}
        {(colorScale || valueMap.size === 0) && (
          <div className="absolute bottom-3 left-3 z-10 bg-background/80 backdrop-blur-sm rounded-lg p-2 border">
            {colorScale && (
              <MapLegend
                scale={colorScale}
                formatValue={formatValue}
                label={tooltipLabel}
              />
            )}
            {valueMap.size === 0 && (
              <NoDataIndicator className={colorScale ? "mt-2" : undefined} />
            )}
          </div>
        )}

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="pointer-events-none fixed z-50 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y - 10}px`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="font-medium">{tooltip.name}</div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>
                {tooltipLabel}: {tooltip.formattedValue}
              </span>
              {tooltip.changePercent != null && (
                <span
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    tooltip.changePercent > 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {tooltip.changePercent > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(tooltip.changePercent).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Time slider */}
      {showTimeSlider && periods.length > 0 && (
        <TimeSlider
          periods={periodItems}
          currentPeriod={currentPeriod}
          isPlaying={isPlaying}
          onPeriodChange={handlePeriodChange}
          onPlayPause={() => setIsPlaying((p) => !p)}
        />
      )}
    </div>
  )
}
