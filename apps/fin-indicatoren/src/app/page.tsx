import path from "node:path"
import { readFile } from "node:fs/promises"
import { AnalysisLayout } from "@embuild/shared/components/shared/AnalysisLayout"
import { FinIndicatorenArticle, type FinIndicatorenArticleData } from "@/components/FinIndicatorenArticle"
import type { EurostatData } from "@/components/EurostatExplorer"
import type { MarktwerkingData } from "@/components/MarktwerkingExplorer"

const metadata = {
  title: "Financiële indicatoren in de bouwsector",
  date: "2026-11-10",
  summary: "NBB-ratio's, Eurostat-bedrijfsstatistieken en de marktwerkingsscreening van FOD Economie voor de bouwsector.",
  dataAvailabilityLabel: "2024 voor Eurostat, 2023 voor FOD Economie en 2022 voor de NBB",
  tags: ["bouw", "financiën", "NBB", "Eurostat", "marktwerking"],
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
