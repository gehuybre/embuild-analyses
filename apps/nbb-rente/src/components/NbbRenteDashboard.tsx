"use client"

import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { NbbRenteSection } from "./NbbRenteSection"
import type { NbbRenteMetadata, NbbRentePoint } from "./types"

const DATA_PATHS = {
  series: "/data/interest_rates.json",
  metadata: "/data/metadata.json",
} as const

export function NbbRenteDashboard() {
  const { data: bundle, loading, error } = useJsonBundle<{
    series: NbbRentePoint[]
    metadata: NbbRenteMetadata
  }>(DATA_PATHS)

  if (loading) {
    return <div className="p-8 text-center">Data laden...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  return (
    <NbbRenteSection
      data={bundle.series}
      metadata={bundle.metadata}
      slug="nbb-rente"
      sectionId="hypothecaire-rente"
      title="Hypothecaire rente bij nieuwe contracten (> 10 jaar rentevast)"
    />
  )
}
