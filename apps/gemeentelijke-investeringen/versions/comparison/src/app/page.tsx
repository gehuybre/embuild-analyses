import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { ComparisonDashboard } from "@/components/ComparisonDashboard"

const metadata = {
  title: "Gemeentelijke investeringen: vergelijking van MJP's",
  date: "2026-10-07",
  summary: "Vergelijk de wijzigingen in het lopende MJP 2026 tussen mei en september en de geplande investeringen in de MJP's 2014, 2020 en 2026.",
  tags: ["gemeente","investeringen","financiën","meerjarenplan","MJP"],
  source: {
    provider: "Agentschap Binnenlands Bestuur",
    title: "Gemeentelijke jaarrekeningen - BBC-DR data",
    url: "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <ComparisonDashboard />
    </AnalysisLayout>
  )
}
