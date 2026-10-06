import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { InvesteringenDashboard } from "@/components/InvesteringenDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Gemeentelijke investeringen in Vlaanderen",
  date: "2026-10-06",
  summary: "Analyse van geplande gemeentelijke investeringen in Vlaanderen per beleidsdomein en subdomein op basis van meerjarenplannen (2014-2033). Versie september 2026.",
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
      <PressReferences slug="gemeentelijke-investeringen-2026-09" />
    </AnalysisLayout>
  )
}
