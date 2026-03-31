"use client"

import React, { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Button } from "@embuild/shared/components/ui/button"
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@embuild/shared/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { cn } from "@embuild/shared/lib/utils"
import { Building2, Home } from 'lucide-react'
import { TimeSeriesSection } from "@embuild/shared/components/shared/TimeSeriesSection"
import { GebouwenChart } from "./GebouwenChart"
import { GebouwenTable } from "./GebouwenTable"
import type { GebouwenData, BuildingTypeKey } from "./types"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

const formatNumber = (num: number) => new Intl.NumberFormat('nl-BE').format(num)

// Building type options
type BuildingTypeFilter = BuildingTypeKey | 'all' | 'residential'

const BUILDING_TYPES: { value: BuildingTypeFilter; label: string }[] = [
  { value: 'all', label: 'Alle gebouwen' },
  { value: 'residential', label: 'Woongebouwen' },
  { value: 'Huizen in gesloten bebouwing', label: 'Gesloten' },
  { value: 'Huizen in halfopen bebouwing', label: 'Halfopen' },
  { value: 'Huizen in open bebouwing, hoeven en kastelen', label: 'Open' },
  { value: 'Buildings en flatgebouwen met appartementen', label: 'Appartementen' },
  { value: 'Handelshuizen', label: 'Handelshuizen' },
  { value: 'Alle andere gebouwen', label: 'Andere' }
]

// Region options
type RegionFilter = 'national' | '02000' | '03000' | '04000'

const REGIONS: { value: RegionFilter; label: string }[] = [
  { value: 'national', label: 'Nationaal' },
  { value: '02000', label: 'Vlaanderen' },
  { value: '03000', label: 'Wallonië' },
  { value: '04000', label: 'Brussel' }
]

// Region filter component
function RegionFilterInline({
  selected,
  onChange,
}: {
  selected: RegionFilter
  onChange: (region: RegionFilter) => void
}) {
  const [open, setOpen] = useState(false)

  const selectedLabel = useMemo(() => {
    return REGIONS.find((r) => r.value === selected)?.label ?? 'Nationaal'
  }, [selected])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[120px]">
          <span className="truncate max-w-[100px]">{selectedLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek regio..." />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup heading="Regio">
              {REGIONS.map((region) => (
                <CommandItem
                  key={region.value}
                  value={region.label}
                  onSelect={() => {
                    onChange(region.value)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === region.value ? "opacity-100" : "opacity-0")} />
                  {region.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Building type filter component
function BuildingTypeFilterInline({
  selected,
  onChange,
}: {
  selected: BuildingTypeFilter
  onChange: (type: BuildingTypeFilter) => void
}) {
  const [open, setOpen] = useState(false)

  const selectedLabel = useMemo(() => {
    const type = BUILDING_TYPES.find((t) => t.value === selected)
    return type?.label ?? 'Alle gebouwen'
  }, [selected])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[120px]">
          <span className="truncate max-w-[100px]">{selectedLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek type..." />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup heading="Type">
              {BUILDING_TYPES.map((type) => (
                <CommandItem
                  key={type.value}
                  value={type.label}
                  onSelect={() => {
                    onChange(type.value)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === type.value ? "opacity-100" : "opacity-0")} />
                  {type.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function GebouwenDashboard() {
  const { data: bundle, loading, error } = useJsonBundle<{
    data: GebouwenData
  }>({
    data: "/data/stats_2025.json",
  })

  const timeSeries = bundle?.data.time_series

  // Filter states
  const [selectedRegion, setSelectedRegion] = useState<RegionFilter>('national')
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingTypeFilter>('all')

  // Prepare data for time series chart and table based on filters
  const timeSeriesData = useMemo(() => {
    if (!timeSeries) return []
    const years = timeSeries.years

    // Determine which dataset to use based on region
    const regionalData = selectedRegion === 'national'
      ? timeSeries.national
      : timeSeries.regions[selectedRegion]

    if (!regionalData) return []

    // Calculate values based on building type filter
    return years.map((year, idx) => {
      let total: number
      let residential: number

      if (selectedBuildingType === 'all') {
        total = regionalData.total_buildings[idx]
        residential = regionalData.residential_buildings[idx]
      } else if (selectedBuildingType === 'residential') {
        total = regionalData.residential_buildings[idx]
        residential = regionalData.residential_buildings[idx]
      } else {
        // Specific building type - use by_type data
        total = regionalData.by_type[selectedBuildingType]?.[idx] ?? 0
        // For specific types, we show the same value in both columns
        residential = total
      }

      return {
        year,
        total,
        residential
      }
    })
  }, [timeSeries, selectedRegion, selectedBuildingType])

  // Dynamic column labels based on selected filter
  const columnLabels = useMemo(() => {
    if (selectedBuildingType === 'all') {
      return {
        total: 'Totaal Gebouwen',
        residential: 'Woongebouwen'
      }
    } else if (selectedBuildingType === 'residential') {
      return {
        total: 'Woongebouwen',
        residential: 'Woongebouwen'
      }
    } else {
      const label = BUILDING_TYPES.find(t => t.value === selectedBuildingType)?.label ?? 'Gebouwen'
      return {
        total: label,
        residential: label
      }
    }
  }, [selectedBuildingType])

  // Show both columns only when "all" is selected
  const showBothColumns = selectedBuildingType === 'all'

  // Prepare export data for TimeSeriesSection
  const exportData = useMemo(() => {
    return timeSeriesData.map((row) => ({
      label: row.year.toString(),
      value: row.total,
      periodCells: showBothColumns
        ? [row.year, row.total, row.residential]
        : [row.year, row.total]
    }))
  }, [timeSeriesData, showBothColumns])

  // Export headers based on selected filter
  const exportHeaders = useMemo(() => {
    return showBothColumns
      ? ["Jaar", columnLabels.total, columnLabels.residential]
      : ["Jaar", columnLabels.total]
  }, [showBothColumns, columnLabels])

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  const { snapshot_2025 } = bundle.data
  const national2025 = snapshot_2025.national

  // Calculate residential total for metric card
  const residentialTotal =
    national2025.by_type['Huizen in gesloten bebouwing'] +
    national2025.by_type['Huizen in halfopen bebouwing'] +
    national2025.by_type['Huizen in open bebouwing, hoeven en kastelen'] +
    national2025.by_type['Buildings en flatgebouwen met appartementen']

  return (
    <div className="space-y-8">
      {/* Top Level Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Totaal Gebouwen</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(national2025.total)}</div>
            <p className="text-xs text-muted-foreground">In 2025</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Woongebouwen</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(residentialTotal)}</div>
            <p className="text-xs text-muted-foreground">Huizen + Appartementsgebouwen</p>
          </CardContent>
        </Card>
      </div>

      {/* Time Series Section with Filters */}
      <TimeSeriesSection
        title="Evolutie van het aantal gebouwen (1995-2025)"
        slug="gebouwenpark"
        sectionId="evolutie"
        dataSource="Statbel Building Stock 2025"
        dataSourceUrl="https://statbel.fgov.be/"
        defaultView="chart"
        rightControls={
          <div className="flex items-center gap-2">
            <RegionFilterInline
              selected={selectedRegion}
              onChange={setSelectedRegion}
            />
            <BuildingTypeFilterInline
              selected={selectedBuildingType}
              onChange={setSelectedBuildingType}
            />
          </div>
        }
        views={[
          {
            value: "chart",
            label: "Grafiek",
            exportData,
            exportMeta: {
              viewType: "chart",
              periodHeaders: exportHeaders,
              valueLabel: "Aantal"
            },
            content: (
              <Card>
                <CardContent className="pt-6">
                  <GebouwenChart
                    data={timeSeriesData}
                    totalLabel={columnLabels.total}
                    residentialLabel={columnLabels.residential}
                    showBothLines={showBothColumns}
                  />
                </CardContent>
              </Card>
            )
          },
          {
            value: "table",
            label: "Tabel",
            exportData,
            exportMeta: {
              viewType: "table",
              periodHeaders: exportHeaders,
              valueLabel: "Aantal"
            },
            content: (
              <Card>
                <CardContent className="pt-6">
                  <GebouwenTable
                    data={timeSeriesData}
                    totalLabel={columnLabels.total}
                    residentialLabel={columnLabels.residential}
                    showBothColumns={showBothColumns}
                  />
                </CardContent>
              </Card>
            )
          }
        ]}
      />

    </div>
  )
}
