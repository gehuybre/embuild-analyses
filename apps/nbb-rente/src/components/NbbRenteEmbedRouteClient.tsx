"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { NbbRenteEmbed } from "@/components/NbbRenteEmbed"

const SLUG = "nbb-rente"
const SECTIONS = ["hypothecaire-rente", "inflatieprognoses"] as const

type Section = (typeof SECTIONS)[number]

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

function parseSection(value: string): Section {
  return (SECTIONS as readonly string[]).includes(value)
    ? (value as Section)
    : "hypothecaire-rente"
}

export function NbbRenteEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    const view = prefixedParam(searchParams, "view")
    return view === "table" ? "table" : "chart"
  }, [searchParams])

  return (
    <NbbRenteEmbed
      section={parseSection(section)}
      viewType={viewType as "chart" | "table"}
    />
  )
}
