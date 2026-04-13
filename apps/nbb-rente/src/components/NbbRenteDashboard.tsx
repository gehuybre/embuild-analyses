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

const DATA_PATHS = {
  interestSeries: "/data/interest_rates.json",
  interestMetadata: "/data/metadata.json",
  inflationForecasts: "/data/inflation_forecasts.json",
  inflationMetadata: "/data/inflation_forecasts_metadata.json",
} as const

export function NbbRenteDashboard() {
  const { data: bundle, loading, error } = useJsonBundle<{
    interestSeries: NbbRentePoint[]
    interestMetadata: NbbRenteMetadata
    inflationForecasts: InflationForecast[]
    inflationMetadata: InflationForecastMetadata
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
    <div className="space-y-12">
      <NbbRenteSection
        data={bundle.interestSeries}
        metadata={bundle.interestMetadata}
        slug="nbb-rente"
        sectionId="hypothecaire-rente"
        title="Hypothecaire rente bij nieuwe contracten (> 10 jaar rentevast)"
      />

      <NbbInflatieSection
        forecasts={bundle.inflationForecasts}
        metadata={bundle.inflationMetadata}
        slug="nbb-rente"
        sectionId="inflatieprognoses"
        title="Inflatieprognoses van het Federaal Planbureau"
      />
    </div>
  )
}
