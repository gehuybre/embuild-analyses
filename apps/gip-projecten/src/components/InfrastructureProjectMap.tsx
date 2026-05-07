"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, MouseEvent, PointerEvent, WheelEvent } from "react"
import { isFlemishMunicipality } from "@embuild/shared/lib/geo-utils"
import { getDataPath } from "@embuild/shared/lib/path-utils"

type BudgetKey = "budget2025" | "budget2026" | "budget2027" | "budget_total"
type InvestmentYear = 2025 | 2026 | 2027

export type InfrastructureFeature = {
  id: string
  type: "punt" | "punten" | "lijn"
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "MultiPoint"; coordinates: Array<[number, number]> }
    | { type: "LineString"; coordinates: Array<[number, number]> }
  precision: "bronlocatie_afgeleid" | "projecttekst_afgeleid"
  geometry_method?: "locatiepunt" | "losse_punten" | "kortste_lijn_tussen_locaties" | "osm_wegreferentie"
  osm_refs?: string[]
  route_order?: "bronvolgorde" | "kortste_afstand"
  project: string
  deelproject: string
  programma: string
  subprogramma: string
  entiteit: string
  locatie: string
  municipality_codes: string[]
  municipality_names: string[]
  budget2025: number
  budget2026: number
  budget2027: number
  budget_total: number
  investment_years?: InvestmentYear[]
  start_year?: InvestmentYear | null
}

type GeoFeature = {
  type: "Feature"
  properties: Record<string, unknown>
  geometry: {
    type: "Polygon" | "MultiPolygon"
    coordinates: number[][][] | number[][][][]
  }
}

type GeoJson = {
  type: "FeatureCollection"
  features: GeoFeature[]
}

type BaseMapFeature = {
  id: string
  category: "road" | "rail" | "water"
  level: string
  name?: string
  ref?: string
  coordinates?: Array<[number, number]>
  segments?: Array<Array<[number, number]>>
}

type InfrastructureBaseMap = {
  features: BaseMapFeature[]
}

const WIDTH = 720
const HEIGHT = 560
const PADDING = 28
const ALL_PROGRAMS = "all"
const MERCATOR_ZOOM = 9
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const MIN_PROVINCE_RING_LENGTH = 0.2
const START_YEAR_COLORS: Record<InvestmentYear, string> = {
  2025: "#7c3aed",
  2026: "#16a34a",
  2027: "#d97706",
}

function flattenCoordinatePairs(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return []
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    return [[value[0], value[1]]]
  }

  return value.flatMap((item) => flattenCoordinatePairs(item))
}

function featureCoordinates(feature: InfrastructureFeature): Array<[number, number]> {
  if (feature.geometry.type === "Point") {
    return [feature.geometry.coordinates]
  }
  return feature.geometry.coordinates
}

function computeBounds(geoJson: GeoJson | null, features: InfrastructureFeature[]) {
  const geoCoordinates = geoJson
    ? geoJson.features.flatMap((feature) => flattenCoordinatePairs(feature.geometry.coordinates))
    : []
  const projectCoordinates = features.flatMap(featureCoordinates)
  const coordinates = [...geoCoordinates, ...projectCoordinates]

  if (coordinates.length === 0) {
    return { minLon: 2.45, maxLon: 6.45, minLat: 49.45, maxLat: 51.55 }
  }

  return coordinates.reduce(
    (bounds, [lon, lat]) => ({
      minLon: Math.min(bounds.minLon, lon),
      maxLon: Math.max(bounds.maxLon, lon),
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat),
    }),
    {
      minLon: Number.POSITIVE_INFINITY,
      maxLon: Number.NEGATIVE_INFINITY,
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
    }
  )
}

function lonLatToWorld([lon, lat]: [number, number], zoom = MERCATOR_ZOOM) {
  const scale = 256 * 2 ** zoom
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878)
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  }
}

function makeMercatorViewport(bounds: ReturnType<typeof computeBounds>) {
  const topLeft = lonLatToWorld([bounds.minLon, bounds.maxLat])
  const bottomRight = lonLatToWorld([bounds.maxLon, bounds.minLat])
  const spanX = Math.max(bottomRight.x - topLeft.x, 0.0001)
  const spanY = Math.max(bottomRight.y - topLeft.y, 0.0001)
  const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY)
  const drawnWidth = spanX * scale
  const drawnHeight = spanY * scale
  const offsetX = (WIDTH - drawnWidth) / 2
  const offsetY = (HEIGHT - drawnHeight) / 2

  return { topLeft, bottomRight, scale, offsetX, offsetY }
}

function makeProjector(bounds: ReturnType<typeof computeBounds>) {
  const viewport = makeMercatorViewport(bounds)

  return ([lon, lat]: [number, number]) => {
    const world = lonLatToWorld([lon, lat])
    const x = viewport.offsetX + (world.x - viewport.topLeft.x) * viewport.scale
    const y = viewport.offsetY + (world.y - viewport.topLeft.y) * viewport.scale
    return [x, y] as [number, number]
  }
}

function ringToPath(ring: Array<[number, number]>, project: (coord: [number, number]) => [number, number]) {
  if (!ring.length) return ""
  const [firstX, firstY] = project(ring[0])
  const path = ring.slice(1).map((coord) => {
    const [x, y] = project(coord)
    return `L${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M${firstX.toFixed(1)},${firstY.toFixed(1)}${path.join("")}Z`
}

function ringLength(ring: Array<[number, number]>) {
  return ring.slice(1).reduce((length, coord, index) => {
    const previous = ring[index]
    return length + Math.hypot(coord[0] - previous[0], coord[1] - previous[1])
  }, 0)
}

function provinceFeatureToPath(feature: GeoFeature, project: (coord: [number, number]) => [number, number]) {
  const polygons =
    feature.geometry.type === "MultiPolygon"
      ? (feature.geometry.coordinates as number[][][][])
      : [feature.geometry.coordinates as number[][][]]

  return polygons
    .flatMap((polygon) =>
      polygon
        .map((ring) => ring as Array<[number, number]>)
        .filter((ring) => ringLength(ring) >= MIN_PROVINCE_RING_LENGTH)
        .map((ring) => ringToPath(ring, project))
    )
    .join("")
}

function lineToPath(coordinates: Array<[number, number]>, project: (coord: [number, number]) => [number, number]) {
  if (!coordinates.length) return ""
  const [firstX, firstY] = project(coordinates[0])
  const tail = coordinates.slice(1).map((coord) => {
    const [x, y] = project(coord)
    return `L${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M${firstX.toFixed(1)},${firstY.toFixed(1)}${tail.join("")}`
}

function pointDistance(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

function pointToSegmentDistance(point: [number, number], start: [number, number], end: [number, number]) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  if (dx === 0 && dy === 0) return pointDistance(point, start)

  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)))
  return pointDistance(point, [start[0] + t * dx, start[1] + t * dy])
}

function pointToLineDistance(point: [number, number], line: Array<[number, number]>) {
  if (line.length === 0) return Number.POSITIVE_INFINITY
  if (line.length === 1) return pointDistance(point, line[0])

  return line.slice(1).reduce((distance, end, index) => {
    return Math.min(distance, pointToSegmentDistance(point, line[index], end))
  }, Number.POSITIVE_INFINITY)
}

function budgetValue(feature: InfrastructureFeature, budgetKey: BudgetKey) {
  return feature[budgetKey]
}

function startYear(feature: InfrastructureFeature): InvestmentYear | null {
  if (feature.start_year) return feature.start_year
  if (feature.budget2025 > 0) return 2025
  if (feature.budget2026 > 0) return 2026
  if (feature.budget2027 > 0) return 2027
  return null
}

function featureColor(feature: InfrastructureFeature) {
  const year = startYear(feature)
  return year ? START_YEAR_COLORS[year] : "#64748b"
}

function investmentYearLabel(feature: InfrastructureFeature) {
  const years =
    feature.investment_years?.length
      ? feature.investment_years
      : ([2025, 2026, 2027] as InvestmentYear[]).filter(
          (year) => feature[`budget${year}` as "budget2025" | "budget2026" | "budget2027"] > 0
        )
  return years.length ? years.join(", ") : "Geen positief budget"
}

function isLineFeature(
  feature: InfrastructureFeature
): feature is InfrastructureFeature & { geometry: { type: "LineString"; coordinates: Array<[number, number]> } } {
  return feature.geometry.type === "LineString"
}

function isPointLikeFeature(
  feature: InfrastructureFeature
): feature is InfrastructureFeature & {
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "MultiPoint"; coordinates: Array<[number, number]> }
} {
  return feature.geometry.type === "Point" || feature.geometry.type === "MultiPoint"
}

function pointFeatureCoordinates(
  feature: InfrastructureFeature & {
    geometry:
      | { type: "Point"; coordinates: [number, number] }
      | { type: "MultiPoint"; coordinates: Array<[number, number]> }
  }
) {
  return feature.geometry.type === "Point" ? [feature.geometry.coordinates] : feature.geometry.coordinates
}

function baseMapStyle(feature: BaseMapFeature, scale: number) {
  if (feature.category === "water") {
    return {
      stroke: "#3b82f6",
      strokeWidth: 1.7 / scale,
      opacity: 0.55,
      strokeDasharray: undefined,
    }
  }

  if (feature.category === "rail") {
    return {
      stroke: "#525252",
      strokeWidth: 1 / scale,
      opacity: 0.42,
      strokeDasharray: `${4 / scale} ${3 / scale}`,
    }
  }

  if (feature.level === "motorway" || feature.level === "trunk") {
    return {
      stroke: "#737373",
      strokeWidth: 1.45 / scale,
      opacity: 0.52,
      strokeDasharray: undefined,
    }
  }

  if (feature.level === "primary" || feature.level === "secondary") {
    return {
      stroke: "#8a8a8a",
      strokeWidth: 1.05 / scale,
      opacity: 0.44,
      strokeDasharray: undefined,
    }
  }

  return {
    stroke: "#a3a3a3",
    strokeWidth: 0.75 / scale,
    opacity: 0.32,
    strokeDasharray: undefined,
  }
}

function hasFlemishLocation(feature: InfrastructureFeature) {
  return feature.municipality_codes.some((code) => isFlemishMunicipality(code))
}

function activationKey(event: KeyboardEvent<SVGElement>) {
  return event.key === "Enter" || event.key === " "
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

type MapView = {
  scale: number
  x: number
  y: number
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

export function InfrastructureProjectMap({
  features,
  selectedProgram,
  selectedBudgetKey,
  formatBudget,
  large = false,
}: {
  features: InfrastructureFeature[]
  selectedProgram: string
  selectedBudgetKey: BudgetKey
  formatBudget: (value: number) => string
  large?: boolean
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [provinceGeoJson, setProvinceGeoJson] = useState<GeoJson | null>(null)
  const [baseMap, setBaseMap] = useState<InfrastructureBaseMap>({ features: [] })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeFeatureId, setActiveFeatureId] = useState<string | null>(null)
  const [activeFeatureIds, setActiveFeatureIds] = useState<string[]>([])
  const [selectionPinned, setSelectionPinned] = useState(false)
  const [view, setView] = useState<MapView>({ scale: 1, x: 0, y: 0 })
  const [drag, setDrag] = useState<DragState | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(getDataPath("/data/province_boundaries.json"))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((json) => {
        if (!cancelled) setProvinceGeoJson(json as GeoJson)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Kon kaart niet laden")
      })

    fetch(getDataPath("/data/infrastructure_basemap.json"))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((json) => {
        if (!cancelled) setBaseMap(json as InfrastructureBaseMap)
      })
      .catch(() => {
        if (!cancelled) setBaseMap({ features: [] })
      })

    return () => {
      cancelled = true
    }
  }, [])

  const visibleFeatures = useMemo(() => {
    return features
      .filter((feature) => selectedProgram === ALL_PROGRAMS || feature.programma === selectedProgram)
      .filter((feature) => budgetValue(feature, selectedBudgetKey) > 0)
      .filter(hasFlemishLocation)
      .sort((a, b) => budgetValue(a, selectedBudgetKey) - budgetValue(b, selectedBudgetKey))
  }, [features, selectedBudgetKey, selectedProgram])

  const topFeatures = useMemo(() => {
    return [...visibleFeatures]
      .sort((a, b) => budgetValue(b, selectedBudgetKey) - budgetValue(a, selectedBudgetKey))
      .slice(0, 8)
  }, [selectedBudgetKey, visibleFeatures])

  const activeFeatures = activeFeatureIds
    .map((id) => visibleFeatures.find((feature) => feature.id === id))
    .filter((feature): feature is InfrastructureFeature => Boolean(feature))

  const activeFeature =
    visibleFeatures.find((feature) => feature.id === activeFeatureId)
    ?? activeFeatures[0]
    ?? topFeatures[0]
    ?? null

  const bounds = useMemo(
    () => computeBounds(provinceGeoJson, visibleFeatures),
    [provinceGeoJson, visibleFeatures]
  )
  const project = useMemo(() => makeProjector(bounds), [bounds])
  const baseMapPaths = useMemo(() => {
    const groups = new Map<string, { id: string; category: BaseMapFeature["category"]; level: string; path: string }>()
    for (const feature of baseMap.features) {
      const key = `${feature.category}-${feature.level}`
      const existing = groups.get(key)
      const segments = feature.segments ?? (feature.coordinates ? [feature.coordinates] : [])
      const path = segments.map((coordinates) => lineToPath(coordinates, project)).join("")
      if (!path) continue
      if (existing) {
        existing.path += path
      } else {
        groups.set(key, {
          id: key,
          category: feature.category,
          level: feature.level,
          path,
        })
      }
    }
    return Array.from(groups.values())
  }, [baseMap.features, project])
  const maxBudget = Math.max(...visibleFeatures.map((feature) => budgetValue(feature, selectedBudgetKey)), 1)
  const transform = `matrix(${view.scale} 0 0 ${view.scale} ${view.x} ${view.y})`

  function svgPoint(event: Pick<WheelEvent<SVGSVGElement> | PointerEvent<SVGSVGElement>, "clientX" | "clientY">) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: WIDTH / 2, y: HEIGHT / 2 }
    return {
      x: ((event.clientX - rect.left) / rect.width) * WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * HEIGHT,
    }
  }

  function mapPoint(event: Pick<WheelEvent<SVGSVGElement> | PointerEvent<SVGSVGElement>, "clientX" | "clientY">) {
    const point = svgPoint(event)
    return [(point.x - view.x) / view.scale, (point.y - view.y) / view.scale] as [number, number]
  }

  function renderedPointRadius(feature: InfrastructureFeature) {
    return 3 + Math.sqrt(budgetValue(feature, selectedBudgetKey) / maxBudget) * 10
  }

  function renderedLineWidth(feature: InfrastructureFeature) {
    return 1.2 + Math.sqrt(budgetValue(feature, selectedBudgetKey) / maxBudget) * 5
  }

  function featureHitDistance(feature: InfrastructureFeature, point: [number, number]) {
    if (isPointLikeFeature(feature)) {
      return Math.min(
        ...pointFeatureCoordinates(feature).map((coordinates) => pointDistance(point, project(coordinates)))
      )
    }

    if (isLineFeature(feature)) {
      return pointToLineDistance(point, feature.geometry.coordinates.map(project))
    }

    return Number.POSITIVE_INFINITY
  }

  function featureHitThreshold(feature: InfrastructureFeature) {
    const visualSize = isLineFeature(feature)
      ? renderedLineWidth(feature) + 8
      : renderedPointRadius(feature) + 4
    return visualSize / view.scale
  }

  function selectFeatureAt(
    feature: InfrastructureFeature,
    event?: Pick<MouseEvent<SVGElement> | PointerEvent<SVGElement>, "clientX" | "clientY">
  ) {
    setSelectionPinned(true)
    if (!event) {
      setActiveFeatureId(feature.id)
      setActiveFeatureIds([feature.id])
      return
    }

    const point = mapPoint(event)
    const hits = visibleFeatures
      .filter((candidate) => featureHitDistance(candidate, point) <= featureHitThreshold(candidate))
      .sort((a, b) => {
        if (a.id === feature.id) return -1
        if (b.id === feature.id) return 1
        return budgetValue(b, selectedBudgetKey) - budgetValue(a, selectedBudgetKey)
      })

    const ids = hits.length ? hits.map((candidate) => candidate.id) : [feature.id]
    setActiveFeatureId(ids[0])
    setActiveFeatureIds(ids)
  }

  function previewFeature(feature: InfrastructureFeature) {
    if (selectionPinned) return
    setActiveFeatureId(feature.id)
    setActiveFeatureIds([feature.id])
  }

  function zoomAt(point: { x: number; y: number }, nextScale: number) {
    setView((current) => {
      const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM)
      const mapX = (point.x - current.x) / current.scale
      const mapY = (point.y - current.y) / current.scale
      return {
        scale,
        x: point.x - mapX * scale,
        y: point.y - mapY * scale,
      }
    })
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault()
    const factor = event.deltaY < 0 ? 1.18 : 0.85
    zoomAt(svgPoint(event), view.scale * factor)
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    const point = svgPoint(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originX: view.x,
      originY: view.y,
    })
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = svgPoint(event)
    setView((current) => ({
      ...current,
      x: drag.originX + point.x - drag.startX,
      y: drag.originY + point.y - drag.startY,
    }))
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (drag?.pointerId === event.pointerId) {
      setDrag(null)
    }
  }

  function zoomBy(factor: number) {
    zoomAt({ x: WIDTH / 2, y: HEIGHT / 2 }, view.scale * factor)
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">
        Kon de basiskaart niet laden: {loadError}
      </div>
    )
  }

  if (!provinceGeoJson) {
    return <div className="rounded-md border p-4 text-sm text-muted-foreground">Kaart laden...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Startjaar investering</span>
        {([2025, 2026, 2027] as InvestmentYear[]).map((year) => (
          <span key={year} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: START_YEAR_COLORS[year] }}
            />
            {year}
          </span>
        ))}
        <span className="ml-0 font-medium text-foreground sm:ml-3">Basisinfrastructuur</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-5 bg-neutral-500" />
          hoofdwegen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-px w-5 bg-blue-500" />
          waterwegen
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-px w-5 border-t border-dashed border-neutral-600"
            aria-hidden="true"
          />
          spoor/tram
        </span>
      </div>

      <div className="relative overflow-hidden rounded-md border bg-background">
        <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-md border bg-background/90 shadow-xs">
          <button
            type="button"
            onClick={() => zoomBy(1.35)}
            className="h-8 w-8 border-r text-sm font-semibold hover:bg-muted"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.35)}
            className="h-8 w-8 border-r text-sm font-semibold hover:bg-muted"
            aria-label="Zoom uit"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setView({ scale: 1, x: 0, y: 0 })}
            className="h-8 px-3 text-xs font-medium hover:bg-muted"
          >
            Reset
          </button>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="Projectkaart met GIP-projecten"
          className={`block w-full touch-none ${large ? "h-[min(76vh,860px)]" : "h-auto"} ${drag ? "cursor-grabbing" : "cursor-grab"}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={() => {
            setSelectionPinned(false)
            setActiveFeatureIds([])
          }}
        >
          <defs>
            <clipPath id="map-clip">
              <rect width={WIDTH} height={HEIGHT} />
            </clipPath>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill="#f8fafc" />
          <g clipPath="url(#map-clip)">
            <g transform={transform}>
              <g pointerEvents="none">
                {baseMapPaths.map((feature) => {
                  const style = baseMapStyle(feature, view.scale)
                  return (
                    <path
                      key={`${feature.category}-${feature.id}`}
                      d={feature.path}
                      fill="none"
                      stroke={style.stroke}
                      strokeWidth={style.strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={style.strokeDasharray}
                      opacity={style.opacity}
                    />
                  )
                })}
              </g>
              <g>
                {visibleFeatures
                  .filter(isLineFeature)
                  .map((feature) => {
                    const active = activeFeatureIds.includes(feature.id) || feature.id === activeFeature?.id
                    const width = 1.2 + Math.sqrt(budgetValue(feature, selectedBudgetKey) / maxBudget) * 5
                    return (
                      <path
                        key={feature.id}
                        d={lineToPath(feature.geometry.coordinates, project)}
                        fill="none"
                        stroke={featureColor(feature)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={(active ? width + 1.5 : width) / view.scale}
                        opacity={active ? 0.9 : 0.55}
                        className="cursor-pointer outline-none"
                        onMouseEnter={() => previewFeature(feature)}
                        onFocus={() => previewFeature(feature)}
                        onClick={(event) => {
                          event.stopPropagation()
                          selectFeatureAt(feature, event)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (!activationKey(event)) return
                          event.preventDefault()
                          selectFeatureAt(feature)
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={feature.project}
                      />
                    )
                  })}
              </g>

              <g>
                {visibleFeatures
                  .filter(isPointLikeFeature)
                  .map((feature) => {
                    const active = activeFeatureIds.includes(feature.id) || feature.id === activeFeature?.id
                    const radius = 3 + Math.sqrt(budgetValue(feature, selectedBudgetKey) / maxBudget) * 10
                    return pointFeatureCoordinates(feature).map((coordinates, index) => {
                      const [x, y] = project(coordinates)
                      return (
                        <circle
                          key={`${feature.id}-${index}`}
                          cx={x}
                          cy={y}
                          r={(active ? radius + 2 : radius) / view.scale}
                          fill={featureColor(feature)}
                          stroke="white"
                          strokeWidth={1.5 / view.scale}
                          opacity={active ? 0.95 : 0.72}
                          className="cursor-pointer outline-none"
                          onMouseEnter={() => previewFeature(feature)}
                          onFocus={() => previewFeature(feature)}
                          onClick={(event) => {
                            event.stopPropagation()
                            selectFeatureAt(feature, event)
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (!activationKey(event)) return
                            event.preventDefault()
                            selectFeatureAt(feature)
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={feature.project}
                        />
                      )
                    })
                  })}
              </g>
              <g pointerEvents="none">
                {provinceGeoJson?.features.map((feature) => (
                  <path
                    key={String(feature.properties.nuts_id ?? feature.properties.code)}
                    d={provinceFeatureToPath(feature, project)}
                    fill="none"
                    stroke="#171717"
                    strokeWidth={1.55 / view.scale}
                    opacity={0.82}
                  />
                ))}
              </g>
            </g>
          </g>
        </svg>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-md border p-4">
          {activeFeature ? (
            <div className="space-y-2">
              <h3 className="text-base font-semibold leading-snug">{activeFeature.project}</h3>
              {activeFeatures.length > 1 && (
                <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    {activeFeatures.length} overlappende projecten op deze locatie
                  </div>
                  <div className="space-y-1">
                    {activeFeatures.map((feature) => (
                      <button
                        key={feature.id}
                        type="button"
                        onClick={() => {
                          setActiveFeatureId(feature.id)
                          setSelectionPinned(true)
                        }}
                        className={`block w-full rounded px-2 py-1 text-left text-xs leading-snug hover:bg-background ${
                          feature.id === activeFeature.id ? "bg-background font-medium" : ""
                        }`}
                      >
                        {feature.project}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Beschrijving</dt>
                  <dd>{activeFeature.deelproject || activeFeature.subprogramma}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Budget</dt>
                  <dd className="font-medium tabular-nums">
                    {formatBudget(budgetValue(activeFeature, selectedBudgetKey))}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Investeringsjaren</dt>
                  <dd>{investmentYearLabel(activeFeature)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Locatie</dt>
                  <dd>{activeFeature.locatie}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Programma</dt>
                  <dd>{activeFeature.programma}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Afgeleid via</dt>
                  <dd>
                    {activeFeature.municipality_names.join(" - ")}
                    {activeFeature.osm_refs?.length ? ` (${activeFeature.osm_refs.join(", ")})` : ""}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Geen projecten voor deze selectie.</p>
          )}
        </div>

        <div className="rounded-md border p-4">
          <h3 className="mb-3 text-sm font-semibold">Grootste zichtbare features</h3>
          <div className="space-y-2">
            {topFeatures.map((feature) => (
              <button
                key={feature.id}
                type="button"
                onClick={() => {
                  setActiveFeatureId(feature.id)
                  setActiveFeatureIds([feature.id])
                  setSelectionPinned(true)
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 leading-snug">{feature.project}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatBudget(budgetValue(feature, selectedBudgetKey))}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
