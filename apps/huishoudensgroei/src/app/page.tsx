import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { HuishoudensDashboard } from "@/components/HuishoudensDashboard"

const metadata = {
  title: "Huishoudensgroei per gemeente",
  date: "2024-05-21",
  summary: "Analyse van de huishoudensvooruitzichten in Vlaanderen per gemeente, met projecties tot 2040.",
  dataAvailabilityLabel: "2040",
  tags: ["bevolking","demografie","huishoudens"],
  source: {
    provider: "Statistiek Vlaanderen",
    title: "Huishoudensvooruitzichten - aantal en groei",
    url: "https://www.vlaanderen.be/statistiek-vlaanderen/bevolking/huishoudensvooruitzichten-aantal-en-groei",
    publicationDate: "2024-05-21",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <HuishoudensDashboard />

    </AnalysisLayout>
  )
}
