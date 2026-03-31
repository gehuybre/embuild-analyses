"use client"

import React, { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Button } from "@embuild/shared/components/ui/button"
import { Loader2 } from 'lucide-react'
import { cn } from "@embuild/shared/lib/utils"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { formatCurrency } from "@embuild/shared/lib/number-formatters"
import { getMunicipalityName } from "./nisUtils"
import { stripPrefix } from "./labelUtils"
import { SimpleGeoFilter } from "./SimpleGeoFilter"
import { SimpleGeoContext } from "@embuild/shared/components/shared/GeoContext"
import { fetchInvesteringenJson } from "@embuild/shared/lib/investeringen-data"

interface REKLookups {
  niveau3s: Array<{ Niveau_3: string }>
  alg_rekenings: Array<{ Niveau_3: string; Alg_rekening: string }>
  municipalities: Record<string, string>
}

interface REKCategorySummaryRecord {
  scope: 'all' | 'municipality'
  scope_code: string
  Rapportjaar: number
  Alg_rekening: string
  value: number
}

function validateLookups(data: unknown): REKLookups {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid lookups: expected object')
  }
  const obj = data as Record<string, unknown>

  if (!Array.isArray(obj.niveau3s) || !Array.isArray(obj.alg_rekenings) ||
    (typeof obj.municipalities !== 'object' || obj.municipalities === null)) {
    throw new Error('Invalid lookups: missing or invalid fields')
  }
  return obj as unknown as REKLookups
}

function validateSummaryData(data: unknown): REKCategorySummaryRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid REK category summary: expected array')
  }
  return data as REKCategorySummaryRecord[]
}

export function InvesteringenREKCategorySection() {
  const [lookups, setLookups] = useState<REKLookups | null>(null)
  const [summaryData, setSummaryData] = useState<REKCategorySummaryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [geoSelection, setGeoSelection] = useState<{
    type: 'all' | 'region' | 'province' | 'arrondissement' | 'municipality'
    code?: string
  }>({ type: 'all' })
  const [selectedMetric, setSelectedMetric] = useState<'Totaal' | 'Per_inwoner'>('Totaal')
  const [selectedYear, setSelectedYear] = useState<number>(2026)

  // Load lookups once
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const lookupsData = await fetchInvesteringenJson<REKLookups>('/data/rek_lookups.json')

        if (cancelled) return

        setLookups(validateLookups(lookupsData))
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load REK lookups:', err)
          setError(err instanceof Error ? err.message : 'Fout bij het laden van de data')
        }
      }
    }
    init()

    return () => {
      cancelled = true
    }
  }, [])

  // Load the pre-ranked category summary for the selected metric
  useEffect(() => {
    if (!lookups) {
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const summaryPath = selectedMetric === 'Totaal'
      ? '/data/rek_category_top_totaal.json'
      : '/data/rek_category_top_per_inwoner.json'

    fetchInvesteringenJson<REKCategorySummaryRecord[]>(summaryPath)
      .then((data) => {
        if (cancelled) return
        setSummaryData(validateSummaryData(data))
        setIsLoading(false)
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load REK category summary:', err)
          setError(err instanceof Error ? err.message : 'Fout bij het laden van de data')
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [lookups, selectedMetric])

  // Get available municipalities for the selected year
  const availableMunicipalities = useMemo(() => {
    const nisCodesSet = new Set(
      summaryData
        .filter(d => d.scope === 'municipality' && d.Rapportjaar === selectedYear)
        .map(d => d.scope_code)
    )
    return Array.from(nisCodesSet)
  }, [summaryData, selectedYear])

  // Category breakdown: Top 9 + Other
  const categoryData = useMemo(() => {
    const scope = geoSelection.type === 'municipality' && geoSelection.code ? 'municipality' : 'all'
    const scopeCode = scope === 'municipality' ? geoSelection.code : '__all__'

    return summaryData
      .filter((record) => record.scope === scope && record.scope_code === scopeCode && record.Rapportjaar === selectedYear)
      .map((record) => ({
        label: stripPrefix(record.Alg_rekening),
        value: record.value,
      }))
  }, [geoSelection, selectedYear, summaryData])

  // Calculate max value across ALL years for consistent bar chart scaling
  const maxValue = useMemo(() => {
    const scope = geoSelection.type === 'municipality' && geoSelection.code ? 'municipality' : 'all'
    const scopeCode = scope === 'municipality' ? geoSelection.code : '__all__'
    const values = summaryData
      .filter((record) => record.scope === scope && record.scope_code === scopeCode)
      .map((record) => record.value)

    return Math.max(...values, 1)
  }, [geoSelection, summaryData])

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
          <p className="text-sm text-muted-foreground italic">Laden van REK-categorieën...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <SimpleGeoContext.Provider value={{ selection: geoSelection, setSelection: setGeoSelection }}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Verdeling per algemene rekening (REK)</CardTitle>
            <div className="flex items-center gap-4">
              <ExportButtons
                title="Verdeling per algemene rekening"
                slug="gemeentelijke-investeringen"
                sectionId="rek-category-breakdown"
                viewType="table"
                data={categoryData.map(d => ({ label: d.label, value: d.value }))}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Top 9 algemene rekeningen met hoogste investeringen + overige categorieën.
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

            {/* Category breakdown */}
            <div className="space-y-4">
              {categoryData.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground italic">
                  Geen data beschikbaar voor deze selectie.
                </div>
              ) : (
                categoryData.map((item, index) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {index + 1}. {item.label}
                      </span>
                      <span className="font-bold text-sm">
                        {selectedMetric === 'Totaal'
                          ? formatCurrency(item.value)
                          : `€ ${item.value.toFixed(2)}`
                        }
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          item.label === 'Overige' ? "bg-gray-400" : "bg-green-500"
                        )}
                        style={{ width: `${(item.value / maxValue) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
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
