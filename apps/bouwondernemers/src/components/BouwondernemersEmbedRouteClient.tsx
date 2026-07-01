"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { BouwondernemersEmbed } from "@/components/BouwondernemersEmbed"

const SLUG = "bouwondernemers"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

export function BouwondernemersEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <BouwondernemersEmbed
      section={section as any}
      viewType={viewType as any}
    />
  )
}
