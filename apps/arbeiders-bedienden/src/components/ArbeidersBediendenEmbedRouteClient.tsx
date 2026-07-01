"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { ArbeidersBediendenEmbed } from "@/components/ArbeidersBediendenEmbed"

const SLUG = "arbeiders-bedienden"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function ArbeidersBediendenEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <ArbeidersBediendenEmbed
      section={section as any}
      viewType={viewType as any}
      region={null}
      province={null}
    />
  )
}
