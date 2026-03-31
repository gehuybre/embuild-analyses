"use client"

import React, { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { Button } from "@embuild/shared/components/ui/button"
import { Loader2 } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { InvesteringenMap } from "./InvesteringenMap"
import { SimpleGeoFilter } from "./SimpleGeoFilter"
import { SimpleGeoContext } from "@embuild/shared/components/shared/GeoContext"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { HierarchicalFilter } from "@embuild/shared/components/shared/HierarchicalFilter"
import { getMunicipalityName } from "./nisUtils"
import { normalizeBvDomainLabel, stripPrefix } from "./labelUtils"
import {
  createAutoScaledFormatter,
  createYAxisLabel,
  formatScaledTooltipValue,
  formatCurrency as formatFullCurrency,
} from "@embuild/shared/lib/number-formatters"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
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

type BVSectionViewType = 'chart' | 'table' | 'map'

interface InvesteringenBVSectionProps {
  viewType?: BVSectionViewType
  metric?: string | null
  municipality?: string | null
  domain?: string | null
}

function validateLookups(data: unknown): BVLookups {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid lookups: expected object')
  }
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.domains) || !Array.isArray(obj.subdomeins) ||
    !Array.isArray(obj.beleidsvelds) || !obj.municipalities || typeof obj.municipalities !== 'object') {
    throw new Error('Invalid lookups: missing or invalid fields')
  }
  // More explicit structure validation
  return {
    domains: obj.domains as Array<{ BV_domein: string }>,
    subdomeins: obj.subdomeins as Array<{ BV_domein: string; BV_subdomein: string }>,
    beleidsvelds: obj.beleidsvelds as Array<{ BV_subdomein: string; Beleidsveld: string }>,
    municipalities: obj.municipalities as Record<string, string>
  }
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

export function InvesteringenBVSection({
  viewType = 'chart',
  metric = null,
  municipality = null,
  domain = null,
}: InvesteringenBVSectionProps = {}) {
  const [lookups, setLookups] = useState<BVLookups | null>(null)
  const [aggregateSummary, setAggregateSummary] = useState<BVDomainAllSummaryRecord[]>([])
  const [allMunicipalitySummary, setAllMunicipalitySummary] = useState<BVDomainMunicipalitySummaryRecord[] | null>(null)
  const [selectedMunicipalitySummary, setSelectedMunicipalitySummary] = useState<SelectedMunicipalitySummaryState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAllMunicipalityDetailLoading, setIsAllMunicipalityDetailLoading] = useState(false)
  const [isSelectedMunicipalityLoading, setIsSelectedMunicipalityLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedDomain, setSelectedDomain] = useState<string>('')
  const [selectedMetric, setSelectedMetric] = useState<'Totaal' | 'Per_inwoner'>('Totaal')
  const [currentView, setCurrentView] = useState<BVSectionViewType>(viewType)
  const [geoSelection, setGeoSelection] = useState<{
    type: 'all' | 'region' | 'province' | 'arrondissement' | 'municipality'
    code?: string
  }>({ type: 'all' })

  useEffect(() => {
    setCurrentView(viewType)
  }, [viewType])

  useEffect(() => {
    if (metric === 'per_capita') {
      setSelectedMetric('Per_inwoner')
    } else if (metric === 'total') {
      setSelectedMetric('Totaal')
    }
  }, [metric])

  useEffect(() => {
    if (municipality) {
      setGeoSelection({ type: 'municipality', code: municipality })
    } else {
      setGeoSelection({ type: 'all' })
    }
  }, [municipality])

  useEffect(() => {
    if (domain !== null) {
      setSelectedDomain(domain)
    }
  }, [domain])

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

  const needsAllMunicipalityDetail = currentView !== 'chart'

  useEffect(() => {
    if (!needsAllMunicipalityDetail || allMunicipalitySummary !== null) {
      return
    }

    let cancelled = false
    setIsAllMunicipalityDetailLoading(true)

    fetchInvesteringenJson<BVDomainMunicipalitySummaryRecord[]>(
      '/data/bv_domain_municipality_summary.json'
    )
      .then((data) => {
        if (cancelled) return
        setAllMunicipalitySummary(validateDomainSummaryData(data))
        setIsAllMunicipalityDetailLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load BV municipality summary:', err)
          setError(err instanceof Error ? err.message : 'Fout bij het laden van de data')
          setIsAllMunicipalityDetailLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [needsAllMunicipalityDetail, allMunicipalitySummary])

  useEffect(() => {
    if (geoSelection.type !== 'municipality' || !geoSelection.code || allMunicipalitySummary !== null) {
      return
    }
    if (selectedMunicipalitySummary?.code === geoSelection.code) {
      return
    }

    let cancelled = false
    setIsSelectedMunicipalityLoading(true)

    loadMunicipalitySummary(geoSelection.code)
      .then((data) => {
        if (cancelled) return
        setSelectedMunicipalitySummary({
          code: geoSelection.code!,
          records: validateDomainSummaryData(data),
        })
        setIsSelectedMunicipalityLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load BV municipality detail:', err)
          setError(err instanceof Error ? err.message : 'Fout bij het laden van de data')
          setIsSelectedMunicipalityLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [allMunicipalitySummary, geoSelection, selectedMunicipalitySummary])

  // Get available options based on selections (with prefixes stripped)
  const domainOptions = useMemo(() => {
    if (!lookups) return []
    return Array.from(new Set(lookups.domains.map(d => normalizeBvDomainLabel(d.BV_domein)))).sort()
  }, [lookups])

  // Get subdomains for the selected domain
  const selectedDomainSubdomains = useMemo(() => {
    if (!lookups || !selectedDomain) return []
    const labels = lookups.subdomeins
      .filter(s => normalizeBvDomainLabel(s.BV_domein) === selectedDomain)
      .map(s => stripPrefix(s.BV_subdomein))
      .sort()
    return Array.from(new Set(labels))
  }, [lookups, selectedDomain])

  // Filter data based on BV selections (without geo filter)
  // Match by stripped labels since user sees stripped versions
  const dataWithoutGeoFilter = useMemo(() => {
    let data = allMunicipalitySummary ?? []

    if (selectedDomain) {
      data = data.filter(d => normalizeBvDomainLabel(d.BV_domein) === selectedDomain)
    }

    return data
  }, [allMunicipalitySummary, selectedDomain])

  // Filter data based on selections (including geo filter)
  const filteredData = useMemo(() => {
    if (geoSelection.type !== 'municipality' || !geoSelection.code) {
      return dataWithoutGeoFilter
    }

    return dataWithoutGeoFilter.filter((record) => record.NIS_code === geoSelection.code)
  }, [dataWithoutGeoFilter, geoSelection])

  const selectedMunicipalityChartData = useMemo(() => {
    if (geoSelection.type !== 'municipality' || !geoSelection.code) {
      return []
    }

    const sourceData = allMunicipalitySummary !== null
      ? allMunicipalitySummary.filter((record) => record.NIS_code === geoSelection.code)
      : selectedMunicipalitySummary?.code === geoSelection.code
        ? selectedMunicipalitySummary.records
        : []

    if (!selectedDomain) {
      return sourceData
    }

    return sourceData.filter((record) => normalizeBvDomainLabel(record.BV_domein) === selectedDomain)
  }, [allMunicipalitySummary, geoSelection, selectedDomain, selectedMunicipalitySummary])

  // Chart data: Vlaanderen totals or municipality average
  const chartData = useMemo(() => {
    if (geoSelection.type === 'all') {
      const summaryDomain = selectedDomain || '__all__'
      const byYear: Record<number, { Rapportjaar: number; value: number }> = {}

      // Normalized labels such as "Andere" can combine multiple raw BV domeinen.
      aggregateSummary
        .filter((record) => (
          summaryDomain === '__all__'
            ? record.BV_domein === '__all__'
            : normalizeBvDomainLabel(record.BV_domein) === summaryDomain
        ))
        .forEach((record) => {
          if (!byYear[record.Rapportjaar]) {
            byYear[record.Rapportjaar] = { Rapportjaar: record.Rapportjaar, value: 0 }
          }
          byYear[record.Rapportjaar].value += record[selectedMetric]
        })

      return Object.values(byYear).sort((a, b) => a.Rapportjaar - b.Rapportjaar)
    }

    if (selectedMunicipalityChartData.length === 0) {
      return []
    }

    const byYear: Record<number, { Rapportjaar: number; value: number }> = {}

    selectedMunicipalityChartData.forEach(record => {
      if (!byYear[record.Rapportjaar]) {
        byYear[record.Rapportjaar] = { Rapportjaar: record.Rapportjaar, value: 0 }
      }
      byYear[record.Rapportjaar].value += record[selectedMetric]
    })

    return Object.values(byYear).sort((a, b) => a.Rapportjaar - b.Rapportjaar)
  }, [aggregateSummary, geoSelection, selectedDomain, selectedMetric, selectedMunicipalityChartData])

  // Auto-scale formatter for Y-axis to prevent label overflow
  const { formatter: yAxisFormatter, scaleLabel: yAxisScaleLabel, scaleUnit: yAxisScaleUnit } = useMemo(() => {
    const values = chartData.map(d => d.value)
    return createAutoScaledFormatter(values, true) // true = currency
  }, [chartData])

  // Y-axis label
  const yAxisLabel = useMemo(() => {
    const baseLabel = selectedMetric === 'Totaal' ? 'Totale uitgave' : 'Uitgave per inwoner'
    return createYAxisLabel(baseLabel, yAxisScaleLabel, true)
  }, [selectedMetric, yAxisScaleLabel])

  // Table data: By municipality with context window for selected municipality
  const tableData = useMemo(() => {
    if (allMunicipalitySummary === null) {
      return []
    }

    const byMuni: Record<string, { municipality: string; total: number; count: number; nisCode: string }> = {}

    // Use dataWithoutGeoFilter to get all municipalities for ranking
    dataWithoutGeoFilter.forEach(record => {
      // Show latest year for table
      if (record.Rapportjaar !== 2026) return

      if (!byMuni[record.NIS_code]) {
        byMuni[record.NIS_code] = {
          municipality: getMunicipalityName(record.NIS_code, lookups?.municipalities),
          total: 0,
          count: 0,
          nisCode: record.NIS_code
        }
      }
      byMuni[record.NIS_code].total += record[selectedMetric]
      byMuni[record.NIS_code].count += 1
    })

    // Sort all municipalities by total (high to low) and assign ranks
    const allMunicipalities = Object.values(byMuni)
      .sort((a, b) => b.total - a.total)
      .map((m, index) => ({ ...m, rank: index + 1 }))

    // If a specific municipality is selected, show it with 19 others around it
    if (geoSelection.type === 'municipality' && geoSelection.code) {
      const selectedIndex = allMunicipalities.findIndex(
        m => m.nisCode === geoSelection.code
      )

      if (selectedIndex !== -1) {
        // Calculate window: show selected + 9 above + 10 below (or adjust if at edges)
        const windowSize = 20
        const halfWindow = 9 // municipalities above selected

        let startIndex = Math.max(0, selectedIndex - halfWindow)
        let endIndex = startIndex + windowSize

        // Adjust if we're near the end
        if (endIndex > allMunicipalities.length) {
          endIndex = allMunicipalities.length
          startIndex = Math.max(0, endIndex - windowSize)
        }

        return allMunicipalities.slice(startIndex, endIndex)
      }
    }

    // Default: show top 20 municipalities
    return allMunicipalities.slice(0, 20)
  }, [allMunicipalitySummary, dataWithoutGeoFilter, selectedMetric, geoSelection, lookups?.municipalities])

  // Map data: Latest rapportjaar (2026)
  const mapData = useMemo(() => {
    if (allMunicipalitySummary === null) {
      return []
    }

    const latestYear = 2026
    const byMuni: Record<string, { municipalityCode: string; value: number }> = {}

    filteredData
      .filter(d => d.Rapportjaar === latestYear)
      .forEach(record => {
        if (!byMuni[record.NIS_code]) {
          byMuni[record.NIS_code] = { municipalityCode: record.NIS_code, value: 0 }
        }
        byMuni[record.NIS_code].value += record[selectedMetric]
      })

    return Object.values(byMuni)
  }, [allMunicipalitySummary, filteredData, selectedMetric])

  // Get available municipalities from the filtered data (without geo filter)
  const availableMunicipalities = useMemo(() => {
    return lookups ? Object.keys(lookups.municipalities) : []
  }, [lookups])

  const isChartMunicipalityLoading = geoSelection.type === 'municipality' &&
    selectedMunicipalityChartData.length === 0 &&
    (isSelectedMunicipalityLoading || selectedMunicipalitySummary?.code !== geoSelection.code)

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
          <p className="text-sm text-muted-foreground italic">Laden van investeringen per beleidsdomein...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <SimpleGeoContext.Provider value={{ selection: geoSelection, setSelection: setGeoSelection }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Investeringen per beleidsdomein</CardTitle>
            <div className="flex items-center gap-4">
              <ExportButtons
                title="Investeringen per beleidsdomein"
                slug="gemeentelijke-investeringen"
                sectionId="investments-bv"
                viewType={currentView}
                embedParams={{
                  metric: selectedMetric === 'Per_inwoner' ? 'per_capita' : 'total',
                  municipality: geoSelection.type === 'municipality' ? geoSelection.code : null,
                  domain: selectedDomain || null,
                }}
                data={tableData.map(d => ({ label: d.municipality, value: d.total }))}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Filter op beleidsdomein om de investeringen per gemeente te bekijken.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
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
              <SimpleGeoFilter
                availableMunicipalities={availableMunicipalities}
                municipalityLookup={lookups?.municipalities}
              />
              <HierarchicalFilter
                value={selectedDomain}
                onChange={setSelectedDomain}
                options={domainOptions}
                placeholder="Selecteer domein"
              />
            </div>

            {selectedDomain && selectedDomainSubdomains.length > 0 && (
              <div className="bg-muted/50 p-3 rounded border text-sm">
                <p>
                  <span className="font-semibold">Dit domein bevat:</span> {selectedDomainSubdomains.join(', ')}
                </p>
              </div>
            )}

            <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as 'chart' | 'table' | 'map')} className="w-full">
              <TabsList>
                <TabsTrigger value="chart">Grafiek</TabsTrigger>
                <TabsTrigger value="table">Tabel</TabsTrigger>
                <TabsTrigger value="map">Kaart</TabsTrigger>
              </TabsList>

              <TabsContent value="chart" className="mt-4">
                {isChartMunicipalityLoading ? (
                  <div className="h-[400px] flex flex-col items-center justify-center space-y-4 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm italic">
                      {isSelectedMunicipalityLoading ? 'Laden van gemeentelijke detaildata...' : 'Detaildata wordt voorbereid...'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="text-sm font-medium ml-16">
                        {yAxisLabel.text}
                        <span className="font-bold">
                          {yAxisLabel.boldText}
                        </span>
                      </div>
                      <div className="w-full h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="Rapportjaar" />
                            <YAxis
                              tickFormatter={yAxisFormatter}
                            />
                            <Tooltip
                              formatter={(value) => {
                                if (typeof value !== 'number') return ''
                                return formatScaledTooltipValue(value, yAxisFormatter, yAxisScaleUnit)
                              }}
                              labelFormatter={(label) => `Rapportjaar ${label}`}
                            />
                            <Bar dataKey="value" fill={CHART_SERIES_COLORS[0]} name={selectedMetric === 'Totaal' ? 'Totaal' : 'Gemiddelde per inwoner'} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {geoSelection.type === 'all'
                        ? selectedMetric === 'Totaal'
                          ? 'Som van alle gemeenten'
                          : 'Gemiddelde over alle gemeenten'
                        : 'Geselecteerde regio/provincie/gemeente'
                      }
                    </p>
                  </>
                )}
              </TabsContent>

              <TabsContent value="table" className="mt-4">
                {allMunicipalitySummary === null ? (
                  <div className="h-48 flex flex-col items-center justify-center space-y-4 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm italic">
                      {isAllMunicipalityDetailLoading ? 'Laden van gemeentelijke detaildata...' : 'Detaildata wordt voorbereid...'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="p-2 text-left font-medium w-16">Rank</th>
                            <th className="p-2 text-left font-medium">Gemeente</th>
                            <th className="p-2 text-right font-medium">
                              {selectedMetric === 'Totaal' ? 'Totaal' : 'Per inwoner'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableData.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="p-4 text-center text-muted-foreground italic">
                                Geen data beschikbaar voor deze selectie.
                              </td>
                            </tr>
                          ) : (
                            tableData.map((row, i) => {
                              const isSelected = geoSelection.type === 'municipality' && geoSelection.code === row.nisCode
                              return (
                                <tr key={i} className={`border-b ${isSelected ? 'bg-primary/10 font-semibold' : ''}`}>
                                  <td className="p-2 text-center text-muted-foreground">{row.rank}</td>
                                  <td className="p-2">{row.municipality}</td>
                                  <td className="p-2 text-right">
                                    {selectedMetric === 'Totaal'
                                      ? formatFullCurrency(row.total)
                                      : `€ ${row.total.toFixed(2)}`
                                    }
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {geoSelection.type === 'municipality' && geoSelection.code
                        ? 'Top 20 gemeenten (inclusief geselecteerde gemeente, rapportjaar 2026)'
                        : 'Top 20 gemeenten (rapportjaar 2026)'}
                    </p>
                  </>
                )}
              </TabsContent>

              <TabsContent value="map" className="mt-4">
                {allMunicipalitySummary === null ? (
                  <div className="h-[400px] flex flex-col items-center justify-center space-y-4 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm italic">
                      {isAllMunicipalityDetailLoading ? 'Laden van gemeentelijke detaildata...' : 'Detaildata wordt voorbereid...'}
                    </p>
                  </div>
                ) : (
                  <>
                    <InvesteringenMap
                      data={mapData.map(d => ({
                        value: d.value,
                        municipality: getMunicipalityName(d.municipalityCode, lookups?.municipalities),
                        nis_code: d.municipalityCode
                      }))}
                      selectedMetric={selectedMetric === 'Totaal' ? 'total' : 'per_capita'}
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      Rapportjaar 2026 - {selectedMetric === 'Totaal' ? 'Totale uitgave' : 'Uitgave per inwoner'}
                    </p>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </SimpleGeoContext.Provider>
  )
}
