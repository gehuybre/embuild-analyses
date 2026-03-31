"use client"

import React, { useEffect, useMemo, useState } from 'react'
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
import { SimpleGeoFilter } from "./SimpleGeoFilter"
import { SimpleGeoContext } from "@embuild/shared/components/shared/GeoContext"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { getMunicipalityName } from "./nisUtils"
import {
  createAutoScaledFormatter,
  createYAxisLabel,
  formatScaledTooltipValue,
  formatCurrency as formatFullCurrency,
} from "@embuild/shared/lib/number-formatters"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { fetchInvesteringenJson } from "@embuild/shared/lib/investeringen-data"

interface BVLookups {
  municipalities: Record<string, string>
}

interface IndexedTotalsRecord {
  NIS_code?: string
  Rapportjaar: number
  Totaal: number
  Per_inwoner: number
}

interface IndexedMetadataPeriod {
  source_label: string
  factor: number
}

interface IndexedMetadata {
  price_level_label: string
  midpoint_note: string
  periods: Record<string, IndexedMetadataPeriod>
}

interface InvesteringenBVIndexedSectionProps {
  viewType?: 'chart' | 'table' | 'map'
  metric?: string | null
  municipality?: string | null
}

function validateLookups(data: unknown): BVLookups {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid lookups: expected object')
  }
  const obj = data as Record<string, unknown>
  if (!obj.municipalities || typeof obj.municipalities !== 'object') {
    throw new Error('Invalid lookups: missing municipalities')
  }
  return {
    municipalities: obj.municipalities as Record<string, string>,
  }
}

function validateTotals(data: unknown): IndexedTotalsRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid indexed totals: expected array')
  }
  return data as IndexedTotalsRecord[]
}

function validateMetadata(data: unknown): IndexedMetadata {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid indexed metadata: expected object')
  }
  const obj = data as Record<string, unknown>
  if (typeof obj.price_level_label !== 'string' || typeof obj.midpoint_note !== 'string' || !obj.periods || typeof obj.periods !== 'object') {
    throw new Error('Invalid indexed metadata: missing fields')
  }
  return {
    price_level_label: obj.price_level_label,
    midpoint_note: obj.midpoint_note,
    periods: obj.periods as Record<string, IndexedMetadataPeriod>,
  }
}

export function InvesteringenBVIndexedSection({
  viewType = 'chart',
  metric = null,
  municipality = null,
}: InvesteringenBVIndexedSectionProps = {}) {
  const [lookups, setLookups] = useState<BVLookups | null>(null)
  const [municipalityTotals, setMunicipalityTotals] = useState<IndexedTotalsRecord[]>([])
  const [vlaanderenTotals, setVlaanderenTotals] = useState<IndexedTotalsRecord[]>([])
  const [metadata, setMetadata] = useState<IndexedMetadata | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedMetric, setSelectedMetric] = useState<'Totaal' | 'Per_inwoner'>('Totaal')
  const [currentView, setCurrentView] = useState<'chart' | 'table'>(viewType === 'table' ? 'table' : 'chart')
  const [geoSelection, setGeoSelection] = useState<{
    type: 'all' | 'region' | 'province' | 'arrondissement' | 'municipality'
    code?: string
  }>({ type: 'all' })

  useEffect(() => {
    setCurrentView(viewType === 'table' ? 'table' : 'chart')
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
    let cancelled = false

    async function init() {
      try {
        const [lookupsData, municipalityTotalsData, vlaanderenTotalsData, metadataData] = await Promise.all([
          fetchInvesteringenJson<BVLookups>('/data/bv_lookups.json'),
          fetchInvesteringenJson<IndexedTotalsRecord[]>('/data/bv_indexed_municipality_totals.json'),
          fetchInvesteringenJson<IndexedTotalsRecord[]>('/data/bv_indexed_vlaanderen_totals.json'),
          fetchInvesteringenJson<IndexedMetadata>('/data/bv_indexation_metadata.json'),
        ])

        if (cancelled) return

        setLookups(validateLookups(lookupsData))
        setMunicipalityTotals(validateTotals(municipalityTotalsData))
        setVlaanderenTotals(validateTotals(vlaanderenTotalsData))
        setMetadata(validateMetadata(metadataData))
        setIsLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load indexed BV totals:', err)
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

  const availableMunicipalities = useMemo(() => {
    return lookups ? Object.keys(lookups.municipalities) : []
  }, [lookups])

  const selectedMunicipalityData = useMemo(() => {
    if (geoSelection.type !== 'municipality' || !geoSelection.code) {
      return []
    }
    return municipalityTotals.filter((record) => record.NIS_code === geoSelection.code)
  }, [geoSelection, municipalityTotals])

  const chartData = useMemo(() => {
    const sourceData = geoSelection.type === 'all' ? vlaanderenTotals : selectedMunicipalityData
    return sourceData
      .map((record) => ({
        Rapportjaar: record.Rapportjaar,
        value: record[selectedMetric],
      }))
      .sort((a, b) => a.Rapportjaar - b.Rapportjaar)
  }, [geoSelection, selectedMetric, selectedMunicipalityData, vlaanderenTotals])

  const { formatter: yAxisFormatter, scaleLabel: yAxisScaleLabel, scaleUnit: yAxisScaleUnit } = useMemo(() => {
    const values = chartData.map((record) => record.value)
    return createAutoScaledFormatter(values, true)
  }, [chartData])

  const yAxisLabel = useMemo(() => {
    const baseLabel = selectedMetric === 'Totaal'
      ? 'Geindexeerde totale uitgave'
      : 'Geindexeerde uitgave per inwoner'
    return createYAxisLabel(baseLabel, yAxisScaleLabel, true)
  }, [selectedMetric, yAxisScaleLabel])

  const latestRapportjaar = useMemo(() => {
    return municipalityTotals.reduce((maxYear, record) => Math.max(maxYear, record.Rapportjaar), 0) || 2026
  }, [municipalityTotals])

  const tableData = useMemo(() => {
    const rows = municipalityTotals
      .filter((record) => record.Rapportjaar === latestRapportjaar && record.NIS_code)
      .map((record) => ({
        municipality: getMunicipalityName(record.NIS_code!, lookups?.municipalities),
        total: record[selectedMetric],
        nisCode: record.NIS_code!,
      }))
      .sort((a, b) => b.total - a.total)
      .map((record, index) => ({ ...record, rank: index + 1 }))

    if (geoSelection.type === 'municipality' && geoSelection.code) {
      const selectedIndex = rows.findIndex((record) => record.nisCode === geoSelection.code)
      if (selectedIndex !== -1) {
        const windowSize = 20
        const halfWindow = 9

        let startIndex = Math.max(0, selectedIndex - halfWindow)
        let endIndex = startIndex + windowSize

        if (endIndex > rows.length) {
          endIndex = rows.length
          startIndex = Math.max(0, endIndex - windowSize)
        }

        return rows.slice(startIndex, endIndex)
      }
    }

    return rows.slice(0, 20)
  }, [geoSelection, latestRapportjaar, lookups?.municipalities, municipalityTotals, selectedMetric])

  const methodologyText = useMemo(() => {
    if (!metadata) return ''
    const period2014 = metadata.periods['2014']
    const period2020 = metadata.periods['2020']
    return `Geindexeerd naar prijspeil ${metadata.price_level_label}. 2014 gebruikt ${period2014?.source_label ?? 'januari 2017'} als referentie, 2020 gebruikt ${period2020?.source_label ?? 'januari 2023'}.`
  }, [metadata])

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

  if (isLoading || !lookups || !metadata) {
    return (
      <Card>
        <CardContent className="h-64 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground italic">Laden van geindexeerde investeringsbedragen...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <SimpleGeoContext.Provider value={{ selection: geoSelection, setSelection: setGeoSelection }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Geindexeerde investeringsbedragen</CardTitle>
            <ExportButtons
              title="Geindexeerde investeringsbedragen"
              slug="gemeentelijke-investeringen"
              sectionId="investments-bv-indexed"
              viewType={currentView}
              embedParams={{
                metric: selectedMetric === 'Per_inwoner' ? 'per_capita' : 'total',
                municipality: geoSelection.type === 'municipality' ? geoSelection.code : null,
              }}
              data={tableData.map((row) => ({ label: row.municipality, value: row.total }))}
              valueLabel={selectedMetric === 'Totaal' ? 'Geindexeerde totale uitgave' : 'Geindexeerde uitgave per inwoner'}
              dataSource="Statbel CPI + ABB meerjarenplannen"
              dataSourceUrl="https://statbel.fgov.be/sites/default/files/files/opendata/Consumptieprijsindex%20en%20gezondheidsindex/CPI%20All%20base%20years.zip"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Totale investeringen voor Vlaamse gemeenten, zonder opsplitsing per beleidsdomein.
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
              <SimpleGeoFilter
                availableMunicipalities={availableMunicipalities}
                municipalityLookup={lookups.municipalities}
              />
            </div>

            <div className="bg-muted/50 p-3 rounded border text-sm space-y-1">
              <p>{methodologyText}</p>
              <p className="text-muted-foreground">{metadata.midpoint_note}</p>
            </div>

            <Tabs value={currentView} onValueChange={(value) => setCurrentView(value as 'chart' | 'table')} className="w-full">
              <TabsList>
                <TabsTrigger value="chart">Grafiek</TabsTrigger>
                <TabsTrigger value="table">Tabel</TabsTrigger>
              </TabsList>

              <TabsContent value="chart" className="mt-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium ml-16">
                    {yAxisLabel.text}
                    <span className="font-bold">{yAxisLabel.boldText}</span>
                  </div>
                  <div className="w-full h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="Rapportjaar" />
                        <YAxis tickFormatter={yAxisFormatter} />
                        <Tooltip
                          formatter={(value) => {
                            if (typeof value !== 'number') return ''
                            return formatScaledTooltipValue(value, yAxisFormatter, yAxisScaleUnit)
                          }}
                          labelFormatter={(label) => `Rapportjaar ${label}`}
                        />
                        <Bar
                          dataKey="value"
                          fill={CHART_SERIES_COLORS[0]}
                          name={selectedMetric === 'Totaal' ? 'Geindexeerde totale uitgave' : 'Geindexeerde uitgave per inwoner'}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {geoSelection.type === 'all'
                    ? selectedMetric === 'Totaal'
                      ? `Som van alle gemeenten, prijspeil ${metadata.price_level_label}`
                      : `Gemiddelde over alle gemeenten, prijspeil ${metadata.price_level_label}`
                    : `Geselecteerde gemeente, prijspeil ${metadata.price_level_label}`
                  }
                </p>
              </TabsContent>

              <TabsContent value="table" className="mt-4">
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left font-medium w-16">Rank</th>
                        <th className="p-2 text-left font-medium">Gemeente</th>
                        <th className="p-2 text-right font-medium">
                          {selectedMetric === 'Totaal' ? 'Geindexeerd totaal' : 'Geindexeerd per inwoner'}
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
                        tableData.map((row) => {
                          const isSelected = geoSelection.type === 'municipality' && geoSelection.code === row.nisCode
                          return (
                            <tr key={row.nisCode} className={`border-b ${isSelected ? 'bg-primary/10 font-semibold' : ''}`}>
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
                    ? `Top 20 gemeenten (inclusief geselecteerde gemeente, rapportjaar ${latestRapportjaar})`
                    : `Top 20 gemeenten (rapportjaar ${latestRapportjaar})`}
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </SimpleGeoContext.Provider>
  )
}
