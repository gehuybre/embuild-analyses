"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { InschrijvingenOnderwijsEmbed } from "@/components/InschrijvingenOnderwijsEmbed"

const SLUG = "inschrijvingen-onderwijs"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function InschrijvingenOnderwijsEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <InschrijvingenOnderwijsEmbed
      section={section as any}
      viewType={viewType as any}
      province={null}
    />
  )
}
