import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { BedrijventerreinenDashboard } from "@/components/BedrijventerreinenDashboard"

const metadata = {
  title: "Bezettingsgraad van bedrijventerreinen in Vlaanderen",
  date: "2025-01-28",
  summary: "Analyse van de bezettingsgraad van bedrijventerreinen in Vlaanderen tussen 2014 en 2025, met geografische verdeling per gemeente.",
  dataAvailabilityLabel: "2025",
  tags: ["economie","ruimtelijke ordening","bedrijventerreinen"],
  source: {
    provider: "Vlaanderen - Gemeente- en Stadsmonitor",
    title: "Bezettingsgraad van bedrijventerreinen",
    url: "https://gemeente-stadsmonitor.vlaanderen.be/over-de-monitor/overzicht-indicatoren/bezettingsgraad-van-bedrijventerreinen",
    publicationDate: "2025-01-28",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <BedrijventerreinenDashboard />

    </AnalysisLayout>
  )
}
