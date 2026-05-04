"use client"

import { useMemo } from "react"
import { format, parseISO } from "date-fns"
import { nl } from "date-fns/locale"
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
import { createYAxisLabel } from "@embuild/shared/lib/number-formatters"
import type { InflationForecast, InflationForecastMetadata } from "./types"

const INVESTMENT_AMOUNT = 1_000_000
const INVESTMENT_START_PERIOD = "2026-01"

function formatPeriod(period: string, pattern: string) {
  return format(parseISO(`${period}-01`), pattern, { locale: nl })
}

function formatDate(isoDate: string) {
  return format(parseISO(isoDate), "d MMMM yyyy", { locale: nl })
}

function formatIndex(value: number) {
  return new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatGrowthRate(value: number | null) {
  if (value === null) {
    return "n.b."
  }

  return `${new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`
}

function formatAxisIndex(value: number) {
  return new Intl.NumberFormat("nl-BE", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCurrencyAxis(value: number) {
  return new Intl.NumberFormat("nl-BE", {
    maximumFractionDigits: 0,
  }).format(value)
}

function joinLabels(labels: string[]) {
  if (labels.length <= 1) {
    return labels[0] ?? ""
  }

  if (labels.length === 2) {
    return `${labels[0]} en ${labels[1]}`
  }

  return `${labels.slice(0, -1).join(", ")} en ${labels[labels.length - 1]}`
}

function ForecastLegend({
  forecasts,
}: {
  forecasts: InflationForecast[]
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
      {forecasts.map((forecast, index) => (
        <div key={forecast.forecastMonth} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] }}
          />
          <span>{forecast.forecastLabel}</span>
        </div>
      ))}
    </div>
  )
}

export function NbbInflatieSection({
  forecasts,
  metadata,
  slug,
  sectionId,
  title,
  defaultView = "chart",
}: {
  forecasts: InflationForecast[]
  metadata: InflationForecastMetadata
  slug: string
  sectionId: string
  title: string
  defaultView?: "chart" | "table"
}) {
  const comparisonForecasts = useMemo(() => {
    const allowedMonths = new Set(metadata.comparableForecastMonths)
    return forecasts
      .filter((forecast) => allowedMonths.has(forecast.forecastMonth))
      .sort((left, right) => left.forecastSortValue - right.forecastSortValue)
  }, [forecasts, metadata.comparableForecastMonths])

  const latestForecast = forecasts[forecasts.length - 1] ?? null

  const latestAnnualFigures = useMemo(() => {
    if (!latestForecast) {
      return {
        rate2026: null,
        rate2027: null,
      }
    }

    const annualLookup = new Map(
      latestForecast.annualPoints.map((point) => [point.year, point.cpiGrowthRate]),
    )

    return {
      rate2026: annualLookup.get(2026) ?? null,
      rate2027: annualLookup.get(2027) ?? null,
    }
  }, [latestForecast])

  const chartData = useMemo(() => {
    const rows = new Map<
      string,
      {
        label: string
        period: string
        sortValue: number
        [key: string]: number | string | null
      }
    >()

    comparisonForecasts.forEach((forecast) => {
      forecast.monthlyPoints.forEach((point) => {
        const existing = rows.get(point.period)
        const row =
          existing ??
          {
            label: formatPeriod(point.period, "LLL/yy"),
            period: point.period,
            sortValue: point.sortValue,
          }

        row[forecast.forecastLabel] = point.cpiIndex
        rows.set(point.period, row)
      })
    })

    return [...rows.values()].sort((left, right) => left.sortValue - right.sortValue)
  }, [comparisonForecasts])

  const realValueChartData = useMemo(() => {
    const rows = new Map<
      string,
      {
        label: string
        period: string
        sortValue: number
        [key: string]: number | string | null
      }
    >()

    comparisonForecasts.forEach((forecast) => {
      const basePoint = forecast.monthlyPoints.find((point) => point.period === INVESTMENT_START_PERIOD)
      const baseIndex = basePoint?.cpiIndex ?? null

      forecast.monthlyPoints.forEach((point) => {
        const existing = rows.get(point.period)
        const row =
          existing ??
          {
            label: formatPeriod(point.period, "LLL/yy"),
            period: point.period,
            sortValue: point.sortValue,
          }

        row[forecast.forecastLabel] =
          typeof baseIndex === "number" && typeof point.cpiIndex === "number"
            ? (INVESTMENT_AMOUNT * baseIndex) / point.cpiIndex
            : null
        rows.set(point.period, row)
      })
    })

    return [...rows.values()].sort((left, right) => left.sortValue - right.sortValue)
  }, [comparisonForecasts])

  const realValueYAxis = useMemo(() => {
    return {
      formatter: formatCurrencyAxis,
      label: createYAxisLabel("Reële waarde van 1 miljoen", "", true),
    }
  }, [])

  const exportData = useMemo(() => {
    return chartData.map((row) => {
      const exportRow: {
        label: string
        value: number
        periodCells: Array<string | number>
        [key: string]: string | number | Array<string | number> | null
      } = {
        label: row.period,
        value: 0,
        periodCells: [formatPeriod(row.period, "MMMM yyyy")],
      }

      comparisonForecasts.forEach((forecast) => {
        exportRow[forecast.forecastLabel] =
          typeof row[forecast.forecastLabel] === "number"
            ? Number((row[forecast.forecastLabel] as number).toFixed(2))
            : null
      })

      return exportRow
    })
  }, [chartData, comparisonForecasts])

  const excludedForecasts = useMemo(() => {
    const allowedMonths = new Set(metadata.comparableForecastMonths)
    const latestYear = latestForecast?.forecastYear ?? null

    return forecasts.filter((forecast) => {
      if (latestYear === null || forecast.forecastYear !== latestYear) {
        return false
      }

      return !allowedMonths.has(forecast.forecastMonth)
    })
  }, [forecasts, latestForecast?.forecastYear, metadata.comparableForecastMonths])

  const comparisonLabelText = useMemo(() => {
    return joinLabels(comparisonForecasts.map((forecast) => forecast.forecastLabel))
  }, [comparisonForecasts])
  const description =
    metadata.description ||
    `Het Federaal Planbureau publiceert elke maand een nieuwe inflatieprognose. Deze vergelijking toont ${
      comparisonLabelText || metadata.latestForecastLabel
    } op basis van ${metadata.comparableBaseIndexLabel.toLowerCase()}.${
      latestForecast ? ` Laatste update: ${formatDate(latestForecast.sourcePublicationDate)}.` : ""
    }${
      excludedForecasts.length > 0
        ? ` Prognoses met een andere indexbasis, zoals ${joinLabels(excludedForecasts.map((forecast) => forecast.forecastLabel))}, worden niet meegetoond.`
        : ""
    }`

  return (
    <TimeSeriesSection
      title={title}
      slug={slug}
      sectionId={sectionId}
      dataSource={`${metadata.sourceProvider} - ${metadata.sourceTitle}`}
      dataSourceUrl={metadata.sourceUrl}
      defaultView={defaultView}
      headerContent={
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Laatste prognose</div>
                <div className="text-2xl font-bold">{metadata.latestForecastLabel}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Inflatie 2026</div>
                <div className="text-2xl font-bold">{formatGrowthRate(latestAnnualFigures.rate2026)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Inflatie 2027</div>
                <div className="text-2xl font-bold">{formatGrowthRate(latestAnnualFigures.rate2027)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Vergelijkte prognoses</div>
                <div className="text-2xl font-bold">{metadata.comparableForecastCount}</div>
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
          exportMeta: {
            viewType: "chart",
            periodHeaders: ["Periode"],
            valueLabel: metadata.comparableBaseIndexLabel,
          },
          content: (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Consumptieprijsindex per prognose</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <div className="text-sm font-medium ml-16 mb-1">{metadata.comparableBaseIndexLabel}</div>
                    <ForecastLegend forecasts={comparisonForecasts} />
                    <div className="h-[360px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={CHART_THEME.margin}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                          <XAxis
                            dataKey="label"
                            angle={-45}
                            textAnchor="end"
                            height={72}
                            interval="preserveStartEnd"
                            fontSize={CHART_THEME.fontSize}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            domain={[100, 110]}
                            tickFormatter={(value) => formatAxisIndex(Number(value))}
                            fontSize={CHART_THEME.fontSize}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={CHART_THEME.tooltip}
                            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
                            formatter={(value, name) => [formatIndex(Number(value ?? 0)), String(name)]}
                            labelFormatter={(_, payload) => {
                              const period = payload?.[0]?.payload?.period as string | undefined
                              return period ? formatPeriod(period, "MMMM yyyy") : ""
                            }}
                          />
                          {comparisonForecasts.map((forecast, index) => (
                            <Line
                              key={forecast.forecastMonth}
                              type="monotone"
                              dataKey={forecast.forecastLabel}
                              name={forecast.forecastLabel}
                              stroke={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Reële koopkracht van 1 miljoen euro uit januari 2026</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-muted-foreground">
                    Deze simulatie houdt een investering van {formatCurrency(INVESTMENT_AMOUNT)} in{" "}
                    {formatPeriod(INVESTMENT_START_PERIOD, "MMMM yyyy")} nominaal constant, en drukt die uit in euro
                    van {formatPeriod(INVESTMENT_START_PERIOD, "MMMM yyyy")}. Hogere inflatieprognoses doen de reële
                    waarde dus sneller dalen.
                  </p>
                  <div className="space-y-1">
                    <div className="text-sm font-medium ml-16 mb-1">
                      {realValueYAxis.label.text}
                      <span className="font-bold">{realValueYAxis.label.boldText}</span>
                    </div>
                    <ForecastLegend forecasts={comparisonForecasts} />
                    <div className="h-[360px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={realValueChartData}
                          margin={{ ...CHART_THEME.margin, left: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                          <XAxis
                            dataKey="label"
                            angle={-45}
                            textAnchor="end"
                            height={72}
                            interval="preserveStartEnd"
                            fontSize={CHART_THEME.fontSize}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            domain={[920_000, 1_000_000]}
                            tickFormatter={realValueYAxis.formatter}
                            ticks={[920_000, 940_000, 960_000, 980_000, 1_000_000]}
                            width={72}
                            fontSize={CHART_THEME.fontSize}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={CHART_THEME.tooltip}
                            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
                            formatter={(value, name) => {
                              const numericValue = Number(value ?? 0)
                              return [
                                formatCurrency(numericValue),
                                String(name),
                              ]
                            }}
                            labelFormatter={(_, payload) => {
                              const period = payload?.[0]?.payload?.period as string | undefined
                              return period ? formatPeriod(period, "MMMM yyyy") : ""
                            }}
                          />
                          {comparisonForecasts.map((forecast, index) => (
                            <Line
                              key={forecast.forecastMonth}
                              type="monotone"
                              dataKey={forecast.forecastLabel}
                              name={forecast.forecastLabel}
                              stroke={CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ),
        },
        {
          value: "table",
          label: "Tabel",
          exportData,
          exportMeta: {
            viewType: "table",
            periodHeaders: ["Periode"],
            valueLabel: metadata.comparableBaseIndexLabel,
          },
          content: (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      {comparisonForecasts.map((forecast) => (
                        <TableHead key={forecast.forecastMonth} className="text-right">
                          {forecast.forecastLabel}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chartData.map((row) => (
                      <TableRow key={row.period}>
                        <TableCell>{formatPeriod(row.period, "MMMM yyyy")}</TableCell>
                        {comparisonForecasts.map((forecast) => {
                          const value = row[forecast.forecastLabel]
                          return (
                            <TableCell key={forecast.forecastMonth} className="text-right">
                              {typeof value === "number" ? formatIndex(value) : "n.b."}
                            </TableCell>
                          )
                        })}
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
