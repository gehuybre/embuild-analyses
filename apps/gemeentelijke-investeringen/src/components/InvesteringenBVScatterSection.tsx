"use client"

import React, { useMemo, useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Button } from "@embuild/shared/components/ui/button"
import { Loader2 } from 'lucide-react'
import { InvesteringenDistributionPlot } from "./InvesteringenDistributionPlot"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { HierarchicalFilter } from "@embuild/shared/components/shared/HierarchicalFilter"
import { MunicipalitySearch } from "@embuild/shared/components/shared/MunicipalitySearch"
import { getMunicipalityName, getAllMunicipalities } from "./nisUtils"
import { stripPrefix } from "./labelUtils"
import {
  createAutoScaledFormatter,
  formatCurrency as formatFullCurrency,
} from "@embuild/shared/lib/number-formatters"
import { getPublicPath } from "@embuild/shared/lib/path-utils"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"

interface BVLookups {
  domains: Array<{ BV_domein: string }>
  subdomeins: Array<{ BV_domein: string; BV_subdomein: string }>
  beleidsvelds: Array<{ BV_subdomein: string; Beleidsveld: string }>
  municipalities: Record<string, string>
}

interface BVRecord {
  NIS_code: string
  Rapportjaar: number
  BV_domein: string
  BV_subdomein: string
  Beleidsveld: string
  Totaal: number
  Per_inwoner: number
}

interface ScatterDataPoint {
  municipality: string
  NIS_code: string
  value: number
  x: number // Index for X axis
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
  return {
    domains: obj.domains as Array<{ BV_domein: string }>,
    subdomeins: obj.subdomeins as Array<{ BV_domein: string; BV_subdomein: string }>,
    beleidsvelds: obj.beleidsvelds as Array<{ BV_subdomein: string; Beleidsveld: string }>,
    municipalities: obj.municipalities as Record<string, string>
  }
}

function validateMetadata(data: unknown): { bv_chunks: number; rek_chunks: number } {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid metadata: expected object')
  }
  const obj = data as Record<string, unknown>
  if (typeof obj.bv_chunks !== 'number' || typeof obj.rek_chunks !== 'number') {
    throw new Error('Invalid metadata: missing or invalid chunk counts')
  }
  return obj as { bv_chunks: number; rek_chunks: number }
}

function validateChunkData(data: unknown): BVRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid chunk data: expected array')
  }
  return data as BVRecord[]
}


export function InvesteringenBVScatterSection() {
  const [lookups, setLookups] = useState<BVLookups | null>(null)
  const [muniData, setMuniData] = useState<BVRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadedChunks, setLoadedChunks] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [selectedDomain, setSelectedDomain] = useState<string>('')
  const [selectedMetric, setSelectedMetric] = useState<'Totaal' | 'Per_inwoner'>('Totaal')
  const [selectedMunicipality, setSelectedMunicipality] = useState<string | null>(null)

  // Fixed year: only 2026 data available
  const selectedYear = 2026

  // Load initial data and start chunk loading
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        setMuniData([])
        setLoadedChunks(0)

        const [metaRes, lookupsRes] = await Promise.all([
          fetch(getPublicPath('/data/metadata.json')),
          fetch(getPublicPath('/data/bv_lookups.json'))
        ])

        if (cancelled) return

        if (!metaRes.ok) throw new Error(`Failed to load metadata: ${metaRes.statusText}`)
        if (!lookupsRes.ok) throw new Error(`Failed to load lookups: ${lookupsRes.statusText}`)

        const meta = validateMetadata(await metaRes.json())
        const lookupsData = validateLookups(await lookupsRes.json())

        if (cancelled) return

        setLookups(lookupsData)
        setTotalChunks(meta.bv_chunks)

        // Set default domain to empty string (Alle)
        setSelectedDomain('')

        setIsLoading(false)

        // Load chunks sequentially
        const allChunks: BVRecord[] = []
        for (let i = 0; i < meta.bv_chunks; i++) {
          if (cancelled) return

          const chunkRes = await fetch(getPublicPath(`/data/bv_municipality_data_chunk_${i}.json`))
          if (!chunkRes.ok) {
            throw new Error(`Failed to load chunk ${i}: ${chunkRes.statusText}`)
          }
          const chunkData = validateChunkData(await chunkRes.json())
          allChunks.push(...chunkData)
          setMuniData([...allChunks])
          setLoadedChunks(i + 1)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load BV data:', err)
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

  // Get available domain options
  const domainOptions = useMemo(() => {
    if (!lookups) return []
    return lookups.domains.map(d => stripPrefix(d.BV_domein)).sort()
  }, [lookups])

  // Get all municipalities for search
  const allMunicipalities = useMemo(() => {
    return getAllMunicipalities(lookups?.municipalities).map(m => ({
      code: m.nisCode,
      name: m.name
    }))
  }, [])

  // Scatter data: aggregate by municipality for selected year and domain
  const scatterData = useMemo(() => {
    if (!lookups) return []

    const byMuni: Record<string, number> = {}

    if (!selectedDomain || selectedDomain === '') {
      // Aggregate all domains ("Alle" option)
      muniData
        .filter(d => d.Rapportjaar === selectedYear)
        .forEach(record => {
          if (!byMuni[record.NIS_code]) {
            byMuni[record.NIS_code] = 0
          }
          byMuni[record.NIS_code] += record[selectedMetric]
        })
    } else {
      // Find original domain value (with prefix) for filtering
      const originalDomain = lookups.domains.find(
        d => stripPrefix(d.BV_domein) === selectedDomain
      )?.BV_domein

      if (!originalDomain) return []

      muniData
        .filter(d => d.Rapportjaar === selectedYear && d.BV_domein === originalDomain)
        .forEach(record => {
          if (!byMuni[record.NIS_code]) {
            byMuni[record.NIS_code] = 0
          }
          byMuni[record.NIS_code] += record[selectedMetric]
        })
    }

    return Object.entries(byMuni)
      .map(([nisCode, value]) => ({
        municipality: getMunicipalityName(nisCode, lookups?.municipalities),
        NIS_code: nisCode,
        value,
        x: 0, // Will be reassigned after sorting
      }))
      .sort((a, b) => a.value - b.value) // Sort by value: small to large
      .map((item, index) => ({ ...item, x: index }))
  }, [muniData, selectedDomain, selectedMetric, selectedYear, lookups])


  // Export data
  const exportData = useMemo(() => {
    return scatterData.map(d => ({
      label: d.municipality,
      value: d.value
    }))
  }, [scatterData])

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
          <p className="text-sm text-muted-foreground italic">Laden van data...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Gemeentelijke investeringen per beleidsdomein</CardTitle>
          <div className="flex items-center gap-4">
            {loadedChunks < totalChunks && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                Laden data: {Math.round((loadedChunks / totalChunks) * 100)}%
              </div>
            )}
            <ExportButtons
              title="Investeringen per beleidsdomein verdeling"
              slug="gemeentelijke-investeringen"
              sectionId="investments-bv-distribution"
              viewType="table"
              data={exportData}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Dit histogram toont de verdeling van investeringen over alle Vlaamse gemeenten. Zoek een gemeente om haar positie in de verdeling te zien.
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
            <HierarchicalFilter
              value={selectedDomain}
              onChange={setSelectedDomain}
              options={domainOptions}
              placeholder="Selecteer domein"
            />
            <div className="flex-1 min-w-[200px]">
              <MunicipalitySearch
                selectedMunicipality={selectedMunicipality}
                onSelect={setSelectedMunicipality}
                municipalities={allMunicipalities}
                placeholder="Selecteer gemeente..."
              />
            </div>
          </div>

          {/* Distribution Plot */}
          <div className="w-full h-[500px]">
              <InvesteringenDistributionPlot
                data={scatterData}
                selectedMetric={selectedMetric}
                selectedMunicipality={selectedMunicipality}
                color={CHART_SERIES_COLORS[0]}
              />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Domein: <strong>{selectedDomain || 'Alle'}</strong> | Rapportjaar: <strong>2026</strong> | {selectedMetric === 'Totaal' ? 'Totale uitgave' : 'Uitgave per inwoner'} | {scatterData.length} gemeenten
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
