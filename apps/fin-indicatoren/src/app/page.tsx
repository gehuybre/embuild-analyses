import path from "node:path"
import { readFile } from "node:fs/promises"
import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { FinIndicatorenArticle, type FinIndicatorenArticleData } from "@/components/FinIndicatorenArticle"

const metadata = {
  title: "Financiële indicatoren in de bouwsector",
  date: "2026-04-15",
  summary: "Vergelijking van NBB-ratio's voor de bouwsector, alle sectoren en geselecteerde bouwsubsectoren.",
  dataAvailabilityLabel: "2022",
  tags: ["bouw", "financiën", "NBB"],
  source: {
    provider: "Nationale Bank van België",
    title: "CBRATIOSE - Financiële ratio's van niet-financiële vennootschappen",
    url: "https://dataviewer-stat.nbb.be/?chartId=a6e7262c-5128-4d39-8d36-dc3320f1ded8",
  },
}

async function loadArticleData(): Promise<FinIndicatorenArticleData> {
  const filePath = path.join(process.cwd(), "public", "data", "article.json")
  const raw = await readFile(filePath, "utf-8")
  return JSON.parse(raw) as FinIndicatorenArticleData
}

export default async function Page() {
  const article = await loadArticleData()

  return (
    <AnalysisLayout {...metadata}>
      <FinIndicatorenArticle article={article} />
    </AnalysisLayout>
  )
}
