import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { StartersStoppersDashboard } from "@/components/StartersStoppersDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Starters en stoppers",
  date: "2026-10-08",
  summary: "Analyse van starters, stoppers, aantal ondernemingen en overlevingskansen van btw-plichtige ondernemingen, met jaarreeksen per sector en gewest vanaf 2008 en maandreeksen vanaf 2019.",
  dataAvailabilityLabel: "juli 2026",
  tags: ["economie","ondernemerschap"],
  source: {
    provider: "Statbel",
    title: "Jaar- en maandevolutie van de btw-plichtige ondernemingen",
    url: "https://statbel.fgov.be/nl/themas/ondernemingen/btw-plichtige-ondernemingen/maandevolutie-van-de-btw-plichtige-ondernemingen",
    publicationDate: "2026-09-25",
  },
}

// Bronnen per grafiek, naast de hoofdbron. Beide migratiegrafieken komen uit dezelfde Statbel-tabel.
const MIGRATION_SOURCE = {
  provider: "Statbel",
  title: "Migratie van btw-plichtige ondernemingen tussen de gewesten (move_nl.xlsx)",
  url: "https://statbel.fgov.be/sites/default/files/files/documents/Ondernemingen/7.4%20BTW-plichtige%20ondernemers/7.4.1%20Jaarevolutie/Migratie/move_nl.xlsx",
}

const BANKRUPTCY_SOURCE = {
  provider: "Statbel",
  title: "Maandelijkse faillissementen",
  url: "https://statbel.fgov.be/nl/themas/ondernemingen/faillissementen/maandelijkse-faillissementen",
}

const additionalSources = [
  { label: "Faillissementen (aantal, getroffen werknemers, leeftijd, werknemersklasse)", ...BANKRUPTCY_SOURCE },
  {
    label: "Faillissementen per 1.000 ondernemingen",
    provider: "Statbel",
    title: "Maandelijkse faillissementen en btw-plichtige ondernemingen per werknemersklasse",
    url: "https://statbel.fgov.be/en/themes/enterprises/vat-registered-businesses/vat-registered-enterprises",
  },
  { label: "Instroom en uitstroom", ...MIGRATION_SOURCE },
  { label: "Herkomst en bestemming", ...MIGRATION_SOURCE },
]

export default function Page() {
  return (
    <AnalysisLayout {...metadata} additionalSources={additionalSources}>
      <StartersStoppersDashboard />
      <PressReferences slug="starters-stoppers" />
    </AnalysisLayout>
  )
}
