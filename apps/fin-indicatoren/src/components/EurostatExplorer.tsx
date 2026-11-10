"use client"

import * as React from "react"
import { Download, Info } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Card, CardContent } from "@embuild/shared/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@embuild/shared/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import {
  FilterLabel,
  PresetChips,
  Segmented,
  SelectedChips,
  SeriesPicker,
  assignColors,
  type PickerGroup,
  type PickerItem,
  type Preset,
} from "./explorer-controls"

type Kind = "count" | "decimal" | "meur" | "teur" | "pct"
type Indicator = { code: string; label: string; unit: string; kind: Kind }
type Values = (number | null)[]
type Series = { key: string; label: string; level?: number; type?: string }

type NationalSet = {
  years: number[]
  indicators: Indicator[]
  series: Series[]
  values: Record<string, Record<string, Values>>
}
type RegionalSet = {
  years: number[]
  indicators: Indicator[]
  series: Series[]
  nace: { key: string; label: string }[]
  values: Record<string, Record<string, Record<string, Values>>>
}

export type EurostatData = {
  generatedAt: string
  sourceUrl: string
  apiGuideUrl: string
  breakYear: number
  datasets?: Record<string, string>
  excelDownload?: { href: string; filename: string }
  bouw: NationalSet
  sectors: NationalSet
  regional: RegionalSet
}

type View = "bouw" | "sectors" | "regional"
type ViewState = { indicator: string; selected: string[]; mode: "value" | "index"; nace: string }

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "bouw", label: "Bouw per subsector" },
  { value: "sectors", label: "Bouw vs andere sectoren" },
  { value: "regional", label: "Per gewest" },
]

const PALETTE = [
  "#0f4c81", "#e07a5f", "#2a9d8f", "#8c6d31", "#6d597a", "#b56576", "#457b9d", "#6b8f71",
  "#c08497", "#7f5539", "#4d908e", "#5c677d", "#d4a017", "#9b2226", "#3d405b", "#81b29a",
]
// Vaste kleuren voor de gewesten zodat ze in elke grafiek herkenbaar blijven.
const GEO_COLORS: Record<string, string> = {
  BE: "#5c677d", BE1: "#e07a5f", BE2: "#0f4c81", BE3: "#2a9d8f",
}

function formatNumber(value: number, digits: number) {
  return new Intl.NumberFormat("nl-BE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

function formatterFor(kind: Kind, mode: "value" | "index") {
  if (mode === "index") return (value: number) => formatNumber(value, 0)
  if (kind === "pct") return (value: number) => `${formatNumber(value, 1)}%`
  if (kind === "decimal" || kind === "teur") return (value: number) => formatNumber(value, 1)
  return (value: number) => formatNumber(value, 0)
}

function indexed(values: Values): Values {
  const base = values.find((v) => v !== null && v !== 0)
  if (base === undefined || base === null) return values.map(() => null)
  return values.map((v) => (v === null ? null : (v / base) * 100))
}

function pick(keys: string[], available: Set<string>) {
  return keys.filter((key) => available.has(key))
}

function initialState(data: EurostatData): Record<View, ViewState> {
  return {
    bouw: { indicator: "ENT", selected: ["F", "F41", "F42", "F43"], mode: "value", nace: "F" },
    sectors: { indicator: "VA", selected: ["F", "C", "G", "M"], mode: "index", nace: "F" },
    regional: {
      indicator: data.regional.indicators[0]?.code ?? "LOC",
      selected: ["BE2", "BE1", "BE3"],
      mode: "value",
      nace: "F",
    },
  }
}

export type EurostatInitialState = {
  dataset?: string
  indicator?: string
  series?: string[]
  mode?: string
  nace?: string
  tab?: "chart" | "table"
}

export function EurostatExplorer({ data, initial }: { data: EurostatData; initial?: EurostatInitialState }) {
  const startView: View = initial?.dataset === "sectors" || initial?.dataset === "regional" ? initial.dataset : "bouw"
  const [view, setView] = React.useState<View>(startView)
  const [tab, setTab] = React.useState<"chart" | "table">(initial?.tab ?? "chart")
  const [states, setStates] = React.useState<Record<View, ViewState>>(() => {
    const base = initialState(data)
    if (!initial) return base
    const set = startView === "regional" ? data.regional : startView === "bouw" ? data.bouw : data.sectors
    const known = new Set(set.series.map((item) => item.key))
    const series = (initial.series ?? []).filter((key) => known.has(key))
    base[startView] = {
      indicator: set.indicators.some((item) => item.code === initial.indicator) ? (initial.indicator as string) : base[startView].indicator,
      selected: series.length > 0 ? series : base[startView].selected,
      mode: initial.mode === "index" ? "index" : initial.mode === "value" ? "value" : base[startView].mode,
      nace: startView === "regional" && data.regional.nace.some((item) => item.key === initial.nace) ? (initial.nace as string) : base[startView].nace,
    }
    return base
  })
  const state = states[view]
  const update = (patch: Partial<ViewState>) => setStates((prev) => ({ ...prev, [view]: { ...prev[view], ...patch } }))

  const regional = view === "regional"
  const dataset = regional ? data.regional : view === "bouw" ? data.bouw : data.sectors
  const indicators = dataset.indicators
  const indicator = indicators.find((item) => item.code === state.indicator) ?? indicators[0]
  const years = dataset.years

  const groups: PickerGroup[] = React.useMemo(() => {
    const toItem = (s: Series, color?: string): PickerItem => ({
      key: s.key,
      label: s.label,
      color,
      hint: view === "bouw" ? s.key : undefined,
    })
    if (view === "bouw") {
      const bySeries = data.bouw.series
      const levelGroup = (level: number, label: string) => ({
        key: `l${level}`,
        label,
        items: bySeries.filter((s) => s.level === level).map((s, i) => toItem(s, PALETTE[i % PALETTE.length])),
      })
      return [
        levelGroup(0, "Totaal bouw"),
        levelGroup(2, "Afdelingen (F41, F42, F43)"),
        levelGroup(3, "Groepen (3 cijfers)"),
        levelGroup(4, "Klassen (4 cijfers)"),
      ]
    }
    if (view === "sectors") {
      const all = data.sectors.series
      return [
        { key: "bouw", label: "Bouw en totaal", items: all.filter((s) => s.key === "F" || s.key === "ECON").map((s) => toItem(s, s.key === "F" ? "#0f4c81" : "#5c677d")) },
        { key: "sec", label: "Andere sectoren", items: all.filter((s) => s.key !== "F" && s.key !== "ECON").map((s, i) => toItem(s, PALETTE[(i + 1) % PALETTE.length])) },
      ]
    }
    const geo = data.regional.series
    return [
      { key: "land", label: "België en gewesten", items: geo.filter((s) => s.type !== "provincie").map((s) => toItem(s, GEO_COLORS[s.key])) },
      { key: "vl", label: "Vlaamse provincies", items: geo.filter((s) => s.key.startsWith("BE2") && s.key.length === 4).map((s, i) => toItem(s, PALETTE[i])) },
      { key: "wa", label: "Waalse provincies", items: geo.filter((s) => s.key.startsWith("BE3") && s.key.length === 4).map((s, i) => toItem(s, PALETTE[i + 5])) },
    ]
  }, [view, data])

  const allItems = React.useMemo(() => new Map(groups.flatMap((g) => g.items).map((i) => [i.key, i])), [groups])
  const available = React.useMemo(() => new Set(allItems.keys()), [allItems])
  const keysOf = (groupKey: string) => groups.find((g) => g.key === groupKey)?.items.map((i) => i.key) ?? []

  const presets: Preset[] = React.useMemo(() => {
    if (view === "bouw") {
      return [
        { key: "afd", label: "Totaal en afdelingen", keys: pick(["F", "F41", "F42", "F43"], available) },
        { key: "spec", label: "Gespecialiseerde bouw", keys: pick(["F431", "F432", "F433", "F439"], available) },
        { key: "grp", label: "Alle groepen", keys: keysOf("l3") },
        { key: "kl", label: "Alle klassen", keys: keysOf("l4") },
      ]
    }
    if (view === "sectors") {
      return [
        { key: "econ", label: "Bouw vs totale economie", keys: pick(["F", "ECON"], available) },
        { key: "grote", label: "Bouw vs grote sectoren", keys: pick(["F", "C", "G", "M"], available) },
        { key: "alle", label: "Alle sectoren", keys: [...pick(["F"], available), ...keysOf("sec")] },
      ]
    }
    return [
      { key: "gew", label: "Gewesten", keys: pick(["BE2", "BE1", "BE3"], available) },
      { key: "be", label: "België en gewesten", keys: keysOf("land") },
      { key: "vl", label: "Vlaamse provincies", keys: keysOf("vl") },
      { key: "wa", label: "Waalse provincies", keys: keysOf("wa") },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, groups, available])

  const selectedItems = state.selected.map((key) => allItems.get(key)).filter((i): i is PickerItem => Boolean(i))
  const colors = React.useMemo(() => assignColors(selectedItems), [selectedItems])

  const valuesFor = React.useCallback(
    (key: string): Values => {
      const raw = regional
        ? data.regional.values[indicator.code]?.[state.nace]?.[key]
        : (dataset as NationalSet).values[indicator.code]?.[key]
      const row = raw ?? years.map(() => null)
      return state.mode === "index" ? indexed(row) : row
    },
    [regional, data, dataset, indicator.code, state.nace, state.mode, years]
  )

  // Elke reeks wordt in twee lijnen gesplitst (SBS t.e.m. 2020, EBS vanaf 2021) zodat de reeksbreuk zichtbaar blijft.
  const chart = React.useMemo(() => {
    const rows = years.map((year) => ({ label: String(year), sortValue: year } as Record<string, string | number | null>))
    const lines: { key: string; label: string; color: string }[] = []
    for (const item of selectedItems) {
      const values = valuesFor(item.key)
      const nextKey = `${item.key}__ebs`
      years.forEach((year, i) => {
        const isNew = year >= data.breakYear
        rows[i][item.key] = isNew ? null : values[i]
        rows[i][nextKey] = isNew ? values[i] : null
      })
      lines.push({ key: item.key, label: item.label, color: colors[item.key] })
      lines.push({ key: nextKey, label: item.label, color: colors[item.key] })
    }
    return { rows, lines, legendKeys: selectedItems.map((i) => i.key) }
  }, [selectedItems, valuesFor, years, colors, data.breakYear])

  const tableRows = selectedItems.map((item, index) => {
    const values = valuesFor(item.key)
    const row: Record<string, string | number | string[]> = {
      periodCells: [item.label],
      sortValue: selectedItems.length - index,
    }
    const fmt = formatterFor(indicator.kind, state.mode)
    years.forEach((year, i) => {
      const v = values[i]
      row[`y${year}`] = v === null ? "-" : fmt(v)
    })
    return row
  })

  const unitLabel = state.mode === "index" ? `index, eerste beschikbaar jaar = 100` : indicator.unit
  const naceLabel = regional ? data.regional.nace.find((n) => n.key === state.nace)?.label : null
  const seriesHeader = regional ? "Regio" : view === "bouw" ? "Subsector" : "Sector"

  const exportRows = selectedItems
    .flatMap((item) => {
      const values = valuesFor(item.key)
      return years.map((year, i) => ({
        label: item.label,
        value: values[i],
        periodCells: [item.label, year],
      }))
    })
    .filter((row) => row.value !== null)

  return (
    <div className="space-y-5">
      <Segmented value={view} options={VIEW_OPTIONS} onChange={setView} ariaLabel="Soort vergelijking" />

      <Card>
        <CardContent className="space-y-5 pt-6">
          <div>
            <FilterLabel>Snelle selectie</FilterLabel>
            <PresetChips presets={presets} selected={state.selected} onPick={(keys) => update({ selected: keys })} />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[260px]">
              <FilterLabel>Indicator</FilterLabel>
              <Select value={indicator.code} onValueChange={(value) => update({ indicator: value })}>
                <SelectTrigger className="h-9 w-full min-w-[260px]" aria-label="Indicator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {indicators.map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {regional ? (
              <div className="min-w-[220px]">
                <FilterLabel>Sector</FilterLabel>
                <Select value={state.nace} onValueChange={(value) => update({ nace: value })}>
                  <SelectTrigger className="h-9 w-full min-w-[220px]" aria-label="Sector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.regional.nace.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div>
              <FilterLabel>{seriesHeader}</FilterLabel>
              <SeriesPicker
                groups={groups}
                selected={state.selected}
                onChange={(keys) => update({ selected: keys })}
                colors={colors}
                triggerLabel={`${seriesHeader} kiezen`}
              />
            </div>

            <div>
              <FilterLabel>Waarden</FilterLabel>
              <Segmented
                value={state.mode}
                options={[
                  { value: "value", label: "Absoluut" },
                  { value: "index", label: "Index" },
                ]}
                onChange={(mode) => update({ mode })}
                ariaLabel="Absolute waarden of index"
              />
            </div>
          </div>

          <SelectedChips
            items={selectedItems}
            colors={colors}
            onRemove={(key) => update({ selected: state.selected.filter((k) => k !== key) })}
          />
        </CardContent>
      </Card>

      <div className="space-y-1">
        <h3 className="text-xl font-semibold text-foreground">
          {indicator.label}
          {naceLabel ? <span className="font-normal text-muted-foreground"> | {naceLabel}</span> : null}
        </h3>
        <p className="text-sm text-muted-foreground">
          Eenheid: {unitLabel}. Beschikbaar: {years[0]} t.e.m. {years[years.length - 1]}.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "chart" | "table")} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
          </TabsList>
          <ExportButtons
            data={exportRows}
            title={`Eurostat SBS: ${indicator.label}`}
            slug="fin-indicatoren"
            sectionId="eurostat"
            viewType={tab}
            periodHeaders={[seriesHeader, "Jaar"]}
            valueLabel={`${indicator.label} (${unitLabel})`}
            dataSource="Eurostat - Structural Business Statistics"
            dataSourceUrl={data.sourceUrl}
            embedParams={{
              dataset: view,
              indicator: indicator.code,
              series: state.selected.join(","),
              mode: state.mode,
              nace: regional ? state.nace : null,
            }}
          />
        </div>
        <TabsContent value="chart">
          <Card>
            <CardContent className="pt-6">
              {selectedItems.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Geen reeksen geselecteerd. Kies een snelle selectie of voeg reeksen toe.
                </p>
              ) : (
                <FilterableChart
                  data={chart.rows}
                  series={chart.lines}
                  legendVisibleKeys={chart.legendKeys}
                  chartType="line"
                  showLegend={selectedItems.length <= 8}
                  showMovingAverage={false}
                  getLabel={(point) => String(point.label)}
                  getSortValue={(point) => Number(point.sortValue)}
                  yAxisLabelAbove={`${indicator.label} (${unitLabel})`}
                  yAxisFormatter={formatterFor(indicator.kind, state.mode)}
                  tooltipUsesYAxisFormatter
                  yAxisStartFromZero={state.mode === "value"}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="table">
          <Card>
            <CardContent className="pt-6">
              <FilterableTable data={tableRows} label={indicator.label} periodHeaders={[seriesHeader]} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex max-w-4xl gap-2 rounded-lg border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
        <Info className="mt-1 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p>
            <strong className="font-semibold text-foreground">Reeksbreuk {data.breakYear - 1}-{data.breakYear}.</strong>{" "}
            Eurostat publiceert tot en met 2020 (SBS) en vanaf 2021 (EBS) met een nieuwe methodologie en afbakening.
            De lijn is daarom onderbroken: vergelijk niveaus over die grens heen met voorzichtigheid. Ook de benaming van
            enkele indicatoren verschilt tussen beide reeksen, bijvoorbeeld toegevoegde waarde tegen factorkost (tot 2020) en
            toegevoegde waarde (vanaf 2021), of omzet en nettoomzet.
          </p>
          {regional ? (
            <p>
              Regionale cijfers gaan over vestigingen (lokale eenheden) en niet over ondernemingen. Een bedrijf met
              vestigingen in meerdere gewesten telt in elk gewest mee.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function EurostatDownload({ excel }: { excel?: { href: string; filename: string } }) {
  if (!excel) return null
  return (
    <Button asChild variant="outline" size="sm" className="gap-2">
      <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${excel.href}`} download={excel.filename}>
        <Download className="h-4 w-4" />
        Download alle Eurostat-data in Excel
      </a>
    </Button>
  )
}
