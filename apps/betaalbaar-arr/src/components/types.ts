/**
 * Type definitions for the Betaalbaar wonen per arrondissement analysis.
 */

/**
 * Municipality-level data with building stock, permits, and household projections.
 */
export interface MunicipalityData {
  // Geographic identifiers
  CD_REFNIS: string // Municipality code (NIS)
  CD_SUP_REFNIS: string // Arrondissement code
  TX_REFNIS_NL: string // Municipality name in Dutch

  // Building stock (2025)
  Huizen_totaal_2025: number | null // Total houses
  Appartementen_2025: number | null // Apartments

  // Building permits (36-month rolling periods)
  Woningen_Nieuwbouw_2019sep_2022aug: number | null // New housing 2019-2022
  Woningen_Nieuwbouw_2022sep_2025aug: number | null // New housing 2022-2025
  Woningen_Nieuwbouw_pct_verschil_36m: number | null // % difference new housing
  Gebouwen_Renovatie_2019sep_2022aug: number | null // Renovations 2019-2022
  Gebouwen_Renovatie_2022sep_2025aug: number | null // Renovations 2022-2025
  Gebouwen_Renovatie_pct_verschil_36m: number | null // % difference renovations

  // Household projections (2025 baseline)
  hh_1_2025: number | null // 1-person households 2025
  hh_2_2025: number | null // 2-person households 2025
  hh_3_2025: number | null // 3-person households 2025
  "hh_4+_2025": number | null // 4+ person households 2025

  // Household growth projections (2025-2040)
  hh_1_pct_toename: number | null // % increase 1-person households
  hh_2_pct_toename: number | null // % increase 2-person households
  hh_3_pct_toename: number | null // % increase 3-person households
  "hh_4+_pct_toename": number | null // % increase 4+ person households
  hh_1_abs_toename: number | null // Absolute increase 1-person households
  hh_2_abs_toename: number | null // Absolute increase 2-person households
  hh_3_abs_toename: number | null // Absolute increase 3-person households
  "hh_4+_abs_toename": number | null // Absolute increase 4+ person households

  // Data availability flags
  HH_available: boolean // Household data available (Flanders only)
}

/**
 * Arrondissement-level aggregated data.
 */
export interface ArrondissementData {
  // Geographic identifiers
  CD_ARR: string // Arrondissement code
  TX_ARR_NL: string // Arrondissement name in Dutch

  // Building stock aggregates (2025)
  Huizen_totaal_2025: number | null // Total houses
  Appartementen_2025: number | null // Apartments
  Flats_ratio: number | null // Apartments ratio (%)

  // Building permits aggregates (36-month rolling)
  Woningen_Nieuwbouw_2019sep_2022aug: number | null // New housing 2019-2022
  Woningen_Nieuwbouw_2022sep_2025aug: number | null // New housing 2022-2025
  Woningen_Nieuwbouw_pct_verschil_36m: number | null // % difference new housing
  Gebouwen_Renovatie_2019sep_2022aug: number | null // Renovations 2019-2022
  Gebouwen_Renovatie_2022sep_2025aug: number | null // Renovations 2022-2025
  Gebouwen_Renovatie_pct_verschil_36m: number | null // % difference renovations

  // Household projections aggregates
  hh_1_2025: number | null // Total 1-person households 2025
  hh_2_2025: number | null // Total 2-person households 2025
  hh_3_2025: number | null // Total 3-person households 2025
  "hh_4+_2025": number | null // Total 4+ person households 2025

  // Weighted average household growth (2025-2040)
  hh_1_pct_toename: number | null // Weighted avg % increase 1-person
  hh_2_pct_toename: number | null // Weighted avg % increase 2-person
  hh_3_pct_toename: number | null // Weighted avg % increase 3-person
  "hh_4+_pct_toename": number | null // Weighted avg % increase 4+ person

  // Absolute household growth aggregates
  hh_1_abs_toename: number | null // Total absolute increase 1-person
  hh_2_abs_toename: number | null // Total absolute increase 2-person
  hh_3_abs_toename: number | null // Total absolute increase 3-person
  "hh_4+_abs_toename": number | null // Total absolute increase 4+ person
  Totaal_hh_toename: number | null // Total household increase (all sizes)
}

/**
 * Summary metrics for dashboard header.
 */
export interface SummaryMetrics {
  totalHuizen: number
  totalAppartementen: number
  nieuwbouwRecent: number
  renovatieRecent: number
  completenessHuizen: number // Percentage (0-100)
  completenessAppartementen: number
  completenessNieuwbouw: number
  completenessRenovatie: number
}

/**
 * Quartile statistics for household growth distribution.
 */
export interface QuartileData {
  size: string // "1", "2", "3", "4+"
  min: number
  q1: number
  median: number
  q3: number
  max: number
  mean: number
}

/**
 * Scatter plot data point with computed metrics.
 */
export interface ScatterDataPoint {
  municipality: string
  x: number
  y: number
  size: number // Bubble size (typically total houses)
  color?: string
}

/**
 * Trendline coefficients for scatter plots (OLS regression).
 */
export interface TrendlineCoefficients {
  slope: number
  intercept: number
  rSquared: number
}

/**
 * Table column configuration for DataTable component.
 */
export interface TableColumn {
  key: string
  header: string
  format?: "number" | "percentage" | "text"
  align?: "left" | "right" | "center"
  sortable?: boolean
}
