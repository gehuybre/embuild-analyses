"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { StartersStoppersEmbed } from "@/components/StartersStoppersEmbed"
import type { MigrationDim } from "@/lib/migration"

const SLUG = "starters-stoppers"
const REGION_CODES = ["1000", "2000", "3000", "4000"] as const

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function StartersStoppersEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  const filters = useMemo(() => {
    const region = prefixedParam(searchParams, "region")
    const timeRange = prefixedParam(searchParams, "timeRange")
    const horizon = Number(prefixedParam(searchParams, "horizon"))
    return {
      region: REGION_CODES.find((code) => code === region) ?? null,
      province: prefixedParam(searchParams, "province"),
      sector: prefixedParam(searchParams, "sector"),
      workerClass: prefixedParam(searchParams, "workerClass"),
      timeRange: timeRange === "monthly" || timeRange === "quarterly" ? timeRange : "yearly",
      horizon: horizon >= 1 && horizon <= 5 ? horizon : 1,
      counterpart: prefixedParam(searchParams, "counterpart"),
      migrationDim: ((["cls", "nace", "type"] as const).find((value) => value === prefixedParam(searchParams, "dim")) ?? "tot") as MigrationDim,
      category: prefixedParam(searchParams, "category"),
      year: Number(prefixedParam(searchParams, "year")) || null,
    }
  }, [searchParams])

  return (
    <StartersStoppersEmbed
      section={section as any}
      viewType={viewType as any}
      region={filters.region}
      province={filters.province}
      sector={filters.sector}
      workerClass={filters.workerClass}
      timeRange={filters.timeRange as any}
      horizon={filters.horizon as any}
      counterpart={filters.counterpart}
      migrationDim={filters.migrationDim}
      category={filters.category}
      year={filters.year}
    />
  )
}
