"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { StartersStoppersEmbed } from "@/components/StartersStoppersEmbed"
import type { MigrationDim } from "@/lib/migration"
import { normalizeCounterparts, normalizeMigrationRegions } from "@/lib/migration"
import { geoFromParams, parseList } from "@/lib/selection"

const SLUG = "starters-stoppers"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function StartersStoppersEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams, section])

  // Meerdere waarden staan kommagescheiden in de URL, bv. region=2000,3000&sector=F,G
  const filters = useMemo(() => {
    const timeRange = prefixedParam(searchParams, "timeRange")
    const horizon = Number(prefixedParam(searchParams, "horizon"))
    const regionParam = prefixedParam(searchParams, "region")
    const migrationRegionList = normalizeMigrationRegions(parseList(regionParam))
    return {
      // arrondissementen bestaan enkel voor de ondernemingstellingen
      geos: geoFromParams(
        regionParam,
        prefixedParam(searchParams, "province"),
        prefixedParam(searchParams, "arrondissement"),
        section.startsWith("enterprises")
      ),
      sectors: parseList(prefixedParam(searchParams, "sector")),
      workerClasses: parseList(prefixedParam(searchParams, "workerClass")),
      timeRange: timeRange === "monthly" || timeRange === "quarterly" ? timeRange : "yearly",
      horizon: horizon >= 1 && horizon <= 5 ? horizon : 1,
      migrationRegions: migrationRegionList, // "all" of geen waarde = alle gewesten
      counterparts: normalizeCounterparts(parseList(prefixedParam(searchParams, "counterpart")), migrationRegionList),
      migrationDim: ((["cls", "nace", "type"] as const).find((value) => value === prefixedParam(searchParams, "dim")) ?? "tot") as MigrationDim,
      categories: parseList(prefixedParam(searchParams, "category")),
      year: Number(prefixedParam(searchParams, "year")) || null,
    }
  }, [searchParams, section])

  return (
    <StartersStoppersEmbed
      section={section as any}
      viewType={viewType as any}
      geos={filters.geos}
      sectors={filters.sectors}
      workerClasses={filters.workerClasses}
      timeRange={filters.timeRange as any}
      horizon={filters.horizon as any}
      migrationRegions={filters.migrationRegions}
      counterparts={filters.counterparts}
      migrationDim={filters.migrationDim}
      categories={filters.categories}
      year={filters.year}
    />
  )
}
