"use client"

import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { ExportButtons } from "./ExportButtons"
import { CHART_SERIES_COLORS } from "../../lib/chart-theme"
import { fetchInvesteringenJson } from "../../lib/investeringen-data"
import { createAutoScaledFormatter } from "../../lib/number-formatters"

interface YearlyTotal {
  Rapportjaar: number
  Boekjaar: number
  Totaal: number
}

const PLAN_YEARS = [2014, 2020, 2026]
const TITLE = "Geplande investeringen per boekjaar (2014-2031)"
const SOURCE_URL = "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien"
const currency = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
})

function validateYearlyTotals(data: unknown): YearlyTotal[] {
  if (!Array.isArray(data) || data.length !== 18) {
    throw new Error("Ongeldige jaartotalen: verwacht alle boekjaren van 2014 tot en met 2031")
  }
  return data.map((row: unknown, index) => {
    if (
      !row || typeof row !== "object" ||
      !("Boekjaar" in row) || row.Boekjaar !== 2014 + index ||
      !("Rapportjaar" in row) || row.Rapportjaar !== PLAN_YEARS[Math.floor(index / 6)] ||
      !("Totaal" in row) || typeof row.Totaal !== "number" || !Number.isFinite(row.Totaal)
    ) {
      throw new Error(`Ongeldige investeringsgegevens voor boekjaar ${2014 + index}`)
    }
    return { Boekjaar: row.Boekjaar, Rapportjaar: row.Rapportjaar, Totaal: row.Totaal }
  })
}

export function InvesteringenYearlySection({
  slug,
  viewType = "chart",
}: {
  slug: string
  viewType?: "chart" | "table"
}) {
  const [data, setData] = useState<YearlyTotal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<"chart" | "table">(viewType)

  useEffect(() => setCurrentView(viewType), [viewType])

  useEffect(() => {
    let cancelled = false
    fetchInvesteringenJson<unknown>("/data/bv_yearly_totals.json")
      .then(validateYearlyTotals)
      .then((rows) => {
        if (!cancelled) setData(rows)
      })
      .catch((err: unknown) => {
        console.error("Failed to load yearly BV totals:", err)
        if (!cancelled) setError(err instanceof Error ? err.message : "Fout bij het laden van de jaartotalen")
      })
    return () => { cancelled = true }
  }, [])

  const { formatter, scaleLabel } = useMemo(
    () => createAutoScaledFormatter(data.map((row) => row.Totaal), true),
    [data]
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{TITLE}</CardTitle>
          <ExportButtons
            title={TITLE}
            slug={slug}
            sectionId="investments-bv-yearly"
            viewType={currentView}
            data={data.map((row) => ({
              label: String(row.Boekjaar),
              periodCells: [row.Boekjaar, row.Rapportjaar],
              value: row.Totaal,
            }))}
            periodHeaders={["Boekjaar", "Rapportjaar"]}
            valueLabel="Geplande investeringsuitgaven (euro)"
            dataSource="Agentschap Binnenlands Bestuur - meerjarenplannen (BV)"
            dataSourceUrl={SOURCE_URL}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Totale geplande investeringsuitgaven voor heel Vlaanderen, volgens de beleidsvelden (BV).
          Dit zijn bedragen uit de meerjarenplannen, geen gerealiseerde investeringen uit de jaarrekeningen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Elk boekjaar telt alleen mee in het bijbehorende plan: 2014-2019 uit rapportjaar 2014,
          2020-2025 uit rapportjaar 2020 en 2026-2031 uit rapportjaar 2026.
          Bedragen zoals opgenomen in de bron, zonder bijkomende inflatiecorrectie.
        </p>
        {error ? (
          <p role="alert" className="text-destructive">De jaartotalen konden niet worden geladen: {error}</p>
        ) : data.length === 0 ? (
          <p role="status" className="text-muted-foreground">Investeringen per boekjaar laden...</p>
        ) : (
          <Tabs value={currentView} onValueChange={(value) => setCurrentView(value === "table" ? "table" : "chart")}>
            <TabsList aria-label="Weergave investeringen per boekjaar">
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart" className="space-y-4 mt-4">
              <p className="text-sm font-medium">
                Geplande investeringsuitgaven {scaleLabel ? `(in ${scaleLabel} euro)` : "(in euro)"}
              </p>
              <div className="overflow-x-auto">
                <div className="h-[400px] min-w-[640px]" aria-label={TITLE}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 20 }} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="Boekjaar" interval={0} angle={-45} textAnchor="end" height={50} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={formatter} width={70} domain={[0, "auto"]} />
                      <Tooltip
                        formatter={(value) => typeof value === "number" ? currency.format(value) : ""}
                        labelFormatter={(label) => `Boekjaar ${label}`}
                      />
                      <Bar dataKey="Totaal" name="Geplande investeringsuitgaven" isAnimationActive={false}>
                        {data.map((row) => (
                          <Cell key={row.Boekjaar} fill={CHART_SERIES_COLORS[PLAN_YEARS.indexOf(row.Rapportjaar)]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <ul className="flex flex-wrap gap-4 text-sm" aria-label="Meerjarenplannen">
                {PLAN_YEARS.map((year, index) => (
                  <li key={year} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: CHART_SERIES_COLORS[index] }} aria-hidden="true" />
                    Plan {year}-{year + 5}
                  </li>
                ))}
              </ul>
            </TabsContent>
            <TabsContent value="table" className="mt-4">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <caption className="sr-only">{TITLE} - heel Vlaanderen, bedragen in euro</caption>
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="p-3 text-left">Boekjaar</th>
                      <th scope="col" className="p-3 text-left">Rapportjaar</th>
                      <th scope="col" className="p-3 text-right">Geplande investeringsuitgaven</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.Boekjaar} className="border-t">
                        <th scope="row" className="p-3 text-left font-normal">{row.Boekjaar}</th>
                        <td className="p-3">{row.Rapportjaar}</td>
                        <td className="p-3 text-right tabular-nums">{currency.format(row.Totaal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        )}
        <p className="text-sm text-muted-foreground">
          Bron: <a className="underline" href={SOURCE_URL}>Agentschap Binnenlands Bestuur, BBC-DR meerjarenplannen</a>.
          Dezelfde investeringsscope en bronversie als de overige BV-grafieken op deze pagina.
        </p>
      </CardContent>
    </Card>
  )
}
