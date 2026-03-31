/**
 * Unit tests for analysis-defaults.ts
 *
 * Tests the centralized defaults registry to ensure:
 * - All analyses have valid defaults
 * - Defaults are consistent and type-safe
 * - Helper functions work correctly
 */

import { describe, it, expect } from 'vitest'
import {
  type AnalysisSlug,
  getAnalysisDefaults,
  getAvailableAnalyses,
  hasAnalysisDefaults,
} from '../analysis-defaults'

describe('getAnalysisDefaults', () => {
  it('returns faillissementen defaults correctly', () => {
    const defaults = getAnalysisDefaults('faillissementen')

    expect(defaults.timeRange).toBe('yearly')
    expect(defaults.selectedSector).toBe('ALL')  // "Alle sectoren"
    expect(defaults.selectedProvince).toBeNull()  // All Flanders
    expect(defaults.currentView).toBe('chart')
  })

  it('returns vergunningen-goedkeuringen defaults correctly', () => {
    const defaults = getAnalysisDefaults('vergunningen-goedkeuringen')

    expect(defaults.timeRange).toBe('monthly')  // Different from faillissementen
    expect(defaults.selectedRegion).toBeNull()
    expect(defaults.currentView).toBe('chart')
  })

  it('returns gebouwenpark defaults correctly', () => {
    const defaults = getAnalysisDefaults('gebouwenpark')

    expect(defaults.selectedProvince).toBeNull()
    expect(defaults.currentView).toBe('map')
  })

  it('returns different defaults per analysis', () => {
    const fail = getAnalysisDefaults('faillissementen')
    const verg = getAnalysisDefaults('vergunningen-goedkeuringen')

    // Different analyses have different time range defaults
    expect(fail.timeRange).toBe('yearly')
    expect(verg.timeRange).toBe('monthly')
  })

  it('throws error for unknown analysis', () => {
    expect(() => getAnalysisDefaults('unknown-analysis' as AnalysisSlug)).toThrow()
    expect(() => getAnalysisDefaults('unknown-analysis' as AnalysisSlug)).toThrow(/No defaults found/)
  })

  it('returns all expected analyses', () => {
    // Test that all 16 analyses have defaults
    const expectedAnalyses: AnalysisSlug[] = [
      'faillissementen',
      'vergunningen-goedkeuringen',
      'gebouwenpark',
      'prijsherziening',
      'woningmarkt',
      'vastgoed-verkopen',
      'starters-stoppers',
      'huishoudensgroei',
      'energiekaart-premies',
      'vergunningen-aanvragen',
      'gemeentelijke-investeringen',
      'bouwprojecten-gemeenten',
      'bouwondernemers',
      'betaalbaar-arr',
      'silc-energie-2023',
      'vastgoed-prijzen',
    ]

    expectedAnalyses.forEach((slug) => {
      expect(() => getAnalysisDefaults(slug)).not.toThrow()
    })
  })
})

describe('getAvailableAnalyses', () => {
  it('returns an array of analysis slugs', () => {
    const analyses = getAvailableAnalyses()

    expect(Array.isArray(analyses)).toBe(true)
    expect(analyses.length).toBeGreaterThan(0)
  })

  it('includes faillissementen', () => {
    const analyses = getAvailableAnalyses()

    expect(analyses).toContain('faillissementen')
  })

  it('includes vergunningen-goedkeuringen', () => {
    const analyses = getAvailableAnalyses()

    expect(analyses).toContain('vergunningen-goedkeuringen')
  })

  it('returns at least 16 analyses', () => {
    const analyses = getAvailableAnalyses()

    expect(analyses.length).toBeGreaterThanOrEqual(16)
  })
})

describe('hasAnalysisDefaults', () => {
  it('returns true for existing analysis', () => {
    expect(hasAnalysisDefaults('faillissementen')).toBe(true)
    expect(hasAnalysisDefaults('vergunningen-goedkeuringen')).toBe(true)
  })

  it('returns false for unknown analysis', () => {
    expect(hasAnalysisDefaults('unknown-analysis')).toBe(false)
    expect(hasAnalysisDefaults('non-existent')).toBe(false)
  })

  it('handles empty string', () => {
    expect(hasAnalysisDefaults('')).toBe(false)
  })
})

describe('Analysis defaults validation', () => {
  it('all analyses have consistent structure', () => {
    const analyses = getAvailableAnalyses()

    analyses.forEach((slug) => {
      const defaults = getAnalysisDefaults(slug)

      // Defaults should be an object
      expect(typeof defaults).toBe('object')
      expect(defaults).not.toBeNull()
    })
  })

  it('timeRange defaults are valid values', () => {
    const analyses = getAvailableAnalyses()
    const validTimeRanges = ['yearly', 'monthly', 'quarterly', undefined]

    analyses.forEach((slug) => {
      const defaults = getAnalysisDefaults(slug)

      if (defaults.timeRange !== undefined) {
        expect(validTimeRanges).toContain(defaults.timeRange)
      }
    })
  })

  it('currentView defaults are valid values', () => {
    const analyses = getAvailableAnalyses()
    const validViews = ['chart', 'table', 'map', undefined]

    analyses.forEach((slug) => {
      const defaults = getAnalysisDefaults(slug)

      if (defaults.currentView !== undefined) {
        expect(validViews).toContain(defaults.currentView)
      }
    })
  })

  it('null sector means "All sectors"', () => {
    // Some analyses might use null for sector
    const defaults = getAnalysisDefaults('starters-stoppers')

    // If selectedSector is defined, it should be null or a string
    if (defaults.selectedSector !== undefined) {
      expect(['string', 'object']).toContain(typeof defaults.selectedSector)
    }
  })

  it('faillissementen uses "ALL" for sector instead of null', () => {
    const defaults = getAnalysisDefaults('faillissementen')

    // Special case: faillissementen uses "ALL" instead of null
    expect(defaults.selectedSector).toBe('ALL')
  })
})

describe('Specific analysis defaults', () => {
  describe('gemeentelijke-investeringen', () => {
    it('has perspective default', () => {
      const defaults = getAnalysisDefaults('gemeentelijke-investeringen')

      expect(defaults.selectedPerspective).toBe('BV')
      expect(defaults.selectedReportYear).toBe(2026)
    })
  })

  describe('energiekaart-premies', () => {
    it('has measure default', () => {
      const defaults = getAnalysisDefaults('energiekaart-premies')

      expect(defaults.selectedMeasure).toBe('aantal')
      expect(defaults.currentView).toBe('map')
    })
  })

  describe('starters-stoppers', () => {
    it('has yearly timeRange', () => {
      const defaults = getAnalysisDefaults('starters-stoppers')

      expect(defaults.timeRange).toBe('yearly')
      expect(defaults.selectedSector).toBeNull()
      expect(defaults.stopHorizon).toBeNull()
    })
  })
})
