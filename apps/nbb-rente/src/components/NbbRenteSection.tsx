"use client"

import { useMemo } from "react"
import { format, parseISO, subYears } from "date-fns"
import { nl } from "date-fns/locale"
import { Card, CardContent } from "@embuild/shared/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@embuild/shared/components/ui/table"
import { TimeSeriesSection } from "@embuild/shared/components/shared/TimeSeriesSection"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import type { NbbRenteMetadata, NbbRentePoint } from "./types"

function formatPeriod(period: string, pattern: string) {
  return format(parseISO(`${period}-01`), pattern, { locale: nl })
}

function formatRate(value: number) {
  return `${new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`
}

function formatPercentagePointChange(value: number | null) {
  if (value === null) {
    return "n.b."
  }

  const sign = value > 0 ? "+" : ""
  return `${sign}${new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} pp`
}

export function NbbRenteSection({
  data,
  metadata,
  slug,
  sectionId,
  title,
  defaultView = "chart",
}: {
  data: NbbRentePoint[]
  metadata: NbbRenteMetadata
  slug: string
  sectionId: string
  title: string
  defaultView?: "chart" | "table"
}) {
  const stats = useMemo(() => {
    const latest = data[data.length - 1] ?? null
    const yearAgoLookup = new Map(data.map((point) => [point.period, point.rate]))

    if (!latest) {
      return {
        latestLabel: "",
        latestRate: 0,
        yearOnYearChange: null,
        minRate: 0,
        maxRate: 0,
      }
    }

    const yearAgoPeriod = format(subYears(parseISO(`${latest.period}-01`), 1), "yyyy-MM")
    const yearAgoRate = yearAgoLookup.get(yearAgoPeriod)
    const rates = data.map((point) => point.rate)

    return {
      latestLabel: formatPeriod(latest.period, "MMMM yyyy"),
      latestRate: latest.rate,
      yearOnYearChange: typeof yearAgoRate === "number" ? latest.rate - yearAgoRate : null,
      minRate: Math.min(...rates),
      maxRate: Math.max(...rates),
    }
  }, [data])

  const exportData = useMemo(() => {
    return data.map((point) => ({
      label: point.period,
      value: point.rate,
      periodCells: [formatPeriod(point.period, "MMMM yyyy")],
    }))
  }, [data])
  const latestPeriodLabel =
    metadata.latestPeriodLabel || stats.latestLabel || formatPeriod(metadata.latestPeriod, "MMMM yyyy")
  const description =
    metadata.description ||
    `Reeks voor huishoudens, nieuwe contracten, woningkredieten en een initiële rentevaste periode van meer dan 10 jaar. Meest recente observatie: ${latestPeriodLabel}.`

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
                <div className="text-sm text-muted-foreground">Meest recent</div>
                <div className="text-2xl font-bold">{formatRate(stats.latestRate)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Verschil op jaarbasis</div>
                <div className="text-2xl font-bold">{formatPercentagePointChange(stats.yearOnYearChange)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Minimum sinds 2015</div>
                <div className="text-2xl font-bold">{formatRate(stats.minRate)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Maximum sinds 2015</div>
                <div className="text-2xl font-bold">{formatRate(stats.maxRate)}</div>
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
            valueLabel: "Rente (%)",
          },
          content: (
            <Card>
              <CardContent className="pt-6">
                <FilterableChart
                  data={data}
                  chartType="line"
                  showMovingAverage={false}
                  getLabel={(point) => formatPeriod(point.period, "LLL yyyy")}
                  getValue={(point) => point.rate}
                  getSortValue={(point) => point.sortValue}
                  yAxisLabelAbove="Rente (%)"
                  yAxisFormatter={(value) => formatRate(value)}
                />
              </CardContent>
            </Card>
          ),
        },
        {
          value: "table",
          label: "Tabel",
          exportData,
          exportMeta: {
            viewType: "table",
            periodHeaders: ["Periode"],
            valueLabel: "Rente (%)",
          },
          content: (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Periode</TableHead>
                      <TableHead className="text-right">Rente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data].reverse().map((point) => (
                      <TableRow key={point.period}>
                        <TableCell>{formatPeriod(point.period, "MMMM yyyy")}</TableCell>
                        <TableCell className="text-right">{formatRate(point.rate)}</TableCell>
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
