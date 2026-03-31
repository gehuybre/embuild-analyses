/**
 * Centralized Analysis Defaults Registry
 *
 * This module provides a single source of truth for default filter values across all analyses.
 * It ensures consistent defaults between:
 * - Dashboard components
 * - Embed components
 * - EmbedClient (URL parameter parsing)
 *
 * Usage:
 * ```typescript
 * import { getAnalysisDefaults } from './analysis-defaults'
 *
 * const defaults = getAnalysisDefaults('faillissementen')
 * // → { timeRange: 'yearly', selectedSector: null, ... }
 * ```
 *
 * Design Principles:
 * - `null` means "All" (e.g., sector=null → "Alle sectoren")
 * - Defaults can differ per analysis (e.g., some use 'yearly', others 'monthly')
 * - Type-safe: TypeScript ensures correct keys and values
 */

import type { RegionCode, ProvinceCode, MunicipalityCode } from './geo-utils'

// ============================================================================
// Types
// ============================================================================

/**
 * Default values for analysis filters
 * Individual analyses use subsets of these
 */
export interface AnalysisDefaults {
  // ===== Time Filters =====
  timeRange?: 'yearly' | 'monthly' | 'quarterly'
  selectedYear?: number | null
  selectedQuarter?: number | null  // 1-4
  selectedMonth?: number | null    // 1-12
  startYear?: number | null
  endYear?: number | null

  // ===== Geographic Filters =====
  selectedRegion?: RegionCode | null
  selectedProvince?: ProvinceCode | null
  selectedMunicipality?: MunicipalityCode | null
  selectedArrondissement?: string | null
  selectedHighlightMunicipality?: MunicipalityCode | null
  geoLevel?: 'region' | 'province' | 'municipality' | 'arrondissement'

  // ===== Sector/Category Filters =====
  /**
   * NACE sector code
   * null = "All sectors" (show aggregated data for all sectors)
   */
  selectedSector?: string | null
  selectedCategory?: string | null
  selectedSubcategory?: string | null

  // ===== UI State =====
  currentView?: 'chart' | 'table' | 'map'
  currentChartType?: 'composed' | 'line' | 'bar' | 'area'
  showMovingAverage?: boolean
  showProvinceBoundaries?: boolean

  // ===== Analysis-Specific Filters =====
  // Faillissementen
  selectedDuration?: string | null
  selectedWorkerCount?: string | null

  // Vastgoed
  selectedPropertyType?: string | null

  // Starters-Stoppers
  stopHorizon?: 1 | 2 | 3 | 4 | 5 | null

  // Energiekaart
  selectedMeasure?: string | null

  // Gemeentelijke Investeringen
  selectedPerspective?: 'BV' | 'REK' | null
  selectedField?: string | null
  selectedReportYear?: 2014 | 2020 | 2026 | null

  // Bouwprojecten
  selectedBudgetRange?: string | null
  selectedProjectType?: string | null
  sortBy?: string | null

  // SILC
  selectedIncomeQuintile?: string | null
  selectedTenureStatus?: string | null
}

// ============================================================================
// Defaults Registry
// ============================================================================

/**
 * Registry of default values per analysis
 *
 * Guidelines:
 * - Use `null` to indicate "All" (not a specific filter value)
 * - Only include filters that the analysis actually uses
 * - Document reasoning for non-obvious defaults
 */
const ANALYSIS_DEFAULTS = {
  /**
   * Faillissementen (Bankruptcies)
   *
   * Defaults:
   * - timeRange: 'yearly' (long-term trends more meaningful than monthly fluctuations)
   * - selectedSector: 'ALL' (show all sectors by default, not just construction)
   * - selectedProvince: null (show all of Flanders)
   *
   * Note: In faillissementen, "ALL" is used instead of null for the sector filter
   * to maintain compatibility with existing UI implementation
   */
  faillissementen: {
    timeRange: 'yearly',
    selectedSector: 'ALL',        // "Alle sectoren" (special value in faillissementen)
    selectedProvince: null,       // All Flanders
    selectedDuration: null,       // All durations
    selectedWorkerCount: null,    // All company sizes
    currentView: 'chart',
    currentChartType: 'composed',
  },

  /**
   * Vergunningen en Goedkeuringen (Permits and Approvals)
   *
   * Defaults:
   * - timeRange: 'monthly' (permits are issued frequently, monthly resolution useful)
   * - selectedRegion: null (all regions)
   */
  'vergunningen-goedkeuringen': {
    timeRange: 'monthly',
    selectedRegion: null,
    currentView: 'chart',
  },

  /**
   * Gebouwenpark (Building Stock)
   *
   * Defaults:
   * - No time range (static data)
   * - selectedProvince: null (all of Belgium)
   */
  gebouwenpark: {
    selectedProvince: null,
    currentView: 'map',
  },

  /**
   * Prijsherziening (Price Revision)
   *
   * Defaults:
   * - timeRange: 'monthly' (index updates monthly)
   */
  prijsherziening: {
    timeRange: 'monthly',
    currentView: 'chart',
  },

  /**
   * Woningmarkt (Housing Market)
   *
   * Defaults:
   * - timeRange: 'yearly' (real estate trends are long-term)
   * - selectedRegion: null (all regions)
   */
  woningmarkt: {
    timeRange: 'yearly',
    selectedRegion: null,
    currentView: 'chart',
  },

  /**
   * Vastgoed Verkopen (Real Estate Sales)
   *
   * Defaults:
   * - timeRange: 'yearly' (sales are aggregated annually)
   * - selectedPropertyType: null (all property types)
   */
  'vastgoed-verkopen': {
    timeRange: 'yearly',
    selectedPropertyType: null,
    selectedProvince: null,
    currentView: 'chart',
  },

  /**
   * Starters en Stoppers (Business Starts and Stops)
   *
   * Defaults:
   * - timeRange: 'yearly' (annual business dynamics)
   * - selectedSector: null (all sectors)
   * - stopHorizon: null (all time horizons)
   */
  'starters-stoppers': {
    timeRange: 'yearly',
    selectedSector: null,
    stopHorizon: null,
    selectedProvince: null,
    currentView: 'chart',
  },

  /**
   * Huishoudensgroei (Household Growth)
   *
   * Defaults:
   * - timeRange: 'yearly' (demographic trends are annual)
   */
  huishoudensgroei: {
    timeRange: 'yearly',
    selectedMunicipality: null,
    currentView: 'chart',
  },

  /**
   * Energiekaart Premies (Energy Map Subsidies)
   *
   * Defaults:
   * - timeRange: 'yearly' (subsidies aggregated annually)
   * - selectedMeasure: 'aantal' (count of subsidies, not amounts)
   */
  'energiekaart-premies': {
    timeRange: 'yearly',
    selectedMeasure: 'aantal',
    selectedProvince: null,
    currentView: 'map',
  },

  /**
   * Vergunningen Aanvragen (Permit Applications)
   *
   * Defaults:
   * - timeRange: 'monthly' (applications are submitted continuously)
   */
  'vergunningen-aanvragen': {
    timeRange: 'monthly',
    selectedRegion: null,
    currentView: 'chart',
  },

  /**
   * Gemeentelijke Investeringen (Municipal Investments)
   *
   * Defaults:
   * - selectedPerspective: 'BV' (policy field perspective)
   * - selectedReportYear: 2026 (latest reporting standard)
   */
  'gemeentelijke-investeringen': {
    selectedPerspective: 'BV',
    selectedReportYear: 2026,
    selectedField: null,
    selectedMunicipality: null,
    currentView: 'chart',
  },

  /**
   * Bouwprojecten Gemeenten (Construction Projects Municipalities)
   *
   * Defaults:
   * - selectedBudgetRange: null (all budgets)
   * - selectedProjectType: null (all project types)
   */
  'bouwprojecten-gemeenten': {
    selectedBudgetRange: null,
    selectedProjectType: null,
    selectedMunicipality: null,
    sortBy: null,
    currentView: 'table',
  },

  /**
   * Bouwondernemers (Construction Contractors)
   *
   * Defaults:
   * - selectedProvince: null (all provinces)
   */
  bouwondernemers: {
    selectedProvince: null,
    currentView: 'chart',
  },

  /**
   * Betaalbaar ARR (Affordable Housing ARR)
   *
   * Defaults:
   * - selectedArrondissement: null (all arrondissements)
   * - selectedHighlightMunicipality: null (no municipality highlighted)
   * - currentView: 'chart' (default to chart view)
   */
  'betaalbaar-arr': {
    selectedArrondissement: null,
    selectedHighlightMunicipality: null,
    currentView: 'chart',
  },

  /**
   * SILC Energie 2023 (SILC Energy 2023)
   *
   * Defaults:
   * - selectedIncomeQuintile: null (all income groups)
   * - selectedTenureStatus: null (all tenure statuses)
   */
  'silc-energie-2023': {
    selectedIncomeQuintile: null,
    selectedTenureStatus: null,
    currentView: 'chart',
  },

  /**
   * Vastgoed Prijzen (Real Estate Prices)
   *
   * Defaults:
   * - timeRange: 'yearly' (price trends are long-term)
   * - selectedPropertyType: null (all property types)
   */
  'vastgoed-prijzen': {
    timeRange: 'yearly',
    selectedPropertyType: null,
    selectedProvince: null,
    currentView: 'chart',
  },

  /**
   * EPC Labelverdeling (EPC Label Distribution)
   *
   * Defaults:
   * - selectedCategory: null (all building types)
   * - currentView: 'chart' (default to chart view)
   */
  'epc-labelverdeling': {
    selectedCategory: null,
    currentView: 'chart',
  },

  /**
   * Inschrijvingen Onderwijs (Higher Education Enrollments)
   *
   * Defaults:
   * - timeRange: 'yearly' (dataset is annual)
   * - selectedProvince: null (Vlaanderen totaal)
   * - currentView: 'chart'
   */
  'inschrijvingen-onderwijs': {
    timeRange: 'yearly',
    selectedProvince: null,
    currentView: 'chart',
  },
} as const satisfies Record<string, AnalysisDefaults>

export type AnalysisSlug = keyof typeof ANALYSIS_DEFAULTS

// ============================================================================
// Public API
// ============================================================================

/**
 * Get default filter values for a specific analysis
 *
 * @param slug - Analysis slug (e.g., 'faillissementen', 'vergunningen-goedkeuringen')
 * @returns Default filter values for the analysis
 * @throws Error if analysis slug is not found in registry
 *
 * @example
 * ```typescript
 * const defaults = getAnalysisDefaults('faillissementen')
 * // → { timeRange: 'yearly', selectedSector: null, ... }
 * ```
 */
export function getAnalysisDefaults(slug: AnalysisSlug): AnalysisDefaults {
  const defaults = ANALYSIS_DEFAULTS[slug]

  if (!defaults) {
    throw new Error(
      `No defaults found for analysis: "${slug}". ` +
      `Available analyses: ${Object.keys(ANALYSIS_DEFAULTS).join(', ')}`
    )
  }

  return defaults
}

/**
 * Get all available analysis slugs
 *
 * @returns Array of all registered analysis slugs
 *
 * @example
 * ```typescript
 * const slugs = getAvailableAnalyses()
 * // → ['faillissementen', 'vergunningen-goedkeuringen', ...]
 * ```
 */
export function getAvailableAnalyses(): AnalysisSlug[] {
  return Object.keys(ANALYSIS_DEFAULTS) as AnalysisSlug[]
}

/**
 * Check if an analysis has registered defaults
 *
 * @param slug - Analysis slug to check
 * @returns true if defaults exist, false otherwise
 *
 * @example
 * ```typescript
 * hasAnalysisDefaults('faillissementen')  // → true
 * hasAnalysisDefaults('unknown-analysis')  // → false
 * ```
 */
export function hasAnalysisDefaults(slug: string): slug is AnalysisSlug {
  return slug in ANALYSIS_DEFAULTS
}
