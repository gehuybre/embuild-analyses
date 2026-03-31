import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { EpcLabelverdelingDashboard } from "@/components/EpcLabelverdelingDashboard"

const metadata = {
  title: "EPC-labelverdeling in Vlaanderen",
  date: "2026-02-04",
  summary: "Analyse van de verdeling van energielabels (EPC) voor residentiële en niet-residentiële gebouwen in Vlaanderen. In welke mate voldoen onze gebouwen al aan de doelstelling van minstens label A?",
  tags: ["energie","gebouwen","epc","duurzaamheid"],
  source: {
    provider: "Energiesparen.be",
    title: "Energiekaart Vlaanderen",
    url: "https://apps.energiesparen.be/energiekaart/vlaanderen",
    publicationDate: "2026-02-04",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <EpcLabelverdelingDashboard />

    </AnalysisLayout>
  )
}
