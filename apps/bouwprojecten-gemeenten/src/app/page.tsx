import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { ProjectBrowser } from "@/components/ProjectBrowser"

const metadata = {
  title: "Gemeentelijke bouwprojecten Vlaanderen 2026-2031",
  date: "2026-01-09",
  summary: "Doorzoekbare database van 7,134 concrete investeringsprojecten uit meerjarenplannen van Vlaamse gemeenten.",
  tags: ["gemeente","bouwprojecten","aannemers","investeringen","meerjarenplan"],
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
      <ProjectBrowser />
    </AnalysisLayout>
  )
}
