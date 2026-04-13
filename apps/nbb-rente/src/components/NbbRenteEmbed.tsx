"use client"

import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { NbbInflatieSection } from "./NbbInflatieSection"
import { NbbRenteSection } from "./NbbRenteSection"
import type {
  InflationForecast,
  InflationForecastMetadata,
  NbbRenteMetadata,
  NbbRentePoint,
} from "./types"

interface NbbRenteEmbedProps {
  section: "hypothecaire-rente" | "inflatieprognoses"
  viewType?: "chart" | "table"
}

const DATA_PATHS = {
  interestSeries: "/data/interest_rates.json",
  interestMetadata: "/data/metadata.json",
  inflationForecasts: "/data/inflation_forecasts.json",
  inflationMetadata: "/data/inflation_forecasts_metadata.json",
} as const

export function NbbRenteEmbed({
  section,
  viewType = "chart",
}: NbbRenteEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    interestSeries: NbbRentePoint[]
    interestMetadata: NbbRenteMetadata
    inflationForecasts: InflationForecast[]
    inflationMetadata: InflationForecastMetadata
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
      {section === "inflatieprognoses" ? (
        <NbbInflatieSection
          forecasts={bundle.inflationForecasts}
          metadata={bundle.inflationMetadata}
          slug="nbb-rente"
          sectionId={section}
          title="Inflatieprognoses van het Federaal Planbureau"
          defaultView={viewType}
        />
      ) : (
        <NbbRenteSection
          data={bundle.interestSeries}
          metadata={bundle.interestMetadata}
          slug="nbb-rente"
          sectionId={section}
          title="Hypothecaire rente bij nieuwe contracten (> 10 jaar rentevast)"
          defaultView={viewType}
        />
      )}
    </div>
  )
}
