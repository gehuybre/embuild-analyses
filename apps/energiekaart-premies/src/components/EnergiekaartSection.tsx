"use client"

import { useMemo } from "react"
import { Card, CardContent } from "@embuild/shared/components/ui/card"
import { TimeSeriesSection } from "@embuild/shared/components/shared/TimeSeriesSection"
import { EnergiekaartChart } from "./EnergiekaartChart"
import { EnergiekaartTable } from "./EnergiekaartTable"
import type { YearlyDataRow } from "./EnergiekaartDashboard"
import { formatScaledEuro, getCurrencyLabel, getCurrencyScale } from "./formatters"

interface EnergiekaartSectionProps {
  title: string
  data: YearlyDataRow[]
  metric: keyof YearlyDataRow
  label: string
  slug: string
  sectionId: string
  dataSource: string
  dataSourceUrl: string
  selectedMeasure: string // Used for filtering logic inside this component if needed, or just display
  isCurrency?: boolean
  headerControls?: React.ReactNode
}

export function EnergiekaartSection({
  title,
  data,
  metric,
  label,
  slug,
  sectionId,
  dataSource,
  dataSourceUrl,
  selectedMeasure,
  isCurrency = false,
  headerControls,
}: EnergiekaartSectionProps) {

  // Filter data (if data passed contains all measures)
  // Note: Previous implementation assumed 'data' passed might contain all rows, 
  // but often the parent filtered it. 
  // Let's look at usage: 
  // In Dashboard (old): passed filteredData.
  // In Embed: passed filteredData.
  // BUT the old Dashboard passed `filteredData` which was ALREADY filtered by `selectedMeasure`.
  // However, my new Adapter logic inside Dashboard did the filtering itself.
  // To be safe and compatible with both (if they pass full data or filtered data), 
  // checks are needed. 
  // Actually, checking previous `EnergiekaartSection.tsx`:
  // It did NOT filter data. It took `data` prop and used it directly.
  // `EnergiekaartDashboard` (old) did: `const filteredData = data.filter(...)` then passed it.
  // `EnergiekaartPremiesEmbed` did: `const filteredData = data.filter(...)` then passed it.
  // So this component expects PRE-FILTERED data.


  // Filter data by selected measure
  const filteredData = useMemo(() => {
    return data.filter((row) => row.maatregel === selectedMeasure)
  }, [data, selectedMeasure])

  const chartData = useMemo(() => {
    return filteredData
      .map((row) => ({
        jaar: row.jaar,
        value: Number(row[metric]),
      }))
      .sort((a, b) => a.jaar - b.jaar)
  }, [filteredData, metric])

  const currencyScale = useMemo(() => {
    if (!isCurrency) return null
    return getCurrencyScale(chartData.map((d) => d.value))
  }, [chartData, isCurrency])

  const displayLabel = useMemo(() => {
    if (!isCurrency || !currencyScale) return label
    return getCurrencyLabel(label, currencyScale)
  }, [currencyScale, isCurrency, label])

  // Prepare exports
  const exportData = useMemo(() => {
    return chartData.map((row) => ({
      label: row.jaar.toString(),
      value: row.value,
      periodCells: [row.jaar],
    }))
  }, [chartData])

  // Calculate summary stats
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return { latest: 0, min: 0, max: 0, total: 0 }
    }

    const values = chartData.map((d) => d.value)
    const latest = values[values.length - 1] || 0
    const min = Math.min(...values)
    const max = Math.max(...values)
    const total = values.reduce((sum, v) => sum + v, 0)

    return { latest, min, max, total }
  }, [chartData])

  const formatNumber = (value: number) => {
    if (isCurrency) {
      if (!currencyScale) return `€ ${value}`
      return formatScaledEuro(value, currencyScale)
    }
    return new Intl.NumberFormat("nl-BE").format(value)
  }

  const latestYear = chartData[chartData.length - 1]?.jaar

  return (
    <TimeSeriesSection
      title={title}
      slug={slug}
      sectionId={sectionId}
      dataSource={dataSource}
      dataSourceUrl={dataSourceUrl}
      defaultView="chart"
      rightControls={headerControls}
      headerContent={
        chartData.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Meest recent ({latestYear})</div>
                <div className="text-2xl font-bold">{formatNumber(stats.latest)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Maximum</div>
                <div className="text-2xl font-bold">{formatNumber(stats.max)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Minimum</div>
                <div className="text-2xl font-bold">{formatNumber(stats.min)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Totaal (alle jaren)</div>
                <div className="text-2xl font-bold">{formatNumber(stats.total)}</div>
              </CardContent>
            </Card>
          </div>
        ) : undefined
      }
      views={[
        {
          value: "chart",
          label: "Grafiek",
          exportData,
          exportMeta: { viewType: "chart", periodHeaders: ["Jaar"], valueLabel: label },
          content: (
            <Card>
              <CardContent className="pt-6">
                <EnergiekaartChart data={chartData} label={displayLabel} isCurrency={isCurrency} />
              </CardContent>
            </Card>
          )
        },
        {
          value: "table",
          label: "Tabel",
          exportData,
          exportMeta: { viewType: "table", periodHeaders: ["Jaar"], valueLabel: label },
          content: (
            <Card>
              <CardContent className="pt-6">
                <EnergiekaartTable data={chartData} label={displayLabel} isCurrency={isCurrency} />
              </CardContent>
            </Card>
          )
        }
      ]}
    />
  )
}
