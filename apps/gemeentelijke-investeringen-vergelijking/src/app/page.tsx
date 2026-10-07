import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { ComparisonDashboard } from "@/components/ComparisonDashboard"

const metadata = {
  title: "Gemeentelijke investeringen: vergelijking van versies",
  date: "2026-10-07",
  summary: "Wat verandert er tussen de versies van februari, mei en september 2026 van de analyse van geplande gemeentelijke investeringen? Vergelijking per rapportjaar, beleidsdomein, beleidsveld en gemeente.",
  tags: ["gemeente","investeringen","financiën","meerjarenplan","versievergelijking"],
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
