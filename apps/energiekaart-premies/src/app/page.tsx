import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { EnergiekaartDashboard } from "@/components/EnergiekaartDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Energiepremies Vlaanderen",
  date: "2025-12-27",
  summary: "Analyse van energiepremies voor residentiële gebouwen in Vlaanderen op basis van de Energiekaart PowerBI dashboard.",
  dataAvailabilityLabel: "2024",
  tags: ["energie","premies","renovatie","vlaanderen"],
  source: {
    provider: "Vlaams Energieagentschap",
    title: "Energiekaart - Premies Tijdreeks",
    url: "https://apps.energiesparen.be/energiekaart/vlaanderen/premies-res-tijdreeks-algemeen",
    publicationDate: "2025-12-28",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <EnergiekaartDashboard />
      <PressReferences slug="energiekaart-premies" />
    </AnalysisLayout>
  )
}
