import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { InvesteringenDashboard } from "@/components/InvesteringenDashboard"

const metadata = {
  title: "Gemeentelijke investeringen in Vlaanderen",
  date: "2026-01-07",
  summary: "Analyse van geplande gemeentelijke investeringen in Vlaanderen per beleidsdomein en subdomein op basis van meerjarenplannen (2014-2033).",
  dataAvailabilityLabel: "2026",
  tags: ["gemeente","investeringen","financiën","beleidsdomein","meerjarenplan"],
  source: {
    provider: "Agentschap Binnenlands Bestuur",
    title: "Gemeentelijke jaarrekeningen - BBC-DR data",
    url: "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien",
    publicationDate: "2025-12-31",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <InvesteringenDashboard />

    </AnalysisLayout>
  )
}
