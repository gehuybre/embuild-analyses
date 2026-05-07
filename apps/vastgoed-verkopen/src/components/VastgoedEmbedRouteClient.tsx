"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { VastgoedVerkopenEmbed } from "@/components/VastgoedVerkopenEmbed"

const VIEWS = ["chart", "table", "map"] as const

type View = (typeof VIEWS)[number]
type Section = "transacties" | "prijzen" | "transacties-kwartaal" | "prijzen-kwartaal"

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`vastgoed-verkopen.${key}`) ?? searchParams.get(key)
}

function parseView(value: string | null): View {
  return VIEWS.includes(value as View) ? (value as View) : "chart"
}

export function VastgoedEmbedRouteClient({ section }: { section: Section }) {
  const searchParams = useSearchParams()

  const embedParams = useMemo(() => {
    return {
      viewType: parseView(prefixedParam(searchParams, "view")),
      type: prefixedParam(searchParams, "type") ?? "alle_huizen",
      geo: prefixedParam(searchParams, "geo"),
    }
  }, [searchParams])

  return (
    <VastgoedVerkopenEmbed
      section={section}
      viewType={embedParams.viewType}
      type={embedParams.type}
      geo={embedParams.geo}
    />
  )
}
