"use client"

import * as React from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@embuild/shared/components/ui/card"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { getLocalPublicPath } from "@embuild/shared/lib/path-utils"
import { CHART_SERIES_COLORS, CHART_THEME } from "@embuild/shared/lib/chart-theme"
import { LABOR_CATEGORIES, LABOR_SIZES, buildLaborChart, type LaborIndex } from "@/lib/price-revision"

function dateLabel(value: string | number): string {
  return new Date(typeof value === "number" ? value : `${value}T12:00:00`).toLocaleDateString("nl-BE")
}

export function LaborIndexChart() {
  const { data, loading, error } = useJsonBundle<{ labor: LaborIndex[] }>({ labor: "/data/labor_indices.json" })
  const [sizes, setSizes] = React.useState(["<10 werklieden"])
  const [categories, setCategories] = React.useState(["A"])
  const { series, points } = React.useMemo(
    () => buildLaborChart(data?.labor ?? [], sizes, categories), [data, sizes, categories]
  )
  const toggle = (values: string[], value: string) => values.includes(value)
    ? values.filter(item => item !== value) : [...values, value]

  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 className="text-2xl font-bold">Evolutie S-waarden</h2></CardTitle>
        <CardDescription>Lonen, sociale lasten en verzekeringen volgens FOD Economie. Selecteer meerdere werkgeversgroottes en categorieën om reeksen te vergelijken.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Aantal werknemers (werklieden)</legend>
            {LABOR_SIZES.map(size => (
              <label key={size.value} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={sizes.includes(size.value)} onChange={() => setSizes(values => toggle(values, size.value))} />
                {size.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Categorie</legend>
            {LABOR_CATEGORIES.map(category => (
              <label key={category.code} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm" title={category.description}>
                <input type="checkbox" checked={categories.includes(category.code)} onChange={() => setCategories(values => toggle(values, category.code))} />
                Categorie {category.code} (RSZ {category.rsz})
              </label>
            ))}
          </fieldset>
        </div>
        {loading ? <p role="status">S-waarden laden...</p> : error ? (
          <p role="alert" className="text-sm text-destructive">S-waarden konden niet worden geladen: {error}</p>
        ) : series.length === 0 ? (
          <p role="status">Selecteer minstens één werkgeversgrootte en één categorie.</p>
        ) : points.length === 0 ? (
          <p role="status">Geen S-waarden beschikbaar voor deze selectie.</p>
        ) : <>
          <p className="text-sm" role="status">{series.length} {series.length === 1 ? "reeks" : "reeksen"} geselecteerd. S-waarde in euro, geen index met basis 100.</p>
          <div className="h-[440px] min-w-0" role="img" aria-label={`Evolutie S-waarden: ${series.map(item => item.label).join("; ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={CHART_THEME.margin}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
                <XAxis dataKey="timestamp" type="number" domain={["dataMin", "dataMax"]} scale="time"
                  tickFormatter={value => new Date(value).toLocaleDateString("nl-BE", { year: "numeric", timeZone: "UTC" })}
                  tickLine={false} axisLine={false} fontSize={CHART_THEME.fontSize} />
                <YAxis tickFormatter={value => Number(value).toLocaleString("nl-BE")} tickLine={false} axisLine={false}
                  fontSize={CHART_THEME.fontSize} width={55} />
                <Tooltip contentStyle={CHART_THEME.tooltip} labelFormatter={value => dateLabel(Number(value))}
                  formatter={(value, name) => [typeof value === "number" ? value.toLocaleString("nl-BE", { minimumFractionDigits: 3 }) : "Niet beschikbaar", name]} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                {series.map(item => (
                  <Line key={item.id} dataKey={item.id} name={item.label} type="stepAfter" dot={false} connectNulls={false}
                    stroke={CHART_SERIES_COLORS[item.colorIndex % CHART_SERIES_COLORS.length]}
                    strokeDasharray={[undefined, "6 3", "2 3"][Math.floor(item.colorIndex / CHART_SERIES_COLORS.length)]}
                    strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">S-waarden en PDF-bronnen bekijken</summary>
            <div className="mt-3 max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead><tr><th scope="col" className="p-2">Reeks</th><th scope="col" className="p-2">Geldig vanaf (S)</th><th scope="col" className="p-2">Waarde (€)</th><th scope="col" className="p-2">Bron</th></tr></thead>
                <tbody>{series.flatMap(item => [...item.rows].sort((a, b) => (b.initial_effective_date ?? "").localeCompare(a.initial_effective_date ?? "")).map(row => (
                  <tr key={`${item.id}-${row.effective_date}`} className="border-t">
                    <th scope="row" className="p-2 font-normal">{item.label}</th>
                    <td className="p-2 whitespace-nowrap">{dateLabel(row.initial_effective_date ?? row.effective_date)}</td>
                    <td className="p-2">{row.value.toLocaleString("nl-BE", { minimumFractionDigits: 3 })}</td>
                    <td className="p-2">{row.source_pdf && row.source_page ? (
                      <a className="underline" href={`${getLocalPublicPath(row.source_pdf)}#page=${row.source_page}`} target="_blank" rel="noopener noreferrer">{row.circular}, p. {row.source_page}</a>
                    ) : row.circular}</td>
                  </tr>
                )))}</tbody>
              </table>
            </div>
          </details>
        </>}
        <p className="text-xs text-muted-foreground">
          Grote S volgt de gepubliceerde ingangsdatum voor aanbestedingen (offerten vanaf 11/06/2007).
          De lijn verandert alleen bij een nieuwe geldige waarde; ontbrekende periodes worden niet opgevuld.
          Vóór 2011 gebruikt de bron één gezamenlijke klasse voor werkgevers met 10 of meer werklieden.
        </p>
      </CardContent>
    </Card>
  )
}
