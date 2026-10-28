"use client"

import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { AnalysisOnly } from "@embuild/shared/components/shared/AnalysisOnly"
import { MunicipalityMap } from "@embuild/shared/components/shared/MunicipalityMap"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { createAutoScaledFormatter } from "@embuild/shared/lib/number-formatters"
import { getConstituents } from "@embuild/shared/lib/nis-fusion-utils"
import inflation from "../../public/data/inflation_factors.json"
import { SLUG } from "@/lib/sections"
import {
  FLANDERS, GeoFilter, LabeledSelect, ToggleGroup, geoMembers, geoName, useDomainSummary, useGeoIndex,
  type DomainSummary, type GeoIndex,
} from "./geo"
import type { Metric } from "./BreakdownSection"

const SOURCE_URL = "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien"
const PERIODS = [2014, 2020, 2026] as const
const TABLE_SIZE = 20
const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const euroCents = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
const factor = (year: number) => inflation.years[String(year) as keyof typeof inflation.years].factor

/** Amount of one municipality in one plan period (six book years), optionally deflated, in total or per inhabitant. */
function municipalityValue(
  entry: DomainSummary["municipalities"][string],
  domains: string[],
  period: number,
  metric: Metric,
  indexed: boolean,
) {
  let total = 0
  for (let year = period; year <= period + 5; year++) {
    let amount = 0
    for (const domain of domains) amount += entry.domains[domain]?.[String(year)] ?? 0
    const adjusted = indexed ? amount * factor(year) : amount
    if (metric === "total") total += adjusted
    else if (entry.population[String(year)]) total += adjusted / entry.population[String(year)]
  }
  return total
}

/** Same period value for a group of municipalities; per inhabitant divides per book year by the summed population. */
function groupValue(
  summary: DomainSummary,
  members: string[],
  domains: string[],
  period: number,
  metric: Metric,
  indexed: boolean,
) {
  if (metric === "total") {
    return members.reduce((sum, nis) => sum + municipalityValue(summary.municipalities[nis], domains, period, "total", indexed), 0)
  }
  let total = 0
  for (let year = period; year <= period + 5; year++) {
    let amount = 0
    let population = 0
    for (const nis of members) {
      const entry = summary.municipalities[nis]
      population += entry.population[String(year)] ?? 0
      for (const domain of domains) amount += entry.domains[domain]?.[String(year)] ?? 0
    }
    if (population) total += (indexed ? amount * factor(year) : amount) / population
  }
  return total
}

function useRanking(
  index: GeoIndex | null,
  summary: DomainSummary | null,
  geo: string,
  domains: string[],
  metric: Metric,
  indexed: boolean,
) {
  const chart = useMemo(() => {
    if (!index || !summary) return null
    const members = geoMembers(index, geo)
    return PERIODS.map((period) => ({
      period,
      label: `${period}-${period + 5}`,
      value: groupValue(summary, members, domains, period, metric, indexed),
    }))
  }, [index, summary, geo, domains, metric, indexed])
  const ranking = useMemo(() => {
    if (!index || !summary) return null
    return index.municipalities
      .map((entry) => ({ nis: entry.code, name: entry.name, value: municipalityValue(summary.municipalities[entry.code], domains, 2026, metric, indexed) }))
      .sort((a, b) => b.value - a.value)
      .map((row, position) => ({ ...row, rank: position + 1 }))
  }, [index, summary, domains, metric, indexed])
  const visibleRanking = useMemo(() => {
    if (!ranking) return []
    const selected = ranking.findIndex((row) => row.nis === geo)
    if (selected === -1) return ranking.slice(0, TABLE_SIZE)
    const start = Math.min(Math.max(0, selected - 9), Math.max(0, ranking.length - TABLE_SIZE))
    return ranking.slice(start, start + TABLE_SIZE)
  }, [ranking, geo])
  return { chart, ranking, visibleRanking }
}

function MetricToggle({ value, onChange }: { value: Metric; onChange: (value: Metric) => void }) {
  return (
    <ToggleGroup
      label="Weergave"
      value={value}
      options={[{ value: "total", label: "Totaal" }, { value: "capita", label: "Per inwoner" }]}
      onChange={onChange}
    />
  )
}

function ValueMap({ ranking, metric, label }: { ranking: { nis: string; name: string; value: number }[]; metric: Metric; label: string }) {
  const data = useMemo(() => ranking.flatMap((row) => {
    const constituents = getConstituents(row.nis)
    return (constituents.length > 0 ? constituents : [row.nis]).map((code) => ({ code, name: row.name, value: row.value }))
  }), [ranking])
  const names = useMemo(() => new Map(data.map((row) => [row.code, row.name])), [data])
  return (
    <MunicipalityMap
      data={data}
      getGeoCode={(row) => row.code}
      getValue={(row) => row.value}
      getGeoName={(code) => names.get(code) ?? null}
      formatValue={(value) => (metric === "total" ? euro : euroCents).format(value)}
      tooltipLabel={label}
      colorScheme="orange"
      showProvinceBoundaries={false}
    />
  )
}

function DomainCard({
  indexed,
  viewType,
  initialGeo,
  initialMetric,
  initialDomain,
}: {
  indexed: boolean
  viewType: "chart" | "table" | "map"
  initialGeo: string
  initialMetric: Metric
  initialDomain: string
}) {
  const [view, setView] = useState(viewType)
  const [geo, setGeo] = useState(initialGeo)
  const [metric, setMetric] = useState<Metric>(initialMetric)
  const [domain, setDomain] = useState(indexed ? "" : initialDomain)
  useEffect(() => setView(viewType), [viewType])
  useEffect(() => setGeo(initialGeo), [initialGeo])
  useEffect(() => setMetric(initialMetric), [initialMetric])
  useEffect(() => setDomain(indexed ? "" : initialDomain), [indexed, initialDomain])
  const { data: index } = useGeoIndex()
  const { data: summary, error } = useDomainSummary()
  const domainIndexes = useMemo(
    () => domain === "" ? (index?.domains.map((_, position) => String(position)) ?? []) : [domain],
    [domain, index],
  )
  const { chart, ranking, visibleRanking } = useRanking(index, summary, geo, domainIndexes, metric, indexed)

  const sectionId = indexed ? "investments-bv-indexed" : "investments-bv"
  const place = geoName(index, geo)
  const domainName = domain === "" ? null : index?.domains[Number(domain)]?.name
  const baseTitle = indexed ? "Geïndexeerde investeringsbedragen" : "Investeringen per beleidsdomein"
  const title = `${baseTitle} - ${place}${domainName ? `, ${domainName.toLowerCase()}` : ""}`
  const metricLabel = metric === "total" ? "Totale bouwinvesteringen" : "Bouwinvesteringen per inwoner"
  const unitLabel = indexed ? `${metricLabel}, prijspeil ${inflation.price_level_label}` : metricLabel
  const format = (value: number) => (metric === "total" ? euro : euroCents).format(value)
  const { formatter, scaleLabel } = createAutoScaledFormatter((chart ?? []).map((row) => row.value), true)
  const csvData = (chart ?? []).map((row) => ({ label: row.label, periodCells: [row.label], value: Math.round(row.value * 100) / 100 }))

  return (
    <section id={sectionId} className="scroll-mt-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle><h2 className="text-xl font-semibold">{title}</h2></CardTitle>
            <ExportButtons
              data={csvData}
              title={title}
              slug={SLUG}
              sectionId={sectionId}
              viewType={view}
              periodHeaders={["Planperiode"]}
              valueLabel={`${unitLabel} (euro)`}
              dataSource="ABB BBC-DR, meest recent meerjarenplan, bouwscope op economische rekeningen"
              dataSourceUrl={SOURCE_URL}
              embedParams={{ geo: geo === FLANDERS ? null : geo, metric: metric === "capita" ? "capita" : null, domein: domain || null }}
            />
          </div>
          <AnalysisOnly>
            <p className="text-sm text-muted-foreground">
              {indexed
                ? "Geplande bouwinvesteringen per planperiode, omgerekend naar constante prijzen. Elk boekjaar wordt afzonderlijk gedeflateerd en daarna opgeteld over de zes jaar van het plan."
                : "Geplande bouwinvesteringen per planperiode (meest recent plan), gefilterd op beleidsdomein. De tabel en kaart tonen de gemeenten voor 2026-2031."}
            </p>
          </AnalysisOnly>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <MetricToggle value={metric} onChange={setMetric} />
            {index && <GeoFilter index={index} value={geo} onChange={setGeo} />}
            {index && !indexed && (
              <LabeledSelect label="Beleidsdomein" value={domain} onChange={setDomain}>
                <option value="">Alle beleidsdomeinen</option>
                {index.domains.map((entry, position) => <option key={entry.label} value={String(position)}>{entry.label}</option>)}
              </LabeledSelect>
            )}
          </div>
          <AnalysisOnly>
            {indexed && (
              <p className="rounded border bg-muted/40 p-3 text-sm">
                Prijspeil {inflation.price_level_label} (CPI-index {inflation.reference_cpi.toFixed(2).replace(".", ",")}).
                Per boekjaar het jaargemiddelde van de CPI; na {new Date(`${inflation.last_statbel_month}-01`).toLocaleDateString("nl-BE", { month: "long", year: "numeric" })}
                {" "}volgt de Planbureau-prognose en daarna een constante inflatie. Zie de inflatiegrafiek hierboven voor de volledige methode.
              </p>
            )}
            {!indexed && domainName && index && (
              <p className="rounded border bg-muted/40 p-3 text-sm">
                <span className="font-semibold">Dit domein bevat:</span>{" "}
                {index.subdomains.filter((entry) => entry.domain === Number(domain)).map((entry) => entry.name).join(", ")}
              </p>
            )}
          </AnalysisOnly>
          {!chart || !ranking ? (
            <p className="text-sm text-muted-foreground" role="status">
              {error ? `Fout bij het laden: ${error}` : "Gegevens laden..."}
            </p>
          ) : (
            <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
              <TabsList aria-label={`Weergave ${title}`}>
                <TabsTrigger value="chart">Grafiek</TabsTrigger>
                <TabsTrigger value="table">Tabel</TabsTrigger>
                <TabsTrigger value="map">Kaart</TabsTrigger>
              </TabsList>
              <TabsContent value="chart" className="space-y-2 mt-4">
                <p className="text-sm font-medium">
                  {metric === "total" ? `${metricLabel} (in ${scaleLabel} euro)` : `${metricLabel} (euro)`}
                </p>
                <div className="h-[400px]" aria-label={title}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 760, height: 400 }}>
                    <BarChart data={chart} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" />
                      <YAxis tickFormatter={formatter} width={75} />
                      <Tooltip formatter={(value) => typeof value === "number" ? format(value) : ""} labelFormatter={(label) => `Planperiode ${label}`} />
                      <Bar dataKey="value" name={unitLabel} fill={CHART_SERIES_COLORS[0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-sm text-muted-foreground">
                  {geo === FLANDERS ? (metric === "total" ? "Som van alle gemeenten" : "Per inwoner, alle gemeenten samen") : place}
                  {" "}- som over de zes boekjaren van elke planperiode.
                </p>
              </TabsContent>
              <TabsContent value="table" className="mt-4 space-y-2">
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{title}, gemeenten voor 2026-2031</caption>
                    <thead className="bg-muted/50">
                      <tr>
                        <th scope="col" className="p-2 text-left w-16">Rang</th>
                        <th scope="col" className="p-2 text-left">Gemeente</th>
                        <th scope="col" className="p-2 text-right">{metric === "total" ? "Totaal" : "Per inwoner"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRanking.map((row) => (
                        <tr key={row.nis} className={`border-t ${row.nis === geo ? "bg-primary/10 font-semibold" : ""}`}>
                          <td className="p-2 text-muted-foreground">{row.rank}</td>
                          <th scope="row" className="p-2 text-left font-normal">{row.name}</th>
                          <td className="p-2 text-right tabular-nums">{format(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted-foreground">
                  {ranking.some((row) => row.nis === geo)
                    ? "Top 20 gemeenten rond de geselecteerde gemeente (planperiode 2026-2031)"
                    : "Top 20 gemeenten (planperiode 2026-2031)"}
                </p>
              </TabsContent>
              <TabsContent value="map" className="mt-4 space-y-2">
                <ValueMap ranking={ranking} metric={metric} label={unitLabel} />
                <p className="text-sm text-muted-foreground">Planperiode 2026-2031 - {unitLabel.toLowerCase()}</p>
              </TabsContent>
            </Tabs>
          )}
          <p className="text-sm text-muted-foreground">Bron: <a className="underline" href={SOURCE_URL}>ABB BBC-DR</a>.</p>
        </CardContent>
      </Card>
    </section>
  )
}

type DomainProps = { viewType?: "chart" | "table" | "map"; initialGeo?: string; initialMetric?: Metric; initialDomain?: string }

export const DomainInvestmentsSection = (props: DomainProps) =>
  <DomainCard indexed={false} viewType={props.viewType ?? "chart"} initialGeo={props.initialGeo ?? FLANDERS} initialMetric={props.initialMetric ?? "total"} initialDomain={props.initialDomain ?? ""} />

export const IndexedInvestmentsSection = (props: Omit<DomainProps, "initialDomain">) =>
  <DomainCard indexed viewType={props.viewType ?? "chart"} initialGeo={props.initialGeo ?? FLANDERS} initialMetric={props.initialMetric ?? "total"} initialDomain="" />
