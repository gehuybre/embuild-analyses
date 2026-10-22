"use client"

import React, { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Button } from "@embuild/shared/components/ui/button"
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { formatCurrency } from "@embuild/shared/lib/number-formatters"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { getMunicipalityName } from "./nisUtils"
import { BV_OTHER_DOMAIN_LABEL, normalizeBvDomainLabel, stripPrefix } from "./labelUtils"
import { SimpleGeoFilter } from "./SimpleGeoFilter"
import { SimpleGeoContext } from "@embuild/shared/components/shared/GeoContext"
import { fetchInvesteringenJson } from "@embuild/shared/lib/investeringen-data"

interface BVLookups {
  domains: Array<{ BV_domein: string }>
  subdomeins: Array<{ BV_domein: string; BV_subdomein: string }>
  beleidsvelds: Array<{ BV_subdomein: string; Beleidsveld: string }>
  municipalities: Record<string, string>
}

interface BVDomainMunicipalitySummaryRecord {
  NIS_code: string
  Rapportjaar: number
  BV_domein: string
  Totaal: number
  Per_inwoner: number
}

interface BVDomainAllSummaryRecord {
  Rapportjaar: number
  BV_domein: string
  Totaal: number
  Per_inwoner: number
}

interface SelectedMunicipalitySummaryState {
  code: string
  records: BVDomainMunicipalitySummaryRecord[]
}

function validateLookups(data: unknown): BVLookups {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid lookups: expected object')
  }
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.domains) || !Array.isArray(obj.subdomeins) ||
    !Array.isArray(obj.beleidsvelds) || typeof obj.municipalities !== 'object') {
    throw new Error('Invalid lookups: missing or invalid fields')
  }
  return obj as unknown as BVLookups
}

function validateDomainSummaryData(data: unknown): BVDomainMunicipalitySummaryRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid BV domain summary: expected array')
  }
  return data as BVDomainMunicipalitySummaryRecord[]
}

function validateDomainAllSummaryData(data: unknown): BVDomainAllSummaryRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid BV aggregate summary: expected array')
  }
  return data as BVDomainAllSummaryRecord[]
}

async function loadMunicipalitySummary(nisCode: string): Promise<BVDomainMunicipalitySummaryRecord[]> {
  try {
    return validateDomainSummaryData(
      await fetchInvesteringenJson<BVDomainMunicipalitySummaryRecord[]>(
        `/data/bv_domain_municipality/${nisCode}.json`
      )
    )
  } catch (error) {
    console.warn(`Falling back to BV full municipality summary for ${nisCode}:`, error)
    return validateDomainSummaryData(
      await fetchInvesteringenJson<BVDomainMunicipalitySummaryRecord[]>(
        '/data/bv_domain_municipality_summary.json'
      )
    ).filter((record) => record.NIS_code === nisCode)
  }
}

const BV_DOMAIN_COLOR_ORDER = [
  BV_OTHER_DOMAIN_LABEL,
  "Veiligheidszorg",
  "Zich verplaatsen en mobiliteit",
  "Natuur en milieubeheer",
  "Ondernemen en werken",
  "Leren en onderwijs",
  "Zorg en opvang",
  "Wonen en ruimtelijke ordening",
  "Cultuur en vrije tijd",
]

function getBvDomainColor(label: string): string {
  const index = BV_DOMAIN_COLOR_ORDER.indexOf(label)
  if (index === -1) return CHART_SERIES_COLORS[0]
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]
}

interface DomainData {
  label: string
  value: number
  count: number
  subdomainLabels: string[]
}

export function InvesteringenBVCategorySection() {
  const [lookups, setLookups] = useState<BVLookups | null>(null)
  const [aggregateSummary, setAggregateSummary] = useState<BVDomainAllSummaryRecord[]>([])
  const [selectedMunicipalitySummary, setSelectedMunicipalitySummary] = useState<SelectedMunicipalitySummaryState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [geoSelection, setGeoSelection] = useState<{
    type: 'all' | 'region' | 'province' | 'arrondissement' | 'municipality'
    code?: string
  }>({ type: 'all' })
  const [selectedMetric, setSelectedMetric] = useState<'Totaal' | 'Per_inwoner'>('Totaal')
  const [selectedYear, setSelectedYear] = useState<number>(2026)
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [lookupsData, aggregateSummaryData] = await Promise.all([
          fetchInvesteringenJson<BVLookups>('/data/bv_lookups.json'),
          fetchInvesteringenJson<BVDomainAllSummaryRecord[]>(
            '/data/bv_domain_all_summary.json'
          ),
        ])

        if (cancelled) return

        setLookups(validateLookups(lookupsData))
        setAggregateSummary(validateDomainAllSummaryData(aggregateSummaryData))
        setIsLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load BV aggregate summary:', err)
          setError(err instanceof Error ? err.message : 'Fout bij het laden van de data')
          setIsLoading(false)
        }
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (geoSelection.type !== 'municipality' || !geoSelection.code) {
      return
    }
    if (selectedMunicipalitySummary?.code === geoSelection.code) {
      return
    }

    let cancelled = false
    setIsDetailLoading(true)

    loadMunicipalitySummary(geoSelection.code)
      .then((data) => {
        if (cancelled) return
        setSelectedMunicipalitySummary({
          code: geoSelection.code!,
          records: validateDomainSummaryData(data),
        })
        setIsDetailLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load BV municipality detail:', err)
          setError(err instanceof Error ? err.message : 'Fout bij het laden van de data')
          setIsDetailLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [geoSelection, selectedMunicipalitySummary])

  const availableMunicipalities = useMemo(() => {
    return lookups ? Object.keys(lookups.municipalities) : []
  }, [lookups])

  const subdomainLabelsByDomain = useMemo(() => {
    if (!lookups) return new Map<string, string[]>()

    const labelsByDomain = new Map<string, Set<string>>()
    lookups.subdomeins.forEach((entry) => {
      const domain = normalizeBvDomainLabel(entry.BV_domein)
      if (!labelsByDomain.has(domain)) {
        labelsByDomain.set(domain, new Set())
      }
      labelsByDomain.get(domain)?.add(stripPrefix(entry.BV_subdomein))
    })

    return new Map(
      Array.from(labelsByDomain.entries()).map(([domain, labels]) => [
        domain,
        Array.from(labels).sort(),
      ])
    )
  }, [lookups])

  const categoryData = useMemo(() => {
    if (!lookups) return []

    if (geoSelection.type === 'municipality' && geoSelection.code) {
      if (selectedMunicipalitySummary?.code !== geoSelection.code) return []

      const byDomain: Record<string, { label: string; value: number }> = {}

      selectedMunicipalitySummary.records
        .filter((record) => record.Rapportjaar === selectedYear && record.NIS_code === geoSelection.code)
        .forEach((record) => {
          const domain = normalizeBvDomainLabel(record.BV_domein)
          if (!byDomain[domain]) {
            byDomain[domain] = { label: domain, value: 0 }
          }
          byDomain[domain].value += record[selectedMetric]
        })

      return Object.values(byDomain)
        .map((domain) => ({
          label: domain.label,
          value: domain.value,
          count: 1,
          subdomainLabels: subdomainLabelsByDomain.get(domain.label) ?? [],
        }))
        .sort((a, b) => b.value - a.value) as DomainData[]
    }

    const byDomain: Record<string, { label: string; value: number }> = {}

    aggregateSummary
      .filter((record) => record.Rapportjaar === selectedYear && record.BV_domein !== '__all__')
      .forEach((record) => {
        const label = normalizeBvDomainLabel(record.BV_domein)
        if (!byDomain[label]) {
          byDomain[label] = { label, value: 0 }
        }
        byDomain[label].value += record[selectedMetric]
      })

    return Object.values(byDomain)
      .map((domain) => ({
        label: domain.label,
        value: domain.value,
        count: 1,
        subdomainLabels: subdomainLabelsByDomain.get(domain.label) ?? [],
      }))
      .sort((a, b) => b.value - a.value) as DomainData[]
  }, [lookups, aggregateSummary, selectedMunicipalitySummary, selectedYear, geoSelection, selectedMetric, subdomainLabelsByDomain])

  const maxValue = useMemo(() => {
    if (!lookups) return 1

    if (geoSelection.type === 'municipality' && geoSelection.code) {
      if (selectedMunicipalitySummary?.code !== geoSelection.code) return 1

      const years = [2014, 2020, 2026]
      let globalMax = 1

      years.forEach((year) => {
        const byDomain: Record<string, number> = {}

        selectedMunicipalitySummary.records
          .filter((record) => record.Rapportjaar === year && record.NIS_code === geoSelection.code)
          .forEach((record) => {
            const label = normalizeBvDomainLabel(record.BV_domein)
            byDomain[label] = (byDomain[label] || 0) + record[selectedMetric]
          })

        const yearMax = Math.max(...Object.values(byDomain), 1)
        globalMax = Math.max(globalMax, yearMax)
      })
      return globalMax
    }

    const years = [2014, 2020, 2026]
    let globalMax = 1

    years.forEach((year) => {
      const byDomain: Record<string, number> = {}

      aggregateSummary
        .filter((record) => record.Rapportjaar === year && record.BV_domein !== '__all__')
        .forEach((record) => {
          const label = normalizeBvDomainLabel(record.BV_domein)
          byDomain[label] = (byDomain[label] || 0) + record[selectedMetric]
        })

      const yearMax = Math.max(...Object.values(byDomain), 1)
      globalMax = Math.max(globalMax, yearMax)
    })

    return globalMax
  }, [lookups, aggregateSummary, selectedMunicipalitySummary, geoSelection, selectedMetric])

  if (error) {
    return (
      <Card>
        <CardContent className="h-64 flex flex-col items-center justify-center space-y-4">
          <p className="text-sm text-destructive font-medium">Fout bij het laden van de data</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button onClick={() => window.location.reload()} size="sm">
            Opnieuw proberen
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isLoading || !lookups) {
    return (
      <Card>
        <CardContent className="h-64 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground italic">Laden van BV-categorieën...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <SimpleGeoContext.Provider value={{ selection: geoSelection, setSelection: setGeoSelection }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Verdeling per beleidsdomein</CardTitle>
            <div className="flex items-center gap-4">
              <ExportButtons
                title="Verdeling per beleidsdomein"
                slug="gemeentelijke-investeringen"
                sectionId="bv-category-breakdown"
                viewType="table"
                data={categoryData.map((domain) => ({ label: domain.label, value: domain.value }))}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Investeringen per beleidsdomein. Klik op een domein om te zien welke subdomeinen het bevat.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-2">
                <Button
                  variant={selectedMetric === 'Totaal' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedMetric('Totaal')}
                  className="h-9"
                >
                  Totaal
                </Button>
                <Button
                  variant={selectedMetric === 'Per_inwoner' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedMetric('Per_inwoner')}
                  className="h-9"
                >
                  Per inwoner
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedYear === 2014 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedYear(2014)}
                  className="h-9"
                >
                  2014
                </Button>
                <Button
                  variant={selectedYear === 2020 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedYear(2020)}
                  className="h-9"
                >
                  2020
                </Button>
                <Button
                  variant={selectedYear === 2026 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedYear(2026)}
                  className="h-9"
                >
                  2026
                </Button>
              </div>
              <SimpleGeoFilter
                availableMunicipalities={availableMunicipalities}
                municipalityLookup={lookups?.municipalities}
              />
            </div>

            <div className="space-y-3">
              {geoSelection.type === 'municipality' && selectedMunicipalitySummary?.code !== geoSelection.code ? (
                <div className="p-8 text-center text-muted-foreground italic space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                  <p>{isDetailLoading ? 'Laden van gemeentelijke detaildata...' : 'Detaildata wordt voorbereid...'}</p>
                </div>
              ) : categoryData.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground italic">
                  Geen data beschikbaar voor deze selectie.
                </div>
              ) : (
                categoryData.map((domain, index) => {
                  const isExpanded = expandedDomains.has(domain.label)
                  const domainColor = getBvDomainColor(domain.label)
                  const toggleExpand = () => {
                    const newExpanded = new Set(expandedDomains)
                    if (isExpanded) {
                      newExpanded.delete(domain.label)
                    } else {
                      newExpanded.add(domain.label)
                    }
                    setExpandedDomains(newExpanded)
                  }

                  return (
                    <div key={domain.label} className="border rounded-lg p-3 space-y-2">
                      <button
                        type="button"
                        onClick={toggleExpand}
                        className="w-full text-left hover:bg-muted/50 transition-colors p-2 -m-2 rounded"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            <div className="w-5">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                            <span className="font-medium text-sm">
                              {index + 1}. {domain.label}
                            </span>
                          </div>
                          <span className="font-bold text-sm">
                            {selectedMetric === 'Totaal'
                              ? formatCurrency(domain.value)
                              : `€ ${domain.value.toFixed(2)}`
                            }
                          </span>
                        </div>
                      </button>

                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(domain.value / maxValue) * 100}%`,
                            backgroundColor: domainColor,
                          }}
                        />
                      </div>

                      {isExpanded && domain.subdomainLabels.length > 0 && (
                        <div className="mt-2 pt-2 border-t text-sm text-muted-foreground">
                          <p>
                            <span className="font-semibold text-foreground">Subdomeinen:</span> {domain.subdomainLabels.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <p className="text-sm text-muted-foreground mt-4">
              {geoSelection.type === 'municipality' && geoSelection.code
                ? `Investeringen voor ${getMunicipalityName(geoSelection.code, lookups?.municipalities)} in ${selectedYear}`
                : `Totale investeringen over alle gemeenten in ${selectedYear}`
              }
            </p>
          </div>
        </CardContent>
      </Card>
    </SimpleGeoContext.Provider>
  )
}
