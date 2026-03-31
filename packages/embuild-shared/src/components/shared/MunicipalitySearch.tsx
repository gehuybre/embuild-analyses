"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { Search, X } from "lucide-react"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"

interface Municipality {
  code: string
  name: string
}

interface MunicipalitySearchProps {
  /** Currently selected municipality code */
  selectedMunicipality?: string | null

  /** Callback when a municipality is selected */
  onSelect: (code: string | null) => void

  /** Placeholder text for search input */
  placeholder?: string

  /** Optional class name */
  className?: string

  /** List of municipalities to search from */
  municipalities?: Municipality[]
}

/**
 * MunicipalitySearch component
 *
 * Provides autocomplete search functionality for Belgian municipalities.
 * Users can type to filter municipalities and select one to zoom the map.
 */
export function MunicipalitySearch({
  selectedMunicipality = null,
  onSelect,
  placeholder = "Zoek gemeente...",
  className,
  municipalities = [],
}: MunicipalitySearchProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Filter municipalities based on search query
  const filteredMunicipalities = useMemo(() => {
    if (!searchQuery.trim()) return []

    const query = searchQuery.toLowerCase().trim()
    return municipalities
      .filter((m) => m.name.toLowerCase().includes(query))
      .slice(0, 10) // Limit to 10 results
  }, [searchQuery, municipalities])

  // Get selected municipality name
  const selectedName = useMemo(() => {
    if (!selectedMunicipality) return null
    const muni = municipalities.find((m) => m.code === selectedMunicipality)
    return muni?.name ?? null
  }, [selectedMunicipality, municipalities])

  // Handle selection
  const handleSelect = (code: string | null) => {
    onSelect(code)
    setSearchQuery("")
    setIsOpen(false)
    setHighlightedIndex(0)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredMunicipalities.length === 0) return

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < filteredMunicipalities.length - 1 ? prev + 1 : prev
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
        break
      case "Enter":
        e.preventDefault()
        if (filteredMunicipalities[highlightedIndex]) {
          handleSelect(filteredMunicipalities[highlightedIndex].code)
        }
        break
      case "Escape":
        e.preventDefault()
        setIsOpen(false)
        setSearchQuery("")
        break
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Open dropdown when typing
  useEffect(() => {
    if (searchQuery.trim()) {
      setIsOpen(true)
      setHighlightedIndex(0)
    } else {
      setIsOpen(false)
    }
  }, [searchQuery])

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex gap-2 items-center">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="pl-9"
            aria-label="Zoek gemeente"
            aria-autocomplete="list"
            aria-controls={isOpen ? "municipality-list" : undefined}
            aria-expanded={isOpen}
          />
        </div>

        {/* Clear button (only show when municipality selected) */}
        {selectedMunicipality && (
          <Button
            onClick={() => handleSelect(null)}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <X className="h-4 w-4" />
            <span className="hidden sm:inline">Reset</span>
          </Button>
        )}
      </div>

      {/* Selected municipality indicator */}
      {selectedName && !searchQuery && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          Geselecteerd: <span className="font-medium">{selectedName}</span>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && filteredMunicipalities.length > 0 && (
        <ul
          id="municipality-list"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto z-50"
        >
          {filteredMunicipalities.map((municipality, index) => (
            <li
              key={municipality.code}
              role="option"
              aria-selected={index === highlightedIndex}
              className={cn(
                "px-4 py-2 cursor-pointer transition-colors",
                index === highlightedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
              )}
              onClick={() => handleSelect(municipality.code)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="font-medium">{municipality.name}</div>
              <div className="text-xs text-muted-foreground">
                NIS: {municipality.code}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* No results */}
      {isOpen && searchQuery.trim() && filteredMunicipalities.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg p-4 text-sm text-muted-foreground z-50">
          Geen gemeenten gevonden voor "{searchQuery}"
        </div>
      )}
    </div>
  )
}
