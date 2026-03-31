/**
 * Centralized state management for analysis filters with automatic URL synchronization
 *
 * This store manages all filter states (year, sector, province, view type, etc.) and
 * automatically syncs them to the URL query parameters. This enables:
 * - Shareable filtered views via direct links
 * - Accurate embed code generation without manual parameter passing
 * - Browser back/forward navigation through filter states
 * - Consistent state across analysis sections
 *
 * Usage:
 * ```tsx
 * import { useEmbedFilters } from '../stores/embed-filters-store'
 *
 * function MyDashboard() {
 *   const { selectedYear, setYear, loadFromUrl } = useEmbedFilters()
 *
 *   useEffect(() => {
 *     loadFromUrl()  // Load initial state from URL
 *   }, [loadFromUrl])
 *
 *   return <YearSelector value={selectedYear} onChange={setYear} />
 * }
 * ```
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { useEffect } from 'react'
import { getAnalysisDefaults, type AnalysisSlug } from '../analysis-defaults'
import type { RegionCode, ProvinceCode, MunicipalityCode } from '../geo-utils'

// ============================================================================
// Types
// ============================================================================

export type ViewType = 'chart' | 'table' | 'map'
export type TimeRange = 'monthly' | 'yearly' | 'quarterly'
export type ChartType = 'composed' | 'line' | 'bar' | 'area'

/**
 * All possible filter states across analyses
 * Individual analyses will use subsets of these
 */
export interface EmbedFiltersState {
  // ===== Time Filters =====
  selectedYear: number | null
  selectedQuarter: number | null  // 1-4
  selectedMonth: number | null    // 1-12
  timeRange: TimeRange
  startYear: number | null
  endYear: number | null

  // ===== Geographic Filters =====
  selectedRegion: RegionCode | null
  selectedProvince: ProvinceCode | null
  selectedMunicipality: MunicipalityCode | null
  selectedArrondissement: string | null
  selectedHighlightMunicipality: MunicipalityCode | null
  geoLevel: 'region' | 'province' | 'municipality' | 'arrondissement'

  // ===== Sector/Category Filters =====
  selectedSector: string | null      // NACE code
  selectedCategory: string | null    // Generic category filter
  selectedSubcategory: string | null

  // ===== UI State =====
  currentView: ViewType
  currentChartType: ChartType
  showMovingAverage: boolean
  showProvinceBoundaries: boolean

  // ===== Analysis-Specific Filters =====
  // Faillissementen
  selectedDuration: string | null    // Business age category
  selectedWorkerCount: string | null // Worker count category

  // Vastgoed
  selectedPropertyType: string | null // 'house' | 'apartment'

  // Starters-Stoppers
  stopHorizon: 1 | 2 | 3 | 4 | 5 | null

  // Energiekaart
  selectedMeasure: string | null     // 'aantal' | 'bedrag'

  // Gemeentelijke Investeringen
  selectedPerspective: 'BV' | 'REK' | null
  selectedField: string | null       // Beleidsveld or Rekening code
  selectedReportYear: 2014 | 2020 | 2026 | null

  // Bouwprojecten
  selectedBudgetRange: string | null
  selectedProjectType: string | null
  sortBy: string | null

  // SILC
  selectedIncomeQuintile: string | null
  selectedTenureStatus: string | null

  // ===== Metadata =====
  lastUpdated: number  // Timestamp of last state change
  analysisSlug: string | null  // Current analysis context
}

/**
 * Store actions for updating state
 */
export interface EmbedFiltersActions {
  // ===== Time Actions =====
  setYear: (year: number | null) => void
  setQuarter: (quarter: number | null) => void
  setMonth: (month: number | null) => void
  setTimeRange: (range: TimeRange) => void
  setDateRange: (start: number | null, end: number | null) => void

  // ===== Geographic Actions =====
  setRegion: (code: RegionCode | null) => void
  setProvince: (code: ProvinceCode | null) => void
  setMunicipality: (code: MunicipalityCode | null) => void
  setArrondissement: (code: string | null) => void
  setHighlightMunicipality: (code: MunicipalityCode | null) => void
  setGeoLevel: (level: 'region' | 'province' | 'municipality' | 'arrondissement') => void

  // ===== Sector/Category Actions =====
  setSector: (sector: string | null) => void
  setCategory: (category: string | null) => void
  setSubcategory: (subcategory: string | null) => void

  // ===== UI Actions =====
  setView: (view: ViewType) => void
  setChartType: (type: ChartType) => void
  toggleMovingAverage: () => void
  toggleProvinceBoundaries: () => void

  // ===== Analysis-Specific Actions =====
  setDuration: (duration: string | null) => void
  setWorkerCount: (count: string | null) => void
  setPropertyType: (type: string | null) => void
  setStopHorizon: (horizon: 1 | 2 | 3 | 4 | 5 | null) => void
  setMeasure: (measure: string | null) => void
  setPerspective: (perspective: 'BV' | 'REK' | null) => void
  setField: (field: string | null) => void
  setReportYear: (year: 2014 | 2020 | 2026 | null) => void
  setBudgetRange: (range: string | null) => void
  setProjectType: (type: string | null) => void
  setSortBy: (sort: string | null) => void
  setIncomeQuintile: (quintile: string | null) => void
  setTenureStatus: (status: string | null) => void

  // ===== Core Actions =====
  /**
   * Load state from URL query parameters
   * Call this in useEffect on component mount
   */
  loadFromUrl: () => void

  /**
   * Sync current state to URL query parameters
   * Automatically called after each state change
   */
  syncToUrl: () => void

  /**
   * Reset all filters to default values
   * Optionally preserve certain filters
   */
  reset: (preserve?: Partial<EmbedFiltersState>) => void

  /**
   * Set the current analysis context
   * Used for context-aware URL param naming
   */
  setAnalysisContext: (slug: string) => void

  /**
   * Get current state as URL query string
   */
  toQueryString: () => string

  /**
   * Get current state as object (for embedParams compatibility)
   */
  toEmbedParams: () => Record<string, string | number>

  /**
   * Load state from URL with analysis-specific defaults
   * This is the new recommended way to initialize filters
   *
   * @param slug - Analysis slug (e.g., 'faillissementen')
   */
  loadFromUrlWithDefaults: (slug: AnalysisSlug) => void
}

export type EmbedFiltersStore = EmbedFiltersState & EmbedFiltersActions

// ============================================================================
// Default State
// ============================================================================

const defaultState: EmbedFiltersState = {
  // Time
  selectedYear: null,
  selectedQuarter: null,
  selectedMonth: null,
  timeRange: 'yearly',
  startYear: null,
  endYear: null,

  // Geographic
  selectedRegion: null,
  selectedProvince: null,
  selectedMunicipality: null,
  selectedArrondissement: null,
  selectedHighlightMunicipality: null,
  geoLevel: 'region',

  // Sector/Category
  selectedSector: null,
  selectedCategory: null,
  selectedSubcategory: null,

  // UI
  currentView: 'chart',
  currentChartType: 'composed',
  showMovingAverage: false,
  showProvinceBoundaries: false,

  // Analysis-specific
  selectedDuration: null,
  selectedWorkerCount: null,
  selectedPropertyType: null,
  stopHorizon: null,
  selectedMeasure: null,
  selectedPerspective: null,
  selectedField: null,
  selectedReportYear: null,
  selectedBudgetRange: null,
  selectedProjectType: null,
  sortBy: null,
  selectedIncomeQuintile: null,
  selectedTenureStatus: null,

  // Metadata
  lastUpdated: Date.now(),
  analysisSlug: null,
}

// ============================================================================
// URL Parameter Mapping
// ============================================================================

/**
 * Maps state keys to URL parameter names
 * Shorter param names for cleaner URLs
 */
const URL_PARAM_MAP: Record<keyof Omit<EmbedFiltersState, 'lastUpdated' | 'analysisSlug'>, string> = {
  // Time
  selectedYear: 'year',
  selectedQuarter: 'q',
  selectedMonth: 'month',
  timeRange: 'range',
  startYear: 'start',
  endYear: 'end',

  // Geographic
  selectedRegion: 'region',
  selectedProvince: 'province',
  selectedMunicipality: 'municipality',
  selectedArrondissement: 'arr',
  selectedHighlightMunicipality: 'muni',
  geoLevel: 'geoLevel',

  // Sector/Category
  selectedSector: 'sector',
  selectedCategory: 'category',
  selectedSubcategory: 'subcategory',

  // UI
  currentView: 'view',
  currentChartType: 'chartType',
  showMovingAverage: 'ma',
  showProvinceBoundaries: 'boundaries',

  // Analysis-specific
  selectedDuration: 'duration',
  selectedWorkerCount: 'workers',
  selectedPropertyType: 'type',
  stopHorizon: 'horizon',
  selectedMeasure: 'measure',
  selectedPerspective: 'perspective',
  selectedField: 'field',
  selectedReportYear: 'reportYear',
  selectedBudgetRange: 'budget',
  selectedProjectType: 'projectType',
  sortBy: 'sort',
  selectedIncomeQuintile: 'income',
  selectedTenureStatus: 'tenure',
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Serialize a state value to URL parameter string
 */
function serializeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}

/**
 * Deserialize a URL parameter to typed state value
 */
function deserializeValue<T>(
  param: string | null,
  type: 'string' | 'number' | 'boolean'
): T | null {
  // Explicitly check for null/undefined to allow "0" and "false"
  if (param === null || param === undefined) return null

  switch (type) {
    case 'number':
      const num = parseInt(param, 10)
      return (isNaN(num) ? null : num) as T
    case 'boolean':
      return (param === '1' || param === 'true') as T
    case 'string':
    default:
      return param as T
  }
}

/**
 * Get URLSearchParams object (browser or SSR safe)
 */
function getUrlParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

/**
 * Update browser URL without reload
 */
function updateBrowserUrl(params: URLSearchParams): void {
  if (typeof window === 'undefined') return

  const queryString = params.toString()
  const newUrl = queryString
    ? `${window.location.pathname}?${queryString}`
    : window.location.pathname

  // Use replaceState to avoid adding to history on every filter change
  // Components can use pushState for explicit history entries if needed
  window.history.replaceState({}, '', newUrl)
}

function getParamKey(paramKey: string, analysisSlug: string | null): string {
  return analysisSlug ? `${analysisSlug}.${paramKey}` : paramKey
}

function getParamValue(
  params: URLSearchParams,
  paramKey: string,
  analysisSlug: string | null
): string | null {
  if (analysisSlug) {
    const namespacedKey = getParamKey(paramKey, analysisSlug)
    const namespacedValue = params.get(namespacedKey)
    if (namespacedValue !== null) return namespacedValue
  }

  return params.get(paramKey)
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useEmbedFilters = create<EmbedFiltersStore>()(
  devtools(
    (set, get) => ({
      // ===== Initial State =====
      ...defaultState,

      // ===== Time Actions =====
      setYear: (year) => {
        set({ selectedYear: year, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setQuarter: (quarter) => {
        set({ selectedQuarter: quarter, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setMonth: (month) => {
        set({ selectedMonth: month, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setTimeRange: (range) => {
        set({ timeRange: range, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setDateRange: (start, end) => {
        set({ startYear: start, endYear: end, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      // ===== Geographic Actions =====
      setRegion: (code) => {
        set({ selectedRegion: code, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setProvince: (code) => {
        set({ selectedProvince: code, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setMunicipality: (code) => {
        set({ selectedMunicipality: code, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setArrondissement: (code) => {
        set({ selectedArrondissement: code, lastUpdated: Date.now() })
        get().syncToUrl()
      },
      setHighlightMunicipality: (code) => {
        set({ selectedHighlightMunicipality: code, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setGeoLevel: (level) => {
        set({ geoLevel: level, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      // ===== Sector/Category Actions =====
      setSector: (sector) => {
        set({ selectedSector: sector, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setCategory: (category) => {
        set({ selectedCategory: category, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setSubcategory: (subcategory) => {
        set({ selectedSubcategory: subcategory, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      // ===== UI Actions =====
      setView: (view) => {
        set({ currentView: view, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setChartType: (type) => {
        set({ currentChartType: type, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      toggleMovingAverage: () => {
        set((state) => ({
          showMovingAverage: !state.showMovingAverage,
          lastUpdated: Date.now(),
        }))
        get().syncToUrl()
      },

      toggleProvinceBoundaries: () => {
        set((state) => ({
          showProvinceBoundaries: !state.showProvinceBoundaries,
          lastUpdated: Date.now(),
        }))
        get().syncToUrl()
      },

      // ===== Analysis-Specific Actions =====
      setDuration: (duration) => {
        set({ selectedDuration: duration, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setWorkerCount: (count) => {
        set({ selectedWorkerCount: count, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setPropertyType: (type) => {
        set({ selectedPropertyType: type, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setStopHorizon: (horizon) => {
        set({ stopHorizon: horizon, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setMeasure: (measure) => {
        set({ selectedMeasure: measure, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setPerspective: (perspective) => {
        set({ selectedPerspective: perspective, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setField: (field) => {
        set({ selectedField: field, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setReportYear: (year) => {
        set({ selectedReportYear: year, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setBudgetRange: (range) => {
        set({ selectedBudgetRange: range, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setProjectType: (type) => {
        set({ selectedProjectType: type, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setSortBy: (sort) => {
        set({ sortBy: sort, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setIncomeQuintile: (quintile) => {
        set({ selectedIncomeQuintile: quintile, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      setTenureStatus: (status) => {
        set({ selectedTenureStatus: status, lastUpdated: Date.now() })
        get().syncToUrl()
      },

      // ===== Core Actions =====
      loadFromUrl: () => {
        const params = getUrlParams()
        const analysisSlug = get().analysisSlug
        const readParam = (key: string) => getParamValue(params, key, analysisSlug)
        const updates: Partial<EmbedFiltersState> = {}

        // Time
        updates.selectedYear = deserializeValue(readParam(URL_PARAM_MAP.selectedYear), 'number')
        updates.selectedQuarter = deserializeValue(readParam(URL_PARAM_MAP.selectedQuarter), 'number')
        updates.selectedMonth = deserializeValue(readParam(URL_PARAM_MAP.selectedMonth), 'number')
        updates.timeRange = (readParam(URL_PARAM_MAP.timeRange) as TimeRange) || defaultState.timeRange
        updates.startYear = deserializeValue(readParam(URL_PARAM_MAP.startYear), 'number')
        updates.endYear = deserializeValue(readParam(URL_PARAM_MAP.endYear), 'number')

        // Geographic
        updates.selectedRegion = readParam(URL_PARAM_MAP.selectedRegion) as RegionCode | null
        updates.selectedProvince = readParam(URL_PARAM_MAP.selectedProvince) as ProvinceCode | null
        updates.selectedMunicipality = readParam(URL_PARAM_MAP.selectedMunicipality) as MunicipalityCode | null
        updates.selectedArrondissement = readParam(URL_PARAM_MAP.selectedArrondissement)
        updates.selectedHighlightMunicipality = readParam(URL_PARAM_MAP.selectedHighlightMunicipality) as MunicipalityCode | null
        updates.geoLevel = (readParam(URL_PARAM_MAP.geoLevel) as EmbedFiltersState['geoLevel']) || defaultState.geoLevel

        // Sector/Category
        updates.selectedSector = readParam(URL_PARAM_MAP.selectedSector)
        updates.selectedCategory = readParam(URL_PARAM_MAP.selectedCategory)
        updates.selectedSubcategory = readParam(URL_PARAM_MAP.selectedSubcategory)

        // UI
        updates.currentView = (readParam(URL_PARAM_MAP.currentView) as ViewType) || defaultState.currentView
        updates.currentChartType = (readParam(URL_PARAM_MAP.currentChartType) as ChartType) || defaultState.currentChartType
        updates.showMovingAverage = deserializeValue(readParam(URL_PARAM_MAP.showMovingAverage), 'boolean') || defaultState.showMovingAverage
        updates.showProvinceBoundaries = deserializeValue(readParam(URL_PARAM_MAP.showProvinceBoundaries), 'boolean') || defaultState.showProvinceBoundaries

        // Analysis-specific
        updates.selectedDuration = readParam(URL_PARAM_MAP.selectedDuration)
        updates.selectedWorkerCount = readParam(URL_PARAM_MAP.selectedWorkerCount)
        updates.selectedPropertyType = readParam(URL_PARAM_MAP.selectedPropertyType)
        updates.stopHorizon = deserializeValue(readParam(URL_PARAM_MAP.stopHorizon), 'number') as 1 | 2 | 3 | 4 | 5 | null
        updates.selectedMeasure = readParam(URL_PARAM_MAP.selectedMeasure)
        updates.selectedPerspective = readParam(URL_PARAM_MAP.selectedPerspective) as 'BV' | 'REK' | null
        updates.selectedField = readParam(URL_PARAM_MAP.selectedField)
        updates.selectedReportYear = deserializeValue(readParam(URL_PARAM_MAP.selectedReportYear), 'number') as 2014 | 2020 | 2026 | null
        updates.selectedBudgetRange = readParam(URL_PARAM_MAP.selectedBudgetRange)
        updates.selectedProjectType = readParam(URL_PARAM_MAP.selectedProjectType)
        updates.sortBy = readParam(URL_PARAM_MAP.sortBy)
        updates.selectedIncomeQuintile = readParam(URL_PARAM_MAP.selectedIncomeQuintile)
        updates.selectedTenureStatus = readParam(URL_PARAM_MAP.selectedTenureStatus)

        updates.lastUpdated = Date.now()

        set(updates)
      },

      syncToUrl: () => {
        const state = get()
        const params = new URLSearchParams()
        const analysisSlug = state.analysisSlug

        // Only add non-null/non-default values to keep URLs clean
        Object.entries(URL_PARAM_MAP).forEach(([stateKey, paramKey]) => {
          const value = state[stateKey as keyof typeof URL_PARAM_MAP]
          const serialized = serializeValue(value)

          if (serialized !== null) {
            params.set(getParamKey(paramKey, analysisSlug), serialized)
          }
        })

        updateBrowserUrl(params)
      },

      reset: (preserve = {}) => {
        set({
          ...defaultState,
          ...preserve,
          lastUpdated: Date.now(),
        })
        get().syncToUrl()
      },

      setAnalysisContext: (slug) => {
        if (get().analysisSlug === slug) return
        set({ analysisSlug: slug })
      },

      toQueryString: () => {
        const state = get()
        const params = new URLSearchParams()
        const analysisSlug = state.analysisSlug

        Object.entries(URL_PARAM_MAP).forEach(([stateKey, paramKey]) => {
          const value = state[stateKey as keyof typeof URL_PARAM_MAP]
          const serialized = serializeValue(value)

          if (serialized !== null) {
            params.set(getParamKey(paramKey, analysisSlug), serialized)
          }
        })

        return params.toString()
      },

      toEmbedParams: () => {
        const state = get()
        const params: Record<string, string | number> = {}
        const analysisSlug = state.analysisSlug

        Object.entries(URL_PARAM_MAP).forEach(([stateKey, paramKey]) => {
          const value = state[stateKey as keyof typeof URL_PARAM_MAP]

          if (value !== null && value !== undefined) {
            params[getParamKey(paramKey, analysisSlug)] = typeof value === 'boolean' ? (value ? 1 : 0) : value
          }
        })

        return params
      },

      loadFromUrlWithDefaults: (slug: AnalysisSlug) => {
        // Prevent multiple initializations if context hasn't changed.
        const currentState = get()
        if (currentState.analysisSlug === slug && currentState.lastUpdated > 0) {
          return
        }

        const defaults = getAnalysisDefaults(slug)

        const params = getUrlParams()
        const readParam = (key: string) => getParamValue(params, key, slug)
        const updates: Partial<EmbedFiltersState> = {}

        // Time - merge URL > Analysis defaults > Store defaults
        updates.selectedYear = deserializeValue(readParam(URL_PARAM_MAP.selectedYear), 'number')
          ?? defaults.selectedYear
          ?? defaultState.selectedYear

        updates.selectedQuarter = deserializeValue(readParam(URL_PARAM_MAP.selectedQuarter), 'number')
          ?? defaults.selectedQuarter
          ?? defaultState.selectedQuarter

        updates.selectedMonth = deserializeValue(readParam(URL_PARAM_MAP.selectedMonth), 'number')
          ?? defaults.selectedMonth
          ?? defaultState.selectedMonth

        updates.timeRange = (readParam(URL_PARAM_MAP.timeRange) as TimeRange)
          ?? defaults.timeRange
          ?? defaultState.timeRange

        updates.startYear = deserializeValue(readParam(URL_PARAM_MAP.startYear), 'number')
          ?? defaults.startYear
          ?? defaultState.startYear

        updates.endYear = deserializeValue(readParam(URL_PARAM_MAP.endYear), 'number')
          ?? defaults.endYear
          ?? defaultState.endYear

        // Geographic - merge URL > Analysis defaults > Store defaults
        updates.selectedRegion = (readParam(URL_PARAM_MAP.selectedRegion) as RegionCode | null)
          ?? defaults.selectedRegion
          ?? defaultState.selectedRegion

        updates.selectedProvince = (readParam(URL_PARAM_MAP.selectedProvince) as ProvinceCode | null)
          ?? defaults.selectedProvince
          ?? defaultState.selectedProvince

        updates.selectedMunicipality = (readParam(URL_PARAM_MAP.selectedMunicipality) as MunicipalityCode | null)
          ?? defaults.selectedMunicipality
          ?? defaultState.selectedMunicipality

        updates.selectedArrondissement = readParam(URL_PARAM_MAP.selectedArrondissement)
          ?? defaultState.selectedArrondissement // Arrondissement usually doesn't have a fixed default per analysis yet

        updates.geoLevel = (readParam(URL_PARAM_MAP.geoLevel) as EmbedFiltersState['geoLevel'])
          ?? defaults.geoLevel
          ?? defaultState.geoLevel

        // Sector/Category - merge URL > Analysis defaults > Store defaults
        updates.selectedSector = readParam(URL_PARAM_MAP.selectedSector)
          ?? defaults.selectedSector
          ?? defaultState.selectedSector

        updates.selectedCategory = readParam(URL_PARAM_MAP.selectedCategory)
          ?? defaults.selectedCategory
          ?? defaultState.selectedCategory

        updates.selectedSubcategory = readParam(URL_PARAM_MAP.selectedSubcategory)
          ?? defaults.selectedSubcategory
          ?? defaultState.selectedSubcategory

        // UI - merge URL > Analysis defaults > Store defaults
        updates.currentView = (readParam(URL_PARAM_MAP.currentView) as ViewType)
          ?? defaults.currentView
          ?? defaultState.currentView

        updates.currentChartType = (readParam(URL_PARAM_MAP.currentChartType) as ChartType)
          ?? defaults.currentChartType
          ?? defaultState.currentChartType

        updates.showMovingAverage = deserializeValue(readParam(URL_PARAM_MAP.showMovingAverage), 'boolean')
          ?? defaults.showMovingAverage
          ?? defaultState.showMovingAverage

        updates.showProvinceBoundaries = deserializeValue(readParam(URL_PARAM_MAP.showProvinceBoundaries), 'boolean')
          ?? defaults.showProvinceBoundaries
          ?? defaultState.showProvinceBoundaries

        // Analysis-specific - merge URL > Analysis defaults > Store defaults
        updates.selectedDuration = readParam(URL_PARAM_MAP.selectedDuration)
          ?? defaults.selectedDuration
          ?? defaultState.selectedDuration

        updates.selectedWorkerCount = readParam(URL_PARAM_MAP.selectedWorkerCount)
          ?? defaults.selectedWorkerCount
          ?? defaultState.selectedWorkerCount

        updates.selectedPropertyType = readParam(URL_PARAM_MAP.selectedPropertyType)
          ?? defaults.selectedPropertyType
          ?? defaultState.selectedPropertyType

        updates.stopHorizon = (deserializeValue(readParam(URL_PARAM_MAP.stopHorizon), 'number') as 1 | 2 | 3 | 4 | 5 | null)
          ?? defaults.stopHorizon
          ?? defaultState.stopHorizon

        updates.selectedMeasure = readParam(URL_PARAM_MAP.selectedMeasure)
          ?? defaults.selectedMeasure
          ?? defaultState.selectedMeasure

        updates.selectedPerspective = (readParam(URL_PARAM_MAP.selectedPerspective) as 'BV' | 'REK' | null)
          ?? defaults.selectedPerspective
          ?? defaultState.selectedPerspective

        updates.selectedField = readParam(URL_PARAM_MAP.selectedField)
          ?? defaults.selectedField
          ?? defaultState.selectedField

        updates.selectedReportYear = (deserializeValue(readParam(URL_PARAM_MAP.selectedReportYear), 'number') as 2014 | 2020 | 2026 | null)
          ?? defaults.selectedReportYear
          ?? defaultState.selectedReportYear

        updates.selectedBudgetRange = readParam(URL_PARAM_MAP.selectedBudgetRange)
          ?? defaults.selectedBudgetRange
          ?? defaultState.selectedBudgetRange

        updates.selectedProjectType = readParam(URL_PARAM_MAP.selectedProjectType)
          ?? defaults.selectedProjectType
          ?? defaultState.selectedProjectType

        updates.sortBy = readParam(URL_PARAM_MAP.sortBy)
          ?? defaults.sortBy
          ?? defaultState.sortBy

        updates.selectedIncomeQuintile = readParam(URL_PARAM_MAP.selectedIncomeQuintile)
          ?? defaults.selectedIncomeQuintile
          ?? defaultState.selectedIncomeQuintile

        updates.selectedTenureStatus = readParam(URL_PARAM_MAP.selectedTenureStatus)
          ?? defaults.selectedTenureStatus
          ?? defaultState.selectedTenureStatus

        updates.lastUpdated = Date.now()
        updates.analysisSlug = slug

        set(updates)
      },
    }),
    { name: 'EmbedFilters' }  // DevTools name
  )
)

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Hook for time-related filters only
 */
export function useTimeFilters() {
  return useEmbedFilters(useShallow((state) => ({
    selectedYear: state.selectedYear,
    selectedQuarter: state.selectedQuarter,
    selectedMonth: state.selectedMonth,
    timeRange: state.timeRange,
    startYear: state.startYear,
    endYear: state.endYear,
    setYear: state.setYear,
    setQuarter: state.setQuarter,
    setMonth: state.setMonth,
    setTimeRange: state.setTimeRange,
    setDateRange: state.setDateRange,
  })))
}

/**
 * Hook for geographic filters only
 */
export function useGeoFilters() {
  return useEmbedFilters(useShallow((state) => ({
    selectedRegion: state.selectedRegion,
    selectedProvince: state.selectedProvince,
    selectedMunicipality: state.selectedMunicipality,
    selectedArrondissement: state.selectedArrondissement,
    selectedHighlightMunicipality: state.selectedHighlightMunicipality,
    geoLevel: state.geoLevel,
    setRegion: state.setRegion,
    setProvince: state.setProvince,
    setMunicipality: state.setMunicipality,
    setArrondissement: state.setArrondissement,
    setHighlightMunicipality: state.setHighlightMunicipality,
    setGeoLevel: state.setGeoLevel,
  })))
}

/**
 * Hook for UI state only
 */
export function useViewState() {
  return useEmbedFilters(useShallow((state) => ({
    currentView: state.currentView,
    currentChartType: state.currentChartType,
    showMovingAverage: state.showMovingAverage,
    showProvinceBoundaries: state.showProvinceBoundaries,
    setView: state.setView,
    setChartType: state.setChartType,
    toggleMovingAverage: state.toggleMovingAverage,
    toggleProvinceBoundaries: state.toggleProvinceBoundaries,
  })))
}

/**
 * Initialize filters from URL on component mount
 * Use this in top-level dashboard components
 *
 * @deprecated Use useInitializeFiltersWithDefaults instead
 */
export function useInitializeFilters() {
  const loadFromUrl = useEmbedFilters((state) => state.loadFromUrl)

  useEffect(() => {
    loadFromUrl()
  }, [loadFromUrl])
}

/**
 * Initialize filters from URL with analysis-specific defaults
 * This is the recommended way to initialize filters in dashboard components
 *
 * Usage:
 * ```typescript
 * function FaillissementenDashboard() {
 *   useInitializeFiltersWithDefaults('faillissementen')
 *   // ... rest of component
 * }
 * ```
 *
 * Benefits over useInitializeFilters:
 * - Automatically sets analysis context
 * - Loads defaults from central registry
 * - Consistent initialization order (no race conditions)
 * - No manual setSector() or similar calls needed
 *
 * @param slug - Analysis slug (e.g., 'faillissementen')
 */
export function useInitializeFiltersWithDefaults(slug: AnalysisSlug) {
  const loadFromUrlWithDefaults = useEmbedFilters((state) => state.loadFromUrlWithDefaults)
  const setAnalysisContext = useEmbedFilters((state) => state.setAnalysisContext)

  useEffect(() => {
    setAnalysisContext(slug)
    loadFromUrlWithDefaults(slug)
  }, [slug, setAnalysisContext, loadFromUrlWithDefaults])
}
