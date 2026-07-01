"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { HuishoudensgroeiEmbed } from "@/components/HuishoudensgroeiEmbed"

const SLUG = "huishoudensgroei"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function HuishoudensgroeiEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <HuishoudensgroeiEmbed
      section={section as any}
      viewType={viewType as any}
    />
  )
}
