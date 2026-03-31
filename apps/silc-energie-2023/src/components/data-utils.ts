/**
 * Shared data parsing utilities for SILC Energy 2023 analysis
 *
 * This module provides clean data extraction from the raw Excel-like JSON structure,
 * reducing code duplication between Dashboard and Embed components.
 */

export interface ProcessedRow {
  [key: string]: string | number | null
}

export interface ProcessedData {
  [key: string]: ProcessedRow[]
}

export interface SectionConfig {
  dataKey: string
  series: Array<{ key: string; label: string; columnIndex: number }>
}

/**
 * Configuration for each analysis section
 */
export const SECTION_CONFIGS: Record<string, SectionConfig> = {
  renovatiemaatregelen: {
    dataKey: "Isolatie verbeterd",
    series: [
      { key: "eenMaatregel", label: "Één maatregel", columnIndex: 3 },
      { key: "tweeMaatregelen", label: "Twee maatregelen", columnIndex: 1 },
      { key: "driePlusMaatregelen", label: "Drie of meer maatregelen", columnIndex: 2 },
      { key: "geenRenovatie", label: "Geen renovatie", columnIndex: 4 },
      { key: "weetNiet", label: "Weet niet", columnIndex: 5 }
    ]
  },
  isolatieverbeteringen: {
    dataKey: "Isolatie verbeterd",
    series: [
      { key: "eenMaatregel", label: "Één maatregel", columnIndex: 3 },
      { key: "tweeMaatregelen", label: "Twee maatregelen", columnIndex: 1 },
      { key: "driePlusMaatregelen", label: "Drie of meer maatregelen", columnIndex: 2 },
      { key: "geenRenovatie", label: "Geen renovatie", columnIndex: 4 },
      { key: "weetNiet", label: "Weet niet", columnIndex: 5 }
    ]
  },
  verwarmingssystemen: {
    dataKey: "Verwarmingssysteem",
    series: [
      { key: "stadsverwarming", label: "Stadsverwarming", columnIndex: 1 },
      { key: "centraleVerwarming", label: "Centrale verwarming", columnIndex: 2 },
      { key: "individueelSysteem", label: "Individueel systeem", columnIndex: 3 },
      { key: "nietVasteVerwarming", label: "Niet-vaste verwarming", columnIndex: 4 },
      { key: "geenVerwarming", label: "Geen verwarming", columnIndex: 5 },
      { key: "weetNiet", label: "Weet niet", columnIndex: 6 }
    ]
  },
  energiebronnen: {
    dataKey: "Belangrijkste energiebron",
    series: [
      { key: "aardgas", label: "Aardgas", columnIndex: 1 },
      { key: "electriciteit", label: "Elektriciteit", columnIndex: 2 },
      { key: "stookolie", label: "Stookolie", columnIndex: 3 },
      { key: "pellets", label: "Pellets", columnIndex: 4 },
      { key: "houtblokken", label: "Houtblokken", columnIndex: 5 },
      { key: "steenkool", label: "Steenkool", columnIndex: 6 },
      { key: "hernieuwbareEnergie", label: "Hernieuwbare energie", columnIndex: 7 },
      { key: "anders", label: "Anders", columnIndex: 8 },
      { key: "weetNiet", label: "Weet niet", columnIndex: 9 }
    ]
  }
}

/**
 * Filter dimension names and their categories
 */
export const FILTER_CATEGORIES = {
  Regio: ["België", "Brussels Hoofdstedelijk Gewest", "Vlaams Gewest", "Waals Gewest"],
  Leeftijd: [
    "0 - 15 jaar", "0 - 17 jaar", "16 - 24 jaar", "18 - 24 jaar",
    "25 - 49 jaar", "25 - 54 jaar", "50 - 64 jaar", "55 - 64 jaar",
    "65 jaar en ouder"
  ],
  "Activiteitenstatus (zelfgedefinieerd)": [
    "Werkenden", "Werklozen", "Gepensioneerden", "Andere inactieven"
  ],
  Inkomenskwintiel: [
    "1ste inkomenskwintiel", "2de inkomenskwintiel", "3de inkomenskwintiel",
    "4de inkomenskwintiel", "5de inkomenskwintiel"
  ]
} as const

/**
 * Extract a specific data row based on filter criteria
 *
 * @param processedData - The raw Excel-like JSON data
 * @param sectionName - Section identifier (e.g., "renovatiemaatregelen")
 * @param filterCategory - Filter dimension name (e.g., "Regio")
 * @param targetValue - Target value within that dimension (e.g., "Vlaams Gewest")
 * @returns The matching row or null if not found
 */
export function getFilteredRow(
  processedData: ProcessedData,
  sectionName: string,
  filterCategory: string,
  targetValue: string
): ProcessedRow | null {
  const config = SECTION_CONFIGS[sectionName]
  if (!config) return null

  const sectionData = processedData[config.dataKey]
  if (!sectionData) return null

  // Find the header row for this filter category
  const headerIndex = sectionData.findIndex(row => row["0"] === filterCategory)
  if (headerIndex === -1) return null

  // Find the specific category row
  for (let i = headerIndex + 1; i < sectionData.length; i++) {
    const row = sectionData[i]
    if (row["0"] === targetValue) {
      return row
    }
    // Stop when we hit the next category header or end markers
    if (row["0"] && typeof row["0"] === "string") {
      const val = row["0"] as string
      if (val.includes("Totaal") || val.includes("Statbel") ||
          val.includes("AROP") || val.includes("AROPE") ||
          Object.keys(FILTER_CATEGORIES).includes(val)) {
        break
      }
    }
  }
  return null
}

/**
 * Transform a data row into chart-friendly format
 *
 * @param row - The raw data row
 * @param config - Section configuration with series definitions
 * @returns Array of {label, value} objects for charts
 */
export function transformRowToChartData(
  row: ProcessedRow | null,
  config: SectionConfig
): Array<{ label: string; value: number }> {
  if (!row) return []

  return config.series.map(s => ({
    label: s.label,
    value: Number(row[s.columnIndex.toString()]) || 0
  }))
}

/**
 * Get all available filter values for a specific dimension
 *
 * @param processedData - The raw Excel-like JSON data
 * @param sectionName - Section identifier
 * @param filterCategory - Filter dimension name
 * @returns Array of available values for that dimension
 */
export function getFilterOptions(
  processedData: ProcessedData,
  sectionName: string,
  filterCategory: string
): readonly string[] {
  return FILTER_CATEGORIES[filterCategory as keyof typeof FILTER_CATEGORIES] || []
}

/**
 * Extract region-level data for a section (for embeds without filters)
 *
 * @param processedData - The raw Excel-like JSON data
 * @param sectionName - Section identifier
 * @returns Array of data rows for all regions
 */
export function getRegionData(
  processedData: ProcessedData,
  sectionName: string
): Array<{ region: string; data: Array<{ label: string; value: number }> }> {
  const config = SECTION_CONFIGS[sectionName]
  if (!config) return []

  const regions = FILTER_CATEGORIES.Regio
  return regions.map(region => ({
    region,
    data: transformRowToChartData(
      getFilteredRow(processedData, sectionName, "Regio", region),
      config
    )
  }))
}

/**
 * Validate imported JSON data structure
 *
 * @param data - Data to validate
 * @returns True if data structure is valid
 */
export function validateProcessedData(data: unknown): data is ProcessedData {
  if (!data || typeof data !== "object") return false

  const requiredKeys = ["Verwarmingssysteem", "Belangrijkste energiebron", "Isolatie verbeterd"]
  return requiredKeys.every(key => key in data && Array.isArray((data as any)[key]))
}
