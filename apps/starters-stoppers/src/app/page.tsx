import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { StartersStoppersDashboard } from "@/components/StartersStoppersDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Starters en stoppers",
  date: "2026-03-24",
  summary: "Analyse van starters, stoppers, aantal ondernemingen en overlevingskansen van btw-plichtige ondernemingen, met jaarreeksen per sector en gewest vanaf 2008 en maandreeksen vanaf 2019.",
  dataAvailabilityLabel: "januari 2026",
  tags: ["economie","ondernemerschap"],
  source: {
    provider: "Statbel",
    title: "Jaar- en maandevolutie van de btw-plichtige ondernemingen",
    url: "https://statbel.fgov.be/nl/themas/ondernemingen/btw-plichtige-ondernemingen/maandevolutie-van-de-btw-plichtige-ondernemingen",
    publicationDate: "2026-03-24",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <StartersStoppersDashboard />
      <PressReferences slug="starters-stoppers" />
    </AnalysisLayout>
  )
}
