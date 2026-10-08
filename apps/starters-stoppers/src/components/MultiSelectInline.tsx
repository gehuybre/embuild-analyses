"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
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
import { GEO_ARRONDISSEMENTS, GEO_PROVINCES, GEO_REGIONS, Option, normalizeGeos, describeSelection, labelsFor } from "@/lib/selection"

export type OptionGroup = { heading: string; options: Option[] }

/**
 * Keuzelijst waarin meerdere waarden aangevinkt kunnen worden. Een lege selectie betekent "alles"
 * (het eerste item wist de selectie). De lijst blijft open zodat er in één keer meerdere gekozen kunnen worden.
 */
export function MultiSelectInline({
  groups,
  selected,
  onChange,
  allLabel,
  noun,
  searchable = false,
  className,
  disabledCodes,
}: {
  groups: OptionGroup[]
  selected: string[]
  onChange: (next: string[]) => void
  allLabel: string
  noun: string
  searchable?: boolean
  className?: string
  disabledCodes?: string[]
}) {
  const [open, setOpen] = React.useState(false)
  const allOptions = React.useMemo(() => groups.flatMap((group) => group.options), [groups])

  const triggerLabel = React.useMemo(() => {
    if (selected.length === 0) return allLabel
    return describeSelection(labelsFor(selected, allOptions), noun, 1)
  }, [allLabel, allOptions, noun, selected])

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className={cn("h-9 gap-1 min-w-[130px]", className)}>
          <span className="truncate max-w-[170px]">{triggerLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={searchable ? "w-[340px] p-0" : "w-[240px] p-0"} align="start">
        <Command>
          {searchable ? <CommandInput placeholder="Zoeken..." /> : null}
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup>
              <CommandItem value={allLabel} onSelect={() => onChange([])}>
                <Check className={cn("mr-2 h-4 w-4", selected.length === 0 ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
            </CommandGroup>
            {groups.map((group) => (
              <React.Fragment key={group.heading}>
                <CommandSeparator />
                <CommandGroup heading={group.heading}>
                  {group.options.map((option) => {
                    const disabled = disabledCodes?.includes(option.code) ?? false
                    return (
                      <CommandItem
                        key={option.code}
                        value={`${option.label} ${option.code}`}
                        disabled={disabled}
                        onSelect={() => toggle(option.code)}
                      >
                        <span
                          className={cn(
                            "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                            selected.includes(option.code) ? "bg-primary text-primary-foreground" : "opacity-60"
                          )}
                        >
                          {selected.includes(option.code) ? <Check className="h-3 w-3" /> : null}
                        </span>
                        {option.label}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const GEO_GROUPS: OptionGroup[] = [
  { heading: "Regio", options: GEO_REGIONS },
  { heading: "Provincie", options: GEO_PROVINCES.map(({ code, label }) => ({ code, label })) },
]

const GEO_GROUPS_WITH_ARRONDISSEMENTEN: OptionGroup[] = [
  ...GEO_GROUPS,
  { heading: "Arrondissement", options: GEO_ARRONDISSEMENTS.map(({ code, label }) => ({ code, label })) },
]

/**
 * Locatiefilter: gewesten, provincies en (optioneel) arrondissementen door elkaar. Een onderliggend niveau van een
 * gekozen gewest of provincie is niet meer selecteerbaar (dubbeltelling).
 */
export function GeoMultiFilter({
  selected,
  onChange,
  allowArrondissements = false,
}: {
  selected: string[]
  onChange: (next: string[]) => void
  allowArrondissements?: boolean
}) {
  const disabledCodes = React.useMemo(
    () => [
      ...GEO_PROVINCES.filter((province) => selected.includes(province.regionCode)).map((province) => province.code),
      ...GEO_ARRONDISSEMENTS.filter(
        (arrondissement) => selected.includes(arrondissement.regionCode) || selected.includes(arrondissement.provinceCode)
      ).map((arrondissement) => arrondissement.code),
    ],
    [selected]
  )
  return (
    <MultiSelectInline
      groups={allowArrondissements ? GEO_GROUPS_WITH_ARRONDISSEMENTEN : GEO_GROUPS}
      selected={selected}
      onChange={(next) => onChange(normalizeGeos(next, allowArrondissements))}
      allLabel="België"
      noun="locaties"
      searchable
      disabledCodes={disabledCodes}
      className="min-w-[120px]"
    />
  )
}
