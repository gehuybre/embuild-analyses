"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { VergunningenAanvragenEmbed } from "@/components/VergunningenAanvragenEmbed"

const SLUG = "vergunningen-aanvragen"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function VergunningenAanvragenEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <VergunningenAanvragenEmbed
      section={section as any}
      viewType={viewType as any}
    />
  )
}
