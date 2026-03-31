import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { VergunningenDashboard } from "@/components/VergunningenDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Vergunningen goedkeuringen",
  date: "2026-02-27",
  summary: "Analyse van de goedgekeurde bouwvergunningen.",
  tags: ["vergunningen","bouw"],
  source: {
    provider: "Statbel",
    title: "Bouwvergunningen per gemeente",
    url: "https://statbel.fgov.be/nl/themas/bouwen-wonen/bouwvergunningen",
    publicationDate: "2026-02-27",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <VergunningenDashboard />
      <PressReferences slug="vergunningen-goedkeuringen" />
    </AnalysisLayout>
  )
}
