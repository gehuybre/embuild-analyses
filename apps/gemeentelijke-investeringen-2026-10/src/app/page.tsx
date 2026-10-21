import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { OctoberDashboard } from "@/components/OctoberDashboard"

const metadata = {
  title: "Gemeentelijke investeringen in Vlaanderen",
  date: "2026-10-21",
  summary: "Bouwinvesteringen per boekjaar: vergelijk de meest recente meerjarenplannen met de werkelijke uitgaven uit jaarrekeningen en het oorspronkelijke beginkrediet. Versie oktober 2026.",
  dataAvailabilityLabel: "boekjaar 2031 (plannen) en 2025 (jaarrekeningen)",
  tags: ["gemeente", "investeringen", "financiën", "bouw", "meerjarenplan", "jaarrekening"],
  source: {
    provider: "Agentschap Binnenlands Bestuur",
    title: "BBC-DR meerjarenplannen en jaarrekeningen, exports oktober 2026",
    url: "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <OctoberDashboard />
    </AnalysisLayout>
  )
}
