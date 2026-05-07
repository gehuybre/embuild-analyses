import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { GIPDashboard } from "@/components/GIPDashboard"
import { PressReferences } from "@embuild/shared/components/shared/PressReferences"

const metadata = {
  title: "Geïntegreerd Investeringsprogramma 2025-2029",
  date: "2025-07-14",
  summary: "€7,51 miljard investeringen voor 2025-2027 uit het Vlaamse GIP, verdeeld over 777 (deel)projecten in mobiliteit, openbare werken, asset management en waterbeheersing.",
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
      <PressReferences slug="gip-projecten" />
    </AnalysisLayout>
  )
}
