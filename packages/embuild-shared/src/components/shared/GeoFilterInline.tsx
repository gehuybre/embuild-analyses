"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "../ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { cn } from "../../lib/utils"
import { PROVINCES, ProvinceCode, REGIONS, RegionCode } from "../../lib/geo-utils"

interface GeoFilterInlineProps {
  selectedRegion: RegionCode
  selectedProvince: ProvinceCode | null
  onSelectRegion: (code: RegionCode) => void
  onSelectProvince: (code: ProvinceCode | null) => void
  showRegions?: boolean
  showProvinces?: boolean
}

export function GeoFilterInline({
  selectedRegion,
  selectedProvince,
  onSelectRegion,
  onSelectProvince,
  showRegions = true,
  showProvinces = true,
}: GeoFilterInlineProps) {
  const [open, setOpen] = React.useState(false)

  const sortedProvinces = React.useMemo(() => {
    return [...PROVINCES].sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  const currentLabel = React.useMemo(() => {
    if (showProvinces && selectedProvince) {
      return PROVINCES.find((p) => String(p.code) === String(selectedProvince))?.name ?? "Provincie"
    }
    if (selectedRegion !== "1000") {
      return REGIONS.find((r) => r.code === selectedRegion)?.name ?? "Regio"
    }
    return "België"
  }, [selectedRegion, selectedProvince])

  function selectBelgium() {
    onSelectRegion("1000")
    onSelectProvince(null)
    setOpen(false)
  }

  function selectRegion(code: RegionCode) {
    onSelectRegion(code)
    onSelectProvince(null)
    setOpen(false)
  }

  function selectProvince(code: ProvinceCode) {
    onSelectProvince(code)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className="h-9 gap-1 min-w-[120px]">
          <span className="truncate max-w-[100px]">{currentLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Zoek locatie..." />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup heading="Land">
              <CommandItem value="België" onSelect={selectBelgium}>
                <Check className={cn("mr-2 h-4 w-4", selectedRegion === "1000" && !selectedProvince ? "opacity-100" : "opacity-0")} />
                België
              </CommandItem>
            </CommandGroup>
            {showRegions && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Regio">
                  {REGIONS.filter((r) => r.code !== "1000").map((r) => (
                    <CommandItem key={r.code} value={r.name} onSelect={() => selectRegion(r.code)}>
                      <Check className={cn("mr-2 h-4 w-4", !selectedProvince && selectedRegion === r.code ? "opacity-100" : "opacity-0")} />
                      {r.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {showProvinces ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Provincie">
                  {sortedProvinces.map((p) => (
                    <CommandItem key={p.code} value={p.name} onSelect={() => selectProvince(p.code)}>
                      <Check className={cn("mr-2 h-4 w-4", String(selectedProvince) === String(p.code) ? "opacity-100" : "opacity-0")} />
                      {p.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
