/**
 * Filter Validation Utilities
 *
 * This module provides validation functions for all filter types used in analyses.
 * It ensures that filter values from URLs or user input are valid before being used
 * in data queries or visualizations.
 *
 * Design Principles:
 * - Validate, don't silently fix (return errors instead of fallbacks)
 * - Clear error messages for debugging and user feedback
 * - Type-safe validation results
 *
 * Usage:
 * ```typescript
 * import { validateProvinceCode } from './filter-validation'
 *
 * const result = validateProvinceCode('10000')
 * if (!result.valid) {
 *   return <Error message={result.error} />
 * }
 * // Use result.value safely
 * ```
 */

import { REGIONS, PROVINCES, ARRONDISSEMENTS } from './geo-utils'
import type { RegionCode, ProvinceCode, ArrondissementCode, MunicipalityCode } from './geo-utils'

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a validation operation
 *
 * @template T - The type of the validated value
 */
export interface ValidationResult<T> {
  /**
   * Whether the value is valid
   */
  valid: boolean

  /**
   * The validated value (null if invalid)
   */
  value: T | null

  /**
   * Error message if validation failed
   * Suitable for display to users or logging
   */
  error?: string
}

// ============================================================================
// Geographic Validation
// ============================================================================

/**
 * Validate a region code against the list of valid Belgian regions
 *
 * @param code - Region code to validate (e.g., '2000' for Flanders)
 * @param allowNull - Whether null is considered valid (default: true)
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * validateRegionCode('2000')     // → { valid: true, value: '2000' }
 * validateRegionCode('9999')     // → { valid: false, value: null, error: '...' }
 * validateRegionCode(null, true) // → { valid: true, value: null }
 * ```
 */
export function validateRegionCode(
  code: string | null,
  allowNull = true
): ValidationResult<RegionCode> {
  // Handle null
  if (code === null || code === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Regio is verplicht',
    }
  }

  // Check if code exists in REGIONS
  const validCodes = REGIONS.map((r) => r.code)
  if (validCodes.includes(code as RegionCode)) {
    return { valid: true, value: code as RegionCode }
  }

  // Invalid code
  const regionName = REGIONS.find((r) => r.code === code)?.name
  return {
    valid: false,
    value: null,
    error: regionName
      ? `Ongeldige regio: ${regionName} (${code})`
      : `Ongeldige regio code: ${code}. Geldige codes: ${validCodes.join(', ')}`,
  }
}

/**
 * Validate a province code against the list of valid Belgian provinces
 *
 * @param code - Province code to validate (e.g., '10000' for Antwerp)
 * @param allowNull - Whether null is considered valid (default: true)
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * validateProvinceCode('10000')     // → { valid: true, value: '10000' }
 * validateProvinceCode('99999')     // → { valid: false, value: null, error: '...' }
 * validateProvinceCode(null, true)  // → { valid: true, value: null }
 * ```
 */
export function validateProvinceCode(
  code: string | null,
  allowNull = true
): ValidationResult<ProvinceCode> {
  // Handle null
  if (code === null || code === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Provincie is verplicht',
    }
  }

  // Check if code exists in PROVINCES
  const province = PROVINCES.find((p) => p.code === code)
  if (province) {
    return { valid: true, value: code as ProvinceCode }
  }

  // Invalid code
  const validCodes = PROVINCES.map((p) => `${p.name} (${p.code})`).join(', ')
  return {
    valid: false,
    value: null,
    error: `Ongeldige provincie code: ${code}. Geldige provincies: ${validCodes}`,
  }
}

/**
 * Validate an arrondissement code against the list of valid Belgian arrondissements
 *
 * @param code - Arrondissement code to validate (e.g., '11000' for Arrondissement Antwerp)
 * @param allowNull - Whether null is considered valid (default: true)
 * @returns Validation result with error message if invalid
 */
export function validateArrondissementCode(
  code: string | null,
  allowNull = true
): ValidationResult<ArrondissementCode> {
  // Handle null
  if (code === null || code === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Arrondissement is verplicht',
    }
  }

  // Check if code exists in ARRONDISSEMENTS
  const arrondissement = ARRONDISSEMENTS.find((a) => a.code === code)
  if (arrondissement) {
    return { valid: true, value: code as ArrondissementCode }
  }

  // Invalid code
  return {
    valid: false,
    value: null,
    error: `Ongeldige arrondissement code: ${code}`,
  }
}

/**
 * Validate a municipality code
 *
 * Note: This is a basic validation (checks if it's a number).
 * For full validation, you would need to check against a municipality dataset.
 *
 * @param code - Municipality code to validate (NIS code)
 * @param allowNull - Whether null is considered valid (default: true)
 * @returns Validation result with error message if invalid
 */
export function validateMunicipalityCode(
  code: string | number | null,
  allowNull = true
): ValidationResult<MunicipalityCode> {
  // Handle null
  if (code === null || code === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Gemeente is verplicht',
    }
  }

  // Convert to string if number
  const codeStr = typeof code === 'number' ? String(code) : code

  // Basic validation: should be a 5-digit number
  if (!/^\d{5}$/.test(codeStr)) {
    return {
      valid: false,
      value: null,
      error: `Ongeldige gemeente code: ${codeStr}. Verwacht 5-cijferig NIS code.`,
    }
  }

  return { valid: true, value: codeStr as MunicipalityCode }
}

// ============================================================================
// Sector/Category Validation
// ============================================================================

/**
 * Validate a sector code against a list of valid sectors
 *
 * @param code - Sector code to validate (e.g., 'F' for construction)
 * @param validSectors - Array of valid sector codes for this analysis
 * @param allowNull - Whether null is considered valid (default: true, means "All sectors")
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * const validSectors = ['F', 'C', 'G', 'H']
 * validateSectorCode('F', validSectors)      // → { valid: true, value: 'F' }
 * validateSectorCode('Z', validSectors)      // → { valid: false, ... }
 * validateSectorCode(null, validSectors)     // → { valid: true, value: null }
 * ```
 */
export function validateSectorCode(
  code: string | null,
  validSectors: string[],
  allowNull = true
): ValidationResult<string> {
  // Handle null (means "All sectors")
  if (code === null || code === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Sector is verplicht',
    }
  }

  // Check if code is in valid sectors
  if (validSectors.includes(code)) {
    return { valid: true, value: code }
  }

  // Invalid code
  return {
    valid: false,
    value: null,
    error: `Ongeldige sector code: ${code}. Geldige sectoren: ${validSectors.join(', ')}`,
  }
}

/**
 * Validate a generic category code against a list of valid categories
 *
 * @param code - Category code to validate
 * @param validCategories - Array of valid category codes
 * @param allowNull - Whether null is considered valid (default: true)
 * @returns Validation result with error message if invalid
 */
export function validateCategoryCode(
  code: string | null,
  validCategories: string[],
  allowNull = true
): ValidationResult<string> {
  // Handle null
  if (code === null || code === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Categorie is verplicht',
    }
  }

  // Check if code is in valid categories
  if (validCategories.includes(code)) {
    return { valid: true, value: code }
  }

  // Invalid code
  return {
    valid: false,
    value: null,
    error: `Ongeldige categorie: ${code}. Geldige categorieën: ${validCategories.join(', ')}`,
  }
}

// ============================================================================
// Time Validation
// ============================================================================

/**
 * Validate a time range value
 *
 * @param range - Time range to validate ('yearly', 'monthly', 'quarterly')
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * validateTimeRange('yearly')   // → { valid: true, value: 'yearly' }
 * validateTimeRange('daily')    // → { valid: false, ... }
 * validateTimeRange(null)       // → { valid: true, value: null }
 * ```
 */
export function validateTimeRange(
  range: string | null
): ValidationResult<'yearly' | 'monthly' | 'quarterly'> {
  if (range === null || range === undefined) {
    return { valid: true, value: null }
  }

  const validRanges: Array<'yearly' | 'monthly' | 'quarterly'> = ['yearly', 'monthly', 'quarterly']

  if (validRanges.includes(range as 'yearly' | 'monthly' | 'quarterly')) {
    return { valid: true, value: range as 'yearly' | 'monthly' | 'quarterly' }
  }

  return {
    valid: false,
    value: null,
    error: `Ongeldige tijdsperiode: ${range}. Geldige opties: ${validRanges.join(', ')}`,
  }
}

/**
 * Validate a year value
 *
 * @param year - Year to validate
 * @param minYear - Minimum allowed year (default: 1900)
 * @param maxYear - Maximum allowed year (default: current year + 10)
 * @param allowNull - Whether null is considered valid (default: true)
 * @returns Validation result with error message if invalid
 *
 * @example
 * ```typescript
 * validateYear(2024, 2000, 2030)  // → { valid: true, value: 2024 }
 * validateYear(1800, 2000, 2030)  // → { valid: false, ... }
 * validateYear(null)              // → { valid: true, value: null }
 * ```
 */
export function validateYear(
  year: number | string | null,
  minYear = 1900,
  maxYear = new Date().getFullYear() + 10,
  allowNull = true
): ValidationResult<number> {
  // Handle null
  if (year === null || year === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Jaar is verplicht',
    }
  }

  // Convert string to number
  const yearNum = typeof year === 'string' ? parseInt(year, 10) : year

  // Check if it's a valid number
  if (isNaN(yearNum)) {
    return {
      valid: false,
      value: null,
      error: `Ongeldig jaar: ${year}`,
    }
  }

  // Check range
  if (yearNum < minYear || yearNum > maxYear) {
    return {
      valid: false,
      value: null,
      error: `Jaar ${yearNum} valt buiten het toegestane bereik (${minYear}-${maxYear})`,
    }
  }

  return { valid: true, value: yearNum }
}

/**
 * Validate a quarter value
 *
 * @param quarter - Quarter to validate (1-4)
 * @param allowNull - Whether null is considered valid (default: true)
 * @returns Validation result with error message if invalid
 */
export function validateQuarter(
  quarter: number | string | null,
  allowNull = true
): ValidationResult<number> {
  // Handle null
  if (quarter === null || quarter === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Kwartaal is verplicht',
    }
  }

  // Convert string to number
  const quarterNum = typeof quarter === 'string' ? parseInt(quarter, 10) : quarter

  // Check if it's a valid number
  if (isNaN(quarterNum)) {
    return {
      valid: false,
      value: null,
      error: `Ongeldig kwartaal: ${quarter}`,
    }
  }

  // Check range (1-4)
  if (quarterNum < 1 || quarterNum > 4) {
    return {
      valid: false,
      value: null,
      error: `Kwartaal ${quarterNum} is ongeldig. Moet tussen 1 en 4 zijn.`,
    }
  }

  return { valid: true, value: quarterNum }
}

/**
 * Validate a month value
 *
 * @param month - Month to validate (1-12)
 * @param allowNull - Whether null is considered valid (default: true)
 * @returns Validation result with error message if invalid
 */
export function validateMonth(
  month: number | string | null,
  allowNull = true
): ValidationResult<number> {
  // Handle null
  if (month === null || month === undefined) {
    if (allowNull) {
      return { valid: true, value: null }
    }
    return {
      valid: false,
      value: null,
      error: 'Maand is verplicht',
    }
  }

  // Convert string to number
  const monthNum = typeof month === 'string' ? parseInt(month, 10) : month

  // Check if it's a valid number
  if (isNaN(monthNum)) {
    return {
      valid: false,
      value: null,
      error: `Ongeldige maand: ${month}`,
    }
  }

  // Check range (1-12)
  if (monthNum < 1 || monthNum > 12) {
    return {
      valid: false,
      value: null,
      error: `Maand ${monthNum} is ongeldig. Moet tussen 1 en 12 zijn.`,
    }
  }

  return { valid: true, value: monthNum }
}

// ============================================================================
// UI State Validation
// ============================================================================

/**
 * Validate a view type value
 *
 * @param view - View type to validate ('chart', 'table', 'map')
 * @returns Validation result with error message if invalid
 */
export function validateViewType(
  view: string | null
): ValidationResult<'chart' | 'table' | 'map'> {
  if (view === null || view === undefined) {
    return { valid: true, value: null }
  }

  const validViews: Array<'chart' | 'table' | 'map'> = ['chart', 'table', 'map']

  if (validViews.includes(view as 'chart' | 'table' | 'map')) {
    return { valid: true, value: view as 'chart' | 'table' | 'map' }
  }

  return {
    valid: false,
    value: null,
    error: `Ongeldige weergave: ${view}. Geldige opties: ${validViews.join(', ')}`,
  }
}

/**
 * Validate a chart type value
 *
 * @param type - Chart type to validate ('composed', 'line', 'bar', 'area')
 * @returns Validation result with error message if invalid
 */
export function validateChartType(
  type: string | null
): ValidationResult<'composed' | 'line' | 'bar' | 'area'> {
  if (type === null || type === undefined) {
    return { valid: true, value: null }
  }

  const validTypes: Array<'composed' | 'line' | 'bar' | 'area'> = [
    'composed',
    'line',
    'bar',
    'area',
  ]

  if (validTypes.includes(type as 'composed' | 'line' | 'bar' | 'area')) {
    return { valid: true, value: type as 'composed' | 'line' | 'bar' | 'area' }
  }

  return {
    valid: false,
    value: null,
    error: `Ongeldig grafiektype: ${type}. Geldige opties: ${validTypes.join(', ')}`,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Combine multiple validation results
 * Returns the first error encountered, or a success result if all valid
 *
 * @param results - Array of validation results to combine
 * @returns Combined validation result
 *
 * @example
 * ```typescript
 * const provinceResult = validateProvinceCode('10000')
 * const yearResult = validateYear(2024)
 * const combined = combineValidationResults([provinceResult, yearResult])
 * // → { valid: true, value: null } if all valid
 * // → { valid: false, error: '...' } if any invalid
 * ```
 */
export function combineValidationResults<T>(
  results: ValidationResult<T>[]
): ValidationResult<T> {
  for (const result of results) {
    if (!result.valid) {
      return result
    }
  }
  return { valid: true, value: null }
}
