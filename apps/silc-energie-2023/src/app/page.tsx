import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { Dashboard } from "@/components/Dashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "SILC 2023: Energie-efficiëntie van Huishoudens in België",
  date: "2026-01-21",
  summary: "De SILC 2023 module onthult dat 32,1% van de Belgische bevolking in een woning woont die de afgelopen vijf jaar minstens één energierenovatiemaatregel heeft ondergaan. Gas blijft de belangrijkste energiebron voor verwarming met grote regionale verschillen.",
  tags: ["silc","energie-efficiëntie","huishoudens","belgië","renovatie","verwarming","isolatie","energiebronnen","statbel"],
  source: {
    provider: "Statbel",
    title: "SILC - Module 2023 - Energie-efficiëntie van huishoudens",
    url: "https://statbel.fgov.be/sites/default/files/files/documents/Huishoudens/10.7%20Inkomen%20en%20levensomstandigheden/10.7.4%20Gezondheid/huisvesting/SILC_module2023_HEE_PUBLICATION_NL.xlsx",
    publicationDate: "2024-10-01",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <Dashboard />
      <PressReferences slug="silc-energie-2023" />
    </AnalysisLayout>
  )
}
