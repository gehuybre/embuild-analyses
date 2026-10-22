"use client"

import { useSearchParams } from "next/navigation"
import { OctoberComparison, SLUG, type Section } from "./OctoberDashboard"

export function OctoberEmbed({ section }: { section: Section }) {
  const params = useSearchParams()
  const view = params.get(`${SLUG}.view`) ?? params.get("view")
  return <OctoberComparison section={section} viewType={view === "table" ? "table" : "chart"} />
}
