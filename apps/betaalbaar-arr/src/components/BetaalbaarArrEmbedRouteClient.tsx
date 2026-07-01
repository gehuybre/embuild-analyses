"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { BetaalbaarArrEmbed } from "@/components/BetaalbaarArrEmbed"

const SLUG = "betaalbaar-arr"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function BetaalbaarArrEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <BetaalbaarArrEmbed
      section={section as any}
      viewType={viewType as any}
    />
  )
}
