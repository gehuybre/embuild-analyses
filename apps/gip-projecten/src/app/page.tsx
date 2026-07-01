import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { GIPDashboard } from "@/components/GIPDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Geïntegreerd Investeringsprogramma MOW",
  date: "2026-05-22",
  summary: "Vergelijk GIP 2025-2027 met de actualisatie GIP 2026 voor mobiliteit, openbare werken, asset management en waterbeheersing.",
  tags: ["infrastructuur","mobiliteit","gip","investering"],
  source: {
    provider: "Vlaamse Regering",
    title: "GIP MOW 2026 - mededeling en bijlage",
    url: "https://www.vlaanderen.be/geintegreerd-investeringsprogramma",
    publicationDate: "2026-05-22",
  },
}

export default function Page() {
  const isStandaloneBuild = process.env.NEXT_PUBLIC_BASE_PATH === ""

  return (
    <AnalysisLayout {...metadata} hideBackLink={isStandaloneBuild}>
      <GIPDashboard />
      <PressReferences slug="gip-projecten" />
    </AnalysisLayout>
  )
}
