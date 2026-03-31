"use client"

import * as React from "react"
import { useMemo } from "react"
import type { MunicipalityData } from "./types"
import { Alert, AlertDescription } from "@embuild/shared/components/ui/alert"
import { InfoIcon } from "lucide-react"
import { DataTable } from "./DataTable"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { useEmbedFilters, useGeoFilters } from "@embuild/shared/lib/stores/embed-filters-store"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
  Cell,
  ReferenceLine,
} from "recharts"
import {
  createAutoScaledFormatter,
  createYAxisLabel,
} from "@embuild/shared/lib/number-formatters"

interface HuishoudensSectionProps {
  data: MunicipalityData[]
}

const householdSizeKeys = ["1 persoon", "2 personen", "3 personen", "4+ personen"] as const

const columns = [
  { key: "TX_REFNIS_NL", header: "Gemeente", format: "text" as const, sortable: true },
  { key: "hh_1_pct_toename", header: "HH 1p %", format: "percentage" as const, sortable: true },
  { key: "hh_2_pct_toename", header: "HH 2p %", format: "percentage" as const, sortable: true },
  { key: "hh_3_pct_toename", header: "HH 3p %", format: "percentage" as const, sortable: true },
  { key: "hh_4+_pct_toename", header: "HH 4+p %", format: "percentage" as const, sortable: true },
]

// Helper to calculate quartiles
function calculateQuartiles(values: number[]) {
  const sorted = [...values].filter(v => v != null && !isNaN(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0 }

  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const median = sorted[Math.floor(sorted.length * 0.5)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]

  return { min, q1, median, q3, max, mean }
}

export function HuishoudensSection({ data }: HuishoudensSectionProps) {
  const currentView = useEmbedFilters((state) => state.currentView)
  const { selectedHighlightMunicipality } = useGeoFilters()

  const highlightedName = React.useMemo(() => {
    if (!selectedHighlightMunicipality) return null
    return data.find(d => d.CD_REFNIS === selectedHighlightMunicipality)?.TX_REFNIS_NL ?? null
  }, [data, selectedHighlightMunicipality])

  const cleanData = data.filter(d => d.HH_available)
  const hasHouseholdData = cleanData.length > 0

  // Map data for export
  const exportData = cleanData.map(d => ({
    label: d.TX_REFNIS_NL,
    value: (d.hh_1_abs_toename ?? 0) + (d.hh_2_abs_toename ?? 0) +
      (d.hh_3_abs_toename ?? 0) + (d["hh_4+_abs_toename"] ?? 0),
    "1 persoon (%)": d.hh_1_pct_toename,
    "2 personen (%)": d.hh_2_pct_toename,
    "3 personen (%)": d.hh_3_pct_toename,
    "4+ personen (%)": d["hh_4+_pct_toename"],
  }))

  // Calculate box plot data (quartiles for percentage growth)
  const boxPlotData = useMemo(() => {
    return [
      {
        name: "1 persoon",
        ...calculateQuartiles(cleanData.map(d => d.hh_1_pct_toename).filter(v => v != null) as number[])
      },
      {
        name: "2 personen",
        ...calculateQuartiles(cleanData.map(d => d.hh_2_pct_toename).filter(v => v != null) as number[])
      },
      {
        name: "3 personen",
        ...calculateQuartiles(cleanData.map(d => d.hh_3_pct_toename).filter(v => v != null) as number[])
      },
      {
        name: "4+ personen",
        ...calculateQuartiles(cleanData.map(d => d["hh_4+_pct_toename"]).filter(v => v != null) as number[])
      },
    ]
  }, [cleanData])

  // Calculate stacked bar chart data (absolute growth by household size)
  const stackedBarData = useMemo(() => {
    return cleanData
      .map(d => {
        const onePerson = d.hh_1_abs_toename ?? 0
        const twoPersons = d.hh_2_abs_toename ?? 0
        const threePersons = d.hh_3_abs_toename ?? 0
        const fourPlusPersons = d["hh_4+_abs_toename"] ?? 0
        const householdValues = [onePerson, twoPersons, threePersons, fourPlusPersons]

        return {
          name: d.TX_REFNIS_NL,
          total: householdValues.reduce((sum, value) => sum + value, 0),
          positiveTotal: householdValues.reduce((sum, value) => sum + Math.max(value, 0), 0),
          negativeTotal: householdValues.reduce((sum, value) => sum + Math.min(value, 0), 0),
          "1 persoon": onePerson,
          "2 personen": twoPersons,
          "3 personen": threePersons,
          "4+ personen": fourPlusPersons,
        }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 15) // Max 15 municipalities
  }, [cleanData])

  // Y-axis formatters and labels
  const { formatter: totalFormatter, scaleLabel: totalScale } = useMemo(() => {
    const values = stackedBarData.map(d => d.total)
    return createAutoScaledFormatter(values, false)
  }, [stackedBarData])

  const totalYAxisLabel = useMemo(() =>
    createYAxisLabel('Aantal', totalScale, false),
    [totalScale]
  )

  const { formatter: stackedFormatter, scaleLabel: stackedScale } = useMemo(() => {
    const values = stackedBarData.flatMap(d => [
      d.positiveTotal,
      d.negativeTotal,
      ...householdSizeKeys.map(key => d[key])
    ])
    return createAutoScaledFormatter(values, false)
  }, [stackedBarData])

  const stackedYAxisLabel = useMemo(() =>
    createYAxisLabel('Absolute toename', stackedScale, false),
    [stackedScale]
  )

  const stackedYAxisDomain = useMemo<[number, number]>(() => {
    if (stackedBarData.length === 0) return [0, 0]

    const minValue = Math.min(0, ...stackedBarData.map(d => d.negativeTotal))
    const maxValue = Math.max(0, ...stackedBarData.map(d => d.positiveTotal))
    const range = maxValue - minValue
    const padding = range === 0 ? 1 : range * 0.05

    return [minValue - (minValue < 0 ? padding : 0), maxValue + (maxValue > 0 ? padding : 0)]
  }, [stackedBarData])

  if (!hasHouseholdData) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Huishoudens - voorspelde toename 2025-2040</h2>
        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            Geen huishoudensdata beschikbaar voor de geselecteerde selectie.
            Huishoudensdata is momenteel alleen beschikbaar voor Vlaanderen.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Huishoudens - voorspelde toename 2025-2040</h2>
          <p className="text-muted-foreground">
            Projecties van huishoudensgroei per grootte (1, 2, 3, 4+ personen).
          </p>
        </div>
        <ExportButtons
          data={exportData}
          title="Huishoudensgroei 2025-2040"
          slug="betaalbaar-arr"
          sectionId="huishoudens"
          viewType={currentView === "map" ? "map" : "chart"}
          periodHeaders={["Gemeente"]}
          valueLabel="Totale toename"
          dataSource="Statbel, Vlaamse Overheid"
          dataSourceUrl="https://statbel.fgov.be/"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Box plot - Percentage distribution */}
        <div>
          <h3 className="text-lg font-medium mb-3">Distributie percentage toename</h3>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={boxPlotData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
                }}
                formatter={(value) => (typeof value === 'number' ? value.toFixed(1) + '%' : value)}
              />
              <Legend />
              <Bar name="Minimum" dataKey="min" fill="transparent" stroke="var(--color-chart-1)" stackId="a" />
              <Bar name="Kwartiel 1 (Q1)" dataKey="q1" fill="var(--color-chart-1)" opacity={0.3} stackId="a" />
              <Bar name="Mediaan" dataKey="median" fill="var(--color-chart-1)" opacity={0.6} stackId="a" />
              <Bar name="Kwartiel 3 (Q3)" dataKey="q3" fill="var(--color-chart-1)" opacity={0.3} stackId="a" />
              <Bar name="Maximum" dataKey="max" fill="transparent" stroke="var(--color-chart-1)" stackId="a" />
              <Line name="Gemiddelde" type="monotone" dataKey="mean" stroke="var(--color-chart-5)" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Total absolute growth */}
        <div>
          <h3 className="text-lg font-medium mb-3">Totale absolute toename per gemeente (max 15)</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            {totalYAxisLabel.text}
            <span className="font-bold">{totalYAxisLabel.boldText}</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={stackedBarData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={totalFormatter} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
                }}
              />
              <Bar dataKey="total" fill="var(--color-chart-1)">
                {stackedBarData.map((entry, index) => (
                  <Cell
                    key={`cell-total-${index}`}
                    fill={entry.name === highlightedName ? "var(--color-chart-5)" : "var(--color-chart-1)"}
                    stroke={entry.name === highlightedName ? "#000" : "none"}
                    strokeWidth={entry.name === highlightedName ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stacked bar chart - Absolute growth breakdown */}
      <div>
        <h3 className="text-lg font-medium mb-3">Absolute toename per huishoudensgrootte (max 15 gemeenten)</h3>
        <div className="text-sm font-medium ml-16 mb-1">
          {stackedYAxisLabel.text}
          <span className="font-bold">{stackedYAxisLabel.boldText}</span>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={stackedBarData} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={stackedFormatter}
              domain={stackedYAxisDomain}
            />
            <ReferenceLine
              y={0}
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              strokeDasharray="6 4"
              zIndex={1000}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                border: '1px solid #e2e8f0',
                borderRadius: '6px'
              }}
            />
            <Legend />
            <Bar dataKey="1 persoon" stackId="a" fill="var(--color-chart-1)">
              {stackedBarData.map((entry, index) => (
                <Cell
                  key={`cell-1-${index}`}
                  stroke={entry.name === highlightedName ? "#000" : "none"}
                  strokeWidth={entry.name === highlightedName ? 2 : 0}
                />
              ))}
            </Bar>
            <Bar dataKey="2 personen" stackId="a" fill="var(--color-chart-2)">
              {stackedBarData.map((entry, index) => (
                <Cell
                  key={`cell-2-${index}`}
                  stroke={entry.name === highlightedName ? "#000" : "none"}
                  strokeWidth={entry.name === highlightedName ? 2 : 0}
                />
              ))}
            </Bar>
            <Bar dataKey="3 personen" stackId="a" fill="var(--color-chart-3)">
              {stackedBarData.map((entry, index) => (
                <Cell
                  key={`cell-3-${index}`}
                  stroke={entry.name === highlightedName ? "#000" : "none"}
                  strokeWidth={entry.name === highlightedName ? 2 : 0}
                />
              ))}
            </Bar>
            <Bar dataKey="4+ personen" stackId="a" fill="var(--color-chart-4)">
              {stackedBarData.map((entry, index) => (
                <Cell
                  key={`cell-4-${index}`}
                  stroke={entry.name === highlightedName ? "#000" : "none"}
                  strokeWidth={entry.name === highlightedName ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DataTable data={cleanData} columns={columns} />
    </div>
  )
}
