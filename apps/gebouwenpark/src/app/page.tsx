import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { GebouwenDashboard } from "@/components/GebouwenDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Gebouwenpark 2025",
  date: "2025-02-14",
  summary: "Analyse van het Belgische gebouwenpark in 2025. Evolutie van het aantal gebouwen en woongelegenheden sinds 1995.",
  tags: ["vastgoed","gebouwen","wonen","statistiek","economie"],
  source: {
    provider: "Statbel",
    title: "Kadastrale statistiek van het bestand van de gebouwen",
    url: "https://statbel.fgov.be/nl/themas/bouwen-wonen/gebouwenpark",
    publicationDate: "2025-02-14",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <GebouwenDashboard />
      <PressReferences slug="gebouwenpark" />
    </AnalysisLayout>
  )
}
