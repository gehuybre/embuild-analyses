import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { VergunningenDashboard } from "@/components/VergunningenDashboard"

const metadata = {
  title: "Vergunningen voor woningen",
  date: "2026-02-01",
  summary: "Analyse van de aanvragen voor vergunningen voor het bouwen, verbouwen of slopen van woningen in Vlaanderen, op basis van data uit het Omgevingsloket.",
  dataAvailabilityLabel: "2025",
  tags: ["vergunningen","bouw","woningen","nieuwbouw","renovatie","sloop"],
  source: {
    provider: "Omgevingsloket Vlaanderen",
    title: "Rapportering bouwen of verbouwen van woningen",
    url: "https://omgevingsloketrapportering.omgeving.vlaanderen.be/wonen",
    publicationDate: "2026-02-01",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <VergunningenDashboard />

    </AnalysisLayout>
  )
}
