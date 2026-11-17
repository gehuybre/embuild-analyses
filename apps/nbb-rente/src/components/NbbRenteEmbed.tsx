"use client"

import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { NbbInflatieSection } from "./NbbInflatieSection"
import { NbbReeleWaardeSection } from "./NbbReeleWaardeSection"
import { NbbRenteSection } from "./NbbRenteSection"
import type {
  CpiAnnual,
  InflationForecast,
  InflationForecastMetadata,
  NbbRenteMetadata,
  NbbRentePoint,
} from "./types"

interface NbbRenteEmbedProps {
  section: "hypothecaire-rente" | "inflatieprognoses" | "reele-waarde"
  viewType?: "chart" | "table"
  startYear?: number | null
}

const DATA_PATHS = {
  interestSeries: "/data/interest_rates.json",
  interestMetadata: "/data/metadata.json",
  inflationForecasts: "/data/inflation_forecasts.json",
  inflationMetadata: "/data/inflation_forecasts_metadata.json",
  cpiAnnual: "/data/cpi_annual.json",
} as const

export function NbbRenteEmbed({
  section,
  viewType = "chart",
  startYear = null,
}: NbbRenteEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    interestSeries: NbbRentePoint[]
    interestMetadata: NbbRenteMetadata
    inflationForecasts: InflationForecast[]
    inflationMetadata: InflationForecastMetadata
    cpiAnnual: CpiAnnual
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
      {section === "reele-waarde" ? (
        <NbbReeleWaardeSection
          cpi={bundle.cpiAnnual}
          slug="nbb-rente"
          sectionId={section}
          title="Reële waarde van 1 miljoen euro sinds een gekozen startjaar"
          initialStartYear={startYear}
          defaultView={viewType}
        />
      ) : section === "inflatieprognoses" ? (
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
