"use client"

import { useMemo } from "react"
import { Card, CardContent } from "@embuild/shared/components/ui/card"
import { TimeSeriesSection } from "@embuild/shared/components/shared/TimeSeriesSection"
import { GebouwenChart } from "./GebouwenChart"
import { GebouwenTable } from "./GebouwenTable"
import type { GebouwenData } from "./types"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

interface GebouwenparkEmbedProps {
  section: "evolutie"
}

export function GebouwenparkEmbed({ section }: GebouwenparkEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    data: GebouwenData
  }>({
    data: "/data/stats_2025.json",
  })

  const timeSeries = bundle?.data.time_series

  // Prepare data for time series chart and table
  const timeSeriesData = useMemo(() => {
    if (!timeSeries) return []
    return timeSeries.years.map((year, idx) => ({
      year,
      total: timeSeries.national.total_buildings[idx],
      residential: timeSeries.national.residential_buildings[idx]
    }))
  }, [timeSeries])

  // Prepare export data
  const exportData = useMemo(() => {
    return timeSeriesData.map((row) => ({
      label: row.year.toString(),
      value: row.total,
      periodCells: [row.year, row.total, row.residential]
    }))
  }, [timeSeriesData])

  if (loading) {
    return <div className="p-4">Data laden...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-4 text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  return (
    <div className="p-4">
      <TimeSeriesSection
        title="Evolutie van het aantal gebouwen (1995-2025)"
        slug="gebouwenpark"
        sectionId="evolutie"
        dataSource="Statbel Building Stock 2025"
        dataSourceUrl="https://statbel.fgov.be/"
        defaultView="chart"
        views={[
          {
            value: "chart",
            label: "Grafiek",
            exportData,
            exportMeta: {
              viewType: "chart",
              periodHeaders: ["Jaar", "Totaal Gebouwen", "Woongebouwen"],
              valueLabel: "Aantal"
            },
            content: (
              <Card>
                <CardContent className="pt-6">
                  <GebouwenChart data={timeSeriesData} />
                </CardContent>
              </Card>
            )
          },
          {
            value: "table",
            label: "Tabel",
            exportData,
            exportMeta: {
              viewType: "table",
              periodHeaders: ["Jaar", "Totaal Gebouwen", "Woongebouwen"],
              valueLabel: "Aantal"
            },
            content: (
              <Card>
                <CardContent className="pt-6">
                  <GebouwenTable data={timeSeriesData} />
                </CardContent>
              </Card>
            )
          }
        ]}
      />
    </div>
  )
}
