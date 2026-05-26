import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { VacaturesDashboard } from "@/components/VacaturesDashboard"

const metadata = {
  title: "Vacatures in de bouw",
  date: "2026-05-26",
  summary: "Evolutie van door VDAB ontvangen vacatures in de bouwsector, met uitsplitsing naar beroep en beroepsgroep.",
  dataAvailabilityLabel: "april 2026",
  tags: ["arbeidsmarkt", "bouw", "vacatures", "VDAB"],
  source: {
    provider: "VDAB",
    title: "Arvastat - ontvangen vacatures, sector bouw",
    url: "https://arvastat.vdab.be/",
    publicationDate: "2026-04-30",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <VacaturesDashboard />
    </AnalysisLayout>
  )
}
