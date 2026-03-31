"use client"

import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { NbbRenteSection } from "./NbbRenteSection"
import type { NbbRenteMetadata, NbbRentePoint } from "./types"

interface NbbRenteEmbedProps {
  section: "hypothecaire-rente"
  viewType?: "chart" | "table"
}

const DATA_PATHS = {
  series: "/data/interest_rates.json",
  metadata: "/data/metadata.json",
} as const

export function NbbRenteEmbed({
  section,
  viewType = "chart",
}: NbbRenteEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    series: NbbRentePoint[]
    metadata: NbbRenteMetadata
  }>(DATA_PATHS)

  if (loading) {
    return <div className="p-4">Data laden...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-4 text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  return (
    <div className="p-4">
      <NbbRenteSection
        data={bundle.series}
        metadata={bundle.metadata}
        slug="nbb-rente"
        sectionId={section}
        title="Hypothecaire rente bij nieuwe contracten (> 10 jaar rentevast)"
        defaultView={viewType}
      />
    </div>
  )
}
