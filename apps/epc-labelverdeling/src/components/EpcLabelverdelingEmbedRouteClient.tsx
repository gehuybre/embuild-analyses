"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { EpcLabelverdelingEmbed } from "@/components/EpcLabelverdelingEmbed"

const SLUG = "epc-labelverdeling"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function EpcLabelverdelingEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <EpcLabelverdelingEmbed
      section={section as any}
      viewType={viewType as any}
    />
  )
}
