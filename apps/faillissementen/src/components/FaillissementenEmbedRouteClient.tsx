"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { FaillissementenEmbed } from "@/components/FaillissementenEmbed"

const SLUG = "faillissementen"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function FaillissementenEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <FaillissementenEmbed
      section={section as any}
      viewType={viewType as any}
    />
  )
}
