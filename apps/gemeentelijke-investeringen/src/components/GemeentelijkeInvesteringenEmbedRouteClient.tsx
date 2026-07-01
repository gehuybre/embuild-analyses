"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { InvesteringenEmbed } from "@/components/InvesteringenEmbed"
import { InvesteringenBVIndexedSection } from "@/components/InvesteringenBVIndexedSection"
import { InvesteringenBVDifferenceSection } from "@/components/InvesteringenBVDifferenceSection"
import { InvesteringenBVCategorySection } from "@/components/InvesteringenBVCategorySection"
import { InvesteringenREKCategorySection } from "@/components/InvesteringenREKCategorySection"
import { InvesteringenBVScatterSection } from "@/components/InvesteringenBVScatterSection"
import { InvesteringenREKScatterSection } from "@/components/InvesteringenREKScatterSection"

const SLUG = "gemeentelijke-investeringen"

const INVESTERINGEN_SECTIONS = ["investments-bv", "investments-bv-top-fields", "investments-rek"] as const
type InvesteringenSection = (typeof INVESTERINGEN_SECTIONS)[number]

function prefixedParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
}

function parseViewType(value: string | null): "chart" | "table" {
  return value === "table" ? "table" : "chart"
}

export function GemeentelijkeInvesteringenEmbedRouteClient({ section }: { section: string }) {
  const searchParams = useSearchParams()

  const viewType = useMemo(() => {
    return parseViewType(prefixedParam(searchParams, "view"))
  }, [searchParams])

  if (section === "investments-bv-indexed") {
    return <InvesteringenBVIndexedSection viewType={viewType} />
  }

  if (section === "investments-bv-difference") {
    return <InvesteringenBVDifferenceSection />
  }

  if (section === "bv-category-breakdown") {
    return <InvesteringenBVCategorySection />
  }

  if (section === "rek-category-breakdown") {
    return <InvesteringenREKCategorySection />
  }

  if (section === "investments-bv-distribution") {
    return <InvesteringenBVScatterSection />
  }

  if (section === "investments-rek-distribution") {
    return <InvesteringenREKScatterSection />
  }

  const embedSection: InvesteringenSection = (INVESTERINGEN_SECTIONS as readonly string[]).includes(section)
    ? (section as InvesteringenSection)
    : "investments-bv"

  return (
    <InvesteringenEmbed
      section={embedSection}
      viewType={viewType}
    />
  )
}
