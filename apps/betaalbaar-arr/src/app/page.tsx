import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { BetaalbaarArrDashboard } from "@/components/BetaalbaarArrDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Betaalbaar wonen per arrondissement",
  date: "2026-01-18",
  summary: "Analyse van woningbehoefte en aanbod per arrondissement: gebouwenpark, huishoudensgroei en bouwvergunningen in België",
  tags: ["huisvesting","betaalbaarheid","arrondissement","demografie","bouwvergunningen"],
  source: {
    provider: "Statbel, Vlaamse Overheid",
    title: "Gebouwenpark, Huishoudensprojecties, Bouwvergunningen",
    url: "https://statbel.fgov.be/",
    publicationDate: "2025-01-01",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <BetaalbaarArrDashboard />
      <PressReferences slug="betaalbaar-arr" />
    </AnalysisLayout>
  )
}
