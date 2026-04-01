import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { InschrijvingenOnderwijsDashboard } from "@/components/InschrijvingenOnderwijsDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Inschrijvingen in het hoger onderwijs in Vlaanderen",
  date: "2026-03-09",
  summary: "Evolutie van inschrijvingen in het hoger onderwijs naar type onderwijsinstelling, opleiding en studiegebied op basis van PinC-data (woonplaats).",
  dataAvailabilityLabel: "2024",
  tags: ["onderwijs","hoger-onderwijs","studenten","vlaanderen"],
  source: {
    provider: "Onderwijs Vlaanderen via Provincies in Cijfers (PinC)",
    title: "Inschrijvingen in het hoger onderwijs naar type onderwijsinstelling, opleiding en studiegebied - WP",
    url: "https://provincies.incijfers.be/jive/",
    publicationDate: "2025-07-28",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <InschrijvingenOnderwijsDashboard />
      <PressReferences slug="inschrijvingen-onderwijs" />
    </AnalysisLayout>
  )
}
