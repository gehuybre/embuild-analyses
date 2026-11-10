"use client"

import { Download } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { MarktwerkingDownload, MarktwerkingExplorer, type MarktwerkingData } from "./MarktwerkingExplorer"
import { Databronnen } from "./Databronnen"
import { EurostatDownload, EurostatExplorer, type EurostatData } from "./EurostatExplorer"
import {
  NbbExplorer,
  type NbbChapter,
  type NbbGuideItem,
  type NbbModelGuideItem,
} from "./NbbExplorer"

type Chapter = NbbChapter & {
  intro: string
  modelGuide?: NbbModelGuideItem[]
}

export type FinIndicatorenArticleData = {
  title: string
  lead: string
  minYear: number
  latestYear: number
  sourceUrl: string
  excelDownload?: { href: string; filename: string }
  indicatorGuide: NbbGuideItem[]
  chapters: Chapter[]
}

const linkClass = "font-medium text-primary underline-offset-4 hover:underline"

export function FinIndicatorenArticle({
  article,
  eurostat,
  marktwerking,
}: {
  article: FinIndicatorenArticleData
  eurostat?: EurostatData | null
  marktwerking?: MarktwerkingData | null
}) {
  const modelGuide = article.chapters.find((chapter) => chapter.modelGuide)?.modelGuide

  return (
    <div className="not-prose space-y-14">
      <section className="space-y-4">
        <p className="max-w-4xl text-lg leading-8 text-muted-foreground">{article.lead}</p>
        {eurostat || marktwerking ? (
          <nav aria-label="Hoofdstukken" className="flex flex-wrap gap-2 text-sm">
            <a href="#nbb" className={linkClass}>
              1. NBB-ratio&apos;s
            </a>
            <span aria-hidden className="text-muted-foreground">
              |
            </span>
            <a href="#eurostat" className={linkClass}>
              2. Eurostat structurele bedrijfsstatistieken
            </a>
            {marktwerking ? (
              <>
                <span aria-hidden className="text-muted-foreground">
                  |
                </span>
                <a href="#marktwerking" className={linkClass}>
                  3. Marktwerking en marges
                </a>
              </>
            ) : null}
            <span aria-hidden className="text-muted-foreground">
              |
            </span>
            <a href="#databronnen" className={linkClass}>
              Databronnen
            </a>
          </nav>
        ) : null}
      </section>

      <section id="nbb" className="scroll-mt-24 space-y-5">
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            Financiële ratio&apos;s van de Nationale Bank
          </h2>
          <p className="max-w-4xl text-base leading-7 text-muted-foreground">
            Vergelijk de bouw met andere hoofdsectoren, met bouwsubsectoren en per jaarrekeningmodel in
            één grafiek. Combineer vrij: kies een indicator en vink de reeksen aan die je wil vergelijken.
          </p>
          <p className="text-sm text-muted-foreground">
            Beschikbare reeks: {article.minYear} t.e.m. {article.latestYear}. Bron:{" "}
            <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Nationale Bank van België
            </a>
            .
          </p>
          {article.excelDownload ? (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a
                href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${article.excelDownload.href}`}
                download={article.excelDownload.filename}
              >
                <Download className="h-4 w-4" />
                Download alle data in Excel
              </a>
            </Button>
          ) : null}
        </div>
        <NbbExplorer chapters={article.chapters} guide={article.indicatorGuide} modelGuide={modelGuide} sourceUrl={article.sourceUrl} />
      </section>

      {eurostat ? (
        <section id="eurostat" className="scroll-mt-24 space-y-5">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">
              Eurostat: structurele bedrijfsstatistieken (SBS)
            </h2>
            <p className="max-w-4xl text-base leading-7 text-muted-foreground">
              Aantal ondernemingen, tewerkstelling, omzet, toegevoegde waarde, investeringen en productiviteit
              van de Belgische bouw, per subsector, naast andere sectoren en per gewest. De cijfers worden via
              de Eurostat-API opgehaald en maandelijks gecontroleerd op nieuwe publicaties.
            </p>
            <p className="text-sm text-muted-foreground">
              Beschikbare reeks: {eurostat.bouw.years[0]} t.e.m. {eurostat.bouw.years[eurostat.bouw.years.length - 1]}{" "}
              (regionaal vanaf {eurostat.regional.years[0]}). Bron:{" "}
              <a href={eurostat.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Eurostat
              </a>
              , laatst opgehaald op {eurostat.generatedAt}.
            </p>
            <EurostatDownload excel={eurostat.excelDownload} />
          </div>
          <EurostatExplorer data={eurostat} />
        </section>
      ) : null}
      {marktwerking ? (
        <section id="marktwerking" className="scroll-mt-24 space-y-5">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">
              Marktwerking en marges in de bouw
            </h2>
            <p className="max-w-4xl text-base leading-7 text-muted-foreground">
              De horizontale screening van FOD Economie toetst alle Belgische sectoren op tien indicatoren van
              marktwerking, zoals concentratie, het aantal bedrijven en de prijs-kostmarge. Hier zie je hoe de
              bouwsubsectoren en de bouwmaterialen scoren en hoe hun marges tussen 2018 en 2023 evolueerden.
            </p>
            <p className="text-sm text-muted-foreground">
              Editie {marktwerking.edition}. Bron:{" "}
              <a href={marktwerking.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                FOD Economie, Marktwerking in België
              </a>
              .
            </p>
            <MarktwerkingDownload excel={marktwerking.excelDownload} />
          </div>
          <MarktwerkingExplorer data={marktwerking} />
        </section>
      ) : null}
      <Databronnen
        nbb={{ sourceUrl: article.sourceUrl, minYear: article.minYear, latestYear: article.latestYear, excel: article.excelDownload }}
        eurostat={eurostat}
        marktwerking={marktwerking}
      />
    </div>
  )
}
