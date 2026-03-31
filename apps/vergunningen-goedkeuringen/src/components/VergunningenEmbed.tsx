"use client"

import React, { useEffect, useState } from "react"
import { EmbeddableSection } from "@embuild/shared/components/shared/EmbeddableSection"
import { getDataPath } from "@embuild/shared/lib/path-utils"
import { normalizeNisCode } from "@embuild/shared/lib/nis-fusion-utils"
import { getAnalysisConstraints, applyDataConstraints } from "@embuild/shared/lib/embed-data-constraints"

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

type TimeRange = "monthly" | "quarterly" | "yearly"

interface VergunningenEmbedProps {
  section: "renovatie" | "nieuwbouw-dwell" | "nieuwbouw-apt" | "nieuwbouw-house" | "nieuwbouw"
  viewType: "chart" | "table" | "map"
  timeRange?: string | null
  category?: string | null
  geoLevel?: string | null
  region?: string | null
  province?: string | null
  arrondissement?: string | null
  municipality?: string | null
  chartType?: string | null
  showMovingAverage?: boolean
  showProvinceBoundaries?: boolean
}

/**
 * VergunningenEmbed - Read-only embed component
 *
 * This component displays the vergunningen-goedkeuringen data as a snapshot of the
 * current filter state. It does NOT have interactive filter controls - instead, all
 * filters are captured in the embed URL by the ExportButtons component on the dashboard.
 *
 * The embed shows EXACTLY what the user sees on the dashboard at the moment they
 * click the export/embed button.
 */
export function VergunningenEmbed({
  section,
  viewType = "chart",
  timeRange: urlTimeRange = null,
  category: urlCategory = null,
  geoLevel: urlGeoLevel = null,
  region: urlRegion = null,
  province: urlProvince = null,
  arrondissement: urlArrondissement = null,
  municipality: urlMunicipality = null,
  chartType: urlChartType = null,
  showMovingAverage: urlShowMovingAverage = false,
  showProvinceBoundaries: urlShowProvinceBoundaries = false,
}: VergunningenEmbedProps) {
  const [data, setData] = useState<DataRow[] | null>(null)
  const [municipalities, setMunicipalities] = useState<MunicipalityData[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Determine metric based on section
  const getMetricAndLabel = (sec: string): { metric: string; label: string } => {
    switch (sec) {
      case "renovatie":
        return { metric: "ren", label: "Aantal" }
      case "nieuwbouw-dwell":
      case "nieuwbouw":
        return { metric: "dwell", label: "Aantal" }
      case "nieuwbouw-apt":
        return { metric: "apt", label: "Aantal" }
      case "nieuwbouw-house":
        return { metric: "house", label: "Aantal" }
      default:
        return { metric: "dwell", label: "Aantal" }
    }
  }

  const { metric, label } = getMetricAndLabel(section)

  // Parse timeRange from URL - default to "monthly" to match dashboard defaults
  const effectiveTimeRange: TimeRange =
    (urlTimeRange === "monthly" || urlTimeRange === "quarterly" || urlTimeRange === "yearly")
      ? urlTimeRange
      : "monthly"

  // For map view, force geoLevel to arrondissement if not a valid value
  const effectiveGeoLevel = viewType === "map" && urlGeoLevel !== "municipality" && urlGeoLevel !== "arrondissement"
    ? "arrondissement"
    : urlGeoLevel

  useEffect(() => {
    let isMounted = true
    const abortController = new AbortController()

    async function loadData() {
      try {
        // Select data file based on timeRange
        const dataFile =
          effectiveTimeRange === "monthly"
            ? "data_monthly.json"
            : "data_quarterly.json"

        const [dataResponse, municipalitiesResponse] = await Promise.all([
          fetch(getDataPath(`/data/${dataFile}`), {
            signal: abortController.signal
          }),
          fetch(getDataPath("/data/municipalities.json"), {
            signal: abortController.signal
          }),
        ])

        if (!dataResponse.ok) throw new Error(`Failed to load ${dataFile}`)
        if (!municipalitiesResponse.ok) throw new Error("Failed to load municipalities")

        const rawData: DataRow[] = await dataResponse.json()
        const municipalitiesData: MunicipalityData[] = await municipalitiesResponse.json()

        if (!isMounted) return

        // Normalize municipality codes and aggregate
        const aggregated = new Map<string, { y: number; q?: number; mo?: number; m: number; ren: number; dwell: number; apt: number; house: number }>()

        for (const row of rawData) {
          const normStr = normalizeNisCode(row.m) || String(row.m).padStart(5, "0")
          const normNum = Number(normStr)

          // Create unique key based on time period
          let key: string
          if (effectiveTimeRange === "monthly") {
            key = `${row.y}-${row.mo}|${normStr}`
          } else {
            key = `${row.y}-${row.q}|${normStr}`
          }

          const prev = aggregated.get(key)
          if (!prev) {
            const newRow: any = { y: row.y, m: normNum }
            if (effectiveTimeRange === "monthly" && row.mo) {
              newRow.mo = row.mo
            } else if (row.q) {
              newRow.q = row.q
            }
            newRow.ren = Number(row.ren) || 0
            newRow.dwell = Number(row.dwell) || 0
            newRow.apt = Number(row.apt) || 0
            newRow.house = Number(row.house) || 0
            aggregated.set(key, newRow)
          } else {
            prev.ren += Number(row.ren) || 0
            prev.dwell += Number(row.dwell) || 0
            prev.apt += Number(row.apt) || 0
            prev.house += Number(row.house) || 0
          }
        }

        let normalizedData = Array.from(aggregated.values())

        // Apply data constraints (minYear, geoAggregation, etc.)
        const constraints = getAnalysisConstraints("vergunningen-goedkeuringen")
        if (constraints) {
          normalizedData = applyDataConstraints(normalizedData, constraints)
        }

        setData(normalizedData)
        setMunicipalities(municipalitiesData)
        setError(null)
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
  }, [effectiveTimeRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!data || !municipalities) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">Geen data beschikbaar</p>
      </div>
    )
  }

  return (
    <EmbeddableSection
      slug="vergunningen-goedkeuringen"
      section={section}
      title={`Vergunningen - ${section}`}
      data={data}
      municipalities={municipalities}
      metric={metric}
      label={label}
      viewType={viewType}
      getMunicipalityCode={(d) => Number(d.m)}
      timeRange={effectiveTimeRange}
      geoLevel={effectiveGeoLevel}
      selectedRegion={urlRegion}
      selectedProvince={urlProvince}
      selectedArrondissement={urlArrondissement}
      selectedMunicipality={urlMunicipality}
      chartType={urlChartType}
      showMovingAverage={urlShowMovingAverage}
      showProvinceBoundaries={urlShowProvinceBoundaries}
      colorScheme="orangeDecile"
      colorScaleMode="positive"
    />
  )
}
