"use client"

import * as React from "react"
import { Check, ChevronsUpDown, TrendingUp, TrendingDown, Building2, Users, Calendar, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { Button } from "@embuild/shared/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@embuild/shared/components/ui/alert"
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
import { getProvincesForRegion, REGIONS, PROVINCES } from "@embuild/shared/lib/geo-utils"
import { validateSectorCode } from "@embuild/shared/lib/filter-validation"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { useEmbedFilters, useInitializeFiltersWithDefaults } from "@embuild/shared/lib/stores/embed-filters-store"
import { useFaillissementenData } from "./use-faillissementen-data"

// Types
type MonthlyRow = {
  y: number
  m: number
  n: number
  w: number
}

type MonthlyProvinceRow = {
  y: number
  m: number
  p: string
  n: number
  w: number
}

type MonthlySectorRow = {
  y: number
  m: number
  s: string
  n: number
  w: number
}

type MonthlySectorProvinceRow = {
  y: number
  m: number
  s: string
  p: string
  n: number
  w: number
}

type YearlyRow = {
  y: number
  n: number
  w: number
}

type YearlySectorRow = {
  y: number
  s: string
  n: number
  w: number
}

type YearlySectorProvinceRow = {
  y: number
  s: string
  p: string
  n: number
  w: number
}

type DurationRow = {
  y: number
  d: string
  ds: string
  do: number
  n: number
  w: number
}

type DurationProvinceRow = {
  y: number
  d: string
  ds: string
  do: number
  p: string
  n: number
  w: number
}

type DurationSectorRow = {
  y: number
  d: string
  ds: string
  do: number
  s: string
  n: number
  w: number
}

type WorkersRow = {
  y: number
  c: string
  n: number
  w: number
}

type WorkersProvinceRow = {
  y: number
  c: string
  p: string
  n: number
  w: number
}

type WorkersSectorRow = {
  y: number
  c: string
  s: string
  n: number
  w: number
}

type ProvinceRow = {
  y: number
  p: string
  n: number
  w: number
}

type Sector = {
  code: string
  nl: string
}

type Province = {
  code: string
  name: string
}

type ChartPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
}

let monthlyConstruction: MonthlyRow[] = []
let monthlyTotals: MonthlyRow[] = []
let monthlyBySector: MonthlySectorRow[] = []
let monthlyBySectorProvince: MonthlySectorProvinceRow[] = []
let yearlyConstruction: YearlyRow[] = []
let yearlyTotals: YearlyRow[] = []
let yearlyBySector: YearlySectorRow[] = []
let yearlyBySectorProvince: YearlySectorProvinceRow[] = []
let provincesConstruction: ProvinceRow[] = []
let provincesData: ProvinceRow[] = []
let monthlyProvincesConstruction: MonthlyProvinceRow[] = []
let monthlyProvinces: MonthlyProvinceRow[] = []
let lookups: any = null
let metadata: any = null
let yearlyByDuration: DurationRow[] = []
let yearlyByDurationConstruction: DurationRow[] = []
let yearlyByDurationProvinceConstruction: DurationProvinceRow[] = []
let yearlyByDurationSector: DurationSectorRow[] = []
let yearlyByWorkers: WorkersRow[] = []
let yearlyByWorkersConstruction: WorkersRow[] = []
let yearlyByWorkersProvinceConstruction: WorkersProvinceRow[] = []
let yearlyByWorkersSector: WorkersSectorRow[] = []
let VALID_SECTOR_CODES: string[] = []

// Lookup data structure with proper typing
interface Lookups {
  sectors: Sector[]
  provinces: Province[]
  years: number[]
}

// Type guard for validating lookups data
function isValidLookups(data: unknown): data is Lookups {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    Array.isArray(obj.sectors) &&
    obj.sectors.every((s: unknown) =>
      typeof s === 'object' && s !== null &&
      'code' in s && 'nl' in s
    ) &&
    Array.isArray(obj.provinces) &&
    obj.provinces.every((p: unknown) =>
      typeof p === 'object' && p !== null &&
      'code' in p && 'name' in p
    ) &&
    Array.isArray(obj.years) &&
    obj.years.every((y: unknown) => typeof y === 'number')
  )
}

// Type guards for runtime validation
function isMonthlyProvinceRow(item: unknown): item is MonthlyProvinceRow {
  return (
    typeof item === 'object' && item !== null &&
    'y' in item && typeof (item as MonthlyProvinceRow).y === 'number' &&
    'm' in item && typeof (item as MonthlyProvinceRow).m === 'number' &&
    'p' in item && typeof (item as MonthlyProvinceRow).p === 'string' &&
    'n' in item && typeof (item as MonthlyProvinceRow).n === 'number' &&
    'w' in item && typeof (item as MonthlyProvinceRow).w === 'number'
  )
}

function isMonthlyRow(item: unknown): item is MonthlyRow {
  return (
    typeof item === 'object' && item !== null &&
    'y' in item && typeof (item as MonthlyRow).y === 'number' &&
    'm' in item && typeof (item as MonthlyRow).m === 'number' &&
    'n' in item && typeof (item as MonthlyRow).n === 'number' &&
    'w' in item && typeof (item as MonthlyRow).w === 'number'
  )
}

function isMonthlySectorRow(item: unknown): item is MonthlySectorRow {
  return (
    typeof item === 'object' && item !== null &&
    'y' in item && typeof (item as MonthlySectorRow).y === 'number' &&
    'm' in item && typeof (item as MonthlySectorRow).m === 'number' &&
    's' in item && typeof (item as MonthlySectorRow).s === 'string' &&
    'n' in item && typeof (item as MonthlySectorRow).n === 'number' &&
    'w' in item && typeof (item as MonthlySectorRow).w === 'number'
  )
}

function isMonthlySectorProvinceRow(item: unknown): item is MonthlySectorProvinceRow {
  return (
    typeof item === 'object' && item !== null &&
    'y' in item && typeof (item as MonthlySectorProvinceRow).y === 'number' &&
    'm' in item && typeof (item as MonthlySectorProvinceRow).m === 'number' &&
    's' in item && typeof (item as MonthlySectorProvinceRow).s === 'string' &&
    'p' in item && typeof (item as MonthlySectorProvinceRow).p === 'string' &&
    'n' in item && typeof (item as MonthlySectorProvinceRow).n === 'number' &&
    'w' in item && typeof (item as MonthlySectorProvinceRow).w === 'number'
  )
}

function isYearlyRow(item: unknown): item is YearlyRow {
  return (
    typeof item === 'object' && item !== null &&
    'y' in item && typeof (item as YearlyRow).y === 'number' &&
    'n' in item && typeof (item as YearlyRow).n === 'number' &&
    'w' in item && typeof (item as YearlyRow).w === 'number'
  )
}

function isProvinceRow(item: unknown): item is ProvinceRow {
  return (
    typeof item === 'object' && item !== null &&
    'y' in item && typeof (item as ProvinceRow).y === 'number' &&
    'p' in item && typeof (item as ProvinceRow).p === 'string' &&
    'n' in item && typeof (item as ProvinceRow).n === 'number' &&
    'w' in item && typeof (item as ProvinceRow).w === 'number'
  )
}

// Utility function for safe array access with error handling
function safeArrayAccess<T>(
  data: unknown,
  arrayName: string,
  validator?: (item: unknown) => item is T
): { data: T[]; error: string | null } {
  try {
    if (!Array.isArray(data)) {
      const errorMsg = `${arrayName} is niet beschikbaar`
      console.error(`Data validation error: ${arrayName} is not an array`, data)
      return { data: [], error: errorMsg }
    }

    // If validator is provided, filter out invalid items
    if (validator) {
      const validData = data.filter(validator)
      if (validData.length !== data.length) {
        console.warn(`${arrayName}: ${data.length - validData.length} invalid items filtered out`)
      }
      return { data: validData, error: null }
    }

    return { data: data as T[], error: null }
  } catch (error) {
    const errorMsg = `Fout bij laden van ${arrayName}`
    console.error(`Error loading ${arrayName}:`, error)
    return { data: [], error: errorMsg }
  }
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mrt", "Apr", "Mei", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"
]

const MONTH_NAMES_FULL = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december"
]

/**
 * Gets province codes to aggregate based on region/province filter selection.
 * @param code - null (België), region code ('2000', '3000', '4000'), or province code ('10000', etc.)
 * @returns Array of province codes to aggregate, 'brussels' for Brussels, 'all' for Belgium, or null for specific province
 */
function getRegionAggregation(code: string | null): string[] | 'brussels' | 'all' | null {
  // null or '1000' = België (all provinces + Brussels)
  if (!code || code === '1000') {
    return 'all'
  }

  // '4000' = Brussel (calculated as total - provinces)
  if (code === '4000') {
    return 'brussels'
  }

  // Check if it's a region code ('2000' = Vlaanderen, '3000' = Wallonië)
  const region = REGIONS.find(r => r.code === code)
  if (region) {
    return getProvincesForRegion(region.code)
  }

  // Check if it's a specific province code
  const province = PROVINCES.find(p => p.code === code)
  if (province) {
    return null // null means specific province selected
  }

  // Fallback to all
  return 'all'
}

// Worker class order for sorting
// NOTE: Includes two variants for the largest class due to inconsistent naming in Statbel source data:
// - "1000 werknemers en meer" appears in all-sector data
// - "1000 en meer werknemers" appears in construction sector data
// This handles both variants during sorting without data normalization
const WORKER_CLASS_ORDER = [
  "0 - 4 werknemers",
  "5 - 9 werknemers",
  "10 - 19 werknemers",
  "20 - 49 werknemers",
  "50 - 99 werknemers",
  "100 - 199 werknemers",
  "200 - 249 werknemers",
  "250 - 499 werknemers",
  "500 - 999 werknemers",
  "1000 werknemers en meer",
  "1000 en meer werknemers",
]

function formatInt(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
}

function formatPct(n: number) {
  const sign = n >= 0 ? "+" : ""
  return `${sign}${n.toFixed(1)}%`
}

function useSectorOptions(): { sectors: Sector[]; error: string | null } {
  if (isValidLookups(lookups)) {
    return { sectors: lookups.sectors, error: null }
  }
  const { data, error } = safeArrayAccess<Sector>(
    (lookups as Record<string, unknown>).sectors,
    'sectorgegevens'
  )
  return { sectors: data, error }
}

function useProvinceOptions(): { provinces: Province[]; error: string | null } {
  if (isValidLookups(lookups)) {
    return { provinces: lookups.provinces, error: null }
  }
  const { data, error } = safeArrayAccess<Province>(
    (lookups as Record<string, unknown>).provinces,
    'provinciegegevens'
  )
  return { provinces: data, error }
}

// Sector filter dropdown
function SectorFilter({
  selected,
  onChange,
  showAll = false,
}: {
  selected: string
  onChange: (code: string) => void
  showAll?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const { sectors, error } = useSectorOptions()

  const currentLabel = React.useMemo(() => {
    if (selected === "ALL") return "Alle sectoren"
    return sectors.find((s) => s.code === selected)?.nl ?? "Sector"
  }, [selected, sectors])

  if (error) {
    return (
      <Button variant="outline" size="sm" disabled className="h-9 gap-1 min-w-[140px]">
        <span className="truncate max-w-[180px]">Fout bij laden</span>
      </Button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[140px]">
          <span className="truncate max-w-[180px]">{currentLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek sector..." />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            {showAll && (
              <CommandGroup heading="Totaal">
                <CommandItem
                  value="Alle sectoren"
                  onSelect={() => {
                    onChange("ALL")
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === "ALL" ? "opacity-100" : "opacity-0")} />
                  Alle sectoren
                </CommandItem>
              </CommandGroup>
            )}
            {showAll && <CommandSeparator />}
            <CommandGroup heading="Sectoren">
              {sectors.map((s) => (
                <CommandItem
                  key={s.code}
                  value={s.nl}
                  onSelect={() => {
                    onChange(s.code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === s.code ? "opacity-100" : "opacity-0")} />
                  {s.nl}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Region/Province filter dropdown (be, vl, wa, br + provinces for vl/wa)
function ProvinceFilter({
  selected,
  onChange,
}: {
  selected: string | null
  onChange: (code: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)

  // Determine current label
  const currentLabel = React.useMemo(() => {
    if (!selected) return "België"

    // Check if it's a region code
    const region = REGIONS.find(r => r.code === selected)
    if (region) return region.name

    // Check if it's a province code
    const province = PROVINCES.find(p => p.code === selected)
    if (province) return province.name

    return "Selecteer regio"
  }, [selected])

  // Get provinces for the current region filter (for display purposes)
  const selectedRegion = React.useMemo(() => {
    if (!selected) return '1000' // België
    const region = REGIONS.find(r => r.code === selected)
    if (region) return region.code
    // If province is selected, find its region
    const province = PROVINCES.find(p => p.code === selected)
    return province?.regionCode ?? '1000'
  }, [selected])

  // Filter provinces by selected region (exclude Brussels provinces)
  const filteredProvinces = React.useMemo(() => {
    // Only show provinces for Vlaanderen and Wallonië, not for Brussels (4000) or Belgium (1000)
    if (selectedRegion === '4000' || selectedRegion === '1000') {
      return []
    }
    // Filter provinces by selected region (already excludes Brussels since selectedRegion !== '4000')
    return PROVINCES.filter(p => p.regionCode === selectedRegion)
  }, [selectedRegion])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[120px]">
          <span className="truncate max-w-[100px]">{currentLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup heading="Regio">
              {REGIONS.map((r) => (
                <CommandItem
                  key={r.code}
                  value={r.name}
                  onSelect={() => {
                    onChange(r.code === '1000' ? null : r.code)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", (!selected && r.code === '1000') || selected === r.code ? "opacity-100" : "opacity-0")} />
                  {r.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {filteredProvinces.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Provincies">
                  {filteredProvinces.map((p) => (
                    <CommandItem
                      key={p.code}
                      value={p.name}
                      onSelect={() => {
                        onChange(p.code)
                        setOpen(false)
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selected === p.code ? "opacity-100" : "opacity-0")} />
                      {p.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Year filter dropdown
function YearFilter({
  selected,
  onChange,
  years,
}: {
  selected: number
  onChange: (year: number) => void
  years: number[]
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1">
          <span>{selected}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[120px] p-0" align="end">
        <Command>
          <CommandList>
            <CommandGroup>
              {years.slice(-10).reverse().map((year) => (
                <CommandItem
                  key={year}
                  value={String(year)}
                  onSelect={() => {
                    onChange(year)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected === year ? "opacity-100" : "opacity-0")} />
                  {year}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Get monthly data for chart with region/province filter
function getMonthlyData(
  sector: string,
  regionCode: string | null,
  months: number = 24
): { data: ChartPoint[]; error: string | null } {
  try {
    let data: MonthlyRow[]
    const regionAggregation = getRegionAggregation(regionCode)

    // Handle specific province selected
    if (regionAggregation === null) {
      if (sector !== "ALL") {
        // Filter by BOTH sector AND province
        const validation = safeArrayAccess<MonthlySectorProvinceRow>(
          monthlyBySectorProvince,
          'maandelijkse sector-provincie gegevens',
          isMonthlySectorProvinceRow
        )
        if (validation.error) return { data: [], error: validation.error }

        const filtered = validation.data.filter((r) => r.p === regionCode && r.s === sector)
        data = filtered.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
      } else {
        // Filter by province only (all sectors)
        const validation = safeArrayAccess<MonthlyProvinceRow>(
          monthlyProvinces,
          'maandelijkse provinciegegevens',
          isMonthlyProvinceRow
        )
        if (validation.error) return { data: [], error: validation.error }

        const filtered = validation.data.filter((r) => r.p === regionCode)
        data = filtered.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
      }
    }
    // Handle Belgium (all data)
    else if (regionAggregation === 'all') {
      if (sector === "ALL") {
        const validation = safeArrayAccess<MonthlyRow>(
          monthlyTotals,
          'maandelijkse totalen',
          isMonthlyRow
        )
        if (validation.error) return { data: [], error: validation.error }
        data = validation.data
      } else {
        const validation = safeArrayAccess<MonthlySectorRow>(
          monthlyBySector,
          'maandelijkse sector gegevens',
          isMonthlySectorRow
        )
        if (validation.error) return { data: [], error: validation.error }
        const filtered = validation.data.filter((r) => r.s === sector)
        data = filtered.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
      }
    }
    // Handle Brussels (total - provinces)
    else if (regionAggregation === 'brussels') {
      if (sector === "ALL") {
        const totalsValidation = safeArrayAccess<MonthlyRow>(
          monthlyTotals,
          'maandelijkse totalen',
          isMonthlyRow
        )
        const provincesValidation = safeArrayAccess<MonthlyProvinceRow>(
          monthlyProvinces,
          'maandelijkse provinciegegevens',
          isMonthlyProvinceRow
        )
        if (totalsValidation.error) return { data: [], error: totalsValidation.error }
        if (provincesValidation.error) return { data: [], error: provincesValidation.error }

        // Calculate Brussels = Total - Sum of all provinces
        const brusselsMap = new Map<string, MonthlyRow>()
        totalsValidation.data.forEach((total) => {
          const key = `${total.y}-${total.m}`
          brusselsMap.set(key, { y: total.y, m: total.m, n: total.n, w: total.w })
        })

        provincesValidation.data.forEach((prov) => {
          const key = `${prov.y}-${prov.m}`
          const brussels = brusselsMap.get(key)
          if (brussels) {
            brussels.n -= prov.n
            brussels.w -= prov.w
          }
        })
        data = Array.from(brusselsMap.values()).sort((a, b) => a.y - b.y || a.m - b.m)
      } else {
        const sectorValidation = safeArrayAccess<MonthlySectorRow>(
          monthlyBySector,
          'maandelijkse sector gegevens',
          isMonthlySectorRow
        )
        const sectorProvinceValidation = safeArrayAccess<MonthlySectorProvinceRow>(
          monthlyBySectorProvince,
          'maandelijkse sector-provincie gegevens',
          isMonthlySectorProvinceRow
        )
        if (sectorValidation.error) return { data: [], error: sectorValidation.error }
        if (sectorProvinceValidation.error) return { data: [], error: sectorProvinceValidation.error }

        // Calculate Brussels sector = Total sector - Sum of provinces for sector
        const brusselsMap = new Map<string, MonthlyRow>()
        sectorValidation.data.filter((r) => r.s === sector).forEach((total) => {
          const key = `${total.y}-${total.m}`
          brusselsMap.set(key, { y: total.y, m: total.m, n: total.n, w: total.w })
        })

        sectorProvinceValidation.data.filter((r) => r.s === sector).forEach((prov) => {
          const key = `${prov.y}-${prov.m}`
          const brussels = brusselsMap.get(key)
          if (brussels) {
            brussels.n -= prov.n
            brussels.w -= prov.w
          }
        })
        data = Array.from(brusselsMap.values()).sort((a, b) => a.y - b.y || a.m - b.m)
      }
    }
    // Handle Flanders/Wallonia (aggregate provinces)
    else {
      if (sector === "ALL") {
        const validation = safeArrayAccess<MonthlyProvinceRow>(
          monthlyProvinces,
          'maandelijkse provinciegegevens',
          isMonthlyProvinceRow
        )
        if (validation.error) return { data: [], error: validation.error }

        const regionData = validation.data.filter((r) => regionAggregation.includes(r.p))
        const aggregated = new Map<string, MonthlyRow>()
        regionData.forEach((r) => {
          const key = `${r.y}-${r.m}`
          const existing = aggregated.get(key)
          if (existing) {
            existing.n += r.n
            existing.w += r.w
          } else {
            aggregated.set(key, { y: r.y, m: r.m, n: r.n, w: r.w })
          }
        })
        data = Array.from(aggregated.values()).sort((a, b) => a.y - b.y || a.m - b.m)
      } else {
        const validation = safeArrayAccess<MonthlySectorProvinceRow>(
          monthlyBySectorProvince,
          'maandelijkse sector-provincie gegevens',
          isMonthlySectorProvinceRow
        )
        if (validation.error) return { data: [], error: validation.error }

        const regionSectorData = validation.data.filter((r) => regionAggregation.includes(r.p) && r.s === sector)
        const aggregated = new Map<string, MonthlyRow>()
        regionSectorData.forEach((r) => {
          const key = `${r.y}-${r.m}`
          const existing = aggregated.get(key)
          if (existing) {
            existing.n += r.n
            existing.w += r.w
          } else {
            aggregated.set(key, { y: r.y, m: r.m, n: r.n, w: r.w })
          }
        })
        data = Array.from(aggregated.values()).sort((a, b) => a.y - b.y || a.m - b.m)
      }
    }

    const chartData = data
      .map((r) => ({
        sortValue: r.y * 100 + r.m,
        periodCells: [`${MONTH_NAMES[r.m - 1]} ${r.y}`],
        value: r.n,
      }))
      .sort((a, b) => a.sortValue - b.sortValue)
      .slice(-months)

    return { data: chartData, error: null }
  } catch (error) {
    console.error("Error loading monthly data:", error)
    return { data: [], error: 'Fout bij laden van maandelijkse gegevens' }
  }
}

// Get yearly data for chart with region/province filter
function getYearlyData(
  sector: string,
  regionCode: string | null,
  yearsLimit?: number
): { data: ChartPoint[]; error: string | null } {
  try {
    let data: YearlyRow[]
    const regionAggregation = getRegionAggregation(regionCode)

    // Handle specific province selected
    if (regionAggregation === null) {
      if (sector !== "ALL") {
        // Filter by BOTH sector AND province
        const validation = safeArrayAccess<YearlySectorProvinceRow>(
          yearlyBySectorProvince,
          'jaarlijkse sector-provincie gegevens'
        )
        if (validation.error) return { data: [], error: validation.error }

        const filtered = validation.data.filter((r: YearlySectorProvinceRow) =>
          r.p === regionCode && r.s === sector
        )
        data = filtered.map((r) => ({ y: r.y, n: r.n, w: r.w }))
      } else {
        // Filter by province only (all sectors) - aggregate from monthly data
        const validation = safeArrayAccess<MonthlyProvinceRow>(
          monthlyProvinces,
          'maandelijkse provinciegegevens',
          isMonthlyProvinceRow
        )
        if (validation.error) return { data: [], error: validation.error }

        const filtered = validation.data.filter((r) => r.p === regionCode)
        const byYear = new Map<number, { n: number; w: number }>()
        for (const r of filtered) {
          const existing = byYear.get(r.y) ?? { n: 0, w: 0 }
          byYear.set(r.y, { n: existing.n + r.n, w: existing.w + r.w })
        }
        data = Array.from(byYear.entries()).map(([y, v]) => ({ y, n: v.n, w: v.w }))
      }
    }
    // Handle Belgium (all data)
    else if (regionAggregation === 'all') {
      if (sector === "ALL") {
        const validation = safeArrayAccess<YearlyRow>(
          yearlyTotals,
          'jaarlijkse totalen',
          isYearlyRow
        )
        if (validation.error) return { data: [], error: validation.error }
        data = validation.data
      } else {
        const validation = safeArrayAccess<YearlySectorRow>(
          yearlyBySector,
          'jaarlijkse sector gegevens'
        )
        if (validation.error) return { data: [], error: validation.error }
        const filtered = validation.data.filter((r) => r.s === sector)
        data = filtered.map((r) => ({ y: r.y, n: r.n, w: r.w }))
      }
    }
    // Handle Brussels (total - provinces)
    else if (regionAggregation === 'brussels') {
      if (sector === "ALL") {
        const totalsValidation = safeArrayAccess<MonthlyRow>(
          monthlyTotals,
          'maandelijkse totalen',
          isMonthlyRow
        )
        const provincesValidation = safeArrayAccess<MonthlyProvinceRow>(
          monthlyProvinces,
          'maandelijkse provinciegegevens',
          isMonthlyProvinceRow
        )
        if (totalsValidation.error) return { data: [], error: totalsValidation.error }
        if (provincesValidation.error) return { data: [], error: provincesValidation.error }

        // Calculate Brussels yearly = Total - Sum of all provinces
        const totalsByYear = new Map<number, { n: number; w: number }>()
        totalsValidation.data.forEach((total) => {
          const existing = totalsByYear.get(total.y) ?? { n: 0, w: 0 }
          totalsByYear.set(total.y, { n: existing.n + total.n, w: existing.w + total.w })
        })

        const provincesByYear = new Map<number, { n: number; w: number }>()
        provincesValidation.data.forEach((prov) => {
          const existing = provincesByYear.get(prov.y) ?? { n: 0, w: 0 }
          provincesByYear.set(prov.y, { n: existing.n + prov.n, w: existing.w + prov.w })
        })

        data = Array.from(totalsByYear.entries()).map(([y, total]) => {
          const prov = provincesByYear.get(y) ?? { n: 0, w: 0 }
          return { y, n: total.n - prov.n, w: total.w - prov.w }
        })
      } else {
        const sectorValidation = safeArrayAccess<MonthlySectorRow>(
          monthlyBySector,
          'maandelijkse sector gegevens',
          isMonthlySectorRow
        )
        const sectorProvinceValidation = safeArrayAccess<MonthlySectorProvinceRow>(
          monthlyBySectorProvince,
          'maandelijkse sector-provincie gegevens',
          isMonthlySectorProvinceRow
        )
        if (sectorValidation.error) return { data: [], error: sectorValidation.error }
        if (sectorProvinceValidation.error) return { data: [], error: sectorProvinceValidation.error }

        // Calculate Brussels sector yearly = Total sector - Sum of provinces for sector
        const totalsByYear = new Map<number, { n: number; w: number }>()
        sectorValidation.data.filter((r) => r.s === sector).forEach((total) => {
          const existing = totalsByYear.get(total.y) ?? { n: 0, w: 0 }
          totalsByYear.set(total.y, { n: existing.n + total.n, w: existing.w + total.w })
        })

        const provincesByYear = new Map<number, { n: number; w: number }>()
        sectorProvinceValidation.data.filter((r) => r.s === sector).forEach((prov) => {
          const existing = provincesByYear.get(prov.y) ?? { n: 0, w: 0 }
          provincesByYear.set(prov.y, { n: existing.n + prov.n, w: existing.w + prov.w })
        })

        data = Array.from(totalsByYear.entries()).map(([y, total]) => {
          const prov = provincesByYear.get(y) ?? { n: 0, w: 0 }
          return { y, n: total.n - prov.n, w: total.w - prov.w }
        })
      }
    }
    // Handle Flanders/Wallonia (aggregate provinces)
    else {
      if (sector === "ALL") {
        const validation = safeArrayAccess<MonthlyProvinceRow>(
          monthlyProvinces,
          'maandelijkse provinciegegevens',
          isMonthlyProvinceRow
        )
        if (validation.error) return { data: [], error: validation.error }

        const regionData = validation.data.filter((r) => regionAggregation.includes(r.p))
        const byYear = new Map<number, { n: number; w: number }>()
        for (const r of regionData) {
          const existing = byYear.get(r.y) ?? { n: 0, w: 0 }
          byYear.set(r.y, { n: existing.n + r.n, w: existing.w + r.w })
        }
        data = Array.from(byYear.entries()).map(([y, v]) => ({ y, n: v.n, w: v.w }))
      } else {
        const validation = safeArrayAccess<MonthlySectorProvinceRow>(
          monthlyBySectorProvince,
          'maandelijkse sector-provincie gegevens',
          isMonthlySectorProvinceRow
        )
        if (validation.error) return { data: [], error: validation.error }

        const regionSectorData = validation.data.filter((r) => regionAggregation.includes(r.p) && r.s === sector)
        const byYear = new Map<number, { n: number; w: number }>()
        for (const r of regionSectorData) {
          const existing = byYear.get(r.y) ?? { n: 0, w: 0 }
          byYear.set(r.y, { n: existing.n + r.n, w: existing.w + r.w })
        }
        data = Array.from(byYear.entries()).map(([y, v]) => ({ y, n: v.n, w: v.w }))
      }
    }

    // Apply years limit if specified
    if (yearsLimit !== undefined) {
      const maxYear = metadata.max_year
      const minYear = maxYear - yearsLimit + 1
      data = data.filter((r) => r.y >= minYear)
    }

    const chartData = data
      .map((r) => ({
        sortValue: r.y,
        periodCells: [r.y],
        value: r.n,
      }))
      .sort((a, b) => a.sortValue - b.sortValue)

    return { data: chartData, error: null }
  } catch (error) {
    console.error("Error loading yearly data:", error)
    return { data: [], error: 'Fout bij laden van jaarlijkse gegevens' }
  }
}


// Header with dynamic date
function DashboardHeader() {
  const currentYear = metadata.max_year
  const currentMonth = metadata.max_month

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>Data tot {MONTH_NAMES_FULL[currentMonth - 1]} {currentYear}</span>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>
          Deze analyse toont de maandelijkse faillissementen in Vlaanderen, met focus op de bouwsector (NACE sectie F).
          De data wordt maandelijks bijgewerkt door Statbel, ongeveer 15 dagen na de referentiemaand.
        </p>
      </div>
    </div>
  )
}

// Summary cards with region filter
function SummaryCards({ sector, regionCode }: { sector: string; regionCode: string | null }) {
  const currentYear = metadata.max_year
  const currentMonth = metadata.max_month
  const prevYear = currentYear - 1
  const { sectors } = useSectorOptions()

  // Get display name for selected region/province
  const locationName = React.useMemo(() => {
    if (!regionCode) return "België"
    const region = REGIONS.find(r => r.code === regionCode)
    if (region) return region.name
    const province = PROVINCES.find(p => p.code === regionCode)
    return province?.name ?? "Regio"
  }, [regionCode])

  // Get data based on region/province and sector filter
  let monthlyData: MonthlyRow[]
  const regionAggregation = getRegionAggregation(regionCode)

  // Handle specific province selected
  if (regionAggregation === null) {
    if (sector !== "ALL") {
      // Filter by BOTH sector AND province
      const combinedData = (monthlyBySectorProvince as MonthlySectorProvinceRow[])
        .filter((r) => r.p === regionCode && r.s === sector)
      monthlyData = combinedData.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
    } else {
      // Filter by province only (all sectors)
      const provData = (monthlyProvinces as MonthlyProvinceRow[])
        .filter((r) => r.p === regionCode)
      monthlyData = provData.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
    }
  }
  // Handle Belgium (all data)
  else if (regionAggregation === 'all') {
    if (sector === "ALL") {
      monthlyData = monthlyTotals as MonthlyRow[]
    } else {
      const sectorData = (monthlyBySector as MonthlySectorRow[])
        .filter((r) => r.s === sector)
      monthlyData = sectorData.map((r) => ({ y: r.y, m: r.m, n: r.n, w: r.w }))
    }
  }
  // Handle Brussels (total - provinces)
  else if (regionAggregation === 'brussels') {
    if (sector === "ALL") {
      const totals = monthlyTotals as MonthlyRow[]
      const provinces = monthlyProvinces as MonthlyProvinceRow[]

      const brusselsMap = new Map<string, MonthlyRow>()
      totals.forEach((total) => {
        const key = `${total.y}-${total.m}`
        brusselsMap.set(key, { y: total.y, m: total.m, n: total.n, w: total.w })
      })

      provinces.forEach((prov) => {
        const key = `${prov.y}-${prov.m}`
        const brussels = brusselsMap.get(key)
        if (brussels) {
          brussels.n -= prov.n
          brussels.w -= prov.w
        }
      })
      monthlyData = Array.from(brusselsMap.values()).sort((a, b) => a.y - b.y || a.m - b.m)
    } else {
      const sectorTotals = (monthlyBySector as MonthlySectorRow[])
        .filter((r) => r.s === sector)
      const sectorProvinces = (monthlyBySectorProvince as MonthlySectorProvinceRow[])
        .filter((r) => r.s === sector)

      const brusselsMap = new Map<string, MonthlyRow>()
      sectorTotals.forEach((total) => {
        const key = `${total.y}-${total.m}`
        brusselsMap.set(key, { y: total.y, m: total.m, n: total.n, w: total.w })
      })

      sectorProvinces.forEach((prov) => {
        const key = `${prov.y}-${prov.m}`
        const brussels = brusselsMap.get(key)
        if (brussels) {
          brussels.n -= prov.n
          brussels.w -= prov.w
        }
      })
      monthlyData = Array.from(brusselsMap.values()).sort((a, b) => a.y - b.y || a.m - b.m)
    }
  }
  // Handle Flanders/Wallonia (aggregate provinces)
  else {
    if (sector === "ALL") {
      const regionData = (monthlyProvinces as MonthlyProvinceRow[])
        .filter((r) => regionAggregation.includes(r.p))
      const aggregated = new Map<string, MonthlyRow>()
      regionData.forEach((r) => {
        const key = `${r.y}-${r.m}`
        const existing = aggregated.get(key)
        if (existing) {
          existing.n += r.n
          existing.w += r.w
        } else {
          aggregated.set(key, { y: r.y, m: r.m, n: r.n, w: r.w })
        }
      })
      monthlyData = Array.from(aggregated.values()).sort((a, b) => a.y - b.y || a.m - b.m)
    } else {
      const regionSectorData = (monthlyBySectorProvince as MonthlySectorProvinceRow[])
        .filter((r) => regionAggregation.includes(r.p) && r.s === sector)
      const aggregated = new Map<string, MonthlyRow>()
      regionSectorData.forEach((r) => {
        const key = `${r.y}-${r.m}`
        const existing = aggregated.get(key)
        if (existing) {
          existing.n += r.n
          existing.w += r.w
        } else {
          aggregated.set(key, { y: r.y, m: r.m, n: r.n, w: r.w })
        }
      })
      monthlyData = Array.from(aggregated.values()).sort((a, b) => a.y - b.y || a.m - b.m)
    }
  }

  const ytdCurrent = monthlyData
    .filter((r) => r.y === currentYear && r.m <= currentMonth)
    .reduce((sum, r) => sum + r.n, 0)

  const ytdCurrentWorkers = monthlyData
    .filter((r) => r.y === currentYear && r.m <= currentMonth)
    .reduce((sum, r) => sum + r.w, 0)

  const ytdPrev = monthlyData
    .filter((r) => r.y === prevYear && r.m <= currentMonth)
    .reduce((sum, r) => sum + r.n, 0)

  const ytdPrevWorkers = monthlyData
    .filter((r) => r.y === prevYear && r.m <= currentMonth)
    .reduce((sum, r) => sum + r.w, 0)

  const changePercent = ytdPrev > 0 ? ((ytdCurrent - ytdPrev) / ytdPrev) * 100 : 0
  const workersChangePercent = ytdPrevWorkers > 0 ? ((ytdCurrentWorkers - ytdPrevWorkers) / ytdPrevWorkers) * 100 : 0

  // Latest month data
  const latestMonth = monthlyData.find((r) => r.y === currentYear && r.m === currentMonth)
  const sameMonthPrevYear = monthlyData.find((r) => r.y === prevYear && r.m === currentMonth)
  const monthlyChange = latestMonth && sameMonthPrevYear && sameMonthPrevYear.n > 0
    ? ((latestMonth.n - sameMonthPrevYear.n) / sameMonthPrevYear.n) * 100
    : 0

  const sectorLabel = React.useMemo(() => {
    if (sector === "ALL") return "alle sectoren"
    return sectors.find((s) => s.code === sector)?.nl?.toLowerCase() ?? "sector"
  }, [sector, sectors])

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span>YTD {currentYear}</span>
          </div>
          <div className="text-2xl font-bold">{formatInt(ytdCurrent)}</div>
          <div className={cn("text-sm flex items-center gap-1", changePercent >= 0 ? "text-red-600" : "text-green-600")}>
            {changePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatPct(changePercent)} vs {prevYear}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>Werknemers YTD</span>
          </div>
          <div className="text-2xl font-bold">{formatInt(ytdCurrentWorkers)}</div>
          <div className={cn("text-sm flex items-center gap-1", workersChangePercent >= 0 ? "text-red-600" : "text-green-600")}>
            {workersChangePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatPct(workersChangePercent)} vs {prevYear}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground">
            {MONTH_NAMES_FULL[currentMonth - 1]} {currentYear}
          </div>
          <div className="text-2xl font-bold">{formatInt(latestMonth?.n ?? 0)}</div>
          <div className={cn("text-sm flex items-center gap-1", monthlyChange >= 0 ? "text-red-600" : "text-green-600")}>
            {monthlyChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatPct(monthlyChange)} vs vorig jaar
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground">Regio</div>
          <div className="text-xl font-bold">{locationName}</div>
          <div className="text-sm text-muted-foreground">{sectorLabel}</div>
        </CardContent>
      </Card>
    </div>
  )
}

// Get all years province data for interactive map
function getAllYearsProvinceData(
  sector: string
): { data: { p: string; n: number; y: number }[]; error: string | null } {
  try {
    const sourceData = sector === "ALL" ? provincesData : provincesConstruction
    const validation = safeArrayAccess<ProvinceRow>(
      sourceData,
      'provinciegegevens',
      isProvinceRow
    )

    if (validation.error) {
      return { data: [], error: validation.error }
    }

    const mapData = validation.data.map((r) => ({
      p: r.p,
      n: r.n,
      y: r.y,
    }))

    return { data: mapData, error: null }
  } catch (error) {
    console.error("Error loading province data:", error)
    return { data: [], error: 'Fout bij laden van provinciegegevens' }
  }
}

// Main evolution section with province filter
function EvolutionSection({
  sector,
  regionCode,
  onSectorChange,
  onProvinceChange,
}: {
  sector: string
  regionCode: string | null
  onSectorChange: (code: string) => void
  onProvinceChange: (code: string | null) => void
}) {
  // Get view state from store
  const currentView = useEmbedFilters((state) => state.currentView)
  const setView = useEmbedFilters((state) => state.setView)
  const timeRange = useEmbedFilters((state) => state.timeRange)
  const setTimeRangeStore = useEmbedFilters((state) => state.setTimeRange)

  const setCurrentView = React.useCallback((view: "chart" | "table" | "map") => {
    setView(view)
  }, [setView])

  const setTimeRange = React.useCallback((range: "monthly" | "yearly") => {
    setTimeRangeStore(range)
  }, [setTimeRangeStore])
  const years = isValidLookups(lookups) ? lookups.years : []

  const { data, error: dataError } = React.useMemo(() => {
    return timeRange === "monthly"
      ? getMonthlyData(sector, regionCode, 36)
      : getYearlyData(sector, regionCode)  // All years from 2005
  }, [sector, regionCode, timeRange])


  const exportData = React.useMemo(
    () =>
      data.map((d) => ({
        label: String(d.periodCells[0]),
        value: d.value,
        periodCells: d.periodCells,
      })),
    [data]
  )

  const { sectors } = useSectorOptions()

  const chartTitle = React.useMemo(() => {
    const sectorLabel = sector === "ALL"
      ? "Alle sectoren"
      : sectors.find(s => s.code === sector)?.nl ?? "Bouwsector"
    const regionLabel = regionCode
      ? ` - ${REGIONS.find(r => r.code === regionCode)?.name ?? ""}`
      : " - België"
    return `${sectorLabel}${regionLabel} - ${timeRange === "monthly" ? "maandelijkse" : "jaarlijkse"} faillissementen`
  }, [sector, regionCode, timeRange, sectors])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Evolutie faillissementen</h2>
        <ExportButtons
          data={exportData}
          title="Evolutie faillissementen"
          slug="faillissementen"
          sectionId="evolutie"
          viewType={currentView === "map" ? "chart" : currentView}
          periodHeaders={[timeRange === "monthly" ? "Maand" : "Jaar"]}
          valueLabel="Faillissementen"
          dataSource="Statbel - Faillissementen"
          dataSourceUrl="https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen"
        />
      </div>

      <Tabs value={currentView === "map" ? "chart" : currentView} onValueChange={(v) => setCurrentView(v as "chart" | "table")}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <SectorFilter selected={sector} onChange={onSectorChange} showAll />
            <ProvinceFilter selected={regionCode} onChange={onProvinceChange} />
            {currentView !== "map" && (
              <>
                <Button
                  variant={timeRange === "monthly" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange("monthly")}
                >
                  Maandelijks
                </Button>
                <Button
                  variant={timeRange === "yearly" ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setTimeRange("yearly")}
                >
                  Jaarlijks
                </Button>
              </>
            )}
          </div>
        </div>
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>{chartTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {dataError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Fout bij laden van gegevens</AlertTitle>
                  <AlertDescription>{dataError}</AlertDescription>
                </Alert>
              ) : (
                <FilterableChart
                  key={`${sector}-${regionCode}-${timeRange}-${data.length}-${data[0]?.value}`}
                  data={data}
                  getLabel={(d) => String((d as ChartPoint).periodCells[0])}
                  getValue={(d) => (d as ChartPoint).value}
                  getSortValue={(d) => (d as ChartPoint).sortValue}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Data</CardTitle>
            </CardHeader>
            <CardContent>
              {dataError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Fout bij laden van gegevens</AlertTitle>
                  <AlertDescription>{dataError}</AlertDescription>
                </Alert>
              ) : (
                <FilterableTable
                  data={data}
                  label="Faillissementen"
                  periodHeaders={[timeRange === "monthly" ? "Maand" : "Jaar"]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Company duration section (bedrijfsleeftijd)
function DurationSection({
  sector,
  regionCode,
  onSectorChange,
  onProvinceChange,
}: {
  sector: string
  regionCode: string | null
  onSectorChange: (code: string) => void
  onProvinceChange: (code: string | null) => void
}) {
  const currentYear = metadata.max_year
  const [selectedYear, setSelectedYear] = React.useState(currentYear)
  const years = isValidLookups(lookups) ? lookups.years : []

  const data = React.useMemo(() => {
    let durationData: DurationRow[]

    // Region/Province filter for construction sector
    if (regionCode && sector === "F") {
      const regionAggregation = getRegionAggregation(regionCode)

      if (regionAggregation === null) {
        // Specific province selected
        const provData = (yearlyByDurationProvinceConstruction as DurationProvinceRow[])
          .filter((r) => r.y === selectedYear && r.p === regionCode)
        durationData = provData.map((r) => ({
          y: r.y,
          d: r.d,
          ds: r.ds,
          do: r.do,
          n: r.n,
          w: r.w,
        }))
      } else if (regionAggregation === 'all') {
        // Belgium - all data
        durationData = (yearlyByDurationConstruction as DurationRow[])
          .filter((r) => r.y === selectedYear)
      } else if (regionAggregation === 'brussels') {
        // Brussels - calculate from total - provinces
        const totalData = (yearlyByDurationConstruction as DurationRow[])
          .filter((r) => r.y === selectedYear)
        const provinceData = (yearlyByDurationProvinceConstruction as DurationProvinceRow[])
          .filter((r) => r.y === selectedYear)

        // Aggregate provinces by duration
        const provincesByDuration = new Map<string, { n: number; w: number }>()
        provinceData.forEach((r) => {
          const existing = provincesByDuration.get(r.d) ?? { n: 0, w: 0 }
          provincesByDuration.set(r.d, { n: existing.n + r.n, w: existing.w + r.w })
        })

        // Calculate Brussels = Total - Provinces
        durationData = totalData.map((total) => ({
          y: total.y,
          d: total.d,
          ds: total.ds,
          do: total.do,
          n: total.n - (provincesByDuration.get(total.d)?.n ?? 0),
          w: total.w - (provincesByDuration.get(total.d)?.w ?? 0),
        }))
      } else {
        // Flanders or Wallonia - aggregate provinces
        const provData = (yearlyByDurationProvinceConstruction as DurationProvinceRow[])
          .filter((r) => r.y === selectedYear && regionAggregation.includes(r.p))

        // Aggregate by duration
        const byDuration = new Map<string, { ds: string; do: number; n: number; w: number }>()
        provData.forEach((r) => {
          const existing = byDuration.get(r.d)
          if (existing) {
            existing.n += r.n
            existing.w += r.w
          } else {
            byDuration.set(r.d, { ds: r.ds, do: r.do, n: r.n, w: r.w })
          }
        })

        durationData = Array.from(byDuration.entries()).map(([d, v]) => ({
          y: selectedYear,
          d,
          ds: v.ds,
          do: v.do,
          n: v.n,
          w: v.w,
        }))
      }
    } else if (sector === "ALL") {
      // All sectors aggregated
      durationData = (yearlyByDuration as DurationRow[])
        .filter((r) => r.y === selectedYear)
    } else if (sector === "F") {
      // Construction sector only
      durationData = (yearlyByDurationConstruction as DurationRow[])
        .filter((r) => r.y === selectedYear)
    } else {
      // Specific sector - use sector-specific data
      const sectorData = (yearlyByDurationSector as DurationSectorRow[])
        .filter((r) => r.y === selectedYear && r.s === sector)
      durationData = sectorData.map((r) => ({
        y: r.y,
        d: r.d,
        ds: r.ds,
        do: r.do,
        n: r.n,
        w: r.w,
      }))
    }

    return durationData.sort((a, b) => a.do - b.do)
  }, [selectedYear, regionCode, sector])

  const totalBankruptcies = data.reduce((sum, r) => sum + r.n, 0)
  const youngCompanies = data.filter(r => r.do <= 4)
  const youngCompanyCount = youngCompanies.reduce((sum, r) => sum + r.n, 0)
  const youngCompanyPercent = totalBankruptcies > 0 ? (youngCompanyCount / totalBankruptcies) * 100 : 0

  const { sectors, error: sectorsError } = useSectorOptions()
  const sectorName = sector === "ALL"
    ? "Alle sectoren"
    : sectors.find((s) => s.code === sector)?.nl ?? "Onbekend"
  const sectorLabelNoun = sector === "ALL" ? "bedrijven" : "bouwbedrijven"
  const exportData = React.useMemo(
    () =>
      data.map((d) => ({
        label: d.ds,
        value: d.n,
        periodCells: [String(selectedYear), d.ds],
      })),
    [data, selectedYear]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Leeftijd gefailleerde bedrijven</h2>
        <ExportButtons
          data={exportData}
          title={`Bedrijfsleeftijd faillissementen ${sectorName.toLowerCase()}`}
          slug="faillissementen"
          sectionId="leeftijd"
          viewType="table"
          periodHeaders={["Jaar", "Bedrijfsleeftijd"]}
          valueLabel="Faillissementen"
          dataSource="Statbel - Faillissementen"
          dataSourceUrl="https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen"
          embedParams={{ year: selectedYear, view: "chart" }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <SectorFilter selected={sector} onChange={onSectorChange} showAll />
        {sector === "F" && <ProvinceFilter selected={regionCode} onChange={onProvinceChange} />}
        <YearFilter selected={selectedYear} onChange={setSelectedYear} years={years} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Faillissementen {sectorName.toLowerCase()} naar bedrijfsleeftijd ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.map((r) => {
              const widthPercent = totalBankruptcies > 0 ? (r.n / totalBankruptcies) * 100 : 0
              const isYoung = r.do <= 4 // < 5 jaar

              return (
                <div key={r.d} className={cn("py-2", isYoung && "bg-destructive/5 -mx-4 px-4 rounded")}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium", isYoung && "text-destructive")}>{r.ds}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{formatInt(r.w)} werknemers</span>
                      <span className="font-bold min-w-[60px] text-right">{formatInt(r.n)}</span>
                      <span className="text-muted-foreground min-w-[50px] text-right">({widthPercent.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", isYoung ? "bg-destructive" : "bg-muted-foreground/30")}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            <p>Jonge bedrijven (&lt;5 jaar) zijn gemarkeerd. In {selectedYear} faalden {formatInt(youngCompanyCount)} jonge {sectorLabelNoun} ({youngCompanyPercent.toFixed(1)}% van totaal).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Workers count section (aantal werknemers)
function WorkersSection({
  sector,
  regionCode,
  onSectorChange,
  onProvinceChange,
}: {
  sector: string
  regionCode: string | null
  onSectorChange: (code: string) => void
  onProvinceChange: (code: string | null) => void
}) {
  const currentYear = metadata.max_year
  const [selectedYear, setSelectedYear] = React.useState(currentYear)
  const years = isValidLookups(lookups) ? lookups.years : []

  const data = React.useMemo(() => {
    let workersData: WorkersRow[]

    // Region/Province filter for construction sector
    if (regionCode && sector === "F") {
      const regionAggregation = getRegionAggregation(regionCode)

      if (regionAggregation === null) {
        // Specific province selected
        const provData = (yearlyByWorkersProvinceConstruction as WorkersProvinceRow[])
          .filter((r) => r.y === selectedYear && r.p === regionCode)
        // Aggregate by class
        const byClass = new Map<string, { n: number; w: number }>()
        for (const r of provData) {
          const existing = byClass.get(r.c) ?? { n: 0, w: 0 }
          byClass.set(r.c, { n: existing.n + r.n, w: existing.w + r.w })
        }
        workersData = Array.from(byClass.entries()).map(([c, v]) => ({
          y: selectedYear,
          c,
          n: v.n,
          w: v.w,
        }))
      } else if (regionAggregation === 'all') {
        // Belgium - all data
        workersData = (yearlyByWorkersConstruction as WorkersRow[])
          .filter((r) => r.y === selectedYear)
      } else if (regionAggregation === 'brussels') {
        // Brussels - calculate from total - provinces
        const totalData = (yearlyByWorkersConstruction as WorkersRow[])
          .filter((r) => r.y === selectedYear)
        const provinceData = (yearlyByWorkersProvinceConstruction as WorkersProvinceRow[])
          .filter((r) => r.y === selectedYear)

        // Aggregate provinces by worker class
        const provincesByClass = new Map<string, { n: number; w: number }>()
        provinceData.forEach((r) => {
          const existing = provincesByClass.get(r.c) ?? { n: 0, w: 0 }
          provincesByClass.set(r.c, { n: existing.n + r.n, w: existing.w + r.w })
        })

        // Calculate Brussels = Total - Provinces
        workersData = totalData.map((total) => ({
          y: total.y,
          c: total.c,
          n: total.n - (provincesByClass.get(total.c)?.n ?? 0),
          w: total.w - (provincesByClass.get(total.c)?.w ?? 0),
        }))
      } else {
        // Flanders or Wallonia - aggregate provinces
        const provData = (yearlyByWorkersProvinceConstruction as WorkersProvinceRow[])
          .filter((r) => r.y === selectedYear && regionAggregation.includes(r.p))

        // Aggregate by class
        const byClass = new Map<string, { n: number; w: number }>()
        for (const r of provData) {
          const existing = byClass.get(r.c) ?? { n: 0, w: 0 }
          byClass.set(r.c, { n: existing.n + r.n, w: existing.w + r.w })
        }
        workersData = Array.from(byClass.entries()).map(([c, v]) => ({
          y: selectedYear,
          c,
          n: v.n,
          w: v.w,
        }))
      }
    } else if (sector === "ALL") {
      // All sectors aggregated
      workersData = (yearlyByWorkers as WorkersRow[])
        .filter((r) => r.y === selectedYear)
    } else if (sector === "F") {
      // Construction sector only
      workersData = (yearlyByWorkersConstruction as WorkersRow[])
        .filter((r) => r.y === selectedYear)
    } else {
      // Specific sector - use sector-specific data
      const sectorData = (yearlyByWorkersSector as WorkersSectorRow[])
        .filter((r) => r.y === selectedYear && r.s === sector)
      workersData = sectorData.map((r) => ({
        y: r.y,
        c: r.c,
        n: r.n,
        w: r.w,
      }))
    }

    return workersData.sort((a, b) => {
      const aIdx = WORKER_CLASS_ORDER.indexOf(a.c)
      const bIdx = WORKER_CLASS_ORDER.indexOf(b.c)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })
  }, [selectedYear, regionCode, sector])

  const totalBankruptcies = data.reduce((sum, r) => sum + r.n, 0)
  const totalWorkers = data.reduce((sum, r) => sum + r.w, 0)
  const smallCompanies = data.filter(r => r.c === "0 - 4 werknemers")
  const smallCompanyCount = smallCompanies.reduce((sum, r) => sum + r.n, 0)
  const smallCompanyPercent = totalBankruptcies > 0 ? (smallCompanyCount / totalBankruptcies) * 100 : 0

  const { sectors, error: sectorsError } = useSectorOptions()
  const sectorName = sector === "ALL"
    ? "Alle sectoren"
    : sectors.find((s) => s.code === sector)?.nl ?? "Onbekend"
  const exportData = React.useMemo(
    () =>
      data.map((d) => ({
        label: d.c,
        value: d.n,
        periodCells: [String(selectedYear), d.c],
      })),
    [data, selectedYear]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Bedrijfsgrootte</h2>
        <ExportButtons
          data={exportData}
          title={`Bedrijfsgrootte faillissementen ${sectorName.toLowerCase()}`}
          slug="faillissementen"
          sectionId="bedrijfsgrootte"
          viewType="table"
          periodHeaders={["Jaar", "Bedrijfsgrootte"]}
          valueLabel="Faillissementen"
          dataSource="Statbel - Faillissementen"
          dataSourceUrl="https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen"
          embedParams={{ year: selectedYear, view: "chart" }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <SectorFilter selected={sector} onChange={onSectorChange} showAll />
        {sector === "F" && <ProvinceFilter selected={regionCode} onChange={onProvinceChange} />}
        <YearFilter selected={selectedYear} onChange={setSelectedYear} years={years} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Faillissementen {sectorName.toLowerCase()} naar bedrijfsgrootte ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.map((r) => {
              const widthPercent = totalBankruptcies > 0 ? (r.n / totalBankruptcies) * 100 : 0
              const isSmall = r.c === "0 - 4 werknemers"

              return (
                <div key={r.c} className={cn("py-2", isSmall && "bg-primary/5 -mx-4 px-4 rounded")}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium", isSmall && "text-primary")}>{r.c}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{formatInt(r.w)} werknemers</span>
                      <span className="font-bold min-w-[60px] text-right">{formatInt(r.n)}</span>
                      <span className="text-muted-foreground min-w-[50px] text-right">({widthPercent.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", isSmall ? "bg-primary" : "bg-muted-foreground/30")}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            <p>In {selectedYear} waren {formatInt(smallCompanyCount)} faillissementen ({smallCompanyPercent.toFixed(1)}%) kleine bedrijven (0-4 werknemers). In totaal verloren {formatInt(totalWorkers)} werknemers hun job.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Sector comparison section
function SectorComparisonSection({
  regionCode,
  onProvinceChange,
}: {
  regionCode: string | null
  onProvinceChange: (code: string | null) => void
}) {
  const currentYear = metadata.max_year
  const [selectedYear, setSelectedYear] = React.useState(currentYear)
  const years = isValidLookups(lookups) ? lookups.years : []
  const { sectors, error: sectorsError } = useSectorOptions()

  const data = React.useMemo(() => {
    let sectorData: YearlySectorRow[]

    if (regionCode) {
      const regionAggregation = getRegionAggregation(regionCode)

      if (regionAggregation === null) {
        // Specific province selected
        const provData = (yearlyBySectorProvince as YearlySectorProvinceRow[])
          .filter((r) => r.y === selectedYear && r.p === regionCode)
        // Aggregate to sector level
        const bySector = new Map<string, { n: number; w: number }>()
        for (const r of provData) {
          const existing = bySector.get(r.s) ?? { n: 0, w: 0 }
          bySector.set(r.s, { n: existing.n + r.n, w: existing.w + r.w })
        }
        sectorData = Array.from(bySector.entries()).map(([s, v]) => ({
          y: selectedYear,
          s,
          n: v.n,
          w: v.w,
        }))
      } else if (regionAggregation === 'all') {
        // Belgium - all data
        sectorData = (yearlyBySector as YearlySectorRow[])
          .filter((r) => r.y === selectedYear)
      } else if (regionAggregation === 'brussels') {
        // Brussels - calculate from total - provinces
        const totalData = (yearlyBySector as YearlySectorRow[])
          .filter((r) => r.y === selectedYear)
        const provinceData = (yearlyBySectorProvince as YearlySectorProvinceRow[])
          .filter((r) => r.y === selectedYear)

        // Aggregate provinces by sector
        const provincesBySector = new Map<string, { n: number; w: number }>()
        provinceData.forEach((r) => {
          const existing = provincesBySector.get(r.s) ?? { n: 0, w: 0 }
          provincesBySector.set(r.s, { n: existing.n + r.n, w: existing.w + r.w })
        })

        // Calculate Brussels = Total - Provinces
        sectorData = totalData.map((total) => ({
          y: total.y,
          s: total.s,
          n: total.n - (provincesBySector.get(total.s)?.n ?? 0),
          w: total.w - (provincesBySector.get(total.s)?.w ?? 0),
        }))
      } else {
        // Flanders or Wallonia - aggregate provinces
        const provData = (yearlyBySectorProvince as YearlySectorProvinceRow[])
          .filter((r) => r.y === selectedYear && regionAggregation.includes(r.p))

        // Aggregate to sector level
        const bySector = new Map<string, { n: number; w: number }>()
        for (const r of provData) {
          const existing = bySector.get(r.s) ?? { n: 0, w: 0 }
          bySector.set(r.s, { n: existing.n + r.n, w: existing.w + r.w })
        }
        sectorData = Array.from(bySector.entries()).map(([s, v]) => ({
          y: selectedYear,
          s,
          n: v.n,
          w: v.w,
        }))
      }
    } else {
      sectorData = (yearlyBySector as YearlySectorRow[])
        .filter((r) => r.y === selectedYear)
    }

    return sectorData
      .map((r) => ({
        sector: r.s,
        name: sectors.find((s) => s.code === r.s)?.nl ?? r.s,
        n: r.n,
        w: r.w,
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
  }, [selectedYear, sectors, regionCode])

  const constructionData = data.find((d) => d.sector === "F")
  const constructionRank = data.findIndex((d) => d.sector === "F") + 1

  const exportData = React.useMemo(
    () =>
      data.map((d) => ({
        label: d.name,
        value: d.n,
        periodCells: [String(selectedYear), d.name],
      })),
    [data, selectedYear]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Sectorvergelijking</h2>
        <ExportButtons
          data={exportData}
          title="Sectorvergelijking faillissementen"
          slug="faillissementen"
          sectionId="sectoren"
          viewType="table"
          periodHeaders={["Jaar", "Sector"]}
          valueLabel="Faillissementen"
          dataSource="Statbel - Faillissementen"
          dataSourceUrl="https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen"
          embedParams={{ year: selectedYear, view: "chart" }}
        />
      </div>

      {constructionData && (
        <Card className="border-primary">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Bouwsector (rang #{constructionRank} in {selectedYear})</div>
                <div className="text-2xl font-bold">{formatInt(constructionData.n)} faillissementen</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Getroffen werknemers</div>
                <div className="text-xl font-bold">{formatInt(constructionData.w)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <ProvinceFilter selected={regionCode} onChange={onProvinceChange} />
        <YearFilter selected={selectedYear} onChange={setSelectedYear} years={years} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top 10 sectoren met meeste faillissementen ({selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.map((r, i) => {
              const isConstruction = r.sector === "F"
              const maxValue = data[0]?.n ?? 1
              const widthPercent = (r.n / maxValue) * 100

              return (
                <div key={r.sector} className={cn("py-2", isConstruction && "bg-primary/5 -mx-4 px-4 rounded")}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-muted-foreground">{i + 1}.</span>
                      <span className={cn("font-medium", isConstruction && "text-primary")}>{r.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-muted-foreground">{formatInt(r.w)} werknemers</span>
                      <span className="font-bold min-w-[60px] text-right">{formatInt(r.n)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", isConstruction ? "bg-primary" : "bg-muted-foreground/30")}
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


// Main Dashboard Component
export function FaillissementenDashboard() {
  // Initialize filters from URL with analysis-specific defaults
  // This automatically sets analysis context and loads defaults from registry
  useInitializeFiltersWithDefaults('faillissementen')

  const { data: bundle, loading, error } = useFaillissementenData()

  if (bundle) {
    monthlyConstruction = bundle.monthlyConstruction as MonthlyRow[]
    monthlyTotals = bundle.monthlyTotals as MonthlyRow[]
    monthlyBySector = bundle.monthlyBySector as MonthlySectorRow[]
    monthlyBySectorProvince = bundle.monthlyBySectorProvince as MonthlySectorProvinceRow[]
    yearlyConstruction = bundle.yearlyConstruction as YearlyRow[]
    yearlyTotals = bundle.yearlyTotals as YearlyRow[]
    yearlyBySector = bundle.yearlyBySector as YearlySectorRow[]
    yearlyBySectorProvince = bundle.yearlyBySectorProvince as YearlySectorProvinceRow[]
    provincesConstruction = bundle.provincesConstruction as ProvinceRow[]
    provincesData = bundle.provincesData as ProvinceRow[]
    monthlyProvincesConstruction = bundle.monthlyProvincesConstruction as MonthlyProvinceRow[]
    monthlyProvinces = bundle.monthlyProvinces as MonthlyProvinceRow[]
    lookups = bundle.lookups
    metadata = bundle.metadata
    yearlyByDuration = bundle.yearlyByDuration as DurationRow[]
    yearlyByDurationConstruction = bundle.yearlyByDurationConstruction as DurationRow[]
    yearlyByDurationProvinceConstruction = bundle.yearlyByDurationProvinceConstruction as DurationProvinceRow[]
    yearlyByDurationSector = bundle.yearlyByDurationSector as DurationSectorRow[]
    yearlyByWorkers = bundle.yearlyByWorkers as WorkersRow[]
    yearlyByWorkersConstruction = bundle.yearlyByWorkersConstruction as WorkersRow[]
    yearlyByWorkersProvinceConstruction = bundle.yearlyByWorkersProvinceConstruction as WorkersProvinceRow[]
    yearlyByWorkersSector = bundle.yearlyByWorkersSector as WorkersSectorRow[]

    VALID_SECTOR_CODES = Array.from(
      new Set([
        "ALL",
        ...((lookups?.sectors ?? []).map((s: Sector) => s.code)),
      ])
    )
  }

  // Get filter state from store
  const selectedSector = useEmbedFilters((state) => state.selectedSector)
  const setSector = useEmbedFilters((state) => state.setSector)
  const selectedProvince = useEmbedFilters((state) => state.selectedProvince)
  const setProvince = useEmbedFilters((state) => state.setProvince)

  const sectorValidation = React.useMemo(
    () => validateSectorCode(selectedSector ?? null, VALID_SECTOR_CODES, true),
    [selectedSector, bundle]
  )

  // Use validated sector with fallback to "ALL" (= "Alle sectoren")
  // The defaults registry sets this to "ALL", but we provide a fallback for safety
  const sectorValue = sectorValidation.valid
    ? (sectorValidation.value ?? "ALL")
    : "ALL"

  // Stabilize callbacks to prevent unnecessary re-renders
  const handleSectorChange = React.useCallback((code: string) => {
    setSector(code)
  }, [setSector])

  const handleProvinceChange = React.useCallback((code: string | null) => {
    setProvince(code)
  }, [setProvince])

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

  return (
    <div className="space-y-10">
      <DashboardHeader />

      <SummaryCards sector={sectorValue} regionCode={selectedProvince} />

      <EvolutionSection
        sector={sectorValue}
        regionCode={selectedProvince}
        onSectorChange={handleSectorChange}
        onProvinceChange={handleProvinceChange}
      />

      <SectorComparisonSection
        regionCode={selectedProvince}
        onProvinceChange={handleProvinceChange}
      />

      <DurationSection
        sector={sectorValue}
        regionCode={selectedProvince}
        onSectorChange={handleSectorChange}
        onProvinceChange={handleProvinceChange}
      />

      <WorkersSection
        sector={sectorValue}
        regionCode={selectedProvince}
        onSectorChange={handleSectorChange}
        onProvinceChange={handleProvinceChange}
      />
    </div>
  )
}
