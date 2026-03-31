"use client"

import { useEffect, useMemo, useState } from "react"
import {
  MunicipalityIndexEntry,
  ProjectFilters,
  ProjectMetadata,
  SortOption,
} from "@embuild/shared/types/project-types"
import { Button } from "@embuild/shared/components/ui/button"
import { Input } from "@embuild/shared/components/ui/input"
import { Label } from "@embuild/shared/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@embuild/shared/components/ui/select"
import { Badge } from "@embuild/shared/components/ui/badge"
import { X, Search, Check, ChevronsUpDown } from "lucide-react"
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

interface ProjectFiltersComponentProps {
  filters: ProjectFilters
  setFilters: (filters: ProjectFilters) => void
  metadata: ProjectMetadata | null
  municipalities: MunicipalityIndexEntry[]
  categoryCounts: Record<string, number>
  searchEnabled: boolean
  sortOption: SortOption
  setSortOption: (option: SortOption) => void
}

export function ProjectFiltersComponent({
  filters,
  setFilters,
  metadata,
  municipalities,
  categoryCounts,
  searchEnabled,
  sortOption,
  setSortOption,
}: ProjectFiltersComponentProps) {
  const [searchInput, setSearchInput] = useState(filters.searchQuery || "")
  const [muniOpen, setMuniOpen] = useState(false)

  useEffect(() => {
    setSearchInput(filters.searchQuery || "")
  }, [filters.searchQuery])

  const sortedMunicipalities = useMemo(
    () => [...municipalities].sort((a, b) => a.municipality.localeCompare(b.municipality)),
    [municipalities]
  )

  const handleMunicipalityChange = (value: string) => {
    if (value === "all") {
      const nextFilters = { ...filters }
      delete nextFilters.nis_code
      setFilters(nextFilters)
      return
    }

    setFilters({ ...filters, nis_code: value })
  }

  const handleCategoryToggle = (categoryId: string) => {
    const currentCategories = filters.categories || []
    const newCategories = currentCategories.includes(categoryId)
      ? currentCategories.filter((currentCategory) => currentCategory !== categoryId)
      : [...currentCategories, categoryId]

    if (newCategories.length === 0) {
      const nextFilters = { ...filters }
      delete nextFilters.categories
      setFilters(nextFilters)
      return
    }

    setFilters({ ...filters, categories: newCategories })
  }

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()

    if (!searchEnabled) {
      return
    }

    const sanitizedQuery = searchInput.trim().slice(0, 200)
    if (sanitizedQuery) {
      setFilters({ ...filters, searchQuery: sanitizedQuery })
      return
    }

    const nextFilters = { ...filters }
    delete nextFilters.searchQuery
    setFilters(nextFilters)
  }

  const handleReset = () => {
    setFilters({})
    setSearchInput("")
  }

  const hasActiveFilters =
    filters.nis_code ||
    (filters.categories && filters.categories.length > 0) ||
    filters.searchQuery

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Filters</h3>
        {hasActiveFilters && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            <X className="mr-2 h-4 w-4" />
            Reset filters
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="municipality">Gemeente</Label>
          <Popover open={muniOpen} onOpenChange={setMuniOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={muniOpen}
                className="w-full justify-between font-normal"
                id="municipality"
              >
                {filters.nis_code
                  ? sortedMunicipalities.find((municipality) => municipality.nis_code === filters.nis_code)?.municipality
                  : "alle gemeenten"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command
                filter={(value, search) => (
                  value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                )}
              >
                <CommandInput placeholder="Zoek gemeente..." />
                <CommandList>
                  <CommandEmpty>geen gemeente gevonden.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all"
                      onSelect={() => {
                        handleMunicipalityChange("all")
                        setMuniOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          !filters.nis_code ? "opacity-100" : "opacity-0"
                        )}
                      />
                      Alle gemeenten
                    </CommandItem>
                    {sortedMunicipalities.map((municipality) => (
                      <CommandItem
                        key={municipality.nis_code}
                        value={municipality.municipality}
                        onSelect={() => {
                          handleMunicipalityChange(municipality.nis_code)
                          setMuniOpen(false)
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            filters.nis_code === municipality.nis_code ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {municipality.municipality}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <Label htmlFor="sort">Sorteren</Label>
          <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
            <SelectTrigger id="sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="amount-desc">bedrag (hoog → laag)</SelectItem>
              <SelectItem value="amount-asc">bedrag (laag → hoog)</SelectItem>
              <SelectItem value="municipality">gemeente (a → z)</SelectItem>
              <SelectItem value="category">categorie</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {metadata && (
        <div>
          <Label className="mb-2 block">categorieën</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(metadata.categories)
              .sort((a, b) => {
                const countA = categoryCounts[a[0]] ?? 0
                const countB = categoryCounts[b[0]] ?? 0
                if (countB !== countA) return countB - countA
                return a[1].label.localeCompare(b[1].label)
              })
              .map(([categoryId, category]) => {
                const isActive = filters.categories?.includes(categoryId)
                const currentCount = categoryCounts[categoryId] ?? 0

                if (currentCount === 0 && !isActive) {
                  return null
                }

                return (
                  <Badge
                    key={categoryId}
                    variant={isActive ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary/90"
                    onClick={() => handleCategoryToggle(categoryId)}
                  >
                    {category.label} ({currentCount})
                  </Badge>
                )
              })}
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <div className="pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-2">actieve filters:</p>
          <div className="flex flex-wrap gap-2">
            {filters.nis_code && (
              <Badge variant="secondary">
                Gemeente: {sortedMunicipalities.find((municipality) => municipality.nis_code === filters.nis_code)?.municipality}
                <X
                  className="ml-1 h-3 w-3 cursor-pointer"
                  onClick={() => {
                    const nextFilters = { ...filters }
                    delete nextFilters.nis_code
                    setFilters(nextFilters)
                  }}
                />
              </Badge>
            )}
            {filters.categories?.map((categoryId) => {
              const category = metadata?.categories[categoryId]
              return (
                <Badge key={categoryId} variant="secondary">
                  {category?.label}
                  <X
                    className="ml-1 h-3 w-3 cursor-pointer"
                    onClick={() => handleCategoryToggle(categoryId)}
                  />
                </Badge>
              )
            })}
            {filters.searchQuery && (
              <Badge variant="secondary">
                Zoekterm: &quot;{filters.searchQuery}&quot;
                <X
                  className="ml-1 h-3 w-3 cursor-pointer"
                  onClick={() => {
                    const nextFilters = { ...filters }
                    delete nextFilters.searchQuery
                    setFilters(nextFilters)
                    setSearchInput("")
                  }}
                />
              </Badge>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSearchSubmit} className="pt-4 border-t">
        <Label htmlFor="search" className="text-sm mb-2 block">
          Zoeken in geladen projectnamen en beschrijvingen
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              type="text"
              placeholder={searchEnabled ? "Zoekterm..." : "Kies eerst een gemeente of categorie"}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="pl-9 h-9"
              maxLength={200}
              disabled={!searchEnabled}
            />
          </div>
          <Button type="submit" size="sm" disabled={!searchEnabled}>
            Zoeken
          </Button>
        </div>
        {!searchEnabled && (
          <p className="mt-2 text-xs text-muted-foreground">
            De zoekfunctie werkt binnen de geselecteerde gemeente of categorie.
          </p>
        )}
      </form>
    </div>
  )
}
