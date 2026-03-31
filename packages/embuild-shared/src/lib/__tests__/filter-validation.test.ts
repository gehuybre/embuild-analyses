/**
 * Unit tests for filter-validation.ts
 *
 * Tests all validation functions to ensure:
 * - Valid values are accepted
 * - Invalid values are rejected with clear error messages
 * - Null handling works as expected
 * - Type safety is maintained
 */

import { describe, it, expect } from 'vitest'
import {
  validateRegionCode,
  validateProvinceCode,
  validateArrondissementCode,
  validateMunicipalityCode,
  validateSectorCode,
  validateCategoryCode,
  validateTimeRange,
  validateYear,
  validateQuarter,
  validateMonth,
  validateViewType,
  validateChartType,
  combineValidationResults,
} from '../filter-validation'

describe('validateRegionCode', () => {
  it('accepts valid region codes', () => {
    const result = validateRegionCode('2000')  // Vlaanderen

    expect(result.valid).toBe(true)
    expect(result.value).toBe('2000')
    expect(result.error).toBeUndefined()
  })

  it('accepts all valid Belgian region codes', () => {
    const validCodes = ['1000', '2000', '3000', '4000']

    validCodes.forEach((code) => {
      const result = validateRegionCode(code)
      expect(result.valid).toBe(true)
      expect(result.value).toBe(code)
    })
  })

  it('rejects invalid region codes', () => {
    const result = validateRegionCode('9999')

    expect(result.valid).toBe(false)
    expect(result.value).toBeNull()
    expect(result.error).toContain('Ongeldige')
  })

  it('accepts null when allowed', () => {
    const result = validateRegionCode(null, true)

    expect(result.valid).toBe(true)
    expect(result.value).toBeNull()
    expect(result.error).toBeUndefined()
  })

  it('rejects null when not allowed', () => {
    const result = validateRegionCode(null, false)

    expect(result.valid).toBe(false)
    expect(result.value).toBeNull()
    expect(result.error).toContain('verplicht')
  })
})

describe('validateProvinceCode', () => {
  it('accepts valid province codes', () => {
    const result = validateProvinceCode('10000')  // Antwerp

    expect(result.valid).toBe(true)
    expect(result.value).toBe('10000')
    expect(result.error).toBeUndefined()
  })

  it('accepts all Flemish province codes', () => {
    const flemishCodes = ['10000', '70000', '40000', '20001', '30000']

    flemishCodes.forEach((code) => {
      const result = validateProvinceCode(code)
      expect(result.valid).toBe(true)
      expect(result.value).toBe(code)
    })
  })

  it('rejects invalid province codes', () => {
    const result = validateProvinceCode('99999')

    expect(result.valid).toBe(false)
    expect(result.value).toBeNull()
    expect(result.error).toContain('Ongeldige')
    expect(result.error).toContain('99999')
  })

  it('accepts null when allowed', () => {
    const result = validateProvinceCode(null, true)

    expect(result.valid).toBe(true)
    expect(result.value).toBeNull()
  })

  it('rejects null when not allowed', () => {
    const result = validateProvinceCode(null, false)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('verplicht')
  })
})

describe('validateArrondissementCode', () => {
  it('accepts valid arrondissement codes', () => {
    const result = validateArrondissementCode('11000')  // Arr. Antwerp

    expect(result.valid).toBe(true)
    expect(result.value).toBe('11000')
  })

  it('rejects invalid arrondissement codes', () => {
    const result = validateArrondissementCode('99999')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Ongeldige')
  })
})

describe('validateMunicipalityCode', () => {
  it('accepts valid 5-digit NIS codes', () => {
    const result = validateMunicipalityCode('12345')

    expect(result.valid).toBe(true)
    expect(result.value).toBe('12345')
  })

  it('accepts numeric municipality codes', () => {
    const result = validateMunicipalityCode(12345)

    expect(result.valid).toBe(true)
    expect(result.value).toBe('12345')
  })

  it('rejects invalid format', () => {
    const result = validateMunicipalityCode('ABC')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Ongeldige')
    expect(result.error).toContain('5-cijferig')
  })

  it('rejects codes that are not 5 digits', () => {
    const result = validateMunicipalityCode('123')

    expect(result.valid).toBe(false)
  })
})

describe('validateSectorCode', () => {
  const validSectors = ['F', 'C', 'G', 'H']

  it('accepts valid sector codes', () => {
    const result = validateSectorCode('F', validSectors)

    expect(result.valid).toBe(true)
    expect(result.value).toBe('F')
  })

  it('accepts all sectors in the list', () => {
    validSectors.forEach((sector) => {
      const result = validateSectorCode(sector, validSectors)
      expect(result.valid).toBe(true)
      expect(result.value).toBe(sector)
    })
  })

  it('rejects invalid sector codes', () => {
    const result = validateSectorCode('INVALID', validSectors)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Ongeldige')
    expect(result.error).toContain('INVALID')
  })

  it('accepts null for "All sectors"', () => {
    const result = validateSectorCode(null, validSectors, true)

    expect(result.valid).toBe(true)
    expect(result.value).toBeNull()
  })

  it('rejects null when not allowed', () => {
    const result = validateSectorCode(null, validSectors, false)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('verplicht')
  })
})

describe('validateCategoryCode', () => {
  const validCategories = ['cat1', 'cat2', 'cat3']

  it('accepts valid category codes', () => {
    const result = validateCategoryCode('cat1', validCategories)

    expect(result.valid).toBe(true)
    expect(result.value).toBe('cat1')
  })

  it('rejects invalid category codes', () => {
    const result = validateCategoryCode('invalid', validCategories)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Ongeldige')
  })
})

describe('validateTimeRange', () => {
  it('accepts yearly', () => {
    const result = validateTimeRange('yearly')

    expect(result.valid).toBe(true)
    expect(result.value).toBe('yearly')
  })

  it('accepts monthly', () => {
    const result = validateTimeRange('monthly')

    expect(result.valid).toBe(true)
    expect(result.value).toBe('monthly')
  })

  it('accepts quarterly', () => {
    const result = validateTimeRange('quarterly')

    expect(result.valid).toBe(true)
    expect(result.value).toBe('quarterly')
  })

  it('rejects invalid time ranges', () => {
    const result = validateTimeRange('daily')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Ongeldige')
    expect(result.error).toContain('daily')
  })

  it('accepts null', () => {
    const result = validateTimeRange(null)

    expect(result.valid).toBe(true)
    expect(result.value).toBeNull()
  })
})

describe('validateYear', () => {
  it('accepts valid years', () => {
    const result = validateYear(2024, 2000, 2030)

    expect(result.valid).toBe(true)
    expect(result.value).toBe(2024)
  })

  it('accepts string years', () => {
    const result = validateYear('2024', 2000, 2030)

    expect(result.valid).toBe(true)
    expect(result.value).toBe(2024)
  })

  it('rejects years outside range', () => {
    const result = validateYear(1800, 2000, 2030)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('buiten')
    expect(result.error).toContain('1800')
  })

  it('rejects invalid year strings', () => {
    const result = validateYear('invalid', 2000, 2030)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Ongeldig')
  })

  it('accepts null when allowed', () => {
    const result = validateYear(null, 2000, 2030, true)

    expect(result.valid).toBe(true)
    expect(result.value).toBeNull()
  })

  it('uses default range when not specified', () => {
    const result = validateYear(2024)

    expect(result.valid).toBe(true)
    expect(result.value).toBe(2024)
  })
})

describe('validateQuarter', () => {
  it('accepts valid quarters (1-4)', () => {
    ;[1, 2, 3, 4].forEach((q) => {
      const result = validateQuarter(q)
      expect(result.valid).toBe(true)
      expect(result.value).toBe(q)
    })
  })

  it('accepts string quarters', () => {
    const result = validateQuarter('3')

    expect(result.valid).toBe(true)
    expect(result.value).toBe(3)
  })

  it('rejects quarters outside range', () => {
    const result = validateQuarter(5)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('ongeldig')
  })

  it('rejects quarter 0', () => {
    const result = validateQuarter(0)

    expect(result.valid).toBe(false)
  })

  it('accepts null when allowed', () => {
    const result = validateQuarter(null, true)

    expect(result.valid).toBe(true)
    expect(result.value).toBeNull()
  })
})

describe('validateMonth', () => {
  it('accepts valid months (1-12)', () => {
    ;[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((m) => {
      const result = validateMonth(m)
      expect(result.valid).toBe(true)
      expect(result.value).toBe(m)
    })
  })

  it('accepts string months', () => {
    const result = validateMonth('6')

    expect(result.valid).toBe(true)
    expect(result.value).toBe(6)
  })

  it('rejects months outside range', () => {
    const result = validateMonth(13)

    expect(result.valid).toBe(false)
    expect(result.error).toContain('ongeldig')
  })

  it('rejects month 0', () => {
    const result = validateMonth(0)

    expect(result.valid).toBe(false)
  })
})

describe('validateViewType', () => {
  it('accepts chart', () => {
    const result = validateViewType('chart')

    expect(result.valid).toBe(true)
    expect(result.value).toBe('chart')
  })

  it('accepts table', () => {
    const result = validateViewType('table')

    expect(result.valid).toBe(true)
    expect(result.value).toBe('table')
  })

  it('accepts map', () => {
    const result = validateViewType('map')

    expect(result.valid).toBe(true)
    expect(result.value).toBe('map')
  })

  it('rejects invalid view types', () => {
    const result = validateViewType('invalid')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Ongeldige')
  })

  it('accepts null', () => {
    const result = validateViewType(null)

    expect(result.valid).toBe(true)
    expect(result.value).toBeNull()
  })
})

describe('validateChartType', () => {
  it('accepts composed', () => {
    const result = validateChartType('composed')

    expect(result.valid).toBe(true)
    expect(result.value).toBe('composed')
  })

  it('accepts all valid chart types', () => {
    const types = ['composed', 'line', 'bar', 'area']

    types.forEach((type) => {
      const result = validateChartType(type)
      expect(result.valid).toBe(true)
      expect(result.value).toBe(type)
    })
  })

  it('rejects invalid chart types', () => {
    const result = validateChartType('pie')

    expect(result.valid).toBe(false)
    expect(result.error).toContain('Ongeldig')
  })
})

describe('combineValidationResults', () => {
  it('returns success when all results are valid', () => {
    const results = [
      { valid: true, value: '10000' },
      { valid: true, value: 2024 },
      { valid: true, value: 'yearly' },
    ]

    const combined = combineValidationResults(results)

    expect(combined.valid).toBe(true)
    expect(combined.value).toBeNull()
  })

  it('returns first error when any result is invalid', () => {
    const results = [
      { valid: true, value: '10000' },
      { valid: false, value: null, error: 'Invalid year' },
      { valid: true, value: 'yearly' },
    ]

    const combined = combineValidationResults(results)

    expect(combined.valid).toBe(false)
    expect(combined.error).toBe('Invalid year')
  })

  it('returns first error when multiple results are invalid', () => {
    const results = [
      { valid: false, value: null, error: 'Error 1' },
      { valid: false, value: null, error: 'Error 2' },
    ]

    const combined = combineValidationResults(results)

    expect(combined.valid).toBe(false)
    expect(combined.error).toBe('Error 1')  // First error
  })

  it('handles empty results array', () => {
    const combined = combineValidationResults([])

    expect(combined.valid).toBe(true)
  })
})

describe('Error message quality', () => {
  it('province error includes the invalid code', () => {
    const result = validateProvinceCode('99999')

    expect(result.error).toContain('99999')
  })

  it('sector error includes valid options', () => {
    const result = validateSectorCode('X', ['F', 'C'])

    expect(result.error).toContain('F')
    expect(result.error).toContain('C')
  })

  it('year error includes range', () => {
    const result = validateYear(1800, 2000, 2030)

    expect(result.error).toContain('2000')
    expect(result.error).toContain('2030')
  })

  it('time range error includes valid options', () => {
    const result = validateTimeRange('daily')

    expect(result.error).toContain('yearly')
    expect(result.error).toContain('monthly')
    expect(result.error).toContain('quarterly')
  })
})
