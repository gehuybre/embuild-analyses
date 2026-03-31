"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { Button } from "@embuild/shared/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@embuild/shared/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { cn } from "@embuild/shared/lib/utils"
import { getDataPath } from "@embuild/shared/lib/path-utils"
import { ARRONDISSEMENTS } from "@embuild/shared/lib/geo-utils"
import { useInitializeFiltersWithDefaults, useGeoFilters } from "@embuild/shared/lib/stores/embed-filters-store"
import { MunicipalitySearch } from "@embuild/shared/components/shared/MunicipalitySearch"

import type { MunicipalityData, SummaryMetrics } from "./types"
import { GebouwenparkSection } from "./GebouwenparkSection"
import { HuishoudensSection } from "./HuishoudensSection"
import { VergunningenSection } from "./VergunningenSection"
import { CorrelatiesSection } from "./CorrelatiesSection"
import { VergelijkingSection } from "./VergelijkingSection"

// Import CSV data (will be loaded client-side)

function formatInt(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number) {
  return `${n.toFixed(0)}%`
}

function calculateCompleteness(data: MunicipalityData[], key: keyof MunicipalityData): number {
  if (data.length === 0) return 0
  const validCount = data.filter(d => d[key] != null && d[key] !== 0).length
  return (validCount / data.length) * 100
}

function calculateSummaryMetrics(data: MunicipalityData[]): SummaryMetrics {
  const totalHuizen = data.reduce((sum, d) => sum + (d.Huizen_totaal_2025 ?? 0), 0)
  const totalAppartementen = data.reduce((sum, d) => sum + (d.Appartementen_2025 ?? 0), 0)
  const nieuwbouwRecent = data.reduce((sum, d) => sum + (d.Woningen_Nieuwbouw_2022sep_2025aug ?? 0), 0)
  const renovatieRecent = data.reduce((sum, d) => sum + (d.Gebouwen_Renovatie_2022sep_2025aug ?? 0), 0)

  return {
    totalHuizen,
    totalAppartementen,
    nieuwbouwRecent,
    renovatieRecent,
    completenessHuizen: calculateCompleteness(data, "Huizen_totaal_2025"),
    completenessAppartementen: calculateCompleteness(data, "Appartementen_2025"),
    completenessNieuwbouw: calculateCompleteness(data, "Woningen_Nieuwbouw_2022sep_2025aug"),
    completenessRenovatie: calculateCompleteness(data, "Gebouwen_Renovatie_2022sep_2025aug"),
  }
}

export function BetaalbaarArrDashboard() {
  useInitializeFiltersWithDefaults("betaalbaar-arr")
  const { selectedArrondissement, setArrondissement, selectedHighlightMunicipality, setHighlightMunicipality } = useGeoFilters()

  const [municipalitiesData, setMunicipalitiesData] = useState<MunicipalityData[]>([])
  const [loading, setLoading] = useState(true)
  const [arrPopoverOpen, setArrPopoverOpen] = useState(false)

  // Mapping store's generalized selectedArrondissement to local use
  const activeArrondissement = selectedArrondissement ?? "all"

  // Load CSV data on mount
  React.useEffect(() => {
    async function loadData() {
      try {
        const MUNICIPALITIES_DATA_PATH = getDataPath("/data/municipalities.csv")

        const response = await fetch(MUNICIPALITIES_DATA_PATH)
        const csvText = await response.text()

        // Parse CSV (simple implementation - could use papaparse library)
        const lines = csvText.split("\n")
        const headers = lines[0].split(",")
        const data: MunicipalityData[] = []

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue
          const values = lines[i].split(",")
          const row: any = {}

          headers.forEach((header, idx) => {
            const trimmedHeader = header.trim().replace(/-/g, "_")
            const value = values[idx]?.trim()

            // Type conversions
            if (trimmedHeader === "HH_available") {
              row[trimmedHeader] = value === "True" || value === "true"
            } else if (trimmedHeader === "CD_REFNIS" || trimmedHeader === "CD_SUP_REFNIS" || trimmedHeader === "TX_REFNIS_NL") {
              row[trimmedHeader] = value
            } else {
              // Numeric columns
              row[trimmedHeader] = value === "" || value === "nan" ? null : parseFloat(value)
            }
          })

          data.push(row as MunicipalityData)
        }

        setMunicipalitiesData(data)
        setLoading(false)
      } catch (error) {
        console.error("Failed to load municipalities data:", error)
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Get unique arrondissements
  const arrondissements = useMemo(() => {
    const unique = new Set<string>()
    municipalitiesData.forEach(d => {
      if (d.CD_SUP_REFNIS) {
        unique.add(d.CD_SUP_REFNIS)
      }
    })
    return Array.from(unique)
      .map(code => {
        const arr = ARRONDISSEMENTS.find(a => a.code === code)
        return {
          code,
          name: arr?.name ?? `Arrondissement ${code}`
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [municipalitiesData])

  // Get all municipalities for search
  const municipalities = useMemo(() => {
    return municipalitiesData
      .map(d => ({
        code: d.CD_REFNIS,
        name: d.TX_REFNIS_NL
      }))
      .filter((m, index, self) =>
        self.findIndex(t => t.code === m.code) === index
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [municipalitiesData])

  // Filter data by selected arrondissement
  const filteredData = useMemo(() => {
    if (activeArrondissement === "all") {
      return municipalitiesData
    }
    return municipalitiesData.filter(d => d.CD_SUP_REFNIS === activeArrondissement)
  }, [municipalitiesData, activeArrondissement])

  // Calculate summary metrics
  const metrics = useMemo(() => calculateSummaryMetrics(filteredData), [filteredData])

  const selectedArrName = useMemo(() => {
    if (activeArrondissement === "all") return "Alle arrondissementen"
    const arr = arrondissements.find(a => a.code === activeArrondissement)
    return arr?.name ?? "Alle arrondissementen"
  }, [activeArrondissement, arrondissements])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Data laden...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        {/* Arrondissement selector */}
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <label className="text-sm font-medium shrink-0">Arrondissement:</label>
          <Popover open={arrPopoverOpen} onOpenChange={setArrPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={arrPopoverOpen}
                className="w-full sm:w-[250px] justify-between"
              >
                {selectedArrName}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
              <Command>
                <CommandInput placeholder="Zoek arrondissement..." />
                <CommandList>
                  <CommandEmpty>Geen resultaten gevonden.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setArrondissement(null)
                        setArrPopoverOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          activeArrondissement === "all" ? "opacity-100" : "opacity-0"
                        )}
                      />
                      Alle arrondissementen
                    </CommandItem>
                    {arrondissements.map((arr) => (
                      <CommandItem
                        key={arr.code}
                        onSelect={() => {
                          setArrondissement(arr.code)
                          setArrPopoverOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            activeArrondissement === arr.code ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {arr.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Municipality Search */}
        <div className="flex items-center gap-4 w-full sm:w-auto flex-1">
          <label className="text-sm font-medium shrink-0">Gemeente markeren:</label>
          <MunicipalitySearch
            municipalities={municipalities}
            selectedMunicipality={selectedHighlightMunicipality}
            onSelect={setHighlightMunicipality}
            className="w-full sm:w-[300px]"
            placeholder="Typ gemeentenaam..."
          />
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totaal huizen (2025)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInt(metrics.totalHuizen)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatPct(metrics.completenessHuizen)} gevuld
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totaal appartementen (2025)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInt(metrics.totalAppartementen)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatPct(metrics.completenessAppartementen)} gevuld
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Nieuwbouw 2022-2025 (36m)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInt(metrics.nieuwbouwRecent)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatPct(metrics.completenessNieuwbouw)} gevuld
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Renovaties 2022-2025 (36m)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInt(metrics.renovatieRecent)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatPct(metrics.completenessRenovatie)} gevuld
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main tabs */}
      <Tabs defaultValue="gebouwenpark" className="space-y-4">
        <TabsList>
          <TabsTrigger value="gebouwenpark">Gebouwenpark</TabsTrigger>
          <TabsTrigger value="huishoudens">Huishoudens</TabsTrigger>
          <TabsTrigger value="vergunningen">Vergunningen</TabsTrigger>
          <TabsTrigger value="correlaties">Correlaties</TabsTrigger>
          <TabsTrigger value="vergelijking">Vergelijking</TabsTrigger>
        </TabsList>

        <TabsContent value="gebouwenpark" className="space-y-4">
          <GebouwenparkSection data={filteredData} />
        </TabsContent>

        <TabsContent value="huishoudens" className="space-y-4">
          <HuishoudensSection data={filteredData} />
        </TabsContent>

        <TabsContent value="vergunningen" className="space-y-4">
          <VergunningenSection data={filteredData} />
        </TabsContent>

        <TabsContent value="correlaties" className="space-y-4">
          <CorrelatiesSection data={filteredData} />
        </TabsContent>

        <TabsContent value="vergelijking" className="space-y-4">
          <VergelijkingSection data={municipalitiesData} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
