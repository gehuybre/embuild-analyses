"use client"

import React, { useEffect, useRef, useState } from 'react'
import { Button } from "../ui/button"
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { cn } from "../../lib/utils"

interface HierarchicalFilterProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
  minWidth?: number
}

export function HierarchicalFilter({
  value,
  onChange,
  options,
  placeholder,
  minWidth = 200,
}: HierarchicalFilterProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedLabel = value || placeholder

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
          className="h-9 gap-1 justify-between"
          style={{ minWidth: `${minWidth}px` }}
        >
          <span className="truncate" style={{ maxWidth: `${minWidth - 20}px` }}>
            {selectedLabel}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[400px] p-0"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Command>
          <CommandInput
            ref={inputRef}
            placeholder={`Zoek ${placeholder.toLowerCase()}...`}
          />
          <CommandList>
            <CommandEmpty>Geen resultaat.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="alle"
                onSelect={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === '' ? "opacity-100" : "opacity-0")} />
                Alle
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => {
                    onChange(option)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === option ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
