"use client"

import React, { useState, useContext, useMemo, useEffect, useRef } from 'react'
import { Button } from "@embuild/shared/components/ui/button"
import { Check, ChevronsUpDown } from 'lucide-react'
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
import { SimpleGeoContext } from "@embuild/shared/components/shared/GeoContext"
import { getAllMunicipalities, type NisLookup } from "./nisUtils"

interface SimpleGeoFilterProps {
  availableMunicipalities?: string[]
  municipalityLookup?: NisLookup | null
}

export function SimpleGeoFilter({ availableMunicipalities, municipalityLookup }: SimpleGeoFilterProps = {}) {
  const { selection, setSelection } = useContext(SimpleGeoContext)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const allMunicipalities = useMemo(() => getAllMunicipalities(municipalityLookup), [municipalityLookup])

  // Filter municipalities if availableMunicipalities is provided
  const municipalities = useMemo(() =>
    availableMunicipalities
      ? allMunicipalities.filter(m => availableMunicipalities.includes(m.nisCode))
      : allMunicipalities,
    [allMunicipalities, availableMunicipalities]
  )

  const getLabel = () => {
    if (selection.type === 'all') return 'Heel Vlaanderen'
    if (selection.type === 'municipality' && selection.code) {
      const muni = municipalities.find(m => m.nisCode === selection.code)
      return muni?.name || selection.code
    }
    return 'Selecteer locatie'
  }

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-9 gap-1 min-w-[200px] justify-between"
        >
          <span className="truncate">{getLabel()}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-0"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Command>
          <CommandInput ref={inputRef} placeholder="Zoek gemeente..." />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => {
                  setSelection({ type: 'all' })
                  setOpen(false)
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", selection.type === 'all' ? "opacity-100" : "opacity-0")} />
                Heel Vlaanderen
              </CommandItem>
              {municipalities.map((muni) => (
                <CommandItem
                  key={muni.nisCode}
                  value={muni.name}
                  onSelect={() => {
                    setSelection({ type: 'municipality', code: muni.nisCode })
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selection.type === 'municipality' && selection.code === muni.nisCode ? "opacity-100" : "opacity-0")} />
                  {muni.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
