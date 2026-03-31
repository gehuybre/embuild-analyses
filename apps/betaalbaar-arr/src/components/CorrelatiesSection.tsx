"use client"

import * as React from "react"
import { useMemo } from "react"
import type { MunicipalityData } from "./types"
import { DataTable } from "./DataTable"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
  ZAxis,
  Cell,
} from "recharts"
import { useEmbedFilters, useGeoFilters } from "@embuild/shared/lib/stores/embed-filters-store"

interface CorrelatiesSectionProps {
  data: MunicipalityData[]
}

interface TooltipEntry {
  name?: string
  value?: number | string
  payload?: {
    name?: string
  }
}

const columns = [
  { key: "TX_REFNIS_NL", header: "Gemeente", format: "text" as const, sortable: true },
  { key: "Huizen_totaal_2025", header: "Huizen 2025", format: "number" as const, sortable: true },
  { key: "Appartementen_2025", header: "Appartementen 2025", format: "number" as const, sortable: true },
]

// Helper function to calculate OLS regression
function calculateOLS(points: Array<{ x: number; y: number }>) {
  const n = points.length
  if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 }
  if (n === 1) return { slope: 0, intercept: points[0].y, rSquared: 0 }

  const sumX = points.reduce((sum, p) => sum + p.x, 0)
  const sumY = points.reduce((sum, p) => sum + p.y, 0)
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0)
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0)
  const denominator = n * sumXX - sumX * sumX

  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, rSquared: 0 }
  }

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  // Calculate R²
  const meanY = sumY / n
  const ssTotal = points.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0)
  const ssResidual = points.reduce((sum, p) => sum + Math.pow(p.y - (slope * p.x + intercept), 2), 0)
  const rSquared = ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal)

  return { slope, intercept, rSquared }
}

function roundUpNice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1

  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const normalized = value / magnitude

  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

function createPositiveDomain(values: number[], padding = 0.05): [number, number] {
  const finiteValues = values.filter(v => Number.isFinite(v) && v >= 0)

  if (finiteValues.length === 0) return [0, 1]

  const maxValue = Math.max(...finiteValues)
  if (maxValue === 0) return [0, 1]

  return [0, roundUpNice(maxValue * (1 + padding))]
}

function formatAxisInteger(value: number): string {
  return value.toLocaleString("nl-BE", { maximumFractionDigits: 0 })
}

function formatIntegerValue(value: number | string | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("nl-BE", { maximumFractionDigits: 0 })
  }

  if (typeof value === "string") {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) {
      return asNumber.toLocaleString("nl-BE", { maximumFractionDigits: 0 })
    }
    return value
  }

  return ""
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-white p-3 border border-slate-200 rounded-md shadow-sm text-sm">
        <p className="font-semibold mb-1 text-slate-900">{data?.name}</p>
        {payload.map((entry, index: number) => (
          <p key={index} className="text-slate-600">
            <span className="font-medium">{entry.name}:</span>{" "}
            {formatIntegerValue(entry.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export function CorrelatiesSection({ data }: CorrelatiesSectionProps) {
  const currentView = useEmbedFilters((state) => state.currentView)
  const { selectedHighlightMunicipality } = useGeoFilters()

  // Map data for export
  const exportData = useMemo(() => {
    return data.map(d => ({
      label: d.TX_REFNIS_NL,
      value: (d.hh_1_abs_toename ?? 0) + (d.hh_2_abs_toename ?? 0) +
        (d.hh_3_abs_toename ?? 0) + (d["hh_4+_abs_toename"] ?? 0),
      "Nieuwbouw 2022-2025": d.Woningen_Nieuwbouw_2022sep_2025aug ?? 0,
      "Huizen 2025": d.Huizen_totaal_2025 ?? 0,
      "Appartementen 2025": d.Appartementen_2025 ?? 0,
    }))
  }, [data])

  // 1. Household growth vs new construction
  const scatter1Data = useMemo(() => {
    const points = data
      .filter(d =>
        d.HH_available &&
        d.Woningen_Nieuwbouw_2022sep_2025aug != null
      )
      .map(d => ({
        x: (d.hh_1_abs_toename ?? 0) + (d.hh_2_abs_toename ?? 0) +
          (d.hh_3_abs_toename ?? 0) + (d["hh_4+_abs_toename"] ?? 0),
        y: d.Woningen_Nieuwbouw_2022sep_2025aug ?? 0,
        z: d.Huizen_totaal_2025 ?? 1000,
        name: d.TX_REFNIS_NL,
        code: d.CD_REFNIS,
      }))
      .filter(p => p.x > 0 || p.y > 0)

    if (points.length === 0) {
      return { points: [], trendline: [], rSquared: 0 }
    }

    const ols = calculateOLS(points)
    const xMin = Math.min(...points.map(p => p.x))
    const xMax = Math.max(...points.map(p => p.x))

    return {
      points,
      trendline: [
        { x: xMin, y: ols.slope * xMin + ols.intercept },
        { x: xMax, y: ols.slope * xMax + ols.intercept },
      ],
      rSquared: ols.rSquared,
    }
  }, [data])

  // 2. Small households growth vs flats ratio
  const scatter2Data = useMemo(() => {
    const points = data
      .filter(d =>
        d.HH_available &&
        d.Appartementen_2025 != null &&
        d.Huizen_totaal_2025 != null &&
        d.Huizen_totaal_2025 > 0
      )
      .map(d => ({
        x: (d.hh_1_pct_toename ?? 0) + (d.hh_2_pct_toename ?? 0),
        y: ((d.Appartementen_2025 ?? 0) / (d.Huizen_totaal_2025 ?? 1)) * 100,
        z: d.Huizen_totaal_2025 ?? 1000,
        name: d.TX_REFNIS_NL,
        code: d.CD_REFNIS,
      }))
      .filter(p => p.x > 0 || p.y > 0)

    if (points.length === 0) {
      return { points: [], trendline: [], rSquared: 0 }
    }

    const ols = calculateOLS(points)
    const xMin = Math.min(...points.map(p => p.x))
    const xMax = Math.max(...points.map(p => p.x))

    return {
      points,
      trendline: [
        { x: xMin, y: ols.slope * xMin + ols.intercept },
        { x: xMax, y: ols.slope * xMax + ols.intercept },
      ],
      rSquared: ols.rSquared,
    }
  }, [data])

  // 3. Household growth vs renovations
  const scatter3Data = useMemo(() => {
    const points = data
      .filter(d =>
        d.HH_available &&
        d.Gebouwen_Renovatie_2022sep_2025aug != null
      )
      .map(d => ({
        x: (d.hh_1_abs_toename ?? 0) + (d.hh_2_abs_toename ?? 0) +
          (d.hh_3_abs_toename ?? 0) + (d["hh_4+_abs_toename"] ?? 0),
        y: d.Gebouwen_Renovatie_2022sep_2025aug ?? 0,
        z: d.Huizen_totaal_2025 ?? 1000,
        name: d.TX_REFNIS_NL,
        code: d.CD_REFNIS,
      }))
      .filter(p => p.x > 0 || p.y > 0)

    if (points.length === 0) {
      return { points: [], trendline: [], rSquared: 0 }
    }

    const ols = calculateOLS(points)
    const xMin = Math.min(...points.map(p => p.x))
    const xMax = Math.max(...points.map(p => p.x))

    return {
      points,
      trendline: [
        { x: xMin, y: ols.slope * xMin + ols.intercept },
        { x: xMax, y: ols.slope * xMax + ols.intercept },
      ],
      rSquared: ols.rSquared,
    }
  }, [data])

  // 4. Large households vs housing stock
  const scatter4Data = useMemo(() => {
    const points = data
      .filter(d =>
        d.HH_available &&
        d.Huizen_totaal_2025 != null
      )
      .map(d => ({
        x: (d.hh_3_abs_toename ?? 0) + (d["hh_4+_abs_toename"] ?? 0),
        y: d.Huizen_totaal_2025 ?? 0,
        z: d.Huizen_totaal_2025 ?? 1000,
        name: d.TX_REFNIS_NL,
        code: d.CD_REFNIS,
      }))
      .filter(p => p.x > 0 || p.y > 0)

    if (points.length === 0) {
      return { points: [], trendline: [], rSquared: 0 }
    }

    const ols = calculateOLS(points)
    const xMin = Math.min(...points.map(p => p.x))
    const xMax = Math.max(...points.map(p => p.x))

    return {
      points,
      trendline: [
        { x: xMin, y: ols.slope * xMin + ols.intercept },
        { x: xMax, y: ols.slope * xMax + ols.intercept },
      ],
      rSquared: ols.rSquared,
    }
  }, [data])

  // 5. Total households vs total housing (with reference line)
  const scatter5Data = useMemo(() => {
    const points = data
      .filter(d =>
        d.HH_available &&
        d.Huizen_totaal_2025 != null
      )
      .map(d => ({
        x: (d.hh_1_2025 ?? 0) + (d.hh_2_2025 ?? 0) + (d.hh_3_2025 ?? 0) + (d["hh_4+_2025"] ?? 0),
        y: d.Huizen_totaal_2025 ?? 0,
        z: d.Huizen_totaal_2025 ?? 1000,
        name: d.TX_REFNIS_NL,
        code: d.CD_REFNIS,
      }))
      .filter(p => p.x > 0 && p.y > 0)

    if (points.length === 0) {
      return { points: [], trendline: [], referenceLine: [], rSquared: 0 }
    }

    const ols = calculateOLS(points)
    const xMax = Math.max(...points.map(p => p.x))

    return {
      points,
      trendline: [
        { x: 0, y: ols.intercept },
        { x: xMax, y: ols.slope * xMax + ols.intercept },
      ],
      referenceLine: [
        { x: 0, y: 0 },
        { x: xMax, y: xMax * 1.14 }, // Flemish average: 1.14 houses per household
      ],
      rSquared: ols.rSquared,
    }
  }, [data])

  const scatter1YDomain = useMemo(
    () => createPositiveDomain([
      ...scatter1Data.points.map(p => p.y),
      ...scatter1Data.trendline.map(p => p.y),
    ]),
    [scatter1Data]
  )

  const scatter3YDomain = useMemo(
    () => createPositiveDomain([
      ...scatter3Data.points.map(p => p.y),
      ...scatter3Data.trendline.map(p => p.y),
    ]),
    [scatter3Data]
  )

  const scatter5XDomain = useMemo(
    () => createPositiveDomain([
      ...scatter5Data.points.map(p => p.x),
      ...scatter5Data.trendline.map(p => p.x),
      ...scatter5Data.referenceLine.map(p => p.x),
    ]),
    [scatter5Data]
  )

  const scatter5YDomain = useMemo(
    () => createPositiveDomain([
      ...scatter5Data.points.map(p => p.y),
      ...scatter5Data.trendline.map(p => p.y),
      ...scatter5Data.referenceLine.map(p => p.y),
    ]),
    [scatter5Data]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Correlaties en trends</h2>
          <p className="text-muted-foreground">
            Scatter plots die de relatie tonen tussen huishoudensgroei en woningaanbod.
          </p>
        </div>
        <ExportButtons
          data={exportData}
          title="Correlaties wonen per arrondissement"
          slug="betaalbaar-arr"
          sectionId="correlaties"
          viewType={currentView === "map" ? "map" : "chart"}
          periodHeaders={["Gemeente"]}
          valueLabel="HH toename"
          dataSource="Statbel, Vlaamse Overheid"
          dataSourceUrl="https://statbel.fgov.be/"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 1. Household growth vs new construction */}
        <div>
          <h3 className="text-lg font-medium mb-2">Huishoudensgroei vs nieuwbouw</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            Nieuwbouw <span className="font-bold">(2022-2025)</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="x"
                name="Totale HH toename"
                tick={{ fontSize: 11 }}
                label={{ value: 'Totale toename huishoudens (2025-2040)', position: 'insideBottom', offset: -5, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Nieuwbouw"
                tick={{ fontSize: 11 }}
                domain={scatter1YDomain}
              />
              <ZAxis type="number" dataKey="z" range={[50, 400]} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '3 3' }}
              />
              <Scatter data={scatter1Data.points} fill="var(--color-chart-1)" fillOpacity={0.6}>
                {scatter1Data.points.map((entry, index: number) => (
                  <Cell
                    key={`cell-1-${index}`}
                    fill={entry.code === selectedHighlightMunicipality ? "var(--color-chart-5)" : "var(--color-chart-1)"}
                    fillOpacity={entry.code === selectedHighlightMunicipality ? 1 : 0.6}
                    stroke={entry.code === selectedHighlightMunicipality ? "#000" : "none"}
                    strokeWidth={entry.code === selectedHighlightMunicipality ? 2 : 0}
                  />
                ))}
              </Scatter>
              <Line
                data={scatter1Data.trendline}
                type="monotone"
                dataKey="y"
                stroke="var(--color-chart-5)"
                strokeWidth={2}
                dot={false}
                legendType="none"
              />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground italic mt-2">
            Hoge huishoudensgroei met lage nieuwbouw (rechts onder) duidt op toenemende druk op de woningmarkt.
            R² = {scatter1Data.rSquared.toFixed(3)}
          </p>
        </div>

        {/* 2. Small households growth vs flats ratio */}
        <div>
          <h3 className="text-lg font-medium mb-2">Kleine huishoudens vs flats ratio</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            Ratio appartementen <span className="font-bold">(% 2025)</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="x"
                name="Klein HH %"
                tick={{ fontSize: 11 }}
                label={{ value: 'Toename 1+2 persoons HH (% 2025-2040)', position: 'insideBottom', offset: -5, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Flats ratio"
                tick={{ fontSize: 11 }}
              />
              <ZAxis type="number" dataKey="z" range={[50, 400]} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '3 3' }}
              />
              <Scatter data={scatter2Data.points} fill="var(--color-chart-2)" fillOpacity={0.6}>
                {scatter2Data.points.map((entry, index: number) => (
                  <Cell
                    key={`cell-2-${index}`}
                    fill={entry.code === selectedHighlightMunicipality ? "var(--color-chart-5)" : "var(--color-chart-2)"}
                    fillOpacity={entry.code === selectedHighlightMunicipality ? 1 : 0.6}
                    stroke={entry.code === selectedHighlightMunicipality ? "#000" : "none"}
                    strokeWidth={entry.code === selectedHighlightMunicipality ? 2 : 0}
                  />
                ))}
              </Scatter>
              <Line
                data={scatter2Data.trendline}
                type="monotone"
                dataKey="y"
                stroke="var(--color-chart-5)"
                strokeWidth={2}
                dot={false}
                legendType="none"
              />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground italic mt-2">
            Hoge groei kleine huishoudens met lage flats ratio wijst op mismatch tussen woningtype en demografie.
            R² = {scatter2Data.rSquared.toFixed(3)}
          </p>
        </div>

        {/* 3. Household growth vs renovations */}
        <div>
          <h3 className="text-lg font-medium mb-2">Huishoudensgroei vs renovatie</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            Renovatie <span className="font-bold">(2022-2025)</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="x"
                name="Totale HH toename"
                tick={{ fontSize: 11 }}
                label={{ value: 'Totale toename huishoudens (2025-2040)', position: 'insideBottom', offset: -5, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Renovatie"
                tick={{ fontSize: 11 }}
                domain={scatter3YDomain}
                tickFormatter={formatAxisInteger}
              />
              <ZAxis type="number" dataKey="z" range={[50, 400]} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '3 3' }}
              />
              <Scatter data={scatter3Data.points} fill="var(--color-chart-3)" fillOpacity={0.6}>
                {scatter3Data.points.map((entry, index: number) => (
                  <Cell
                    key={`cell-3-${index}`}
                    fill={entry.code === selectedHighlightMunicipality ? "var(--color-chart-5)" : "var(--color-chart-3)"}
                    fillOpacity={entry.code === selectedHighlightMunicipality ? 1 : 0.6}
                    stroke={entry.code === selectedHighlightMunicipality ? "#000" : "none"}
                    strokeWidth={entry.code === selectedHighlightMunicipality ? 2 : 0}
                  />
                ))}
              </Scatter>
              <Line
                data={scatter3Data.trendline}
                type="monotone"
                dataKey="y"
                stroke="var(--color-chart-5)"
                strokeWidth={2}
                dot={false}
                legendType="none"
              />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground italic mt-2">
            Hoge huishoudensgroei met weinig renovatie betekent beperkte aanpassing aan nieuwe behoeften.
            R² = {scatter3Data.rSquared.toFixed(3)}
          </p>
        </div>

        {/* 4. Large households vs housing stock */}
        <div>
          <h3 className="text-lg font-medium mb-2">Grote huishoudens vs woningvoorraad</h3>
          <div className="text-sm font-medium ml-16 mb-1">
            Totaal huizen <span className="font-bold">(2025)</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="x"
                name="Groot HH abs"
                tick={{ fontSize: 11 }}
                label={{ value: 'Toename 3-4+ persoons HH (2025-2040)', position: 'insideBottom', offset: -5, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Voorraad"
                tick={{ fontSize: 11 }}
              />
              <ZAxis type="number" dataKey="z" range={[50, 400]} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ strokeDasharray: '3 3' }}
              />
              <Scatter data={scatter4Data.points} fill="var(--color-chart-4)" fillOpacity={0.6}>
                {scatter4Data.points.map((entry, index: number) => (
                  <Cell
                    key={`cell-4-${index}`}
                    fill={entry.code === selectedHighlightMunicipality ? "var(--color-chart-5)" : "var(--color-chart-4)"}
                    fillOpacity={entry.code === selectedHighlightMunicipality ? 1 : 0.6}
                    stroke={entry.code === selectedHighlightMunicipality ? "#000" : "none"}
                    strokeWidth={entry.code === selectedHighlightMunicipality ? 2 : 0}
                  />
                ))}
              </Scatter>
              <Line
                data={scatter4Data.trendline}
                type="monotone"
                dataKey="y"
                stroke="var(--color-chart-5)"
                strokeWidth={2}
                dot={false}
                legendType="none"
              />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground italic mt-2">
            Hoge groei grote huishoudens met beperkte voorraad suggereert capaciteitsproblemen voor gezinnen.
            R² = {scatter4Data.rSquared.toFixed(3)}
          </p>
        </div>
      </div>

      {/* 5. Total households vs total housing (full width) */}
      <div>
        <h3 className="text-lg font-medium mb-2">Totaal huishoudens vs totaal woongelegenheden (2025)</h3>
        <div className="text-sm font-medium ml-16 mb-1">
          Totaal aantal woongelegenheden <span className="font-bold">(2025)</span>
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              dataKey="x"
              name="Huishoudens"
              tick={{ fontSize: 11 }}
              label={{ value: 'Totaal aantal huishoudens (2025)', position: 'insideBottom', offset: -5, fontSize: 11 }}
              domain={scatter5XDomain}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Woningen"
              tick={{ fontSize: 11 }}
              domain={scatter5YDomain}
              tickFormatter={formatAxisInteger}
            />
            <ZAxis type="number" dataKey="z" range={[50, 400]} />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <Scatter data={scatter5Data.points} fill="var(--color-chart-1)" fillOpacity={0.6}>
              {scatter5Data.points.map((entry, index: number) => (
                <Cell
                  key={`cell-5-${index}`}
                  fill={entry.code === selectedHighlightMunicipality ? "var(--color-chart-5)" : "var(--color-chart-1)"}
                  fillOpacity={entry.code === selectedHighlightMunicipality ? 1 : 0.6}
                  stroke={entry.code === selectedHighlightMunicipality ? "#000" : "none"}
                  strokeWidth={entry.code === selectedHighlightMunicipality ? 2 : 0}
                />
              ))}
            </Scatter>
            <Line
              data={scatter5Data.trendline}
              type="monotone"
              dataKey="y"
              stroke="var(--color-chart-5)"
              strokeWidth={2}
              dot={false}
              name="OLS trendline"
            />
            <Line
              data={scatter5Data.referenceLine}
              type="monotone"
              dataKey="y"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name="Vlaams gemiddelde (1.14)"
            />
          </ScatterChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground italic mt-2">
          De stippellijn toont het Vlaams gemiddelde van 1.14 woningen per huishouden (frictionele leegstand, tweedeverblijven, studentenhuisvesting).
          Gemeenten onder deze lijn hebben relatief minder woningen per huishouden.
          R² = {scatter5Data.rSquared.toFixed(3)}
        </p>
      </div>

      <DataTable data={data} columns={columns} />
    </div>
  )
}
