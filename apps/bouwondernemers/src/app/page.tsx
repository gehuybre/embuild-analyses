import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { BouwondernemersDashboard } from "@/components/BouwondernemersDashboard"

const metadata = {
  title: "Bouwondernemers",
  date: "2025-01-10",
  summary: "Analyse van zelfstandige ondernemers per sector, regio, geslacht en leeftijd.",
  tags: ["bouw","ondernemerschap","economie"],
  source: {
    provider: "Statbel",
    title: "Ondernemers - Datalab",
    url: "https://statbel.fgov.be/nl/open-data/ondernemers-datalab",
    publicationDate: "2023-12-31",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <BouwondernemersDashboard />

    </AnalysisLayout>
  )
}
