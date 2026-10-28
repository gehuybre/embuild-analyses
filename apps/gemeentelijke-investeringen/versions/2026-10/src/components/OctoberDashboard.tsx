"use client"

import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { AnalysisOnly } from "@embuild/shared/components/shared/AnalysisOnly"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { createAutoScaledFormatter } from "@embuild/shared/lib/number-formatters"
import { getPublicPath } from "@embuild/shared/lib/path-utils"
import dataset from "../../public/data/yearly_comparison.json"
import inflation from "../../public/data/inflation_factors.json"
import { SLUG, type ComparisonSection } from "@/lib/sections"
import { FLANDERS, GeoFilter, geoName, niceStep, useGeoData, useGeoIndex } from "./geo"
import { BreakdownSection } from "./BreakdownSection"
import { PlannedYearlySection } from "./PlannedYearlySection"
import { ShareSection, YearlyShareSection } from "./ShareSection"
import { DomainInvestmentsSection, IndexedInvestmentsSection } from "./DomainSections"

export { SLUG, SECTIONS, type Section } from "@/lib/sections"

type Row = Omit<typeof dataset.rows[number], "actual" | "municipalities"> & {
  actual: number | null
  municipalities: { latest: number; original: number; actual: number | null }
}

const currency = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
const color = (plan: number) => CHART_SERIES_COLORS[(plan - 2014) / 6]
const formatAmount = (amount: number | null) => amount === null ? "Niet beschikbaar" : currency.format(amount)

const percent = new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1, style: "percent" })

function InflationNote() {
  const { extrapolation, last_statbel_month: lastMonth, forecast_vintage: vintage, forecast_horizon: horizon } = inflation
  const label = (period: string) => new Date(`${period}-01`).toLocaleDateString("nl-BE", { month: "long", year: "numeric" })
  return (
    <div className="space-y-2 text-sm text-muted-foreground">
      <p>
        Elk boekjaar wordt gedeflateerd met het gemiddelde van de twaalf maandelijkse consumptieprijsindexen van dat jaar
        (Statbel, basis {inflation.cpi_base_year}=100), omgerekend naar {inflation.price_level_label}
        {" "}(index {inflation.reference_cpi.toFixed(2).replace(".", ",")}). De correctiefactor loopt van
        {" "}{inflation.years["2014"].factor.toFixed(2).replace(".", ",")} voor 2014 tot
        {" "}{inflation.years["2031"].factor.toFixed(2).replace(".", ",")} voor 2031.
      </p>
      <p>
        Statbel-cijfers lopen tot {label(lastMonth)}. Daarna volgen we de inflatieprognose van het Federaal Planbureau
        (editie {label(vintage)}, zie <a className="underline" href="/analyses/nbb-rente/">de analyse over de NBB-rente</a>)
        tot {label(horizon)}. Voor de jaren daarna nemen we een constante inflatie van {percent.format(extrapolation.annual_inflation)} per jaar,
        het gemiddelde van de jaar-op-jaarinflatie in de laatste vier prognosemaanden. Voor de maanden na {label(lastMonth)} is de correctie dus een
        veronderstelling, geen waarneming.
      </p>
      <p>
        Meerjarenplannen zijn opgesteld in nominale euro. Een plan met een vlakke nominale lijn toont in reële termen dus een dalende lijn.
      </p>
    </div>
  )
}

export function OctoberComparison({
  section,
  viewType = "chart",
  initialGeo = FLANDERS,
}: {
  section: ComparisonSection
  viewType?: "chart" | "table"
  initialGeo?: string
}) {
  const [view, setView] = useState<"chart" | "table">(viewType)
  useEffect(() => setView(viewType), [viewType])
  const [geo, setGeo] = useState(initialGeo)
  useEffect(() => setGeo(initialGeo), [initialGeo])
  const { data: index } = useGeoIndex()
  const { data: geoData, error: geoError } = useGeoData(geo === FLANDERS ? "" : geo)
  const isFlanders = geo === FLANDERS
  const expectedCount = isFlanders ? 285 : geoData?.municipality_count ?? 0
  const isReal = section === "investments-yearly-actual-real"
  const nominalRows: Row[] | null = useMemo(() => {
    if (isFlanders) return dataset.rows
    if (!geoData) return null
    return dataset.rows.map((row) => {
      const year = String(row.Boekjaar)
      const value = (key: "latest" | "original" | "actual") => geoData.series[key].amounts[year] ?? null
      const count = (key: "latest" | "original" | "actual") => geoData.series[key].municipalities[year] ?? null
      return {
        ...row,
        latest: value("latest") as number,
        original: value("original") as number,
        actual: value("actual"),
        municipalities: {
          latest: count("latest") as number,
          original: count("original") as number,
          actual: count("actual"),
        },
      }
    })
  }, [isFlanders, geoData])
  const rows: Row[] | null = useMemo(() => {
    if (!isReal || !nominalRows) return nominalRows
    const deflate = (amount: number | null, year: number) => amount === null ? null : amount * inflation.years[String(year) as keyof typeof inflation.years].factor
    return nominalRows.map((row) => ({
      ...row,
      latest: deflate(row.latest, row.Boekjaar) as number,
      original: deflate(row.original, row.Boekjaar) as number,
      actual: deflate(row.actual, row.Boekjaar),
    }))
  }, [isReal, nominalRows])
  const isComparison = section === "investments-yearly-actual" || isReal
  const comparison = isComparison ? "actual" : "original"
  const primary = section === "investments-yearly-original" ? "original" : "latest"
  const primaryLabel = primary === "original" ? "Origineel beginkrediet" : "Meest recent plan"
  const series: { key: "latest" | "original" | "actual"; label: string; opacity: number }[] = isComparison
    ? [{ key: "latest", label: "Meest recent plan", opacity: 1 }, { key: "actual", label: "Jaarrekening (werkelijk)", opacity: 0.4 }]
    : [{ key: primary, label: primaryLabel, opacity: primary === "original" ? 0.4 : 1 }]
  const comparisonLabel = comparison === "actual" ? "Jaarrekening (werkelijk)" : "Origineel beginkrediet"
  const visibleRows = rows ?? []
  const unequalCoverageYears = visibleRows
    .filter((row) => isComparison
      ? row.municipalities.actual !== null && row.municipalities.latest !== row.municipalities.actual
      : (row.municipalities[primary] ?? 0) < expectedCount)
    .map((row) => row.Boekjaar)
  const place = geoName(index, geo)
  const baseTitle = isReal
    ? "Geplande en werkelijke bouwinvesteringen per boekjaar (2014-2031), gecorrigeerd voor inflatie"
    : comparison === "actual"
    ? "Geplande en werkelijke bouwinvesteringen per boekjaar (2014-2031)"
    : primary === "original"
      ? "Origineel beginkrediet per boekjaar (2014-2031)"
      : "Meest recente plan per boekjaar (2014-2031)"
  const title = isFlanders ? baseTitle : `${baseTitle} - ${place}`
  // Both plan series share one axis so the separate plan charts stay comparable for the same area.
  const scaleValues = visibleRows
    .flatMap((row) => [row.latest, row[comparison]])
    .filter((value): value is number => value !== null)
  const largest = Math.max(0, ...scaleValues)
  const step = isFlanders ? 1_000_000_000 : niceStep(largest)
  const axisMaximum = Math.max(step, Math.ceil(largest / step) * step)
  const ticks = Array.from({ length: Math.round(axisMaximum / step) + 1 }, (_, index) => index * step)
  const { formatter, scaleLabel } = createAutoScaledFormatter(scaleValues, true)
  const csvData = visibleRows.map((row) => ({
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
              valueLabel={isReal ? "Bouwinvesteringen (euro, prijspeil februari 2026)" : "Bouwinvesteringen (euro)"}
              dataSource="ABB BBC-DR, bouwscope op economische rekeningen, oktober 2026"
              dataSourceUrl={dataset.source_url}
              embedParams={{ geo: isFlanders ? null : geo }}
            />
          </div>
          <AnalysisOnly>
            <p className="text-sm text-muted-foreground">
              {isReal
                ? `Dezelfde vergelijking als hierboven, maar alle bedragen zijn omgerekend naar het prijspeil van ${inflation.price_level_label}. Zo zijn boekjaren onderling vergelijkbaar zonder het effect van de prijsstijging.`
                : isComparison
                ? "Per boekjaar het meest recente meerjarenplan naast de werkelijke uitgaven volgens de jaarrekening. Jaarrekeningen zijn beschikbaar tot en met 2025; daarna ontbreekt de lichte balk."
                : primary === "original"
                  ? "Geplande bouwinvesteringen volgens de eerste versie van het meerjarenplan (status Origineel of Origineel-Beginkrediet), geen realisaties."
                  : "Geplande bouwinvesteringen volgens de meest recente versie van het meerjarenplan, geen realisaties."}
            </p>
          </AnalysisOnly>
        </CardHeader>
        <CardContent className="space-y-4">
          {index && <GeoFilter index={index} value={geo} onChange={setGeo} />}
          <AnalysisOnly>
            {rows && unequalCoverageYears.length > 0 && (
              <p role="note" className="rounded border bg-muted/40 p-3 text-sm">
                Let op: in {unequalCoverageYears.join(", ")} {isComparison
                  ? "verschilt het aantal besturen tussen de twee bronnen."
                  : expectedCount === 1
                    ? "ontbreekt deze gemeente in de bron."
                    : `bevat deze bron minder dan ${expectedCount} besturen.`}
                De totalen zijn niet gecorrigeerd voor ontbrekende besturen; zie de dekking in de tabel.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {isFlanders ? "Heel Vlaanderen" : place}; {isReal ? `bedragen in prijzen van ${inflation.price_level_label}` : dataset.price_basis.toLowerCase()}. Elk boekjaar gebruikt zijn eigen zesjarige plan:
              2014-2019, 2020-2025 of 2026-2031. Overlappende planjaren tellen niet dubbel mee.
            </p>
            {isReal && <InflationNote />}
            {!isComparison && <p className="text-sm text-muted-foreground">De twee afzonderlijke plangrafieken gebruiken dezelfde verticale schaal.</p>}
          </AnalysisOnly>
          {isComparison && <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Betekenis kleurtinten">
            <span className="flex items-center gap-2"><span className="h-3 w-4 bg-foreground" aria-hidden="true" />Volle tint: meest recent plan</span>
            <span className="flex items-center gap-2"><span className="h-3 w-4 bg-foreground opacity-40" aria-hidden="true" />Lichte tint: {comparisonLabel.toLowerCase()}</span>
          </div>}
          {!rows && (
            <p className="text-sm text-muted-foreground" role="status">
              {geoError ? `Fout bij het laden van ${place}: ${geoError}` : `Gegevens voor ${place} laden...`}
            </p>
          )}
          {rows && <Tabs value={view} onValueChange={(value) => setView(value === "table" ? "table" : "chart")}>
            <TabsList aria-label={`Weergave ${title}`}>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart" className="space-y-4 mt-4">
              <p className="text-sm font-medium">Bouwinvesteringen (in {scaleLabel} euro)</p>
              <div className="overflow-x-auto">
                <div className="h-[420px] min-w-[760px]" aria-label={title}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 760, height: 420 }}>
                    <BarChart data={visibleRows} margin={{ top: 10, right: 20, left: 10, bottom: 20 }} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="Boekjaar" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={formatter} width={75} domain={[0, axisMaximum]} ticks={ticks} />
                      <Tooltip
                        formatter={(value) => typeof value === "number" ? currency.format(value) : "Niet beschikbaar"}
                        labelFormatter={(label) => `Boekjaar ${label}`}
                      />
                      {series.map(({ key, label, opacity }) => (
                        <Bar key={key} dataKey={key} name={label} fillOpacity={opacity} isAnimationActive={false}>
                          {visibleRows.map((row) => <Cell key={row.Boekjaar} fill={color(row.Rapportjaar)} />)}
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
                    {visibleRows.map((row) => (
                      <tr key={row.Boekjaar} className="border-t">
                        <th scope="row" className="p-2 text-left font-normal">{row.Boekjaar}</th>
                        <td className="p-2 text-right tabular-nums">{formatAmount(row[primary])}</td>
                        {isComparison && <td className="p-2 text-right tabular-nums">{formatAmount(row[comparison])}</td>}
                        <td className="p-2 text-right">
                          {row.municipalities[primary] ?? "Niet beschikbaar"}
                          {isComparison && ` / ${row.municipalities[comparison] ?? "Niet beschikbaar"}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>}
          <p className="text-sm text-muted-foreground">
            Bron: <a className="underline" href={dataset.source_url}>ABB BBC-DR</a>.
            {" "}<a className="underline" href={getPublicPath("/data/yearly_comparison.json")}>Jaartotalen en definities</a>
            <AnalysisOnly>
              {" | "}<a className="underline" href={getPublicPath("/data/source_snapshot.json")}>Broncontrole en SHA-256</a>.
              Ontbrekende waarden zijn geen nulbedragen. De dekking per bron staat in de tabel en CSV.
            </AnalysisOnly>
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
          Nieuwe vergelijkingen uit de exports van oktober, nu ook per provincie, gemeente, beleidsdomein en rekening. De oudere bronversies blijven afzonderlijk beschikbaar:
          {" "}<a className="underline" href="/analyses/gemeentelijke-investeringen-2026-09/">september 2026</a>,
          {" "}<a className="underline" href="/analyses/gemeentelijke-investeringen/">mei 2026</a> en
          {" "}<a className="underline" href="/analyses/gemeentelijke-investeringen-2026-02/">februari 2026</a>.
        </p>
      </aside>
      <OctoberComparison section="investments-yearly-actual" />
      <OctoberComparison section="investments-yearly-actual-real" />
      <OctoberComparison section="investments-yearly-latest" />
      <OctoberComparison section="investments-yearly-original" />
      <PlannedYearlySection />
      <DomainInvestmentsSection />
      <IndexedInvestmentsSection />
      <ShareSection />
      <YearlyShareSection />
      <BreakdownSection kind="bv" />
      <BreakdownSection kind="rek" />
      <section className="rounded-lg border p-4 space-y-3" aria-labelledby="scope-title">
        <h2 id="scope-title" className="text-xl font-semibold">Afbakening en aandachtspunten</h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          {Object.entries(dataset.scope).map(([code, label]) => <li key={code}>{code}: {label}</li>)}
        </ul>
        <p className="text-sm">
          Financiële en immateriële vaste activa, roerende goederen en leasing zijn uitgesloten.
          De bron bevat gemeenten en OCMW&apos;s of districten.
        </p>
        <p className="text-sm">
          Controlebestanden:
          {" "}<a className="underline" href={getPublicPath("/data/construction_latest.csv")}>meest recent plan</a>,
          {" "}<a className="underline" href={getPublicPath("/data/construction_actual.csv")}>jaarrekeningen</a>,
          {" "}<a className="underline" href={getPublicPath("/data/construction_original.csv")}>origineel beginkrediet</a>,
          {" "}<a className="underline" href={getPublicPath("/data/construction_detail_bv.csv")}>uitsplitsing per beleidsveld en rekening</a>
          {" "}(codes in <a className="underline" href={getPublicPath("/data/geo/index.json")}>index.json</a>).
        </p>
      </section>
    </div>
  )
}
