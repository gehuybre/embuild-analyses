"use client"

import React, { useMemo, useState, useEffect, useRef } from 'react'
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
import { HierarchicalFilter } from "@embuild/shared/components/shared/HierarchicalFilter"
import { getMunicipalityName } from "./nisUtils"
import { normalizeBvDomainLabel, stripPrefix } from "./labelUtils"
import {
  createAutoScaledFormatter,
  createYAxisLabel,
  formatScaledTooltipValue,
  formatCurrency as formatFullCurrency,
} from "@embuild/shared/lib/number-formatters"
import { getPublicPath } from "@embuild/shared/lib/path-utils"
import { getConstituents, getFusionInfo, normalizeNisCode } from "@embuild/shared/lib/nis-fusion-utils"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { InvesteringenMap } from "./InvesteringenMap"

interface BVLookups {
  domains: Array<{ BV_domein: string }>
  subdomeins: Array<{ BV_domein: string; BV_subdomein: string }>
  beleidsvelds: Array<{ BV_subdomein: string; Beleidsveld: string }>
  municipalities: Record<string, string>
}

interface REKLookups {
  hoofdrekeningen: Array<{
    Economische_rekening_hoofdrekening?: string
    Niveau_3?: string
  }>
  rubrieken: Array<{
    Economische_rekening_hoofdrekening: string
    Economische_rekening_rubriek: string
  }>
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

interface REKRecord {
  NIS_code: string
  Rapportjaar: number
  Economische_rekening_hoofdrekening: string
  Economische_rekening_rubriek: string
  Totaal: number
  Per_inwoner: number
}

interface BVVlaanderenRecord {
  Rapportjaar: number
  BV_domein: string
  BV_subdomein: string
  Beleidsveld: string
  Totaal: number
  Per_inwoner: number
}

interface REKVlaanderenRecord {
  Rapportjaar: number
  Economische_rekening_hoofdrekening: string
  Economische_rekening_rubriek: string
  Totaal: number
  Per_inwoner: number
}

type ViewType = "chart" | "table" | "map"
type Perspective = "bv" | "rek"

interface InvesteringenEmbedProps {
  section: "investments-bv" | "investments-bv-top-fields" | "investments-rek"
  viewType?: ViewType
  metric?: string | null
  municipality?: string | null
  domain?: string | null
  niveau3?: string | null
  rekening?: string | null
}

// Runtime validation helpers
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

function validateBVLookups(data: unknown): BVLookups {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid BV lookups: expected object')
  }
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.domains) || !Array.isArray(obj.subdomeins) ||
    !Array.isArray(obj.beleidsvelds) || !obj.municipalities || typeof obj.municipalities !== 'object') {
    throw new Error('Invalid BV lookups: missing or invalid fields')
  }
  return {
    domains: obj.domains as Array<{ BV_domein: string }>,
    subdomeins: obj.subdomeins as Array<{ BV_domein: string; BV_subdomein: string }>,
    beleidsvelds: obj.beleidsvelds as Array<{ BV_subdomein: string; Beleidsveld: string }>,
    municipalities: obj.municipalities as Record<string, string>
  }
}

function validateREKLookups(data: unknown): REKLookups {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid REK lookups: expected object')
  }
  const obj = data as Record<string, unknown>
  // Support both key styles for robustness
  const hoofdrekeningen = obj.hoofdrekeningen || obj.niveau3s
  const rubrieken = obj.rubrieken || obj.alg_rekenings

  if (!Array.isArray(hoofdrekeningen) || !Array.isArray(rubrieken) ||
    !obj.municipalities || typeof obj.municipalities !== 'object') {
    throw new Error('Invalid REK lookups: missing or invalid fields')
  }
  return {
    hoofdrekeningen: hoofdrekeningen as any,
    rubrieken: rubrieken as any,
    municipalities: obj.municipalities as Record<string, string>
  }
}

function validateBVVlaanderenData(data: unknown): BVVlaanderenRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid BV Vlaanderen data: expected array')
  }
  return data as BVVlaanderenRecord[]
}

function validateREKVlaanderenData(data: unknown): REKVlaanderenRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid REK Vlaanderen data: expected array')
  }
  return data as REKVlaanderenRecord[]
}

function validateBVChunkData(data: unknown): BVRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid BV chunk data: expected array')
  }
  return data as BVRecord[]
}

function validateREKChunkData(data: unknown): REKRecord[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid REK chunk data: expected array')
  }
  return data as REKRecord[]
}

export function InvesteringenEmbed({
  section,
  viewType = "chart",
  metric = null,
  municipality = null,
  domain = null,
  niveau3 = null,
  rekening = null,
}: InvesteringenEmbedProps) {
  const perspective: Perspective = (section === "investments-bv" || section === "investments-bv-top-fields") ? "bv" : "rek"

  const [bvLookups, setBVLookups] = useState<BVLookups | null>(null)
  const [rekLookups, setREKLookups] = useState<REKLookups | null>(null)
  const [bvVlaanderenData, setBVVlaanderenData] = useState<BVVlaanderenRecord[]>([])
  const [rekVlaanderenData, setREKVlaanderenData] = useState<REKVlaanderenRecord[]>([])
  const [bvMuniData, setBVMuniData] = useState<BVRecord[]>([])
  const [rekMuniData, setREKMuniData] = useState<REKRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadedChunks, setLoadedChunks] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // BV filters
  const [selectedDomain, setSelectedDomain] = useState<string>('')

  // REK filters
  const [selectedHoofdrekening, setSelectedHoofdrekening] = useState<string>('')
  const [selectedRubriek, setSelectedRubriek] = useState<string>('')

  const [selectedMetric, setSelectedMetric] = useState<'Totaal' | 'Per_inwoner'>('Totaal')
  const [geoSelection, setGeoSelection] = useState<{
    type: 'all' | 'region' | 'province' | 'arrondissement' | 'municipality'
    code?: string
  }>({ type: 'all' })
  const [currentView, setCurrentView] = useState<ViewType>(viewType)

  // Track if data was already loaded to prevent double loading
  const isDataLoadedRef = useRef(false)

  useEffect(() => {
    setCurrentView(viewType)
  }, [viewType])

  // Apply URL-driven initial filter state from EmbedClient params
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
    if (niveau3 !== null) {
      setSelectedHoofdrekening(niveau3)
    }
  }, [niveau3])

  useEffect(() => {
    if (rekening !== null) {
      setSelectedRubriek(rekening)
    }
  }, [rekening])

  // Load initial data and start chunk loading
  useEffect(() => {
    let cancelled = false

    async function init() {
      // Prevent double loading
      if (isDataLoadedRef.current) return

      try {
        // Reset data to prevent double-loading on remount
        setBVMuniData([])
        setREKMuniData([])
        setLoadedChunks(0)

        if (perspective === "bv") {
          const [metaRes, lookupsRes, vlaanderenRes] = await Promise.all([
            fetch(getPublicPath('/data/metadata.json')),
            fetch(getPublicPath('/data/bv_lookups.json')),
            fetch(getPublicPath('/data/bv_vlaanderen_data.json'))
          ])

          if (cancelled) return

          if (!metaRes.ok) throw new Error(`Failed to load metadata: ${metaRes.statusText}`)
          if (!lookupsRes.ok) throw new Error(`Failed to load lookups: ${lookupsRes.statusText}`)
          if (!vlaanderenRes.ok) throw new Error(`Failed to load Vlaanderen data: ${vlaanderenRes.statusText}`)

          const [metaJson, lookupsJson, vlaanderenJson] = await Promise.all([
            metaRes.json(),
            lookupsRes.json(),
            vlaanderenRes.json()
          ])

          if (cancelled) return

          const meta = validateMetadata(metaJson)
          const lookupsData = validateBVLookups(lookupsJson)
          const vlaanderen = validateBVVlaanderenData(vlaanderenJson)

          if (cancelled) return

          setBVLookups(lookupsData)
          setBVVlaanderenData(vlaanderen)
          setTotalChunks(meta.bv_chunks)
          setIsLoading(false)

          // Load chunks in parallel
          const chunkPromises = Array.from({ length: meta.bv_chunks }, (_, i) =>
            fetch(getPublicPath(`/data/bv_municipality_data_chunk_${i}.json`))
              .then(async (res) => {
                if (cancelled) return null
                if (!res.ok) throw new Error(`Failed to load chunk ${i}: ${res.statusText}`)
                const json = await res.json()
                if (cancelled) return null
                return { index: i, data: validateBVChunkData(json) }
              })
          )

          const chunks = await Promise.all(chunkPromises)
          if (cancelled) return

          // Sort chunks by index and combine
          const sortedChunks = chunks
            .filter((chunk): chunk is { index: number; data: BVRecord[] } => chunk !== null)
            .sort((a, b) => a.index - b.index)

          const allChunks = sortedChunks.flatMap(chunk => chunk.data)
          setBVMuniData(allChunks)
          setLoadedChunks(meta.bv_chunks)
          isDataLoadedRef.current = true
        } else {
          // REK perspective
          const [metaRes, lookupsRes, vlaanderenRes] = await Promise.all([
            fetch(getPublicPath('/data/metadata.json')),
            fetch(getPublicPath('/data/rek_lookups.json')),
            fetch(getPublicPath('/data/rek_vlaanderen_data.json'))
          ])

          if (cancelled) return

          if (!metaRes.ok) throw new Error(`Failed to load metadata: ${metaRes.statusText}`)
          if (!lookupsRes.ok) throw new Error(`Failed to load lookups: ${lookupsRes.statusText}`)
          if (!vlaanderenRes.ok) throw new Error(`Failed to load Vlaanderen data: ${vlaanderenRes.statusText}`)

          const [metaJson, lookupsJson, vlaanderenJson] = await Promise.all([
            metaRes.json(),
            lookupsRes.json(),
            vlaanderenRes.json()
          ])

          if (cancelled) return

          const meta = validateMetadata(metaJson)
          const lookupsData = validateREKLookups(lookupsJson)
          const vlaanderen = validateREKVlaanderenData(vlaanderenJson)

          if (cancelled) return

          setREKLookups(lookupsData)
          setREKVlaanderenData(vlaanderen)
          setTotalChunks(meta.rek_chunks)
          setIsLoading(false)

          // Set a hoofdrekening default only when no explicit value is active
          const hoofdrekeningen = lookupsData.hoofdrekeningen || (lookupsData as any).niveau3s
          if (hoofdrekeningen && hoofdrekeningen.length > 0) {
            const first = hoofdrekeningen[0]
            const value = first.Economische_rekening_hoofdrekening || first.Niveau_3
            if (value) {
              setSelectedHoofdrekening((prev) => prev || stripPrefix(value))
            }
          }

          // Load chunks in parallel
          const chunkPromises = Array.from({ length: meta.rek_chunks }, (_, i) =>
            fetch(getPublicPath(`/data/rek_municipality_data_chunk_${i}.json`))
              .then(async (res) => {
                if (cancelled) return null
                if (!res.ok) throw new Error(`Failed to load chunk ${i}: ${res.statusText}`)
                const json = await res.json()
                if (cancelled) return null
                return { index: i, data: validateREKChunkData(json) }
              })
          )

          const chunks = await Promise.all(chunkPromises)
          if (cancelled) return

          // Sort chunks by index and combine
          const sortedChunks = chunks
            .filter((chunk): chunk is { index: number; data: REKRecord[] } => chunk !== null)
            .sort((a, b) => a.index - b.index)

          const allChunks = sortedChunks.flatMap(chunk => chunk.data)
          setREKMuniData(allChunks)
          setLoadedChunks(meta.rek_chunks)
          isDataLoadedRef.current = true
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load data:', err)
          setError(err instanceof Error ? err.message : 'Fout bij het laden van de data')
          setIsLoading(false)
        }
      }
    }
    init()

    return () => {
      cancelled = true
    }
  }, [perspective, retryCount])

  // BV filtering logic
  const bvDomainOptions = useMemo(() => {
    if (!bvLookups) return []
    return Array.from(new Set(bvLookups.domains.map(d => normalizeBvDomainLabel(d.BV_domein)))).sort()
  }, [bvLookups])

  const selectedDomainSubdomains = useMemo(() => {
    if (!bvLookups || !selectedDomain) return []
    const labels = bvLookups.subdomeins
      .filter((s) => normalizeBvDomainLabel(s.BV_domein) === selectedDomain)
      .map((s) => stripPrefix(s.BV_subdomein))
      .sort()
    return Array.from(new Set(labels))
  }, [bvLookups, selectedDomain])

  // REK filtering logic - updated to handle keys correctly
  const rekHoofdrekenOptions = useMemo(() => {
    if (!rekLookups) return []
    // Support both key styles for robustness
    const items = rekLookups.hoofdrekeningen || (rekLookups as any).niveau3s || []
    return items.map((h: any) => stripPrefix(h.Economische_rekening_hoofdrekening || h.Niveau_3)).sort()
  }, [rekLookups])

  const rekRubriekOptions = useMemo(() => {
    if (!rekLookups) return []
    let options = rekLookups.rubrieken || (rekLookups as any).alg_rekenings || []
    if (selectedHoofdrekening) {
      options = options.filter((r: any) =>
        stripPrefix(r.Economische_rekening_hoofdrekening || r.Niveau_3) === selectedHoofdrekening
      )
    }
    return options.map((r: any) => stripPrefix(r.Economische_rekening_rubriek || r.Alg_rekening)).sort()
  }, [rekLookups, selectedHoofdrekening])

  // BV: Filter data based on category selections (without geo filter)
  const bvDataWithoutGeoFilter = useMemo(() => {
    let data = bvMuniData

    if (selectedDomain) {
      data = data.filter(d => normalizeBvDomainLabel(d.BV_domein) === selectedDomain)
    }

    return data
  }, [bvMuniData, selectedDomain])

  // BV: Apply geo filter on top of category-filtered data
  const filteredBVData = useMemo(() => {
    let data = bvDataWithoutGeoFilter

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
  }, [bvDataWithoutGeoFilter, geoSelection])

  // REK: Filter data based on category selections (without geo filter)
  const rekDataWithoutGeoFilter = useMemo(() => {
    let data = rekMuniData

    if (selectedHoofdrekening) {
      data = data.filter(d => stripPrefix((d as any).Economische_rekening_hoofdrekening || (d as any).Niveau_3) === selectedHoofdrekening)
    }
    if (selectedRubriek) {
      data = data.filter(d => stripPrefix((d as any).Economische_rekening_rubriek || (d as any).Alg_rekening) === selectedRubriek)
    }

    return data
  }, [rekMuniData, selectedHoofdrekening, selectedRubriek])

  // REK: Apply geo filter on top of category-filtered data
  const filteredREKData = useMemo(() => {
    let data = rekDataWithoutGeoFilter

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
  }, [rekDataWithoutGeoFilter, geoSelection])

  const dataWithoutGeoFilter = perspective === "bv" ? bvDataWithoutGeoFilter : rekDataWithoutGeoFilter
  const filteredData = perspective === "bv" ? filteredBVData : filteredREKData
  const municipalityLookup = perspective === "bv"
    ? bvLookups?.municipalities
    : rekLookups?.municipalities

  // Chart data: Vlaanderen totals or municipality average
  const chartData = useMemo(() => {
    const byYear: Record<number, { Rapportjaar: number; value: number }> = {}

    if (geoSelection.type === 'all') {
      const perMuniYear: Record<string, number> = {}

      dataWithoutGeoFilter.forEach(record => {
        // Defensive fallback: normalizeNisCode returns null only for null/undefined,
        // but keep the fallback to guard against unexpected input or future changes.
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

      if (selectedMetric === 'Per_inwoner') {
        const municipalityCounts: Record<number, Set<string>> = {}
        dataWithoutGeoFilter.forEach(record => {
          if (!municipalityCounts[record.Rapportjaar]) {
            municipalityCounts[record.Rapportjaar] = new Set()
          }
          // Defensive fallback: normalizeNisCode returns null only for null/undefined,
          // but keep the fallback to guard against unexpected input or future changes.
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
  }, [dataWithoutGeoFilter, filteredData, selectedMetric, geoSelection])

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

  // Get the latest year from the data
  const latestYear = useMemo(() => {
    if (filteredData.length === 0) return new Date().getFullYear()
    return Math.max(...filteredData.map(d => d.Rapportjaar))
  }, [filteredData])

  // Table data: By municipality (latest year)
  const tableData = useMemo(() => {
    const byMuni: Record<string, { municipality: string; total: number; count: number }> = {}

    filteredData.forEach(record => {
      if (record.Rapportjaar !== latestYear) return

      const normalizedCode = normalizeNisCode(record.NIS_code) || record.NIS_code

      if (!byMuni[normalizedCode]) {
        const fusion = getFusionInfo(normalizedCode)
        byMuni[normalizedCode] = {
          municipality: fusion ? fusion.newName : getMunicipalityName(normalizedCode, municipalityLookup),
          total: 0,
          count: 0
        }
      }
      byMuni[normalizedCode].total += record[selectedMetric]
      byMuni[normalizedCode].count += 1
    })

    return Object.values(byMuni)
      .sort((a, b) => b.total - a.total)
      .slice(0, 50)
  }, [filteredData, selectedMetric, latestYear, municipalityLookup])

  const mapData = useMemo(() => {
    const byMuni: Record<string, { municipalityCode: string; municipalityName: string; value: number }> = {}

    filteredData.forEach(record => {
      if (record.Rapportjaar !== latestYear) return

      const normalizedCode = normalizeNisCode(record.NIS_code) || record.NIS_code

      if (!byMuni[normalizedCode]) {
        const fusion = getFusionInfo(normalizedCode)
        byMuni[normalizedCode] = {
          municipalityCode: normalizedCode,
          municipalityName: fusion ? fusion.newName : getMunicipalityName(normalizedCode, municipalityLookup),
          value: 0,
        }
      }

      byMuni[normalizedCode].value += record[selectedMetric]
    })

    return Object.values(byMuni)
  }, [filteredData, latestYear, municipalityLookup, selectedMetric])

  // Get available municipalities from the filtered data (without geo filter)
  // This ensures the municipality dropdown shows all municipalities with data for the selected category
  const availableMunicipalities = useMemo(() => {
    const normalizedSet = new Set<string>()
    dataWithoutGeoFilter.forEach((d) => {
      const code = normalizeNisCode(d.NIS_code) || d.NIS_code
      normalizedSet.add(code)
    })
    return Array.from(normalizedSet)
  }, [dataWithoutGeoFilter])

  const handleRetry = () => {
    setError(null)
    setIsLoading(true)
    isDataLoadedRef.current = false
    setRetryCount(prev => prev + 1)
  }

  if (error) {
    return (
      <Card>
        <CardContent className="h-64 flex flex-col items-center justify-center space-y-4">
          <p className="text-sm text-destructive font-medium">Fout bij het laden van de data</p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <Button onClick={handleRetry} size="sm">
            Opnieuw proberen
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isLoading || (perspective === "bv" && !bvLookups) || (perspective === "rek" && !rekLookups)) {
    return (
      <Card>
        <CardContent className="h-64 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground italic">
            Laden van {perspective === "bv" ? "beleidsdomein" : "economische rekening"} data...
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <SimpleGeoContext.Provider value={{ selection: geoSelection, setSelection: setGeoSelection }}>
      <Card>
        <CardHeader>
          <CardTitle>
            {perspective === "bv" ? "Investeringen per beleidsdomein" : "Investeringen per economische rekening (REK)"}
          </CardTitle>
          {loadedChunks < totalChunks && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Laden data: {Math.round((loadedChunks / totalChunks) * 100)}%
            </div>
          )}
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
                municipalityLookup={municipalityLookup}
              />

              {perspective === "bv" && (
                <>
                  <HierarchicalFilter
                    value={selectedDomain}
                    onChange={setSelectedDomain}
                    options={bvDomainOptions}
                    placeholder="Selecteer domein"
                  />
                </>
              )}

              {perspective === "rek" && (
                <>
                  <HierarchicalFilter
                    value={selectedHoofdrekening}
                    onChange={(v) => {
                      setSelectedHoofdrekening(v)
                      setSelectedRubriek('')
                    }}
                    options={rekHoofdrekenOptions}
                    placeholder="Selecteer hoofdrekening"
                  />
                  {selectedHoofdrekening && (
                    <HierarchicalFilter
                      value={selectedRubriek}
                      onChange={setSelectedRubriek}
                      options={rekRubriekOptions}
                      placeholder="Selecteer rubriek"
                    />
                  )}
                </>
              )}
            </div>

            {perspective === "bv" && selectedDomain && selectedDomainSubdomains.length > 0 && (
              <div className="bg-muted/50 p-3 rounded border text-sm">
                <p>
                  <span className="font-semibold">Dit domein bevat:</span> {selectedDomainSubdomains.join(", ")}
                </p>
              </div>
            )}

            <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as ViewType)} className="w-full">
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
                    : 'Geselecteerde gemeente'
                  }
                </p>
              </TabsContent>

              <TabsContent value="table" className="mt-4">
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left font-medium">Gemeente</th>
                        <th className="p-2 text-right font-medium">
                          {selectedMetric === 'Totaal' ? 'Totaal' : 'Per inwoner'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-muted-foreground italic">
                            Data aan het laden...
                          </td>
                        </tr>
                      ) : (
                        tableData.map((row, i) => (
                          <tr key={i} className="border-b">
                            <td className="p-2">{row.municipality}</td>
                            <td className="p-2 text-right">
                              {selectedMetric === 'Totaal'
                                ? formatFullCurrency(row.total)
                                : `€ ${row.total.toFixed(2)}`
                              }
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Top 50 gemeenten (rapportjaar {latestYear})
                </p>
              </TabsContent>

              <TabsContent value="map" className="mt-4">
                <InvesteringenMap
                  data={mapData.map((d) => ({
                    value: d.value,
                    municipality: d.municipalityName,
                    nis_code: d.municipalityCode,
                  }))}
                  selectedMetric={selectedMetric === 'Totaal' ? 'total' : 'per_capita'}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Rapportjaar {latestYear} - {selectedMetric === 'Totaal' ? 'Totale uitgave' : 'Uitgave per inwoner'}
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </SimpleGeoContext.Provider>
  )
}
