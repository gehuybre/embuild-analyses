import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { NbbRenteDashboard } from "@/components/NbbRenteDashboard"

const metadata = {
  title: "Hypothecaire rente in België",
  date: "2026-03-25",
  summary: "Evolutie van de Belgische hypothecaire rente op nieuwe contracten met een initiële rentevaste periode van meer dan 10 jaar, op basis van de NBB MIR-statistiek sinds 2015.",
  tags: ["rente","hypotheken","nbb","woningmarkt"],
  source: {
    provider: "Nationale Bank van België (NBB)",
    title: "MFI rentetarieven (MIR) - hypothecaire rente op nieuwe contracten (> 10 jaar rentevast)",
    url: "https://nsidisseminate-stat.nbb.be/rest/data/BE2,DF_MIR,1.0/M.R_N.2250.A2C.A_P.Z.Z?startPeriod=2015-01&dimensionAtObservation=AllDimensions",
    publicationDate: "2026-01-31",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <NbbRenteDashboard />

    </AnalysisLayout>
  )
}
