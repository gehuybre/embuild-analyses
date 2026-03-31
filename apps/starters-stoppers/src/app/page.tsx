import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { StartersStoppersDashboard } from "@/components/StartersStoppersDashboard"

const metadata = {
  title: "Starters en stoppers",
  date: "2023-12-31",
  summary: "Analyse van startende en stoppende ondernemingen.",
  tags: ["economie","ondernemerschap"],
  source: {
    provider: "Statbel",
    title: "Starters en stoppers per gemeente",
    url: "https://statbel.fgov.be/nl/themas/ondernemingen/starters-en-stoppers",
    publicationDate: "2025-10-16",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <StartersStoppersDashboard />

    </AnalysisLayout>
  )
}
