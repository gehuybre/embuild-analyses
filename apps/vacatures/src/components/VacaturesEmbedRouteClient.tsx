"use client"

import { useSearchParams } from "next/navigation"
import { EmbedAutoResize } from "@embuild/shared/components/shared/EmbedAutoResize"
import { EmbedErrorBoundary } from "@embuild/shared/components/shared/EmbedErrorBoundary"
import {
  VacaturesDashboard,
  type EvolutionMetric,
  type EvolutionPeriodView,
  type VacaturesSection,
  type VacaturesView,
} from "./VacaturesDashboard"

function parseView(value: string | null): VacaturesView {
  return value === "table" ? "table" : "chart"
}

function parsePeriodView(value: string | null): EvolutionPeriodView {
  return value === "year" ? "year" : "month"
}

function parseMetric(value: string | null): EvolutionMetric {
  return value === "open" ? "open" : "received"
}

export function VacaturesEmbedRouteClient({
  section,
}: {
  section: VacaturesSection
}) {
  const searchParams = useSearchParams()
  const view = parseView(searchParams.get("vacatures.view") ?? searchParams.get("view"))
  const metric = parseMetric(searchParams.get("vacatures.metric") ?? searchParams.get("metric"))
  const periodView = parsePeriodView(searchParams.get("vacatures.period") ?? searchParams.get("period"))
  const group = searchParams.get("vacatures.group") ?? searchParams.get("group") ?? undefined
  const profession = searchParams.get("vacatures.profession") ?? searchParams.get("profession") ?? undefined
  const detail =
    searchParams.get("vacatures.detail") ??
    searchParams.get("detail") ??
    searchParams.get("vacatures.occupation") ??
    searchParams.get("occupation") ??
    undefined

  return (
    <EmbedErrorBoundary>
      <main className="min-h-screen bg-background p-3">
        <VacaturesDashboard
          embeddedSection={section}
          initialView={view}
          initialMetric={metric}
          initialPeriodView={periodView}
          initialGroup={group}
          initialProfession={profession}
          initialDetail={detail}
        />
      </main>
      <EmbedAutoResize />
    </EmbedErrorBoundary>
  )
}
