import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { ArbeidersBediendenDashboard } from "@/components/ArbeidersBediendenDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Arbeiders en bedienden in de bouw",
  date: "2026-01-28",
  summary: "Evolutie van arbeiders en bedienden in de Belgische bouwsector (2013-2024). De verhouding verschuift geleidelijk naar meer bedienden.",
  tags: ["bouw", "tewerkstelling", "arbeidsmarkt"],
  source: {
    provider: "Rijksdienst voor Sociale Zekerheid (RSZ)",
    title: "Verdeling van de arbeidsplaatsen naar plaats van tewerkstelling",
    url: "https://www.rsz.be/stats/verdeling-van-de-arbeidsplaatsen-naar-plaats-van-tewerkstelling",
    publicationDate: "2024-06-30",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <p>
        De Belgische bouwsector kent een opvallende verschuiving in tewerkstelling: waar het aantal
        arbeiders de afgelopen 12 jaar daalde met 8%, steeg het aantal bedienden met maar liefst 48%.
        Deze analyse toont de evolutie van 2013 tot 2024, gebaseerd op RSZ-gegevens van de telling op
        30 juni van elk jaar.
      </p>
      <p>
        De data toont aan dat de totale tewerkstelling in de bouwsector relatief stabiel is gebleven
        (rond de 280.000 arbeidsplaatsen), maar de samenstelling verschoof geleidelijk naar meer
        bedienden en minder arbeiders. Dit weerspiegelt mogelijk een toenemende automatisering,
        uitbesteding van uitvoerend werk, en groeiende nood aan administratieve en leidinggevende
        functies.
      </p>
      <ArbeidersBediendenDashboard />
      <PressReferences slug="arbeiders-bedienden" />
    </AnalysisLayout>
  )
}
