import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { GIPDashboard } from "@/components/GIPDashboard"

const metadata = {
  title: "Geïntegreerd Investeringsprogramma 2025-2029",
  date: "2025-07-14",
  summary: "€7,4 miljard investeringen in Vlaamse infrastructuur verdeeld over 774 projecten in mobiliteit, openbare werken, asset management en waterbeheersing.",
  tags: ["infrastructuur","mobiliteit","gip","investering"],
  source: {
    provider: "Vlaamse Regering",
    title: "Geïntegreerd Investeringsprogramma 2025-2029",
    url: "https://www.vlaanderen.be/geintegreerd-investeringsprogramma",
    publicationDate: "2025-07-14",
  },
}

export default function Page() {
  return (
    <AnalysisLayout {...metadata}>
      <GIPDashboard />

    </AnalysisLayout>
  )
}
