"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { StartersStoppersEmbed } from "@/components/StartersStoppersEmbed"

const SLUG = "starters-stoppers"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function StartersStoppersEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <StartersStoppersEmbed
      section={section as any}
      viewType={viewType as any}
    />
  )
}
