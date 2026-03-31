/**
 * Centralized data constraints for embeds and main blog
 *
 * This module defines filtering and aggregation rules that ensure
 * embeds display the same data as the main blog pages.
 *
 * Usage:
 * 1. Define constraints in ANALYSIS_DATA_CONSTRAINTS
 * 2. Apply constraints using applyDataConstraints()
 * 3. Reference constraints in embed-config.ts
 * 4. Use same constraints in dashboard components
 */

import { getArrondissementForMunicipality } from "./geo-utils"

export interface EmbedDataConstraints {
  /** Minimum year to include (inclusive) */
  minYear?: number

  /** Maximum year to include (inclusive) */
  maxYear?: number

  /** Geographic aggregation level */
  geoAggregation?: "municipality" | "arrondissement" | "province" | "region"

  /** Available years for time slider (if applicable) */
  availableYears?: number[]
}

/**
 * Helper function to generate a range of years
 */
function generateYearRange(start: number, end: number): number[] {
  const years: number[] = []
  for (let year = start; year <= end; year++) {
    years.push(year)
  }
  return years
}

const NON_METRIC_KEYS = new Set(["m", "y", "q", "mo"])

function aggregateToArrondissement<T extends { y: number }>(data: T[]): T[] {
  const aggregated = new Map<string, Record<string, unknown>>()
  let aggregatedCount = 0

  for (const row of data) {
    const rec = row as Record<string, unknown>
    const munCode = rec.m
    if (typeof munCode !== "number" && typeof munCode !== "string") {
      continue
    }

    const arrCode = getArrondissementForMunicipality(munCode)
    if (!arrCode) continue

    const year = rec.y
    if (typeof year !== "number") continue
    const quarter = rec.q
    const month = rec.mo
    const key = `${arrCode}|${year}|${typeof quarter === "number" ? quarter : ""}|${typeof month === "number" ? month : ""}`

    let target = aggregated.get(key)
    if (!target) {
      target = { m: Number(arrCode), y: year }
      if (typeof quarter === "number") target.q = quarter
      if (typeof month === "number") target.mo = month
      aggregated.set(key, target)
    }
    aggregatedCount += 1

    for (const [metricKey, value] of Object.entries(rec)) {
      if (NON_METRIC_KEYS.has(metricKey)) continue
      if (typeof value !== "number" || !Number.isFinite(value)) continue
      const existing = target[metricKey]
      target[metricKey] = typeof existing === "number" ? existing + value : value
    }
  }

  if (aggregatedCount === 0 && data.length > 0) {
    return data
  }

  return Array.from(aggregated.values()) as T[]
}

/**
 * Centralized registry of data constraints per analysis
 */
export const ANALYSIS_DATA_CONSTRAINTS: Record<string, EmbedDataConstraints> = {
  "vergunningen-goedkeuringen": {
    minYear: 2019, // Filter to 2019+ (blog applies y > 2018)
    geoAggregation: "arrondissement", // Aggregate to arrondissement level
    availableYears: generateYearRange(2019, 2025), // For time slider
  },
  // Add other analyses as needed
  // "starters-stoppers": { ... },
  // "vastgoed-verkopen": { ... },
}

/**
 * Apply data constraints to a dataset
 *
 * @param data - Array of data rows with 'y' (year) field
 * @param constraints - Constraints to apply
 * @returns Filtered data array
 */
export function applyDataConstraints<T extends { y: number }>(
  data: T[],
  constraints: EmbedDataConstraints
): T[] {
  let filtered = data

  // Apply explicit available years
  if (constraints.availableYears && constraints.availableYears.length > 0) {
    const allowedYears = new Set(constraints.availableYears)
    filtered = filtered.filter((d) => allowedYears.has(d.y))
  }

  // Apply year filtering
  if (constraints.minYear !== undefined) {
    filtered = filtered.filter((d) => d.y >= constraints.minYear!)
  }

  if (constraints.maxYear !== undefined) {
    filtered = filtered.filter((d) => d.y <= constraints.maxYear!)
  }

  if (constraints.geoAggregation === "arrondissement") {
    return aggregateToArrondissement(filtered)
  }

  return filtered
}

/**
 * Get constraints for a specific analysis
 *
 * @param slug - Analysis slug
 * @returns Constraints or undefined if not defined
 */
export function getAnalysisConstraints(
  slug: string
): EmbedDataConstraints | undefined {
  return ANALYSIS_DATA_CONSTRAINTS[slug]
}
