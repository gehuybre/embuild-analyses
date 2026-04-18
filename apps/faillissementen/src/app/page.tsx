import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { FaillissementenDashboard } from "@/components/FaillissementenDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Faillissementen in de bouwsector",
  date: "2026-04-18",
  summary: "Maandelijkse evolutie van faillissementen in de Belgische bouwsector, met vergelijking met andere sectoren en regionale spreiding.",
  dataAvailabilityLabel: "maart 2026",
  tags: ["economie","bedrijven","bouw","faillissementen"],
  source: {
    provider: "Statbel",
    title: "Maandelijkse faillissementen per activiteitssector",
    url: "https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen/maandelijkse-faillissementen",
    publicationDate: "2026-04-17",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <FaillissementenDashboard />
      <PressReferences slug="faillissementen" />
    </AnalysisLayout>
  )
}
