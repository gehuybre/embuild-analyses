/**
 * Type definitions for Belgian Building Stock (Gebouwenpark) data
 * Data source: Statbel Open Data
 */

export type BuildingTypeKey =
  | "Huizen in gesloten bebouwing"
  | "Huizen in halfopen bebouwing"
  | "Huizen in open bebouwing, hoeven en kastelen"
  | "Buildings en flatgebouwen met appartementen"
  | "Handelshuizen"
  | "Alle andere gebouwen"

export interface BuildingTypeStats {
  "Huizen in gesloten bebouwing": number
  "Huizen in halfopen bebouwing": number
  "Huizen in open bebouwing, hoeven en kastelen": number
  "Buildings en flatgebouwen met appartementen": number
  "Handelshuizen": number
  "Alle andere gebouwen": number
}

export interface NationalSnapshot {
  total: number
  by_type: BuildingTypeStats
}

export interface RegionalSnapshot {
  name: string
  total: number
  by_type: BuildingTypeStats
}

export interface TimeSeriesNational {
  total_buildings: number[]
  residential_buildings: number[]
  by_type: Record<BuildingTypeKey, number[]>
}

export interface TimeSeriesRegional {
  name: string
  total_buildings: number[]
  residential_buildings: number[]
  by_type: Record<BuildingTypeKey, number[]>
}

export interface GebouwenData {
  metadata: {
    year_snapshot: number
    source: string
  }
  snapshot_2025: {
    national: NationalSnapshot
    regions: Record<string, RegionalSnapshot>
  }
  time_series: {
    years: number[]
    national: TimeSeriesNational
    regions: Record<string, TimeSeriesRegional>
  }
  available_stat_types: string[]
}
