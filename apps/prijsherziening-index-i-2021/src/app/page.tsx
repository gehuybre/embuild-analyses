import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { PrijsherzieningDashboard } from "@/components/PrijsherzieningDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Prijsherzieningsindex I 2021",
  date: "2026-04-01",
  summary: "Maandelijkse evolutie van de prijsherzieningsindex I 2021 voor de bouwsector, met calculator voor prijsherziening.",
  dataAvailabilityLabel: "februari 2026",
  tags: ["bouw","prijzen","indexen","prijsherziening"],
  source: {
    provider: "FOD Economie",
    title: "Prijsherzieningsindexen - Mercuriale Index I 2021",
    url: "https://economie.fgov.be/nl/themas/ondernemingen/specifieke-sectoren/bouw/prijsherzieningsindexen/mercuriale-index-i-2021",
    publicationDate: "2025-01-30",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <PrijsherzieningDashboard />
      <PressReferences slug="prijsherziening-index-i-2021" />
    </AnalysisLayout>
  )
}
