import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { ProjectBrowser } from "@/components/ProjectBrowser"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"
import projectMetadata from "../../public/data/projects_metadata.json"

const metadata = {
  title: "Gemeentelijke bouwprojecten Vlaanderen 2026-2031",
  date: "2026-10-13",
  summary: "Doorzoekbare database van 12.377 concrete investeringsprojecten uit meerjarenplannen van Vlaamse gemeenten. Versie september 2026.",
  dataAvailabilityLabel: "september 2026 (meerjarenplannen 2026)",
  tags: ["gemeente","bouwprojecten","aannemers","investeringen","meerjarenplan"],
  source: {
    provider: "Agentschap Binnenlands Bestuur",
    title: "Gemeentelijke meerjarenplannen - BBC-DR export, versie september 2026",
    url: "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <p>
        Dit is de versie van september 2026. De{" "}
        <a href="/analyses/bouwprojecten-gemeenten/">vorige versie</a>{" "}
        blijft beschikbaar.
      </p>
      <p className="text-sm text-muted-foreground">
        Beleidsindelingen zijn overgenomen uit de vorige export waar gemeente en
        actiecode eenduidig overeenkomen. Acties zonder betrouwbare indeling staan
        bij Overige. De bedragen zijn geplande investeringsuitgaven, geen
        gerealiseerde uitgaven of uitsluitend bouwopdrachten. De export bevat ook
        boekjaren na 2031; die tellen mee in het totaal.
        {" "}Deze versie bevat{" "}
        {projectMetadata.total_projects.toLocaleString("nl-BE")} acties in{" "}
        {projectMetadata.municipalities} gemeenten, waarvan{" "}
        {projectMetadata.categories.overige.project_count.toLocaleString("nl-BE")} acties
        zonder betrouwbare beleidsindeling.{" "}
        <a href="/analyses/bouwprojecten-gemeenten-2026-09/data/source_snapshot.json">
          Verwerkingscontrole en bronvingerafdrukken
        </a>.
      </p>
      <ProjectBrowser />
      <PressReferences slug="bouwprojecten-gemeenten" />
    </AnalysisLayout>
  )
}
