"use client"

import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { createAutoScaledFormatter } from "@embuild/shared/lib/number-formatters"
import { getPublicPath } from "@embuild/shared/lib/path-utils"
import dataset from "../../public/data/yearly_comparison.json"

export const SLUG = "gemeentelijke-investeringen-2026-10"
export const SECTIONS = ["investments-yearly-actual", "investments-yearly-latest", "investments-yearly-original"] as const
export type Section = typeof SECTIONS[number]

const currency = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
const color = (plan: number) => CHART_SERIES_COLORS[(plan - 2014) / 6]
const formatAmount = (amount: number | null) => amount === null ? "Niet beschikbaar" : currency.format(amount)

export function OctoberComparison({
  section,
  viewType = "chart",
}: {
  section: Section
  viewType?: "chart" | "table"
}) {
  const [view, setView] = useState<"chart" | "table">(viewType)
  useEffect(() => setView(viewType), [viewType])
  const comparison = section === "investments-yearly-actual" ? "actual" : "original"
  const isComparison = section === "investments-yearly-actual"
  const primary = section === "investments-yearly-original" ? "original" : "latest"
  const primaryLabel = primary === "original" ? "Origineel beginkrediet" : "Meest recent plan"
  const series: { key: "latest" | "original" | "actual"; label: string; opacity: number }[] = isComparison
    ? [{ key: "latest", label: "Meest recent plan", opacity: 1 }, { key: "actual", label: "Jaarrekening (werkelijk)", opacity: 0.4 }]
    : [{ key: primary, label: primaryLabel, opacity: primary === "original" ? 0.4 : 1 }]
  const comparisonLabel = comparison === "actual" ? "Jaarrekening (werkelijk)" : "Origineel beginkrediet"
  const unequalCoverageYears = dataset.rows
    .filter((row) => isComparison
      ? row.municipalities.actual !== null && row.municipalities.latest !== row.municipalities.actual
      : row.municipalities[primary] < 285)
    .map((row) => row.Boekjaar)
  const title = comparison === "actual"
    ? "Geplande en werkelijke bouwinvesteringen per boekjaar (2014-2031)"
    : primary === "original"
      ? "Origineel beginkrediet per boekjaar (2014-2031)"
      : "Meest recente plan per boekjaar (2014-2031)"
  const axisMaximum = Math.ceil(Math.max(
    ...dataset.rows.flatMap((row) => [row.latest, row[comparison]]).filter((value): value is number => value !== null)
  ) / 1_000_000_000) * 1_000_000_000
  const { formatter, scaleLabel } = createAutoScaledFormatter(
    dataset.rows.flatMap((row) => [row.latest, row[comparison]]).filter((value): value is number => value !== null),
    true
  )
  const csvData = dataset.rows.map((row) => ({
    label: String(row.Boekjaar),
    periodCells: [row.Boekjaar, row.Rapportjaar],
    value: row[primary],
    ...Object.fromEntries(series.flatMap(({ key, label }) => [
      [`${label} (euro)`, row[key]],
      [`Besturen ${label}`, row.municipalities[key]],
    ])),
  }))

  return (
    <section id={section} className="scroll-mt-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle><h2 className="text-xl font-semibold">{title}</h2></CardTitle>
            <ExportButtons
              data={csvData}
              title={title}
              slug={SLUG}
              sectionId={section}
              viewType={view}
              periodHeaders={["Boekjaar", "Planrapportjaar"]}
              valueLabel="Bouwinvesteringen (euro)"
              dataSource="ABB BBC-DR, bouwscope op economische rekeningen, oktober 2026"
              dataSourceUrl={dataset.source_url}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {isComparison
              ? "Per boekjaar het meest recente meerjarenplan naast de werkelijke uitgaven volgens de jaarrekening. Jaarrekeningen zijn beschikbaar tot en met 2025; daarna ontbreekt de lichte balk."
              : primary === "original"
                ? "Geplande bouwinvesteringen volgens de eerste versie van het meerjarenplan (status Origineel of Origineel-Beginkrediet), geen realisaties."
                : "Geplande bouwinvesteringen volgens de meest recente versie van het meerjarenplan, geen realisaties."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {unequalCoverageYears.length > 0 && (
            <p role="note" className="rounded border bg-muted/40 p-3 text-sm">
              Let op: in {unequalCoverageYears.join(", ")} {isComparison
                ? "verschilt het aantal besturen tussen de twee bronnen."
                : "bevat deze bron minder dan 285 besturen."}
              De totalen zijn niet gecorrigeerd voor ontbrekende besturen; zie de dekking in de tabel.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Heel Vlaanderen; {dataset.price_basis.toLowerCase()}. Elk boekjaar gebruikt zijn eigen zesjarige plan:
            2014-2019, 2020-2025 of 2026-2031. Overlappende planjaren tellen niet dubbel mee.
          </p>
          {!isComparison && <p className="text-sm text-muted-foreground">De twee afzonderlijke plangrafieken gebruiken dezelfde verticale schaal.</p>}
          {isComparison && <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Betekenis kleurtinten">
            <span className="flex items-center gap-2"><span className="h-3 w-4 bg-foreground" aria-hidden="true" />Volle tint: meest recent plan</span>
            <span className="flex items-center gap-2"><span className="h-3 w-4 bg-foreground opacity-40" aria-hidden="true" />Lichte tint: {comparisonLabel.toLowerCase()}</span>
          </div>}
          <Tabs value={view} onValueChange={(value) => setView(value === "table" ? "table" : "chart")}>
            <TabsList aria-label={`Weergave ${title}`}>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart" className="space-y-4 mt-4">
              <p className="text-sm font-medium">Bouwinvesteringen (in {scaleLabel} euro)</p>
              <div className="overflow-x-auto">
                <div className="h-[420px] min-w-[760px]" aria-label={title}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 760, height: 420 }}>
                    <BarChart data={dataset.rows} margin={{ top: 10, right: 20, left: 10, bottom: 20 }} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="Boekjaar" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={formatter} width={75} domain={[0, axisMaximum]} />
                      <Tooltip
                        formatter={(value) => typeof value === "number" ? currency.format(value) : "Niet beschikbaar"}
                        labelFormatter={(label) => `Boekjaar ${label}`}
                      />
                      {series.map(({ key, label, opacity }) => (
                        <Bar key={key} dataKey={key} name={label} fillOpacity={opacity} isAnimationActive={false}>
                          {dataset.rows.map((row) => <Cell key={row.Boekjaar} fill={color(row.Rapportjaar)} />)}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <ul className="flex flex-wrap gap-4 text-sm" aria-label="Kleuren per planperiode">
                {[2014, 2020, 2026].map((plan) => (
                  <li className="flex items-center gap-2" key={plan}>
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: color(plan) }} aria-hidden="true" />
                    {plan}-{plan + 5}
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="table" className="mt-4">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <caption className="sr-only">{title}, euro en aantal besturen in de bron</caption>
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="p-2 text-left">Boekjaar</th>
                      <th scope="col" className="p-2 text-right">{primaryLabel}</th>
                      {isComparison && <th scope="col" className="p-2 text-right">{comparisonLabel}</th>}
                      <th scope="col" className="p-2 text-right">{isComparison ? "Besturen recent / vergelijking" : "Besturen"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.rows.map((row) => (
                      <tr key={row.Boekjaar} className="border-t">
                        <th scope="row" className="p-2 text-left font-normal">{row.Boekjaar}</th>
                        <td className="p-2 text-right tabular-nums">{formatAmount(row[primary])}</td>
                        {isComparison && <td className="p-2 text-right tabular-nums">{formatAmount(row[comparison])}</td>}
                        <td className="p-2 text-right">
                          {row.municipalities[primary]}
                          {isComparison && ` / ${row.municipalities[comparison] ?? "Niet beschikbaar"}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
          <p className="text-sm text-muted-foreground">
            Bron: <a className="underline" href={dataset.source_url}>ABB BBC-DR</a>.
            {" "}<a className="underline" href={getPublicPath("/data/yearly_comparison.json")}>Jaartotalen en definities</a>
            {" | "}<a className="underline" href={getPublicPath("/data/source_snapshot.json")}>Broncontrole en SHA-256</a>.
            Ontbrekende waarden zijn geen nulbedragen. De dekking per bron staat in de tabel en CSV.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}

export function OctoberDashboard() {
  return (
    <div className="not-prose space-y-10">
      <aside className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2" aria-label="Over deze versie">
        <p className="font-semibold">Versie oktober 2026 - bouwscope op economische rekeningen</p>
        <p>
          Nieuwe vergelijkingen uit drie exports van oktober. De oudere bronversies blijven afzonderlijk beschikbaar:
          {" "}<a className="underline" href="/analyses/gemeentelijke-investeringen-2026-09/">september 2026</a>,
          {" "}<a className="underline" href="/analyses/gemeentelijke-investeringen/">mei 2026</a> en
          {" "}<a className="underline" href="/analyses/gemeentelijke-investeringen-2026-02/">februari 2026</a>.
        </p>
      </aside>
      <OctoberComparison section="investments-yearly-actual" />
      <OctoberComparison section="investments-yearly-latest" />
      <OctoberComparison section="investments-yearly-original" />
      <section className="rounded-lg border p-4 space-y-3" aria-labelledby="scope-title">
        <h2 id="scope-title" className="text-xl font-semibold">Afbakening en aandachtspunten</h2>
        <p className="text-sm">
          Dezelfde bouwscope als de vroegere BV-selectie, nu rechtstreeks op economische rekeningen gefilterd:
        </p>
        <ul className="list-disc pl-5 text-sm space-y-1">
          {Object.entries(dataset.scope).map(([code, label]) => <li key={code}>{code}: {label}</li>)}
        </ul>
        <p className="text-sm">
          Financiële en immateriële vaste activa, roerende goederen en leasing zijn uitgesloten.
          De bron bevat gemeenten en OCMW&apos;s of districten. De telling betreft besturen met bronregels,
          ook als hun geselecteerde bouwuitgave nul is.
        </p>
        <ul className="list-disc pl-5 text-sm space-y-2">
          {dataset.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
        <p className="text-sm">
          De oktoberexport laat geen betrouwbare bouwuitsplitsing per beleidsveld toe.
          Daarom staan hier geen BV-grafieken met ongefilterde of overgenomen septembercijfers.
          Verschillen met oudere BV-grafieken kunnen ook komen door positieve cellen per rekening
          tegenover per beleidsveld; vergelijk deze totalen niet zonder meer als bronrevisies.
        </p>
        <p className="text-sm">
          Controlebestanden:
          {" "}<a className="underline" href={getPublicPath("/data/construction_latest.csv")}>meest recent plan</a>,
          {" "}<a className="underline" href={getPublicPath("/data/construction_actual.csv")}>jaarrekeningen</a>,
          {" "}<a className="underline" href={getPublicPath("/data/construction_original.csv")}>origineel beginkrediet</a>.
        </p>
      </section>
    </div>
  )
}
