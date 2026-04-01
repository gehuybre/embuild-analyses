import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { VastgoedDashboard } from "@/components/VastgoedDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Verkoop van vastgoed in België",
  date: "2025-09-30",
  summary: "Analyse van vastgoedtransacties en prijzen per type woning, regio en provincie.",
  dataAvailabilityLabel: "2024",
  tags: ["vastgoed","woningmarkt","prijzen"],
  source: {
    provider: "Statbel",
    title: "Verkoop van onroerende goederen",
    url: "https://statbel.fgov.be/nl/themas/bouwen-wonen/vastgoedprijzen",
    publicationDate: "2025-12-18",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <VastgoedDashboard />
      <PressReferences slug="vastgoed-verkopen" />
    </AnalysisLayout>
  )
}
