"use client"

import React, { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { Button } from "@embuild/shared/components/ui/button"
import { Loader2 } from 'lucide-react'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  createAutoScaledFormatter,
  createYAxisLabel,
  formatScaledTooltipValue,
  formatCurrency as formatFullCurrency,
} from "@embuild/shared/lib/number-formatters"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { fetchInvesteringenJson } from "@embuild/shared/lib/investeringen-data"
import { stripPrefix } from "./labelUtils"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"

interface BVLookups {
  domains: Array<{ BV_domein: string }>
}

interface BVVlaanderenRecord {
  Rapportjaar: number
  BV_domein: string
  BV_subdomein: string
  Beleidsveld: string
  Totaal: number
  Per_inwoner: number
}

function validateLookups(data: unknown): BVLookups {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid lookups: expected object')
  }
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.domains)) {
    throw new Error('Invalid lookups: missing domains')
  }
  return {
    domains: obj.domains as Array<{ BV_domein: string }>
  }
}

function validateVlaanderenData(data: unknown): BVVlaanderenRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid Vlaanderen data: expected array')
  }
  return data as BVVlaanderenRecord[]
}

const START_YEAR = 2020
const END_YEAR = 2026
const DOMAIN_LABELS: Record<string, string> = {
  "Algemene financiering": "Alg. financiering",
  "Veiligheidszorg": "Veiligheid",
  "Zich verplaatsen en mobiliteit": "Mobiliteit",
  "Natuur en milieubeheer": "Natuur",
  "Ondernemen en werken": "Ondernemen",
  "Algemeen bestuur": "Alg. bestuur",
  "Leren en onderwijs": "Onderwijs",
  "Zorg en opvang": "Zorg",
  "Wonen en ruimtelijke ordening": "Wonen en RO",
  "Cultuur en vrije tijd": "Vrije tijd",
}
const DOMAIN_ORDER = [
  "Alg. financiering",
  "Veiligheid",
  "Mobiliteit",
  "Natuur",
  "Ondernemen",
  "Alg. bestuur",
  "Onderwijs",
  "Zorg",
  "Wonen en RO",
  "Vrije tijd",
]

interface InvesteringenBVDifferenceSectionProps {
  viewType?: "chart" | "table"
}

export function InvesteringenBVDifferenceSection({ viewType = "chart" }: InvesteringenBVDifferenceSectionProps) {
  const [currentView, setCurrentView] = useState<"chart" | "table">(viewType)
  const [lookups, setLookups] = useState<BVLookups | null>(null)
  const [vlaanderenData, setVlaanderenData] = useState<BVVlaanderenRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const [lookupsData, vlaanderen] = await Promise.all([
          fetchInvesteringenJson<BVLookups>('/data/bv_lookups.json'),
          fetchInvesteringenJson<BVVlaanderenRecord[]>('/data/bv_vlaanderen_data.json'),
        ])

        if (cancelled) return

        setLookups(validateLookups(lookupsData))
        setVlaanderenData(validateVlaanderenData(vlaanderen))
        setIsLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load BV Vlaanderen data:', err)
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

  const chartData = useMemo(() => {
    if (!lookups) return []

    const totalsByDomain: Record<string, Record<number, number>> = {}

    vlaanderenData.forEach(record => {
      if (record.Rapportjaar !== START_YEAR && record.Rapportjaar !== END_YEAR) return
      const domain = stripPrefix(record.BV_domein)
      if (!totalsByDomain[domain]) {
        totalsByDomain[domain] = {}
      }
      totalsByDomain[domain][record.Rapportjaar] = (totalsByDomain[domain][record.Rapportjaar] || 0) + record.Totaal
    })

    const domains = lookups.domains.map(d => stripPrefix(d.BV_domein)).sort()

    const data = domains.map(domain => {
      const totals = totalsByDomain[domain] || {}
      const value = (totals[END_YEAR] || 0) - (totals[START_YEAR] || 0)
      const label = DOMAIN_LABELS[domain] || domain
      return { domain, label, value }
    })

    return DOMAIN_ORDER.map(label => data.find(item => item.label === label))
      .filter((item): item is { domain: string; label: string; value: number } => Boolean(item))
  }, [lookups, vlaanderenData])

  const { formatter: yAxisFormatter, scaleLabel: yAxisScaleLabel, scaleUnit: yAxisScaleUnit } = useMemo(() => {
    const values = chartData.map(d => d.value)
    return createAutoScaledFormatter(values, true)
  }, [chartData])

  const yAxisLabel = useMemo(() => {
    return createYAxisLabel(`Verschil totale uitgave (${END_YEAR} - ${START_YEAR})`, yAxisScaleLabel, true)
  }, [yAxisScaleLabel])

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
          <p className="text-sm text-muted-foreground italic">
            Laden van investeringen per beleidsdomein...
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Verschil investeringen per beleidsdomein (Vlaanderen)</CardTitle>
          <ExportButtons
            title="Verschil investeringen per beleidsdomein (Vlaanderen)"
            slug="gemeentelijke-investeringen"
            sectionId="investments-bv-difference"
            viewType={currentView}
            periodHeaders={["Domein"]}
            valueLabel="Verschil"
            data={chartData.map(d => ({ label: d.label, value: d.value }))}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Totale uitgave per domein: verschil tussen {START_YEAR} en {END_YEAR}.
        </p>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Geen data beschikbaar.</p>
        ) : (
          <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as "chart" | "table")} className="w-full">
            <TabsList>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>

            <TabsContent value="chart" className="mt-4">
              <div className="space-y-1">
                <div className="text-sm font-medium ml-16">
                  {yAxisLabel.text}
                  <span className="font-bold">
                    {yAxisLabel.boldText}
                  </span>
                </div>
                <div className="w-full h-[420px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        height={70}
                      />
                      <YAxis tickFormatter={yAxisFormatter} />
                      <Tooltip
                        formatter={(value) => {
                          if (typeof value !== 'number') return ''
                          return formatScaledTooltipValue(value, yAxisFormatter, yAxisScaleUnit)
                        }}
                        labelFormatter={(label) => `Domein ${label}`}
                      />
                      <Bar dataKey="value" name="Verschil">
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${entry.domain}`} fill={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Positief = stijging, negatief = daling.
              </p>
            </TabsContent>

            <TabsContent value="table" className="mt-4">
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium">Domein</th>
                      <th className="p-2 text-right font-medium">Verschil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row) => (
                      <tr key={row.domain} className="border-b">
                        <td className="p-2">{row.label}</td>
                        <td className="p-2 text-right">{formatFullCurrency(row.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}
