/**
 * Data transformation utilities for embed system
 *
 * Transforms raw JSON data (StandardEmbedDataRow format) into display format (EmbedDataRow)
 * for use in charts, tables, and maps.
 */

import type { StandardEmbedDataRow, EmbedDataRow, KnownMetricKey } from "./embed-types"
import { getMetricValue } from "./embed-types"

/**
 * Transform standard data rows to display format
 *
 * Converts raw data with `m`, `y`, `q`, and metric fields into a display format
 * with `label`, `value`, and `periodCells`, while keeping the original geo/time
 * fields intact so map views and aggregations can still use them.
 *
 * @param rawData - Array of StandardEmbedDataRow from JSON files
 * @param metric - The metric key to extract (e.g., "ren", "new")
 * @returns Array of EmbedDataRow for rendering
 *
 * @example
 * ```typescript
 * const rawData = [
 *   { y: 2024, q: 1, m: 11001, ren: 10, new: 5 },
 *   { y: 2024, q: 2, m: 11001, ren: 15, new: 7 },
 * ]
 * const displayData = transformToEmbedDataRows(rawData, "ren")
 * // Returns: [
 * //   { m: 11001, y: 2024, q: 1, ren: 10, new: 5, label: "2024-Q1", value: 10, periodCells: [2024, 1] },
 * //   { m: 11001, y: 2024, q: 2, ren: 15, new: 7, label: "2024-Q2", value: 15, periodCells: [2024, 2] },
 * // ]
 * ```
 */
export function transformToEmbedDataRows(
  rawData: StandardEmbedDataRow[],
  metric: KnownMetricKey
): EmbedDataRow[] {
  return rawData.map((row) => {
    // Use type-safe helper to extract metric value
    // This validates the metric key and throws helpful errors
    const value = getMetricValue(row, metric)

    return {
      // Preserve original fields for map view and period grouping
      ...(row as unknown as Record<string, unknown>),
      label: `${row.y}-Q${row.q}`,
      value,
      periodCells: [row.y, row.q],
    }
  })
}

/**
 * Validate that raw data has the expected StandardEmbedDataRow structure
 *
 * @param data - Data to validate
 * @throws Error if validation fails with detailed error message
 */
export function validateStandardEmbedDataRow(
  data: unknown
): StandardEmbedDataRow[] {
  if (!Array.isArray(data)) {
    throw new Error("Standard embed data must be an array")
  }

  if (data.length === 0) {
    throw new Error("Standard embed data array is empty")
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    if (typeof row !== "object" || row === null) {
      throw new Error(`Row at index ${i} is not an object`)
    }

    const obj = row as Record<string, unknown>

    // Validate required fields
    if (typeof obj.m !== "number") {
      throw new Error(`Row at index ${i}: field "m" (municipality code) must be a number, got ${typeof obj.m}`)
    }

    if (typeof obj.y !== "number") {
      throw new Error(`Row at index ${i}: field "y" (year) must be a number, got ${typeof obj.y}`)
    }

    if (typeof obj.q !== "number") {
      throw new Error(`Row at index ${i}: field "q" (quarter) must be a number, got ${typeof obj.q}`)
    }

    // Check that there's at least one metric field (any key other than m, y, q)
    const metricKeys = Object.keys(obj).filter(k => k !== "m" && k !== "y" && k !== "q")
    if (metricKeys.length === 0) {
      throw new Error(`Row at index ${i}: no metric fields found (expected fields like "ren", "new", etc.)`)
    }

    // Validate that all metric fields are numbers
    for (const key of metricKeys) {
      if (typeof obj[key] !== "number") {
        throw new Error(`Row at index ${i}: metric field "${key}" must be a number, got ${typeof obj[key]}`)
      }
    }
  }

  return data as StandardEmbedDataRow[]
}
