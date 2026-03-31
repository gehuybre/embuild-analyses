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
import { stripPrefix } from "./labelUtils"
import {
  createAutoScaledFormatter,
  createYAxisLabel,
  formatScaledTooltipValue,
  formatCurrency as formatFullCurrency,
} from "@embuild/shared/lib/number-formatters"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { fetchInvesteringenJson } from "@embuild/shared/lib/investeringen-data"
import { normalizeNisCode, getFusionInfo, getConstituents } from "@embuild/shared/lib/nis-fusion-utils"

interface BVLookups {
  domains: Array<{ BV_domein: string }>
  subdomeins: Array<{ BV_domein: string; BV_subdomein: string }>
  beleidsvelds: Array<{ BV_subdomein: string; Beleidsveld: string }>
  municipalities: Record<string, string>
}

interface BVTopFieldRecord {
  NIS_code: string
  Rapportjaar: number
  Beleidsveld: string
  Totaal: number
  Per_inwoner: number
}

type TopFieldsViewType = 'chart' | 'table' | 'map'

interface InvesteringenBVTopFieldsSectionProps {
  viewType?: TopFieldsViewType
  metric?: string | null
  municipality?: string | null
  field?: string | null
}

// Top 9 policy fields by total investment (all years combined)
const TOP_FIELDS = [
  '0200 Wegen',
  '0119 Overige algemene diensten',
  '0310 Beheer van regen- en afvalwater',
  '0953 Woon- en zorgcentra',
  '0610 Gebiedsontwikkeling',
  '0800 Gewoon basisonderwijs',
  '0742 Sportinfrastructuur',
  '0740 Sportsector- en verenigingsondersteuning',
  '0410 Brandweer',
]

// Runtime validation helpers
function validateLookups(data: unknown): BVLookups {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid lookups: expected object')
  }
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.domains) || !Array.isArray(obj.subdomeins) ||
    !Array.isArray(obj.beleidsvelds) || !obj.municipalities || typeof obj.municipalities !== 'object') {
    throw new Error('Invalid lookups: missing or invalid fields')
  }
  return {
    domains: obj.domains as Array<{ BV_domein: string }>,
    subdomeins: obj.subdomeins as Array<{ BV_domein: string; BV_subdomein: string }>,
    beleidsvelds: obj.beleidsvelds as Array<{ BV_subdomein: string; Beleidsveld: string }>,
    municipalities: obj.municipalities as Record<string, string>
  }
}

function validateSummaryData(data: unknown): BVTopFieldRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid top fields summary: expected array')
  }
  return data as BVTopFieldRecord[]
}

export function InvesteringenBVTopFieldsSection({
  viewType = 'chart',
  metric = null,
  municipality = null,
  field = null,
}: InvesteringenBVTopFieldsSectionProps = {}) {
  const [lookups, setLookups] = useState<BVLookups | null>(null)
  const [muniData, setMuniData] = useState<BVTopFieldRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedField, setSelectedField] = useState<string>('')
  const [selectedMetric, setSelectedMetric] = useState<'Totaal' | 'Per_inwoner'>('Totaal')
  const [currentView, setCurrentView] = useState<TopFieldsViewType>(viewType)
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
    if (field !== null) {
      setSelectedField(stripPrefix(field))
    }
  }, [field])

  // Load lightweight summary data
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [lookupsData, summaryData] = await Promise.all([
          fetchInvesteringenJson<BVLookups>('/data/bv_lookups.json'),
          fetchInvesteringenJson<BVTopFieldRecord[]>('/data/bv_top_fields_summary.json'),
        ])

        if (cancelled) return

        setLookups(validateLookups(lookupsData))
        setMuniData(validateSummaryData(summaryData))
        setIsLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load BV top fields data:', err)
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

  // Filter data based on selected field (without geo filter)
  const dataWithoutGeoFilter = useMemo(() => {
    if (!selectedField) return muniData

    return muniData.filter(d => stripPrefix(d.Beleidsveld) === selectedField)
  }, [muniData, selectedField])

  // Filter data based on selections (including geo filter)
  const filteredData = useMemo(() => {
    let data = dataWithoutGeoFilter

    // Apply geo filter
    if (geoSelection.type === 'municipality' && geoSelection.code) {
      const constituents = getConstituents(geoSelection.code)
      const codesToMatch = constituents.length > 0
        ? [geoSelection.code, ...constituents]
        : [geoSelection.code]

      data = data.filter(d => {
        const normalizedCode = normalizeNisCode(d.NIS_code) || d.NIS_code
        return codesToMatch.includes(normalizedCode) || codesToMatch.includes(d.NIS_code)
      })
    }

    return data
  }, [dataWithoutGeoFilter, geoSelection])

  // Chart data: aggregate by year
  const chartData = useMemo(() => {
    const byYear: Record<number, { Rapportjaar: number; value: number }> = {}

    if (geoSelection.type === 'all') {
      // Aggregate per municipality first to avoid double counting
      const perMuniYear: Record<string, number> = {}

      dataWithoutGeoFilter.forEach(record => {
        const normalizedCode = normalizeNisCode(record.NIS_code) || record.NIS_code
        const key = `${normalizedCode}_${record.Rapportjaar}`
        perMuniYear[key] = (perMuniYear[key] || 0) + record[selectedMetric]
      })

      Object.entries(perMuniYear).forEach(([key, value]) => {
        const year = parseInt(key.split('_')[1])
        if (!byYear[year]) {
          byYear[year] = { Rapportjaar: year, value: 0 }
        }
        byYear[year].value += value
      })

      // For Per_inwoner metric, calculate average across municipalities
      if (selectedMetric === 'Per_inwoner') {
        const municipalityCounts: Record<number, Set<string>> = {}
        dataWithoutGeoFilter.forEach(record => {
          if (!municipalityCounts[record.Rapportjaar]) {
            municipalityCounts[record.Rapportjaar] = new Set()
          }
          const normalizedCode = normalizeNisCode(record.NIS_code) || record.NIS_code
          municipalityCounts[record.Rapportjaar].add(normalizedCode)
        })
        Object.keys(byYear).forEach(year => {
          const y = parseInt(year)
          const count = municipalityCounts[y]?.size || 0
          if (count > 0) {
            byYear[y].value = byYear[y].value / count
          }
        })
      }
    } else {
      filteredData.forEach(record => {
        if (!byYear[record.Rapportjaar]) {
          byYear[record.Rapportjaar] = { Rapportjaar: record.Rapportjaar, value: 0 }
        }
        byYear[record.Rapportjaar].value += record[selectedMetric]
      })
    }

    return Object.values(byYear).sort((a, b) => a.Rapportjaar - b.Rapportjaar)
  }, [filteredData, selectedMetric, geoSelection, dataWithoutGeoFilter])

  // Auto-scale formatter for Y-axis
  const { formatter: yAxisFormatter, scaleLabel: yAxisScaleLabel, scaleUnit: yAxisScaleUnit } = useMemo(() => {
    const values = chartData.map(d => d.value)
    return createAutoScaledFormatter(values, true)
  }, [chartData])

  // Y-axis label
  const yAxisLabel = useMemo(() => {
    const baseLabel = selectedMetric === 'Totaal' ? 'Totale uitgave' : 'Uitgave per inwoner'
    return createYAxisLabel(baseLabel, yAxisScaleLabel, true)
  }, [selectedMetric, yAxisScaleLabel])

  // Table data: By municipality with context window for selected municipality
  const tableData = useMemo(() => {
    const byMuni: Record<string, { municipality: string; total: number; count: number; nisCode: string }> = {}

    dataWithoutGeoFilter.forEach(record => {
      if (record.Rapportjaar !== 2026) return

      const normalizedCode = normalizeNisCode(record.NIS_code) || record.NIS_code

      if (!byMuni[normalizedCode]) {
        const fusion = getFusionInfo(normalizedCode)
        const name = fusion ? fusion.newName : getMunicipalityName(normalizedCode, lookups?.municipalities)

        byMuni[normalizedCode] = {
          municipality: name,
          total: 0,
          count: 0,
          nisCode: normalizedCode
        }
      }
      byMuni[normalizedCode].total += record[selectedMetric]
      byMuni[normalizedCode].count += 1
    })

    const allMunicipalities = Object.values(byMuni)
      .sort((a, b) => b.total - a.total)
      .map((m, index) => ({ ...m, rank: index + 1 }))

    if (geoSelection.type === 'municipality' && geoSelection.code) {
      const selectedIndex = allMunicipalities.findIndex(
        m => m.nisCode === geoSelection.code
      )

      if (selectedIndex !== -1) {
        const windowSize = 20
        const halfWindow = 9

        let startIndex = Math.max(0, selectedIndex - halfWindow)
        let endIndex = startIndex + windowSize

        if (endIndex > allMunicipalities.length) {
          endIndex = allMunicipalities.length
          startIndex = Math.max(0, endIndex - windowSize)
        }

        return allMunicipalities.slice(startIndex, endIndex)
      }
    }

    return allMunicipalities.slice(0, 20)
  }, [dataWithoutGeoFilter, selectedMetric, geoSelection, lookups?.municipalities])

  // Map data: Latest rapportjaar (2026)
  const mapData = useMemo(() => {
    const latestYear = 2026
    const byMuni: Record<string, { municipalityCode: string; value: number }> = {}

    filteredData
      .filter(d => d.Rapportjaar === latestYear)
      .forEach(record => {
        const normalizedCode = normalizeNisCode(record.NIS_code)
        if (!normalizedCode) return

        if (!byMuni[normalizedCode]) {
          byMuni[normalizedCode] = { municipalityCode: normalizedCode, value: 0 }
        }
        byMuni[normalizedCode].value += record[selectedMetric]
      })

    return Object.values(byMuni)
  }, [filteredData, selectedMetric])

  // Get available municipalities from the filtered data (without geo filter)
  const availableMunicipalities = useMemo(() => {
    const normalizedSet = new Set<string>()
    dataWithoutGeoFilter.forEach(d => {
      const c = normalizeNisCode(d.NIS_code)
      if (c) normalizedSet.add(c)
    })
    return Array.from(normalizedSet)
  }, [dataWithoutGeoFilter])

  // Field options: Top 9 + "Overige"
  const fieldOptions = useMemo(() => {
    return [
      ...TOP_FIELDS.map(f => stripPrefix(f)),
      'Overige'
    ]
  }, [])

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
          <p className="text-sm text-muted-foreground italic">Laden van investeringen per beleidsveld...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <SimpleGeoContext.Provider value={{ selection: geoSelection, setSelection: setGeoSelection }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Top beleidsvelden (BV)</CardTitle>
            <div className="flex items-center gap-4">
              <ExportButtons
                title="Top beleidsvelden"
                slug="gemeentelijke-investeringen"
                sectionId="investments-bv-top-fields"
                viewType={currentView}
                embedParams={{
                  metric: selectedMetric === 'Per_inwoner' ? 'per_capita' : 'total',
                  municipality: geoSelection.type === 'municipality' ? geoSelection.code : null,
                  field: selectedField || null,
                }}
                data={tableData.map(d => ({ label: d.municipality, value: d.total }))}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Filter op de 9 grootste beleidsvelden of bekijk alle overige beleidsvelden samen.
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
                value={selectedField}
                onChange={setSelectedField}
                options={fieldOptions}
                placeholder="Selecteer beleidsveld"
              />
            </div>

            <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as 'chart' | 'table' | 'map')} className="w-full">
              <TabsList>
                <TabsTrigger value="chart">Grafiek</TabsTrigger>
                <TabsTrigger value="table">Tabel</TabsTrigger>
                <TabsTrigger value="map">Kaart</TabsTrigger>
              </TabsList>

              <TabsContent value="chart" className="mt-4">
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
              </TabsContent>

              <TabsContent value="table" className="mt-4">
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
                            Data aan het laden...
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
              </TabsContent>

              <TabsContent value="map" className="mt-4">
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
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </SimpleGeoContext.Provider>
  )
}
