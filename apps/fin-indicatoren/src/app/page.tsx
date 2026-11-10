import path from "node:path"
import { readFile } from "node:fs/promises"
import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { FinIndicatorenArticle, type FinIndicatorenArticleData } from "@/components/FinIndicatorenArticle"
import type { EurostatData } from "@/components/EurostatExplorer"
import type { MarktwerkingData } from "@/components/MarktwerkingExplorer"

const metadata = {
  title: "Financiële indicatoren in de bouwsector",
  date: "2026-04-15",
  summary: "NBB-ratio's, Eurostat-bedrijfsstatistieken en de marktwerkingsscreening van FOD Economie voor de bouwsector.",
  dataAvailabilityLabel: "2022",
  tags: ["bouw", "financiën", "NBB", "Eurostat", "marktwerking"],
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

async function loadEurostatData(): Promise<EurostatData | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "eurostat-sbs.json"), "utf-8")
    return JSON.parse(raw) as EurostatData
  } catch {
    return null
  }
}

async function loadMarktwerkingData(): Promise<MarktwerkingData | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", "marktwerking.json"), "utf-8")
    return JSON.parse(raw) as MarktwerkingData
  } catch {
    return null
  }
}

export default async function Page() {
  const [article, eurostat, marktwerking] = await Promise.all([
    loadArticleData(),
    loadEurostatData(),
    loadMarktwerkingData(),
  ])

  return (
    <AnalysisLayout {...metadata}>
      <FinIndicatorenArticle article={article} eurostat={eurostat} marktwerking={marktwerking} />
    </AnalysisLayout>
  )
}
