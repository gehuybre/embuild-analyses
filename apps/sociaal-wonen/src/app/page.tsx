import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { SociaalWonenDashboard } from "@/components/SociaalWonenDashboard"

const metadata = {
  title: "Sociale huurplanning per woonmaatschappij",
  date: "2026-08-14",
  summary: "Waar en voor welke bedragen plannen de Vlaamse woonmaatschappijen sociale huurwoningen?",
  tags: ["sociaal wonen","woonmaatschappijen","aanbesteding","huurwoningen"],
  source: {
    provider: "VMSW",
    title: "Korte termijnplanning en meerjarenplanning sociale huur (14.08.2026)",
    url: "https://www.vmsw.be",
    publicationDate: "2026-08-14",
  },
}

export default function Page() {
  const isStandaloneBuild = process.env.NEXT_PUBLIC_BASE_PATH === ""

  return (
    <AnalysisLayout {...metadata} hideBackLink={isStandaloneBuild}>
      <SociaalWonenDashboard />
    </AnalysisLayout>
  )
}
