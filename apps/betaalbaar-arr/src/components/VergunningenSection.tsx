"use client"

import * as React from "react"
import { useMemo } from "react"
import type { MunicipalityData } from "./types"
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
  Cell,
} from "recharts"
import {
  createAutoScaledFormatter,
  createYAxisLabel,
} from "@embuild/shared/lib/number-formatters"

interface VergunningenSectionProps {
  data: MunicipalityData[]
}

const columns = [
  { key: "TX_REFNIS_NL", header: "Gemeente", format: "text" as const, sortable: true },
  { key: "Woningen_Nieuwbouw_2019sep_2022aug", header: "Nieuwbouw 2019-2022", format: "number" as const, sortable: true },
  { key: "Woningen_Nieuwbouw_2022sep_2025aug", header: "Nieuwbouw 2022-2025", format: "number" as const, sortable: true },
  { key: "Woningen_Nieuwbouw_pct_verschil_36m", header: "Nieuwbouw %", format: "percentage" as const, sortable: true },
]

export function VergunningenSection({ data }: VergunningenSectionProps) {
  const currentView = useEmbedFilters((state) => state.currentView)
  const { selectedHighlightMunicipality } = useGeoFilters()

  const highlightedName = React.useMemo(() => {
    if (!selectedHighlightMunicipality) return null
    return data.find(d => d.CD_REFNIS === selectedHighlightMunicipality)?.TX_REFNIS_NL ?? null
  }, [data, selectedHighlightMunicipality])

  // Map data for export
  const exportData = useMemo(() => {
    return data.map(d => ({
      label: d.TX_REFNIS_NL,
      value: d.Woningen_Nieuwbouw_2022sep_2025aug ?? 0,
      "Nieuwbouw 2019-2022": d.Woningen_Nieuwbouw_2019sep_2022aug ?? 0,
      "Renovatie 2022-2025": d.Gebouwen_Renovatie_2022sep_2025aug ?? 0,
      "Renovatie 2019-2022": d.Gebouwen_Renovatie_2019sep_2022aug ?? 0,
    }))
  }, [data])

  // Prepare grouped bar chart data for new construction
  const nieuwbouwData = useMemo(() => {
    return data
      .filter(d =>
        d.Woningen_Nieuwbouw_2022sep_2025aug != null &&
        d.Woningen_Nieuwbouw_2022sep_2025aug > 0
      )
      .map(d => ({
        name: d.TX_REFNIS_NL,
        "2019-2022": d.Woningen_Nieuwbouw_2019sep_2022aug ?? 0,
        "2022-2025": d.Woningen_Nieuwbouw_2022sep_2025aug ?? 0,
        verschil: d.Woningen_Nieuwbouw_pct_verschil_36m ?? 0,
      }))
      .sort((a, b) => b["2022-2025"] - a["2022-2025"])
      .slice(0, 15) // Top 15 municipalities
  }, [data])

  // Prepare grouped bar chart data for renovations
  const renovatieData = useMemo(() => {
    return data
      .filter(d =>
        d.Gebouwen_Renovatie_2022sep_2025aug != null &&
        d.Gebouwen_Renovatie_2022sep_2025aug > 0
      )
      .map(d => ({
        name: d.TX_REFNIS_NL,
        "2019-2022": d.Gebouwen_Renovatie_2019sep_2022aug ?? 0,
        "2022-2025": d.Gebouwen_Renovatie_2022sep_2025aug ?? 0,
        verschil: d.Gebouwen_Renovatie_pct_verschil_36m ?? 0,
      }))
      .sort((a, b) => b["2022-2025"] - a["2022-2025"])
      .slice(0, 15) // Top 15 municipalities
  }, [data])

  // Percentage difference data
  const nieuwbouwVerschilData = useMemo(() => {
    return data
      .filter(d => d.Woningen_Nieuwbouw_pct_verschil_36m != null)
      .map(d => ({
        name: d.TX_REFNIS_NL,
        verschil: d.Woningen_Nieuwbouw_pct_verschil_36m ?? 0,
      }))
      .sort((a, b) => a.verschil - b.verschil)
      .slice(0, 20)
  }, [data])

  const renovatieVerschilData = useMemo(() => {
    return data
      .filter(d => d.Gebouwen_Renovatie_pct_verschil_36m != null)
      .map(d => ({
        name: d.TX_REFNIS_NL,
        verschil: d.Gebouwen_Renovatie_pct_verschil_36m ?? 0,
      }))
      .sort((a, b) => a.verschil - b.verschil)
      .slice(0, 20)
  }, [data])

  // Y-axis formatters and labels
  const { formatter: nieuwbouwFormatter, scaleLabel: nieuwbouwScale } = useMemo(() => {
    const values = nieuwbouwData.flatMap(d => [d["2019-2022"], d["2022-2025"]])
    return createAutoScaledFormatter(values, false)
  }, [nieuwbouwData])

  const nieuwbouwYAxisLabel = useMemo(() =>
    createYAxisLabel('Aantal', nieuwbouwScale, false),
    [nieuwbouwScale]
  )

  const { formatter: renovatieFormatter, scaleLabel: renovatieScale } = useMemo(() => {
    const values = renovatieData.flatMap(d => [d["2019-2022"], d["2022-2025"]])
    return createAutoScaledFormatter(values, false)
  }, [renovatieData])

  const renovatieYAxisLabel = useMemo(() =>
    createYAxisLabel('Aantal', renovatieScale, false),
    [renovatieScale]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Bouwvergunningen - 36 maanden vergelijking</h2>
          <p className="text-muted-foreground">
            Vergelijking van nieuwbouw en renovatie tussen twee 36-maanden periodes.
          </p>
        </div>
        <ExportButtons
          data={exportData}
          title="Bouwvergunningen vergelijking"
          slug="betaalbaar-arr"
          sectionId="vergunningen"
          viewType={currentView === "map" ? "map" : "chart"}
          periodHeaders={["Gemeente"]}
          valueLabel="Nieuwbouw 2022-2025"
          dataSource="Statbel, Vlaamse Overheid"
          dataSourceUrl="https://statbel.fgov.be/"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* New construction comparison */}
        <div>
          <h3 className="text-lg font-medium mb-3">Nieuwbouw woningen - 36 maanden</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            {nieuwbouwYAxisLabel.text}
            <span className="font-bold">{nieuwbouwYAxisLabel.boldText}</span>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={nieuwbouwData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={nieuwbouwFormatter} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Bar dataKey="2019-2022" fill="var(--color-chart-2)">
                {nieuwbouwData.map((entry, index) => (
                  <Cell
                    key={`cell-1-${index}`}
                    stroke={entry.name === highlightedName ? "#000" : "none"}
                    strokeWidth={entry.name === highlightedName ? 2 : 0}
                  />
                ))}
              </Bar>
              <Bar dataKey="2022-2025" fill="var(--color-chart-1)">
                {nieuwbouwData.map((entry, index) => (
                  <Cell
                    key={`cell-2-${index}`}
                    stroke={entry.name === highlightedName ? "#000" : "none"}
                    strokeWidth={entry.name === highlightedName ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Renovation comparison */}
        <div>
          <h3 className="text-lg font-medium mb-3">Renovatie gebouwen - 36 maanden</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            {renovatieYAxisLabel.text}
            <span className="font-bold">{renovatieYAxisLabel.boldText}</span>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={renovatieData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={renovatieFormatter} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
                }}
              />
              <Legend />
              <Bar dataKey="2019-2022" fill="var(--color-chart-4)">
                {renovatieData.map((entry, index) => (
                  <Cell
                    key={`cell-3-${index}`}
                    stroke={entry.name === highlightedName ? "#000" : "none"}
                    strokeWidth={entry.name === highlightedName ? 2 : 0}
                  />
                ))}
              </Bar>
              <Bar dataKey="2022-2025" fill="var(--color-chart-3)">
                {renovatieData.map((entry, index) => (
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
      </div>

      {/* Percentage difference charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-lg font-medium mb-3">Percentage verschil nieuwbouw woningen</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            Verschil <span className="font-bold">(%)</span>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={nieuwbouwVerschilData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
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
              <Bar
                dataKey="verschil"
                fill="var(--color-chart-1)"
                radius={[4, 4, 0, 0]}
              >
                {nieuwbouwVerschilData.map((entry, index) => (
                  <Cell
                    key={`cell-5-${index}`}
                    fill={entry.name === highlightedName ? "var(--color-chart-5)" : "var(--color-chart-1)"}
                    stroke={entry.name === highlightedName ? "#000" : "none"}
                    strokeWidth={entry.name === highlightedName ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-3">Percentage verschil renovatie gebouwen</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            Verschil <span className="font-bold">(%)</span>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={renovatieVerschilData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
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
              <Bar
                dataKey="verschil"
                fill="var(--color-chart-3)"
                radius={[4, 4, 0, 0]}
              >
                {renovatieVerschilData.map((entry, index) => (
                  <Cell
                    key={`cell-6-${index}`}
                    fill={entry.name === highlightedName ? "var(--color-chart-5)" : "var(--color-chart-3)"}
                    stroke={entry.name === highlightedName ? "#000" : "none"}
                    strokeWidth={entry.name === highlightedName ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <DataTable data={data} columns={columns} />
    </div>
  )
}
