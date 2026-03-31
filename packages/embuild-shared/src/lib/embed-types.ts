/**
 * Type definitions for embed data structures
 */

/**
 * Known metric keys that can appear in embed data
 * Add new metrics here as they are introduced
 */
export type KnownMetricKey = "ren" | "dwell" | "apt" | "house"

/**
 * Standard data row structure from processed JSON files
 * Contains municipality code (m), year (y), quarter (q), and metric values
 */
export interface StandardEmbedDataRow {
  m: number // Municipality code
  y: number // Year
  q: number // Quarter
  // Runtime validation via getMetricValue() ensures type safety
  // Note: TypeScript index signature allows any string key for flexibility
  [metric: string]: number // All properties must be numbers (includes m, y, q, and metrics)
}

/**
 * Type-safe helper to check if a key is a known metric
 */
export function isKnownMetric(key: string): key is KnownMetricKey {
  return key === "ren" || key === "dwell" || key === "apt" || key === "house"
}

/**
 * Type-safe helper to extract metric value from a data row
 * @throws Error if metric key is not recognized
 */
export function getMetricValue(row: StandardEmbedDataRow, metric: string): number {
  if (!isKnownMetric(metric)) {
    throw new Error(
      `Unknown metric key: "${metric}". Expected one of: ren, dwell, apt, house. ` +
      `Add new metrics to KnownMetricKey type in embed-types.ts`
    )
  }

  const value = row[metric]
  if (typeof value !== "number") {
    throw new Error(
      `Expected number for metric "${metric}", got ${typeof value}`
    )
  }

  return value
}

/**
 * Generic display data row with label, value, and optional period information
 * Used for rendering tables and charts
 */
export interface EmbedDataRow {
  label: string
  value: number
  periodCells?: Array<string | number>
}

/**
 * Municipality data structure
 */
export interface MunicipalityData {
  code: number
  name: string
}

/**
 * Standard embed data structure loaded from JSON files
 */
export interface StandardEmbedData {
  data: EmbedDataRow[]
  municipalities: MunicipalityData[]
}

/**
 * Runtime type guard for MunicipalityData
 */
export function isMunicipalityData(value: unknown): value is MunicipalityData {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.code === "number" && typeof obj.name === "string"
}

/**
 * Runtime type guard for EmbedDataRow
 */
export function isEmbedDataRow(value: unknown): value is EmbedDataRow {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>

  if (typeof obj.label !== "string" || typeof obj.value !== "number") {
    return false
  }

  // periodCells is optional but must be an array if present
  if (obj.periodCells !== undefined) {
    if (!Array.isArray(obj.periodCells)) return false
    // Each cell should be string or number
    for (const cell of obj.periodCells) {
      if (typeof cell !== "string" && typeof cell !== "number") {
        return false
      }
    }
  }

  return true
}

/**
 * Validate an array of municipality data
 * @throws Error if validation fails
 */
export function validateMunicipalityData(data: unknown): MunicipalityData[] {
  if (!Array.isArray(data)) {
    throw new Error("Municipality data must be an array")
  }

  if (data.length === 0) {
    throw new Error("Municipality data array is empty")
  }

  for (let i = 0; i < data.length; i++) {
    if (!isMunicipalityData(data[i])) {
      throw new Error(
        `Invalid municipality data at index ${i}: expected {code: number, name: string}`
      )
    }
  }

  return data as MunicipalityData[]
}

/**
 * Validate an array of embed data rows
 * @throws Error if validation fails
 */
export function validateEmbedDataRows(data: unknown): EmbedDataRow[] {
  if (!Array.isArray(data)) {
    throw new Error("Embed data must be an array")
  }

  if (data.length === 0) {
    throw new Error("Embed data array is empty")
  }

  for (let i = 0; i < data.length; i++) {
    if (!isEmbedDataRow(data[i])) {
      const row = data[i]
      const details = typeof row === "object" && row !== null
        ? `Got: ${JSON.stringify(Object.keys(row))}`
        : `Got: ${typeof row}`
      throw new Error(
        `Invalid embed data row at index ${i}: expected {label: string, value: number, periodCells?: Array<string|number>}. ${details}`
      )
    }
  }

  return data as EmbedDataRow[]
}
