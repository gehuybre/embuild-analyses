"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@embuild/shared/components/ui/table"
import { TimeSeriesSection } from "@embuild/shared/components/shared/TimeSeriesSection"
import { CHART_SERIES_COLORS, CHART_THEME } from "@embuild/shared/lib/chart-theme"
import type { CpiAnnual } from "./types"

const AMOUNT = 1_000_000
const DEFAULT_START_YEAR = 2015

const MONTHS_NL = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
]

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`
}

function formatAxis(value: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(value)
}

export function NbbReeleWaardeSection({
  cpi,
  slug,
  sectionId,
  title,
  defaultView = "chart",
  initialStartYear,
}: {
  cpi: CpiAnnual
  slug: string
  sectionId: string
  title: string
  defaultView?: "chart" | "table"
  initialStartYear?: number | null
}) {
  const lastEntry = cpi.years[cpi.years.length - 1]
  const lastYear = lastEntry.year
  const firstYear = cpi.years[0].year
  const startYears = useMemo(
    () => cpi.years.filter((entry) => entry.year < lastYear).map((entry) => entry.year),
    [cpi.years, lastYear],
  )
  const [startYear, setStartYear] = useState(() => {
    if (initialStartYear != null && startYears.includes(initialStartYear)) return initialStartYear
    return startYears.includes(DEFAULT_START_YEAR) ? DEFAULT_START_YEAR : startYears[startYears.length - 1]
  })

  const lastMonthIndex = Number(cpi.lastMonth.slice(5)) - 1
  const hasForecast = lastEntry.forecastMonths > 0
  const lastMonthLabel = `${MONTHS_NL[lastMonthIndex]} ${cpi.lastMonth.slice(0, 4)}`

  const rows = useMemo(() => {
    const base = cpi.years.find((entry) => entry.year === startYear)?.averageCpi ?? 1
    return cpi.years
      .filter((entry) => entry.year >= startYear)
      .map((entry) => ({
        year: entry.year,
        label: entry.forecastMonths > 0 ? `${entry.year}*` : String(entry.year),
        forecast: entry.forecastMonths > 0,
        value: (AMOUNT * base) / entry.averageCpi,
        cpi: entry.averageCpi,
      }))
      .map((row, index, all) => {
        const next = all[index + 1]
        return {
          ...row,
          actual: row.forecast ? null : row.value,
          projected: row.forecast ? row.value : null,
          connector: !row.forecast && next?.forecast ? row.value : row.forecast && all[index - 1] && !all[index - 1].forecast ? row.value : null,
        }
      })
  }, [cpi.years, startYear])

  const latest = rows[rows.length - 1]
  const loss = AMOUNT - latest.value
  const cumulativeInflation = (AMOUNT / latest.value - 1) * 100
  const yearsSpan = lastYear - startYear

  const exportData = useMemo(
    () =>
      rows.map((row) => ({
        label: String(row.year),
        value: Math.round(row.value),
        periodCells: [row.label],
      })),
    [rows],
  )

  const selector = (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={`${sectionId}-startjaar`} className="text-sm font-medium">
        Startjaar
      </label>
      <select
        id={`${sectionId}-startjaar`}
        value={startYear}
        onChange={(event) => setStartYear(Number(event.target.value))}
        className="h-9 rounded-md border bg-background px-3 text-sm"
      >
        {startYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <TimeSeriesSection
      title={title}
      slug={slug}
      sectionId={sectionId}
      dataSource={hasForecast ? `${cpi.source}; Federaal Planbureau (inflatieprognose)` : cpi.source}
      dataSourceUrl={cpi.sourceUrl}
      defaultView={defaultView}
      headerContent={
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wat is {formatCurrency(AMOUNT)} uit {startYear} nu nog waard? De bedragen zijn uitgedrukt in euro van{" "}
            {startYear}: de consumptieprijsindex (jaargemiddelde, Statbel) bepaalt hoeveel koopkracht een nominaal
            constant bedrag verliest. Meest recente gepubliceerde inflatiecijfer: {lastMonthLabel}.
            {hasForecast
              ? ` Jaren met een sterretje (*) en de gestippelde lijn zijn deels of volledig gebaseerd op de inflatieprognose van het Federaal Planbureau (${cpi.forecastLabel}), tot ${MONTHS_NL[Number(cpi.forecastHorizon.slice(5)) - 1]} ${cpi.forecastHorizon.slice(0, 4)}. De prognose is maand op maand aan het laatste gepubliceerde cijfer gekoppeld.`
              : ""}
          </p>
          {selector}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Reële waarde in {lastYear}{hasForecast ? " (prognose)" : ""}</div>
                <div className="text-2xl font-bold">{formatCurrency(latest.value)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Verlies aan koopkracht</div>
                <div className="text-2xl font-bold">{formatCurrency(loss)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Cumulatieve inflatie</div>
                <div className="text-2xl font-bold">{formatPercent(cumulativeInflation)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Periode</div>
                <div className="text-2xl font-bold">
                  {startYear} - {lastYear}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">({yearsSpan} jaar)</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      }
      views={[
        {
          value: "chart",
          label: "Grafiek",
          exportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar"], valueLabel: `Reële waarde (euro van ${startYear})`, embedParams: { startjaar: startYear } },
          content: (
            <Card>
              <CardHeader>
                <CardTitle>
                  Reële waarde van 1 miljoen euro uit {startYear}, in euro van {startYear}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rows} margin={{ ...CHART_THEME.margin, left: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                      <XAxis
                        dataKey="label"
                        interval="preserveStartEnd"
                        fontSize={CHART_THEME.fontSize}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={["auto", AMOUNT]}
                        tickFormatter={(value) => formatAxis(Number(value))}
                        width={72}
                        fontSize={CHART_THEME.fontSize}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={CHART_THEME.tooltip}
                        cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
                        formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]}
                        labelFormatter={(label) => `Jaar ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="connector"
                        stroke={CHART_SERIES_COLORS[0]}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                        activeDot={false}
                        tooltipType="none"
                        legendType="none"
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name="Reële waarde"
                        stroke={CHART_SERIES_COLORS[0]}
                        strokeWidth={2}
                        dot={rows.length <= 12}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="projected"
                        name="Reële waarde (prognose)"
                        stroke={CHART_SERIES_COLORS[0]}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={rows.length <= 12}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ),
        },
        {
          value: "table",
          label: "Tabel",
          exportData,
          exportMeta: { viewType: "table", periodHeaders: ["Jaar"], valueLabel: `Reële waarde (euro van ${startYear})`, embedParams: { startjaar: startYear } },
          content: (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jaar</TableHead>
                      <TableHead className="text-right">CPI (2025=100)</TableHead>
                      <TableHead className="text-right">Reële waarde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.year}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell className="text-right">
                          {new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(row.cpi)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ),
        },
      ]}
    />
  )
}
