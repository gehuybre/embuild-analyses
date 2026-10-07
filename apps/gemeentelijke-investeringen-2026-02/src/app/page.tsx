import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { InvesteringenDashboard } from "@/components/InvesteringenDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Gemeentelijke investeringen in Vlaanderen",
  date: "2026-03-19",
  summary: "Analyse van geplande gemeentelijke investeringen in Vlaanderen per beleidsdomein en subdomein op basis van meerjarenplannen (rapportjaren 2014, 2020 en 2026). Versie februari 2026.",
  dataAvailabilityLabel: "2026",
  tags: ["gemeente","investeringen","financiën","beleidsdomein","meerjarenplan"],
  source: {
    provider: "Agentschap Binnenlands Bestuur",
    title: "Gemeentelijke jaarrekeningen - BBC-DR data",
    url: "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <InvesteringenDashboard />
      <PressReferences slug="gemeentelijke-investeringen-2026-02" />
    </AnalysisLayout>
  )
}
