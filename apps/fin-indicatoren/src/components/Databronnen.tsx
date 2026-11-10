import { Download } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import type { EurostatData } from "./EurostatExplorer"
import type { MarktwerkingData } from "./MarktwerkingExplorer"

type Excel = { href: string; filename: string } | undefined

const linkClass = "font-medium text-primary underline-offset-4 hover:underline"

const EUROSTAT_DATASETS: { code: string; label: string }[] = [
  { code: "sbs_na_con_r2", label: "Bouw in detail (NACE Rev. 2, F), 2005-2020" },
  { code: "sbs_na_sca_r2", label: "Bijzondere aggregaten van activiteiten, 2005-2020" },
  { code: "sbs_r_nuts06_r2", label: "SBS per NUTS 2-regio, 2008-2020" },
  { code: "sbs_ovw_act", label: "Ondernemingen per NACE-activiteit, vanaf 2021" },
  { code: "sbs_r_nuts2021", label: "Ondernemingen per NUTS 2-regio en activiteit, vanaf 2021" },
]

function formatDate(value: string | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("nl-BE", { day: "numeric", month: "long", year: "numeric" })
}

function ExcelButton({ excel, label }: { excel: Excel; label: string }) {
  if (!excel) return null
  return (
    <Button asChild variant="outline" size="sm" className="gap-2">
      <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${excel.href}`} download={excel.filename}>
        <Download className="h-4 w-4" />
        {label}
      </a>
    </Button>
  )
}

function Source({
  id,
  title,
  provider,
  children,
  action,
}: {
  id: string
  title: string
  provider: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader className="pb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{provider}</p>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
        {children}
        {action ? <div className="pt-1">{action}</div> : null}
      </CardContent>
    </Card>
  )
}

export function Databronnen({
  nbb,
  eurostat,
  marktwerking,
}: {
  nbb: { sourceUrl: string; minYear: number; latestYear: number; excel?: Excel }
  eurostat?: EurostatData | null
  marktwerking?: MarktwerkingData | null
}) {
  return (
    <section id="databronnen" className="scroll-mt-24 space-y-5">
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">Databronnen</h2>
        <p className="max-w-4xl text-base leading-7 text-muted-foreground">
          Deze blog gebruikt drie afzonderlijke bronnen. Hieronder staat per bron wat er precies uit komt, hoe
          vaak de cijfers vernieuwd worden en waar je de originele data vindt.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-1">
        <Source
          id="bron-nbb"
          provider="Nationale Bank van België"
          title="CBRATIOSE: financiële ratio's van niet-financiële vennootschappen"
          action={<ExcelButton excel={nbb.excel} label="Download NBB-data in Excel" />}
        >
          <p>
            Jaarrekeningratio's per sector en per jaarrekeningmodel (volledig, verkort, micro). Reeks {nbb.minYear} t.e.m.{" "}
            {nbb.latestYear}. Gebruikt in hoofdstuk 1: winstgevendheid, liquiditeit, solvabiliteit, productiviteit en
            betalingsgedrag.
          </p>
          <p>
            De cijfers worden maandelijks via de SDMX-API van de NBB gecontroleerd. Enkele verdachte bronpunten
            (waarden die plots naar nul vallen of uitschieten) worden in de grafieken als leeg getoond; ze blijven
            wel zichtbaar in de ruwe data.{" "}
            <a href={nbb.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Open de NBB Dataviewer
            </a>
            .
          </p>
        </Source>

        {eurostat ? (
          <Source
            id="bron-eurostat"
            provider="Eurostat"
            title="Structural Business Statistics (SBS)"
            action={<ExcelButton excel={eurostat.excelDownload} label="Download Eurostat-data in Excel" />}
          >
            <p>
              Structurele bedrijfsstatistieken van de Belgische bouw: ondernemingen, tewerkstelling, omzet, toegevoegde
              waarde, investeringen en productiviteit, per subsector, per sector en per gewest. Reeks{" "}
              {eurostat.bouw.years[0]} t.e.m. {eurostat.bouw.years[eurostat.bouw.years.length - 1]}. Gebruikt in
              hoofdstuk 2.
            </p>
            <p>
              Eurostat publiceert de reeks in twee delen met een nieuwe methodologie vanaf {eurostat.breakYear}. De
              cijfers worden via de{" "}
              <a href={eurostat.apiGuideUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Eurostat-API
              </a>{" "}
              opgehaald en maandelijks gecontroleerd op nieuwe publicaties. Regionale cijfers gaan over vestigingen.
            </p>
            <ul className="space-y-1">
              {EUROSTAT_DATASETS.map((dataset) => {
                const updated = formatDate(eurostat.datasets?.[dataset.code])
                return (
                  <li key={dataset.code}>
                    <a
                      href={`https://ec.europa.eu/eurostat/databrowser/view/${dataset.code}/default/table`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      {dataset.code}
                    </a>
                    : {dataset.label}
                    {updated ? <span>, laatst bijgewerkt door Eurostat op {updated}</span> : null}
                  </li>
                )
              })}
            </ul>
          </Source>
        ) : null}

        {marktwerking ? (
          <Source
            id="bron-marktwerking"
            provider="FOD Economie"
            title={`Marktwerking en evolutie van de marges in België: horizontale screening van sectoren (${marktwerking.edition})`}
            action={<ExcelButton excel={marktwerking.excelDownload} label="Download marktwerking-data in Excel" />}
          >
            <p>
              Screening van alle Belgische sectoren op tien indicatoren van marktwerking, plus de evolutie van de netto
              marges {marktwerking.marginYears[0]} t.e.m. {marktwerking.marginYears[marktwerking.marginYears.length - 1]}.
              Gebruikt in hoofdstuk 3, voor de bouwsubsectoren en de bouwmaterialen.
            </p>
            <p>
              Dit is een jaarlijkse studie die als Excel-bijlage verschijnt, zonder API. De cijfers worden daarom één keer
              per jaar manueel vernieuwd.{" "}
              <a href={marktwerking.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Bekijk de publicatie en het methodologisch rapport
              </a>
              .
            </p>
          </Source>
        ) : null}
      </div>
    </section>
  )
}
