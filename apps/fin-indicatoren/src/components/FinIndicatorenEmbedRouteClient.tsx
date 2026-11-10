"use client"

import { useSearchParams } from "next/navigation"
import { EmbedAutoResize } from "@embuild/shared/components/shared/EmbedAutoResize"
import { EurostatExplorer, type EurostatData } from "./EurostatExplorer"
import type { FinIndicatorenArticleData } from "./FinIndicatorenArticle"
import { MarktwerkingExplorer, type MarktwerkingData } from "./MarktwerkingExplorer"
import { NbbExplorer } from "./NbbExplorer"

const SLUG = "fin-indicatoren"

export function FinIndicatorenEmbedRouteClient({
  section,
  data,
}: {
  section: string
  data: unknown
}) {
  const searchParams = useSearchParams()
  // Parameters staan als `fin-indicatoren.<naam>`; de kale naam werkt ook.
  const param = (key: string) => searchParams.get(`${SLUG}.${key}`) ?? searchParams.get(key)
  const list = (key: string) => (param(key) ?? "").split(",").filter(Boolean)
  const tab = param("view") === "table" ? "table" : "chart"

  if (!data) return <div className="p-4 text-sm text-muted-foreground">Data niet beschikbaar.</div>

  let content: React.ReactNode = null
  if (section === "nbb") {
    const article = data as FinIndicatorenArticleData
    content = (
      <NbbExplorer
        chapters={article.chapters}
        guide={article.indicatorGuide}
        sourceUrl={article.sourceUrl}
        initial={{ indicator: param("indicator") ?? undefined, series: list("series"), tab }}
      />
    )
  } else if (section === "eurostat") {
    content = (
      <EurostatExplorer
        data={data as EurostatData}
        initial={{
          dataset: param("dataset") ?? undefined,
          indicator: param("indicator") ?? undefined,
          series: list("series"),
          mode: param("mode") ?? undefined,
          nace: param("nace") ?? undefined,
          tab,
        }}
      />
    )
  } else if (section === "marktwerking") {
    content = (
      <MarktwerkingExplorer
        data={data as MarktwerkingData}
        initial={{
          part: param("part") ?? undefined,
          measure: param("measure") ?? undefined,
          series: list("series"),
          group: param("group") ?? undefined,
          show: param("show") ?? undefined,
          tab,
        }}
      />
    )
  }

  return (
    <div className="not-prose p-4">
      <EmbedAutoResize />
      {content}
    </div>
  )
}
