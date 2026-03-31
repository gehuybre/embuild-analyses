"use client"

import * as React from "react"
import { useMemo } from "react"
import type { MunicipalityData } from "./types"
import { ARRONDISSEMENTS } from "@embuild/shared/lib/geo-utils"
import { cn } from "@embuild/shared/lib/utils"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
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
import { useEmbedFilters, useGeoFilters } from "@embuild/shared/lib/stores/embed-filters-store"
import {
  createAutoScaledFormatter,
  createYAxisLabel,
} from "@embuild/shared/lib/number-formatters"

interface VergelijkingSectionProps {
  data: MunicipalityData[]
}

interface ArrondissementAggregate {
  name: string
  code: string
  huizen: number
  appartementen: number
  flatsRatio: number
  nieuwbouw2019: number
  nieuwbouw2022: number
  renovatie2019: number
  renovatie2022: number
  totalHHToename: number
}

export function VergelijkingSection({ data }: VergelijkingSectionProps) {
  const currentView = useEmbedFilters((state) => state.currentView)
  const { selectedHighlightMunicipality } = useGeoFilters()

  const highlightedArrCode = React.useMemo(() => {
    if (!selectedHighlightMunicipality) return null
    return data.find(d => d.CD_REFNIS === selectedHighlightMunicipality)?.CD_SUP_REFNIS ?? null
  }, [data, selectedHighlightMunicipality])

  // Aggregate data by arrondissement
  const aggregated = useMemo(() => {
    const byArr = new Map<string, ArrondissementAggregate>()

    data.forEach(d => {
      const arrCode = d.CD_SUP_REFNIS
      if (!arrCode) return

      const existing = byArr.get(arrCode) || {
        code: arrCode,
        name: ARRONDISSEMENTS.find(a => a.code === arrCode)?.name.replace("Arrondissement ", "") || d.TX_REFNIS_NL,
        huizen: 0,
        appartementen: 0,
        flatsRatio: 0,
        nieuwbouw2019: 0,
        nieuwbouw2022: 0,
        renovatie2019: 0,
        renovatie2022: 0,
        totalHHToename: 0,
      }

      existing.huizen += d.Huizen_totaal_2025 ?? 0
      existing.appartementen += d.Appartementen_2025 ?? 0
      existing.nieuwbouw2019 += d.Woningen_Nieuwbouw_2019sep_2022aug ?? 0
      existing.nieuwbouw2022 += d.Woningen_Nieuwbouw_2022sep_2025aug ?? 0
      existing.renovatie2019 += d.Gebouwen_Renovatie_2019sep_2022aug ?? 0
      existing.renovatie2022 += d.Gebouwen_Renovatie_2022sep_2025aug ?? 0

      if (d.HH_available) {
        existing.totalHHToename +=
          (d.hh_1_abs_toename ?? 0) +
          (d.hh_2_abs_toename ?? 0) +
          (d.hh_3_abs_toename ?? 0) +
          (d["hh_4+_abs_toename"] ?? 0)
      }

      byArr.set(arrCode, existing)
    })

    // Calculate flats ratio for each arrondissement
    return Array.from(byArr.values())
      .map(arr => ({
        ...arr,
        flatsRatio: arr.huizen > 0 ? (arr.appartementen / arr.huizen) * 100 : 0,
      }))
      .filter(arr => arr.huizen > 0) // Only include arrondissements with data
  }, [data])

  // Map data for export
  const exportData = useMemo(() => {
    return aggregated.map(arr => ({
      label: arr.name,
      value: arr.huizen,
      "Flats ratio (%)": arr.flatsRatio,
      "Nieuwbouw 2022-2025": arr.nieuwbouw2022,
      "Renovatie 2022-2025": arr.renovatie2022,
      "HH toename": arr.totalHHToename,
    }))
  }, [aggregated])

  // Prepare data for different charts
  const huizenData = useMemo(() =>
    [...aggregated].sort((a, b) => b.huizen - a.huizen),
    [aggregated]
  )

  const flatsRatioData = useMemo(() =>
    [...aggregated]
      .filter(a => a.flatsRatio > 0)
      .sort((a, b) => b.flatsRatio - a.flatsRatio),
    [aggregated]
  )

  const nieuwbouwData = useMemo(() =>
    [...aggregated]
      .filter(a => a.nieuwbouw2022 > 0)
      .sort((a, b) => b.nieuwbouw2022 - a.nieuwbouw2022),
    [aggregated]
  )

  const renovatieData = useMemo(() =>
    [...aggregated]
      .filter(a => a.renovatie2022 > 0)
      .sort((a, b) => b.renovatie2022 - a.renovatie2022),
    [aggregated]
  )

  const hhToenameData = useMemo(() =>
    [...aggregated]
      .filter(a => a.totalHHToename > 0)
      .sort((a, b) => b.totalHHToename - a.totalHHToename),
    [aggregated]
  )

  // Y-axis formatters and labels
  const { formatter: huizenFormatter, scaleLabel: huizenScale } = useMemo(() => {
    const values = huizenData.map(d => d.huizen)
    return createAutoScaledFormatter(values, false)
  }, [huizenData])

  const huizenYAxisLabel = useMemo(() =>
    createYAxisLabel('Aantal', huizenScale, false),
    [huizenScale]
  )

  const { formatter: nieuwbouwFormatter, scaleLabel: nieuwbouwScale } = useMemo(() => {
    const values = nieuwbouwData.map(d => d.nieuwbouw2022)
    return createAutoScaledFormatter(values, false)
  }, [nieuwbouwData])

  const nieuwbouwYAxisLabel = useMemo(() =>
    createYAxisLabel('Aantal', nieuwbouwScale, false),
    [nieuwbouwScale]
  )

  const { formatter: renovatieFormatter, scaleLabel: renovatieScale } = useMemo(() => {
    const values = renovatieData.map(d => d.renovatie2022)
    return createAutoScaledFormatter(values, false)
  }, [renovatieData])

  const renovatieYAxisLabel = useMemo(() =>
    createYAxisLabel('Aantal', renovatieScale, false),
    [renovatieScale]
  )

  const { formatter: hhToenameFormatter, scaleLabel: hhToenameScale } = useMemo(() => {
    const values = hhToenameData.map(d => d.totalHHToename)
    return createAutoScaledFormatter(values, false)
  }, [hhToenameData])

  const hhToenameYAxisLabel = useMemo(() =>
    createYAxisLabel('Absolute toename', hhToenameScale, false),
    [hhToenameScale]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Vergelijking arrondissementen</h2>
          <p className="text-muted-foreground">
            Overzicht en verschillen tussen {aggregated.length} arrondissementen.
          </p>
        </div>
        <ExportButtons
          data={exportData}
          title="Vergelijking arrondissementen"
          slug="betaalbaar-arr"
          sectionId="vergelijking"
          viewType={currentView === "map" ? "map" : "chart"}
          periodHeaders={["Arrondissement"]}
          valueLabel="Totaal huizen"
          dataSource="Statbel, Vlaamse Overheid"
          dataSourceUrl="https://statbel.fgov.be/"
        />
      </div>

      {/* Total houses comparison */}
      <div>
        <h3 className="text-lg font-medium mb-3">Totaal huizen 2025</h3>
        <div className="text-sm font-medium ml-16 mb-1">
          {huizenYAxisLabel.text}
          <span className="font-bold">{huizenYAxisLabel.boldText}</span>
        </div>
        <ResponsiveContainer width="100%" height={450}>
          <BarChart data={huizenData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={huizenFormatter} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                color: '#0f172a',
                border: '1px solid #e2e8f0',
                borderRadius: '6px'
              }}
            />
            <Bar dataKey="huizen" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]}>
              {huizenData.map((entry, index) => (
                <Cell
                  key={`cell-1-${index}`}
                  fill={entry.code === highlightedArrCode ? "var(--color-chart-5)" : "var(--color-chart-1)"}
                  stroke={entry.code === highlightedArrCode ? "#000" : "none"}
                  strokeWidth={entry.code === highlightedArrCode ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Flats ratio comparison */}
      <div>
        <h3 className="text-lg font-medium mb-3">Flats ratio per arrondissement (%)</h3>
        <div className="text-sm font-medium ml-16 mb-1">
          Percentage <span className="font-bold">(%)</span>
        </div>
        <ResponsiveContainer width="100%" height={450}>
          <BarChart data={flatsRatioData}>
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
              formatter={(value) => (typeof value === 'number' ? value.toFixed(2) + '%' : value)}
            />
            <Bar dataKey="flatsRatio" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]}>
              {flatsRatioData.map((entry, index) => (
                <Cell
                  key={`cell-2-${index}`}
                  fill={entry.code === highlightedArrCode ? "var(--color-chart-5)" : "var(--color-chart-3)"}
                  stroke={entry.code === highlightedArrCode ? "#000" : "none"}
                  strokeWidth={entry.code === highlightedArrCode ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* New construction comparison */}
      <div>
        <h3 className="text-lg font-medium mb-3">Nieuwbouw 2022-2025 per arrondissement</h3>
        <div className="text-sm font-medium ml-16 mb-1">
          {nieuwbouwYAxisLabel.text}
          <span className="font-bold">{nieuwbouwYAxisLabel.boldText}</span>
        </div>
        <ResponsiveContainer width="100%" height={450}>
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
            <Bar dataKey="nieuwbouw2022" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]}>
              {nieuwbouwData.map((entry, index) => (
                <Cell
                  key={`cell-3-${index}`}
                  fill={entry.code === highlightedArrCode ? "var(--color-chart-5)" : "var(--color-chart-2)"}
                  stroke={entry.code === highlightedArrCode ? "#000" : "none"}
                  strokeWidth={entry.code === highlightedArrCode ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Renovation comparison */}
      <div>
        <h3 className="text-lg font-medium mb-3">Renovatie 2022-2025 per arrondissement</h3>
        <div className="text-sm font-medium ml-16 mb-1">
          {renovatieYAxisLabel.text}
          <span className="font-bold">{renovatieYAxisLabel.boldText}</span>
        </div>
        <ResponsiveContainer width="100%" height={450}>
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
            <Bar dataKey="renovatie2022" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]}>
              {renovatieData.map((entry, index) => (
                <Cell
                  key={`cell-4-${index}`}
                  fill={entry.code === highlightedArrCode ? "var(--color-chart-5)" : "var(--color-chart-4)"}
                  stroke={entry.code === highlightedArrCode ? "#000" : "none"}
                  strokeWidth={entry.code === highlightedArrCode ? 2 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Household growth comparison */}
      {hhToenameData.length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-3">Totale huishoudensgroei 2025-2040 per arrondissement</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            {hhToenameYAxisLabel.text}
            <span className="font-bold">{hhToenameYAxisLabel.boldText}</span>
          </div>
          <ResponsiveContainer width="100%" height={450}>
            <BarChart data={hhToenameData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={hhToenameFormatter} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
                }}
              />
              <Bar dataKey="totalHHToename" fill="var(--color-chart-5)" radius={[4, 4, 0, 0]}>
                {hhToenameData.map((entry, index) => (
                  <Cell
                    key={`cell-5-${index}`}
                    fill={entry.code === highlightedArrCode ? "var(--color-chart-1)" : "var(--color-chart-5)"}
                    stroke={entry.code === highlightedArrCode ? "#000" : "none"}
                    strokeWidth={entry.code === highlightedArrCode ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary table */}
      <div className="mt-8">
        <h3 className="text-lg font-medium mb-3">Overzichtstabel</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 font-medium">Arrondissement</th>
                <th className="text-right p-2 font-medium">Huizen 2025</th>
                <th className="text-right p-2 font-medium">Flats ratio (%)</th>
                <th className="text-right p-2 font-medium">Nieuwbouw 2019-2022</th>
                <th className="text-right p-2 font-medium">Nieuwbouw 2022-2025</th>
                <th className="text-right p-2 font-medium">Renovatie 2019-2022</th>
                <th className="text-right p-2 font-medium">Renovatie 2022-2025</th>
                <th className="text-right p-2 font-medium">Totale HH toename</th>
              </tr>
            </thead>
            <tbody>
              {huizenData.map((arr, idx) => (
                <tr
                  key={arr.code}
                  className={cn(
                    idx % 2 === 0 ? 'bg-muted/30' : '',
                    arr.code === highlightedArrCode ? 'bg-yellow-100 dark:bg-yellow-900/30 font-semibold' : ''
                  )}
                >
                  <td className="p-2">{arr.name}</td>
                  <td className="text-right p-2">{arr.huizen.toLocaleString('nl-BE')}</td>
                  <td className="text-right p-2">{arr.flatsRatio.toFixed(2)}%</td>
                  <td className="text-right p-2">{arr.nieuwbouw2019.toLocaleString('nl-BE')}</td>
                  <td className="text-right p-2">{arr.nieuwbouw2022.toLocaleString('nl-BE')}</td>
                  <td className="text-right p-2">{arr.renovatie2019.toLocaleString('nl-BE')}</td>
                  <td className="text-right p-2">{arr.renovatie2022.toLocaleString('nl-BE')}</td>
                  <td className="text-right p-2">{arr.totalHHToename > 0 ? arr.totalHHToename.toLocaleString('nl-BE') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
