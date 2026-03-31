"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { scaleQuantile } from "d3-scale"
import { geoBounds } from "d3-geo"
import { Loader2, TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "../../lib/utils"
import { getSharedAssetPath } from "../../lib/path-utils"
import { isFlemishMunicipality } from "../../lib/geo-utils"
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

type ColorScheme = keyof typeof MAP_COLOR_SCHEMES

interface MunicipalityMapProps<TData extends UnknownRecord = UnknownRecord> {
  /** Data array containing geographic values across periods */
  data: TData[]

  /** Accessor for municipality NIS code */
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

  /** Selected municipality */
  selectedMunicipality?: string | null

  /** Callback when municipality is selected */
  onSelectMunicipality?: (code: string | null) => void

  /** Format function for values */
  formatValue?: (value: number) => string

  /** Label for tooltips */
  tooltipLabel?: string

  /** Map height in pixels */
  height?: number

  /** Color scheme */
  colorScheme?: ColorScheme

  /** Show province boundaries as overlay */
  showProvinceBoundaries?: boolean

  /** Optional override for municipalities GeoJSON (pass imported JSON for historical geometries) */
  municipalitiesGeoOverride?: any

  /** Optional override for provinces GeoJSON (pass imported JSON) */
  provincesGeoOverride?: any

  /** Optional callback to get clear name for a geography code */
  getGeoName?: (code: string) => string | null

  /** Optional class name */
  className?: string
}

// GeoJSON URLs
const MUNICIPALITIES_GEO_URL = getSharedAssetPath("/maps/belgium_municipalities.json")
const PROVINCES_GEO_URL = getSharedAssetPath("/maps/belgium_provinces.json")

/**
 * Notes:
 * - If a dataset contains only Flemish municipalities, the component will
 *   display a Flanders-focused viewport and hide municipalities from other
 *   regions (visualized as transparent / no stroke). This keeps the map
 *   readable for Flanders-only data.
 * - For datasets with pre-fusion NIS codes (historical data), normalize or
 *   aggregate codes before passing data to the map. Use
 *   `normalizeNisCode` / `aggregateByNormalizedNis` from
 *   `src/lib/nis-fusion-utils.ts`. See `analyses/gemeentelijke-investeringen`
 *   for a canonical example.
 */

// Default formatters
const defaultFormatValue = (n: number) =>
  new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)

export function MunicipalityMap<TData extends UnknownRecord = UnknownRecord>({
  data,
  getGeoCode,
  getValue,
  getPeriod,
  periods = [],
  initialPeriod,
  showTimeSlider = false,
  selectedMunicipality = null,
  onSelectMunicipality,
  formatValue = defaultFormatValue,
  tooltipLabel = "Waarde",
  height = 450,
  colorScheme = "blue",
  showProvinceBoundaries = false,
  municipalitiesGeoOverride,
  provincesGeoOverride,
  getGeoName,
  className,
}: MunicipalityMapProps<TData>) {
  // GeoJSON state
  const [municipalitiesGeo, setMunicipalitiesGeo] = useState<any>(null)
  const [provincesGeo, setProvincesGeo] = useState<any>(null)
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

  // Load municipality GeoJSON (supports optional override)
  useEffect(() => {
    // If an override GeoJSON object is provided, use it directly (useful for historical geometries)
    if ((MunicipalityMap as any).displayName && false) {
      // placeholder so replacement context is unique
    }

    if ((MunicipalityMap as any) && (/* noop to satisfy TS */ true)) {}

    if ((MunicipalityMap as any) && false) {}

    if ((municipalitiesGeoOverride as any) != null) {
      setMunicipalitiesGeo(municipalitiesGeoOverride)
      setLoading(false)
      return
    }

    setLoading(true)
    fetch(MUNICIPALITIES_GEO_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch municipality map data")
        return res.json()
      })
      .then((data) => {
        setMunicipalitiesGeo(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Failed to load municipality map data", err)
        setLoading(false)
      })
  }, [municipalitiesGeoOverride])

  // Load province GeoJSON if needed (supports optional override)
  useEffect(() => {
    if (!showProvinceBoundaries && !provincesGeoOverride) {
      setProvincesGeo(null)
      return
    }

    if (provincesGeoOverride) {
      setProvincesGeo(provincesGeoOverride)
      return
    }

    fetch(PROVINCES_GEO_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch province map data")
        return res.json()
      })
      .then((data) => {
        setProvincesGeo(data)
      })
      .catch((err) => {
        console.error("Failed to load province map data", err)
        setProvincesGeo(null)
      })
  }, [showProvinceBoundaries, provincesGeoOverride])

  // Accessors with defaults
  const geoCodeGetter = useCallback(
    (d: TData) => {
      if (getGeoCode) return getGeoCode(d)
      return (d as any)?.m ?? (d as any)?.municipalityCode
    },
    [getGeoCode]
  )

  const valueGetter = useCallback(
    (d: TData) => {
      if (getValue) return getValue(d)
      return (d as any)?.value ?? (d as any)?.n
    },
    [getValue]
  )

  const periodGetter = useCallback(
    (d: TData) => {
      if (getPeriod) return getPeriod(d)
      return (d as any)?.y ?? (d as any)?.period
    },
    [getPeriod]
  )

  // Get previous period for trend calculation
  const previousPeriod = useMemo(() => {
    if (!periods.length || !currentPeriod) return null
    const idx = periods.indexOf(currentPeriod)
    if (idx <= 0) return null
    return periods[idx - 1]
  }, [periods, currentPeriod])

  // Current period data
  const currentPeriodData = useMemo(() => {
    if (!currentPeriod) return data
    return data.filter((d) => periodGetter(d) === currentPeriod)
  }, [data, currentPeriod, periodGetter])

  // Previous period data for trend
  const previousPeriodData = useMemo(() => {
    if (!previousPeriod) return []
    return data.filter((d) => periodGetter(d) === previousPeriod)
  }, [data, previousPeriod, periodGetter])

  // Value maps
  const valueByGeoCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of currentPeriodData) {
      const code = geoCodeGetter(row)
      if (code === null || code === undefined) continue
      const v = valueGetter(row)
      if (typeof v !== "number" || !Number.isFinite(v)) continue
      m.set(String(code), v)
    }
    return m
  }, [currentPeriodData, geoCodeGetter, valueGetter])

  const previousValueByGeoCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of previousPeriodData) {
      const code = geoCodeGetter(row)
      if (code === null || code === undefined) continue
      const v = valueGetter(row)
      if (typeof v !== "number" || !Number.isFinite(v)) continue
      m.set(String(code), v)
    }
    return m
  }, [previousPeriodData, geoCodeGetter, valueGetter])

  // Detect if data is Flanders-only (no Walloon or Brussels municipalities)
  const isFlandersOnly = useMemo(() => {
    const codes = Array.from(valueByGeoCode.keys())
    if (codes.length === 0) return false

    // Check if any municipality is not Flemish
    const hasNonFlemish = codes.some((code) => !isFlemishMunicipality(code))
    return !hasNonFlemish
  }, [valueByGeoCode])

  // Adjust map projection based on data scope
  const projectionConfig = useMemo(() => {
    if (isFlandersOnly) {
      // Flanders-focused viewport
      return {
        center: [4.5, 51.0] as [number, number],
        scale: 17000,
      }
    }
    // Full Belgium viewport
    return {
      center: [4.4, 50.5] as [number, number],
      scale: 12000,
    }
  }, [isFlandersOnly])

  // Color scale
  const colorScale = useMemo(() => {
    const values = Array.from(valueByGeoCode.values()).filter(
      (v) => Number.isFinite(v) && v > 0
    )
    if (!values.length) return null
    return scaleQuantile<string>().domain(values).range(MAP_COLOR_SCHEMES[colorScheme])
  }, [valueByGeoCode, colorScheme])

  // Filter provinces if needed
  const filteredProvincesGeo = useMemo(() => {
    if (!provincesGeo) return null
    if (!isFlandersOnly) return provincesGeo

    // Flemish province codes: Antwerpen (10000), Vl-Brabant (20001), W-Vl (30000), O-Vl (40000), Limburg (70000)
    const flemishProvinceCodes = ['10000', '20001', '30000', '40000', '70000']

    // Use shallow clone for better performance
    return {
      ...provincesGeo,
      features: provincesGeo.features.filter((f: any) =>
        flemishProvinceCodes.includes(String(f.properties?.code))
      )
    }
  }, [provincesGeo, isFlandersOnly])

  // Update center when projection config changes (when data scope is detected)
  useEffect(() => {
    if (!selectedMunicipality && zoom === 1) {
      setCenter(projectionConfig.center)
    }
  }, [projectionConfig.center, selectedMunicipality, zoom])

  // Auto-zoom to selected municipality
  useEffect(() => {
    if (!selectedMunicipality || !municipalitiesGeo?.features) {
      setZoom(1)
      setCenter(projectionConfig.center)
      return
    }

    const feature = municipalitiesGeo.features.find(
      (f: any) => String(f.properties?.code) === String(selectedMunicipality)
    )

    if (!feature) {
      setZoom(1)
      setCenter(projectionConfig.center)
      return
    }

    const bounds = geoBounds(feature)
    const [[x0, y0], [x1, y1]] = bounds
    const newCenter: [number, number] = [(x0 + x1) / 2, (y0 + y1) / 2]

    const defaultWidth = 3.9
    const defaultHeight = 2.0
    const width = Math.abs(x1 - x0) || 0.1
    const height = Math.abs(y1 - y0) || 0.1

    const zoomX = (defaultWidth / width) * 0.8
    const zoomY = (defaultHeight / height) * 0.8
    const newZoom = Math.min(zoomX, zoomY, 8)

    setCenter(newCenter)
    setZoom(newZoom)
  }, [selectedMunicipality, municipalitiesGeo, projectionConfig.center])

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.5, 8))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / 1.5, 0.5))
  }, [])

  const handleReset = useCallback(() => {
    setZoom(1)
    setCenter(projectionConfig.center)
  }, [projectionConfig.center])

  // Clean municipality name (remove French/extra info)
  const cleanMunicipalityName = useCallback((rawCode: string, rawName: string) => {
    if (getGeoName) {
      const customName = getGeoName(rawCode)
      if (customName) return customName
    }

    if (!rawName) return rawCode

    let cleanName = rawName

    // 1. Handle bilingual names with "/"
    if (cleanName.includes("/")) {
      const parts = cleanName.split("/").map((s) => s.trim())
      // For Flemish municipalities (which is our main focus), the first part is Dutch
      // For others, we also stick to the first part for consistency or best effort
      cleanName = parts[0]
    }

    // 2. Remove anything in parentheses (arrondissement, French aliases, etc.)
    if (cleanName.includes("(")) {
      cleanName = cleanName.split("(")[0].trim()
    }

    return cleanName
  }, [getGeoName])

  // Tooltip handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent, geoCode: string, name: string) => {
      const rect = (e.currentTarget as HTMLElement)
        .closest(".municipality-map-container")
        ?.getBoundingClientRect()
      if (!rect) return

      const value = valueByGeoCode.get(geoCode) ?? null
      const prevValue = previousValueByGeoCode.get(geoCode) ?? null
      const changePercent =
        value !== null && prevValue !== null && prevValue > 0
          ? ((value - prevValue) / prevValue) * 100
          : null

      setTooltip({
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 10,
        name: cleanMunicipalityName(geoCode, name),
        value,
        formattedValue: value !== null ? formatValue(value) : "Geen data",
        previousValue: prevValue,
        changePercent,
        period: String(currentPeriod),
      })
    },
    [valueByGeoCode, previousValueByGeoCode, currentPeriod, formatValue, cleanMunicipalityName]
  )

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }))
  }, [])

  // Period slider data
  const periodItems = useMemo(
    () => periods.map((p) => ({ value: p, label: String(p) })),
    [periods]
  )

  const municipalityStrokeColor = "#475569"
  const municipalityStrokeWidth = 0.35 / zoom
  const provinceStrokeColor = "rgba(71, 85, 105, 0.28)"
  const provinceStrokeWidth = 0.75 / zoom

  // Loading state
  if (loading) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ height }}
      >
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  // Error state
  if (!municipalitiesGeo) {
    return (
      <div
        className={cn(
          "flex items-center justify-center text-sm text-muted-foreground",
          className
        )}
        style={{ height }}
      >
        Kaartdata kon niet geladen worden.
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className="municipality-map-container relative w-full rounded-lg border bg-card/50 overflow-hidden"
        style={{ height }}
      >
        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="absolute z-20 pointer-events-none px-3 py-2 bg-popover text-popover-foreground border rounded-lg shadow-lg"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="font-medium text-sm">{tooltip.name}</div>
            {showTimeSlider && tooltip.period && (
              <div className="text-xs text-muted-foreground">{tooltip.period}</div>
            )}
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-lg font-bold">{tooltip.formattedValue}</span>
              {tooltip.changePercent !== null && (
                <span
                  className={cn(
                    "text-xs flex items-center gap-0.5",
                    tooltip.changePercent >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {tooltip.changePercent >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {tooltip.changePercent >= 0 ? "+" : ""}
                  {tooltip.changePercent.toFixed(1)}%
                </span>
              )}
            </div>
            {tooltipLabel && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {tooltipLabel}
              </div>
            )}
          </div>
        )}

        {/* Zoom Controls */}
        <MapControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleReset}
          zoom={zoom}
          className="absolute top-3 right-3 z-10"
        />

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 bg-background/80 backdrop-blur-sm rounded-lg p-2 border">
          <MapLegend
            scale={colorScale}
            formatValue={formatValue}
            label={tooltipLabel}
          />
          <NoDataIndicator className="mt-2" />
        </div>

        {/* Map */}
        <ComposableMap
          projection="geoMercator"
          projectionConfig={projectionConfig}
          className="w-full h-full"
        >
          <ZoomableGroup
            center={center}
            zoom={zoom}
            minZoom={0.5}
            maxZoom={8}
            onMoveEnd={({ coordinates, zoom: newZoom }) => {
              setCenter(coordinates as [number, number])
              setZoom(newZoom)
            }}
          >
            {/* Municipality layer (colored by data) */}
            <Geographies geography={municipalitiesGeo}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const rawCode = String(geo.properties?.code ?? "")
                  const value = valueByGeoCode.get(rawCode)
                  const isActive = selectedMunicipality && String(selectedMunicipality) === rawCode

                  // If data is Flanders-only and this is not a Flemish municipality, hide it
                  const shouldHide = isFlandersOnly && !isFlemishMunicipality(rawCode)

                  // Choose fill color
                  let fill: string
                  if (shouldHide) {
                    fill = "transparent"
                  } else if (value === undefined || !colorScale) {
                    fill = "#f5f5f5"
                  } else {
                    fill = colorScale(value) ?? "#f5f5f5"
                  }

                  const rawName = geo.properties?.LAU_NAME ?? rawCode
                  const name = cleanMunicipalityName(rawCode, rawName)

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => !shouldHide && onSelectMunicipality?.(rawCode)}
                      onMouseMove={(e) => !shouldHide && handleMouseMove(e, rawCode, name)}
                      onMouseLeave={handleMouseLeave}
                      style={{
                        default: {
                          fill,
                          stroke: shouldHide ? "transparent" : municipalityStrokeColor,
                          strokeWidth: shouldHide ? 0 : municipalityStrokeWidth,
                          outline: "none",
                          cursor: shouldHide ? "default" : (onSelectMunicipality ? "pointer" : "default"),
                          transition: "fill 300ms ease-in-out",
                          vectorEffect: "non-scaling-stroke",
                        },
                        hover: {
                          fill: shouldHide ? "transparent" : (value === undefined || !colorScale ? "#e5e7eb" : fill),
                          stroke: shouldHide ? "transparent" : municipalityStrokeColor,
                          strokeWidth: shouldHide ? 0 : municipalityStrokeWidth,
                          outline: "none",
                          opacity: shouldHide || value === undefined ? 1 : 0.9,
                          vectorEffect: "non-scaling-stroke",
                        },
                        pressed: {
                          fill,
                          stroke: shouldHide ? "transparent" : municipalityStrokeColor,
                          strokeWidth: shouldHide ? 0 : municipalityStrokeWidth,
                          outline: "none",
                          vectorEffect: "non-scaling-stroke",
                        },
                      }}
                      className={cn(isActive ? "drop-shadow-md" : "")}
                      aria-label={name}
                    />
                  )
                })
              }
            </Geographies>

            {/* Province boundary overlay (optional) */}
            {showProvinceBoundaries && filteredProvincesGeo && (
              <Geographies geography={filteredProvincesGeo}>
                {({ geographies }) =>
                  geographies.map((geo) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      style={{
                        default: {
                          fill: "none",
                          stroke: provinceStrokeColor,
                          strokeWidth: provinceStrokeWidth,
                          outline: "none",
                          pointerEvents: "none",
                          vectorEffect: "non-scaling-stroke",
                        },
                        hover: {
                          fill: "none",
                          stroke: provinceStrokeColor,
                          strokeWidth: provinceStrokeWidth,
                          outline: "none",
                          pointerEvents: "none",
                          vectorEffect: "non-scaling-stroke",
                        },
                        pressed: {
                          fill: "none",
                          stroke: provinceStrokeColor,
                          strokeWidth: provinceStrokeWidth,
                          outline: "none",
                          pointerEvents: "none",
                          vectorEffect: "non-scaling-stroke",
                        },
                      }}
                      aria-hidden="true"
                    />
                  ))
                }
              </Geographies>
            )}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Time Slider */}
      {showTimeSlider && periods.length > 1 && (
        <TimeSlider
          periods={periodItems}
          currentPeriod={currentPeriod}
          onPeriodChange={setCurrentPeriod}
          isPlaying={isPlaying}
          onPlayPause={() => setIsPlaying((p) => !p)}
        />
      )}
    </div>
  )
}
