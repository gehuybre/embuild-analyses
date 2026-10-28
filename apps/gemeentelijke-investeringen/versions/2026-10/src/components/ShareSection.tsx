"use client"

import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { AnalysisOnly } from "@embuild/shared/components/shared/AnalysisOnly"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { getPublicPath } from "@embuild/shared/lib/path-utils"
import { SLUG } from "@/lib/sections"
import { FLANDERS, GeoFilter, geoMembers, geoName, useDomainSummary, useGeoIndex, useJson } from "./geo"

const SECTION = "investments-share-total"
const SOURCE_URL = "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien"
const PERIODS = [2014, 2020, 2026] as const
const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat("nl-BE", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 })

interface TotalExpenditure {
  scope: string
  municipalities: Record<string, Record<string, number>>
}

const useTotalExpenditure = () => useJson<TotalExpenditure>("/data/total_expenditure.json")

export function ShareSection({
  viewType = "chart",
  initialGeo = FLANDERS,
}: {
  viewType?: "chart" | "table"
  initialGeo?: string
}) {
  const [view, setView] = useState<"chart" | "table">(viewType)
  const [geo, setGeo] = useState(initialGeo)
  useEffect(() => setView(viewType), [viewType])
  useEffect(() => setGeo(initialGeo), [initialGeo])
  const { data: index } = useGeoIndex()
  const { data: summary, error: summaryError } = useDomainSummary()
  const { data: totals, error: totalsError } = useTotalExpenditure()
  const error = summaryError ?? totalsError

  const rows = useMemo(() => {
    if (!index || !summary || !totals) return null
    const members = geoMembers(index, geo)
    return PERIODS.map((period) => {
      let construction = 0
      let total = 0
      for (let year = period; year <= period + 5; year++) {
        for (const nis of members) {
          total += totals.municipalities[nis]?.[String(year)] ?? 0
          for (const byYear of Object.values(summary.municipalities[nis]?.domains ?? {})) construction += byYear[String(year)] ?? 0
        }
      }
      return { period, label: `${period}-${period + 5}`, construction, total, share: total ? construction / total : 0 }
    })
  }, [index, summary, totals, geo])

  const place = geoName(index, geo)
  const title = `Aandeel bouwinvesteringen in de totale uitgaven per legislatuur - ${place}`
  const largest = Math.max(0.05, ...(rows ?? []).map((row) => row.share))
  const axisMaximum = Math.ceil(largest * 20) / 20
  const csvData = (rows ?? []).map((row) => ({
    label: row.label,
    periodCells: [row.label],
    value: Math.round(row.share * 10000) / 10000,
    "Bouwinvesteringen (euro)": Math.round(row.construction),
    "Totale uitgaven (euro)": Math.round(row.total),
  }))

  return (
    <section id={SECTION} className="scroll-mt-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle><h2 className="text-xl font-semibold">{title}</h2></CardTitle>
            <ExportButtons
              data={csvData}
              title={title}
              slug={SLUG}
              sectionId={SECTION}
              viewType={view}
              periodHeaders={["Legislatuur"]}
              valueLabel="Aandeel bouwinvesteringen in totale uitgaven (verhouding)"
              dataSource="ABB BBC-DR, meest recent meerjarenplan, budgettaire boekhouding, oktober 2026"
              dataSourceUrl={SOURCE_URL}
              embedParams={{ geo: geo === FLANDERS ? null : geo }}
            />
          </div>
          <AnalysisOnly>
            <p className="text-sm text-muted-foreground">
              Geplande bouwinvesteringen als aandeel van de geplande totale uitgaven (investeringen, financiering en exploitatie)
              over de zes boekjaren van elke legislatuur. Het gaat om meerjarenplannen, niet om realisaties.
            </p>
          </AnalysisOnly>
        </CardHeader>
        <CardContent className="space-y-4">
          {index && <GeoFilter index={index} value={geo} onChange={setGeo} />}
          <AnalysisOnly>
            <p role="note" className="rounded border bg-muted/40 p-3 text-sm">
              De teller is enkel de bouwscope van deze analyse (terreinen en gebouwen, wegen en infrastructuur, erfgoed, onroerende goederen
              en investeringssubsidies). De noemer omvat alle investeringsuitgaven, ook roerende goederen en financiële en immateriële vaste activa,
              plus de financierings- en exploitatie-uitgaven. Het aandeel is daarom lager dan het aandeel van alle investeringen. Beide bedragen
              zijn nominaal, dus de inflatie speelt geen rol in de verhouding.
            </p>
          </AnalysisOnly>
          {!rows && (
            <p className="text-sm text-muted-foreground" role="status">
              {error ? `Fout bij het laden: ${error}` : `Gegevens voor ${place} laden...`}
            </p>
          )}
          {rows && <Tabs value={view} onValueChange={(value) => setView(value === "table" ? "table" : "chart")}>
            <TabsList aria-label={`Weergave ${title}`}>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart" className="mt-4 space-y-2">
              <p className="text-sm font-medium">Aandeel bouwinvesteringen in de totale uitgaven</p>
              <div className="h-[400px]" aria-label={title}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 760, height: 400 }}>
                  <BarChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 5 }} accessibilityLayer>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(value) => percent.format(value).replace(",0", "")} width={60} domain={[0, axisMaximum]} />
                    <Tooltip
                      formatter={(value, _name, item) => typeof value === "number"
                        ? [`${percent.format(value)} (${euro.format(item.payload.construction)} van ${euro.format(item.payload.total)})`, "Aandeel"]
                        : ""}
                      labelFormatter={(label) => `Legislatuur ${label}`}
                    />
                    <Bar dataKey="share" name="Aandeel" isAnimationActive={false}>
                      {rows.map((row) => <Cell key={row.period} fill={CHART_SERIES_COLORS[(row.period - 2014) / 6]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
            <TabsContent value="table" className="mt-4">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <caption className="sr-only">{title}</caption>
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="p-2 text-left">Legislatuur</th>
                      <th scope="col" className="p-2 text-right">Bouwinvesteringen</th>
                      <th scope="col" className="p-2 text-right">Totale uitgaven</th>
                      <th scope="col" className="p-2 text-right">Aandeel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.period} className="border-t">
                        <th scope="row" className="p-2 text-left font-normal">{row.label}</th>
                        <td className="p-2 text-right tabular-nums">{euro.format(row.construction)}</td>
                        <td className="p-2 text-right tabular-nums">{euro.format(row.total)}</td>
                        <td className="p-2 text-right tabular-nums">{percent.format(row.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>}
          <p className="text-sm text-muted-foreground">
            Bron: <a className="underline" href={SOURCE_URL}>ABB BBC-DR</a>.
            {" "}<a className="underline" href={getPublicPath("/data/total_expenditure.json")}>Totale uitgaven per gemeente en boekjaar</a>
          </p>
        </CardContent>
      </Card>
    </section>
  )
}

const YEARLY_SECTION = "investments-share-yearly"
const ACTUAL_YEARS = Array.from({ length: 12 }, (_, offset) => 2014 + offset)
const legislature = (year: number) => (year >= 2020 ? 2020 : 2014)

interface ActualExpenditure {
  scope: string
  /** Per municipality and book year: [total expenditure, construction amount or null]. */
  municipalities: Record<string, Record<string, [number, number | null]>>
}

const useActualExpenditure = () => useJson<ActualExpenditure>("/data/total_expenditure_actual.json")

export function YearlyShareSection({
  viewType = "chart",
  initialGeo = FLANDERS,
}: {
  viewType?: "chart" | "table"
  initialGeo?: string
}) {
  const [view, setView] = useState<"chart" | "table">(viewType)
  const [geo, setGeo] = useState(initialGeo)
  useEffect(() => setView(viewType), [viewType])
  useEffect(() => setGeo(initialGeo), [initialGeo])
  const { data: index } = useGeoIndex()
  const { data: actual, error } = useActualExpenditure()

  const { rows, excluded } = useMemo(() => {
    if (!index || !actual) return { rows: null, excluded: [] as { year: number; name: string }[] }
    const members = geoMembers(index, geo)
    const left: { year: number; name: string }[] = []
    const result = ACTUAL_YEARS.map((year) => {
      let construction = 0
      let total = 0
      for (const nis of members) {
        const cell = actual.municipalities[nis]?.[String(year)]
        // A municipality without a construction series leaves both sides out, so the ratio stays like-for-like.
        if (!cell || cell[1] === null) {
          left.push({ year, name: geoName(index, nis) })
          continue
        }
        total += cell[0]
        construction += cell[1]
      }
      return { year, label: String(year), construction, total, share: total ? construction / total : 0 }
    })
    return { rows: result, excluded: left }
  }, [index, actual, geo])

  const place = geoName(index, geo)
  const title = `Aandeel bouwinvesteringen in de totale uitgaven per boekjaar, jaarrekeningen - ${place}`
  const largest = Math.max(0.05, ...(rows ?? []).map((row) => row.share))
  const axisMaximum = Math.ceil(largest * 20) / 20
  const csvData = (rows ?? []).map((row) => ({
    label: row.label,
    periodCells: [row.year, legislature(row.year)],
    value: Math.round(row.share * 10000) / 10000,
    "Bouwinvesteringen (euro)": Math.round(row.construction),
    "Totale uitgaven (euro)": Math.round(row.total),
  }))

  return (
    <section id={YEARLY_SECTION} className="scroll-mt-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle><h2 className="text-xl font-semibold">{title}</h2></CardTitle>
            <ExportButtons
              data={csvData}
              title={title}
              slug={SLUG}
              sectionId={YEARLY_SECTION}
              viewType={view}
              periodHeaders={["Boekjaar", "Legislatuur"]}
              valueLabel="Aandeel bouwinvesteringen in totale uitgaven (verhouding)"
              dataSource="ABB BBC-DR, jaarrekeningen 2014-2025, budgettaire boekhouding, oktober 2026"
              dataSourceUrl={SOURCE_URL}
              embedParams={{ geo: geo === FLANDERS ? null : geo }}
            />
          </div>
          <AnalysisOnly>
            <p className="text-sm text-muted-foreground">
              Werkelijke bouwinvesteringen als aandeel van de werkelijke totale uitgaven (investeringen, financiering en exploitatie)
              volgens de jaarrekeningen, per boekjaar. Jaarrekeningen zijn beschikbaar tot en met 2025.
            </p>
          </AnalysisOnly>
        </CardHeader>
        <CardContent className="space-y-4">
          {index && <GeoFilter index={index} value={geo} onChange={setGeo} />}
          <AnalysisOnly>
            <p role="note" className="rounded border bg-muted/40 p-3 text-sm">
              De teller is enkel de bouwscope van deze analyse; de noemer omvat alle uitgaven, ook roerende goederen en financiële en immateriële
              vaste activa. Beide bedragen zijn nominaal.
              {excluded.length > 0 && ` Voor ${excluded.map((entry) => `${entry.name} (${entry.year})`).join(", ")} bevat de bron geen bouwreeks; die gemeente is in dat jaar uit teller en noemer weggelaten.`}
            </p>
          </AnalysisOnly>
          {!rows && (
            <p className="text-sm text-muted-foreground" role="status">
              {error ? `Fout bij het laden: ${error}` : `Gegevens voor ${place} laden...`}
            </p>
          )}
          {rows && <Tabs value={view} onValueChange={(value) => setView(value === "table" ? "table" : "chart")}>
            <TabsList aria-label={`Weergave ${title}`}>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart" className="mt-4 space-y-2">
              <p className="text-sm font-medium">Aandeel bouwinvesteringen in de totale uitgaven</p>
              <div className="overflow-x-auto">
                <div className="h-[400px] min-w-[620px]" aria-label={title}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 760, height: 400 }}>
                    <BarChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 5 }} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" interval={0} />
                      <YAxis tickFormatter={(value) => percent.format(value).replace(",0", "")} width={60} domain={[0, axisMaximum]} />
                      <Tooltip
                        formatter={(value, _name, item) => typeof value === "number"
                          ? [`${percent.format(value)} (${euro.format(item.payload.construction)} van ${euro.format(item.payload.total)})`, "Aandeel"]
                          : ""}
                        labelFormatter={(label) => `Boekjaar ${label}`}
                      />
                      <Bar dataKey="share" name="Aandeel" isAnimationActive={false}>
                        {rows.map((row) => <Cell key={row.year} fill={CHART_SERIES_COLORS[(legislature(row.year) - 2014) / 6]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <ul className="flex flex-wrap gap-4 text-sm" aria-label="Kleuren per legislatuur">
                {[2014, 2020].map((plan) => (
                  <li className="flex items-center gap-2" key={plan}>
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHART_SERIES_COLORS[(plan - 2014) / 6] }} aria-hidden="true" />
                    {plan}-{plan + 5}
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="table" className="mt-4">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <caption className="sr-only">{title}</caption>
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="p-2 text-left">Boekjaar</th>
                      <th scope="col" className="p-2 text-right">Bouwinvesteringen</th>
                      <th scope="col" className="p-2 text-right">Totale uitgaven</th>
                      <th scope="col" className="p-2 text-right">Aandeel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.year} className="border-t">
                        <th scope="row" className="p-2 text-left font-normal">{row.year}</th>
                        <td className="p-2 text-right tabular-nums">{euro.format(row.construction)}</td>
                        <td className="p-2 text-right tabular-nums">{euro.format(row.total)}</td>
                        <td className="p-2 text-right tabular-nums">{percent.format(row.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>}
          <p className="text-sm text-muted-foreground">
            Bron: <a className="underline" href={SOURCE_URL}>ABB BBC-DR</a>.
            {" "}<a className="underline" href={getPublicPath("/data/total_expenditure_actual.json")}>Totale uitgaven per gemeente en boekjaar</a>
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
