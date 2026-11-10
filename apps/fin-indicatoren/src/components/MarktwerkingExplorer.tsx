"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Download, Info } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Card, CardContent } from "@embuild/shared/components/ui/card"
import { Input } from "@embuild/shared/components/ui/input"
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
import { cn } from "@embuild/shared/lib/utils"
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

type Num = number | null | undefined
type ScreeningRow = {
  nace: string
  label: string
  group: string
  turnover: number | string | null
  firms: number | null
  rankOf: number
  ranks: Record<string, number>
  values: Record<string, number>
}
type MarginSeries = { key: string; nace: string; label: string; group: string; firms: Num; turnover: Num }

export type MarktwerkingData = {
  edition: number
  sourceUrl: string
  marginYears: number[]
  turnoverYear: { screening: number; margins: number }
  indicators: { code: string; label: string }[]
  screening: ScreeningRow[]
  margins: {
    measures: { code: string; label: string; unit: string }[]
    series: MarginSeries[]
    values: Record<string, Record<string, (number | null)[]>>
  }
  excelDownload?: { href: string; filename: string }
}

type View = "screening" | "margins"
type Show = "rank" | "value"
type SortState = { column: string; dir: "asc" | "desc" }
type Group = "Bouw" | "Bouwmaterialen (industrie)" | "all"

export type MarktwerkingInitialState = {
  part?: string
  measure?: string
  series?: string[]
  group?: string
  show?: string
  tab?: "chart" | "table"
}

const PALETTE = [
  "#0f4c81", "#e07a5f", "#2a9d8f", "#8c6d31", "#6d597a", "#b56576", "#457b9d", "#6b8f71",
  "#c08497", "#7f5539", "#4d908e", "#5c677d", "#d4a017", "#9b2226", "#3d405b", "#81b29a",
]

const nf = (value: number, digits = 0) =>
  new Intl.NumberFormat("nl-BE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)

function formatValue(code: string, value: number) {
  if (code === "AB" || code === "TNF8") return nf(value, 0)
  return new Intl.NumberFormat("nl-BE", { maximumSignificantDigits: 3 }).format(value)
}

function formatTurnover(value: number | string | null) {
  if (value === null || value === undefined) return "-"
  return typeof value === "number" ? nf(value, 0) : value
}

function heat(rank: number | undefined, total: number) {
  if (rank === undefined) return undefined
  const strength = Math.pow(1 - (rank - 1) / Math.max(total - 1, 1), 2.2)
  return `rgba(224, 122, 95, ${(0.08 + strength * 0.62).toFixed(2)})`
}

function ScreeningView({ data, initial }: { data: MarktwerkingData; initial?: MarktwerkingInitialState }) {
  const [group, setGroup] = React.useState<Group>(
    initial?.group === "Bouwmaterialen (industrie)" || initial?.group === "all" ? initial.group : "Bouw"
  )
  const [show, setShow] = React.useState<Show>(initial?.show === "value" ? "value" : "rank")
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<SortState>({ column: "IC", dir: "asc" })

  const rows = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = data.screening.filter(
      (row) =>
        (group === "all" || row.group === group) &&
        (!needle || row.label.toLowerCase().includes(needle) || row.nace.startsWith(needle))
    )
    const pickValue = (row: ScreeningRow): number => {
      if (sort.column === "turnover") return typeof row.turnover === "number" ? row.turnover : -1
      if (sort.column === "firms") return row.firms ?? -1
      if (sort.column === "nace") return Number(row.nace)
      const source = show === "rank" ? row.ranks : row.values
      // Rang: relatief aan het aantal gescreende sectoren, zodat diensten (369) en industrie (223) vergelijkbaar blijven.
      return show === "rank" ? (source[sort.column] ?? Infinity) / row.rankOf : (source[sort.column] ?? -Infinity)
    }
    return [...filtered].sort((a, b) => (sort.dir === "asc" ? 1 : -1) * (pickValue(a) - pickValue(b)))
  }, [data.screening, group, query, sort, show])

  const exportRows = React.useMemo(
    () =>
      rows.flatMap((row) =>
        data.indicators
          .filter((i) => i.code !== "AB")
          .map((i) => ({
            label: row.label,
            value: (show === "rank" ? row.ranks[i.code] : row.values[i.code]) ?? null,
            periodCells: [row.nace, row.label, i.label],
          }))
      ).filter((row) => row.value !== null),
    [rows, data.indicators, show]
  )

  const toggleSort = (column: string) =>
    setSort((prev) => (prev.column === column ? { column, dir: prev.dir === "asc" ? "desc" : "asc" } : { column, dir: "asc" }))

  const head = (column: string, label: string, align = "text-right") => (
    <th
      key={column}
      scope="col"
      aria-sort={sort.column === column ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("whitespace-nowrap px-2 py-2 font-medium", align)}
    >
      <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.column === column ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
      </button>
    </th>
  )

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <FilterLabel>Sectoren</FilterLabel>
              <Segmented
                value={group}
                options={[
                  { value: "Bouw", label: "Bouw" },
                  { value: "Bouwmaterialen (industrie)", label: "Bouwmaterialen" },
                  { value: "all", label: "Beide" },
                ]}
                onChange={setGroup}
                ariaLabel="Groep van sectoren"
              />
            </div>
            <div>
              <FilterLabel>Tonen</FilterLabel>
              <Segmented
                value={show}
                options={[
                  { value: "rank", label: "Rang" },
                  { value: "value", label: "Waarde" },
                ]}
                onChange={setShow}
                ariaLabel="Rang of waarde"
              />
            </div>
            <div className="min-w-[220px] flex-1">
              <FilterLabel>Zoek een sector</FilterLabel>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="bv. dakwerk, cement of 4391" />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Klik op een kolomtitel om te sorteren. {nf(rows.length)} sectoren getoond. Omzet en aantal ondernemingen
              zijn van {data.turnoverYear.screening}.
            </p>
            <ExportButtons
              data={exportRows}
              title="Marktwerking: screening bouw"
              slug="fin-indicatoren"
              sectionId="marktwerking"
              viewType="table"
              periodHeaders={["NACE", "Omschrijving", "Indicator"]}
              valueLabel={show === "rank" ? "Rang" : "Waarde"}
              dataSource="FOD Economie - Horizontale screening van sectoren"
              dataSourceUrl={data.sourceUrl}
              embedParams={{ part: "screening", group, show }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="max-h-[620px] overflow-auto rounded-lg border">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
            <tr>
              {head("nace", "NACE", "text-left")}
              <th scope="col" className="px-2 py-2 text-left font-medium">Omschrijving</th>
              {head("turnover", "Omzet (mln euro)")}
              {head("firms", "Ondernemingen")}
              {data.indicators.filter((i) => i.code !== "AB").map((i) => head(i.code, i.label))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.group}-${row.nace}`} className="border-t">
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">{row.nace}</td>
                <td className="min-w-[240px] px-2 py-1.5">
                  {row.label}
                  {group === "all" ? <span className="ml-1 text-xs text-muted-foreground">({row.group === "Bouw" ? "bouw" : "materialen"})</span> : null}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{formatTurnover(row.turnover)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{row.firms === null ? "-" : nf(row.firms)}</td>
                {data.indicators.filter((i) => i.code !== "AB").map((i) => {
                  const rank = row.ranks[i.code]
                  const value = row.values[i.code]
                  return (
                    <td
                      key={i.code}
                      className="px-2 py-1.5 text-right tabular-nums"
                      style={{ backgroundColor: heat(rank, row.rankOf) }}
                      title={rank !== undefined ? `Rang ${nf(rank, rank % 1 ? 1 : 0)} van ${row.rankOf}` : undefined}
                    >
                      {show === "rank"
                        ? rank === undefined ? "-" : nf(rank, rank % 1 ? 1 : 0)
                        : value === undefined ? "-" : formatValue(i.code, value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex max-w-4xl gap-2 rounded-lg border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
        <Info className="mt-1 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p>
            <strong className="font-semibold text-foreground">Zo lees je de rang.</strong> Rang 1 is de score die op de
            minste concurrentiedruk wijst, een hoge rang op meer concurrentie. Bij concentratie (HHI) staat een hoge
            concentratie dus bij een lage rang, net als weinig bedrijven of een hoge prijs-kostmarge. Hoe oranjer de cel,
            hoe lager de rang. De rang is op 369 diensten- en 223 industriële sectoren; kleur en sortering houden daar rekening mee.
          </p>
          <p>
            Voor de berekening van de indicatoren en de interpretatie: zie het{" "}
            <a href={data.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
              methodologisch rapport van FOD Economie
            </a>
            . Importpenetratie bestaat enkel voor industriële sectoren.
          </p>
        </div>
      </div>
    </div>
  )
}

function MarginsView({ data, initial }: { data: MarktwerkingData; initial?: MarktwerkingInitialState }) {
  const { measures, series, values } = data.margins
  const years = data.marginYears
  const [measure, setMeasure] = React.useState(
    measures.some((m) => m.code === initial?.measure) ? (initial?.measure as string) : measures[0].code
  )
  const knownKeys = React.useMemo(() => new Set(series.map((s) => s.key)), [series])
  const [selected, setSelected] = React.useState<string[]>(() => {
    const fromUrl = (initial?.series ?? []).filter((key) => knownKeys.has(key))
    return fromUrl.length > 0 ? fromUrl : ["d2_41", "d2_42", "d2_43"]
  })
  const [tab, setTab] = React.useState<"chart" | "table">(initial?.tab ?? "chart")

  const groups: PickerGroup[] = React.useMemo(() => {
    const order = ["Bouw (NACE 2)", "Bouw (NACE 4)", "Diensten (NACE 2)", "Industrie (NACE 2)", "Diensten (NACE 4)"]
    return order.map((name, gi) => ({
      key: name,
      label: name,
      items: series
        .filter((s) => s.group === name)
        .map((s, i) => ({ key: s.key, label: s.label, color: PALETTE[(i + gi * 3) % PALETTE.length], hint: s.nace })),
    }))
  }, [series])

  const itemMap = React.useMemo(() => new Map(groups.flatMap((g) => g.items).map((i) => [i.key, i])), [groups])
  const keysOf = (name: string) => groups.find((g) => g.key === name)?.items.map((i) => i.key) ?? []
  const presets: Preset[] = [
    { key: "n2", label: "Bouw (NACE 2)", keys: keysOf("Bouw (NACE 2)") },
    { key: "n4", label: "Alle bouwsubsectoren (NACE 4)", keys: keysOf("Bouw (NACE 4)") },
    { key: "vs", label: "Bouw vs handel en industrie", keys: ["d2_41", "d2_42", "d2_43", "d2_45", "d2_46", "d2_47", "i2_23"].filter((k) => itemMap.has(k)) },
  ]

  const selectedItems = selected.map((k) => itemMap.get(k)).filter((i): i is PickerItem => Boolean(i))
  const colors = React.useMemo(() => assignColors(selectedItems), [selectedItems])
  const current = measures.find((m) => m.code === measure) ?? measures[0]
  const fmt = (v: number) => `${nf(v, 1)}%`

  const rows = years.map((year, i) => {
    const row: Record<string, string | number | null> = { label: String(year), sortValue: year }
    for (const item of selectedItems) row[item.key] = values[measure]?.[item.key]?.[i] ?? null
    return row
  })
  const tableRows = selectedItems.map((item, idx) => {
    const row: Record<string, string | number | string[]> = { periodCells: [item.label], sortValue: selectedItems.length - idx }
    years.forEach((year, i) => {
      const v = values[measure]?.[item.key]?.[i]
      row[`y${year}`] = v === null || v === undefined ? "-" : fmt(v)
    })
    return row
  })

  const exportRows = selectedItems
    .flatMap((item) =>
      years.map((year, i) => ({
        label: item.label,
        value: values[measure]?.[item.key]?.[i] ?? null,
        periodCells: [item.label, year],
      }))
    )
    .filter((row) => row.value !== null)

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div>
            <FilterLabel>Snelle selectie</FilterLabel>
            <PresetChips presets={presets} selected={selected} onPick={setSelected} />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[280px]">
              <FilterLabel>Maat</FilterLabel>
              <Select value={measure} onValueChange={setMeasure}>
                <SelectTrigger className="h-9 w-full min-w-[280px]" aria-label="Maat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {measures.map((m) => (
                    <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Sectoren</FilterLabel>
              <SeriesPicker groups={groups} selected={selected} onChange={setSelected} colors={colors} triggerLabel="Sectoren kiezen" />
            </div>
          </div>
          <SelectedChips items={selectedItems} colors={colors} onRemove={(k) => setSelected((p) => p.filter((x) => x !== k))} />
        </CardContent>
      </Card>

      <h3 className="text-xl font-semibold text-foreground">
        {current.label} <span className="font-normal text-muted-foreground">| {years[0]} t.e.m. {years[years.length - 1]}</span>
      </h3>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "chart" | "table")} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
          </TabsList>
          <ExportButtons
            data={exportRows}
            title={`Marktwerking: ${current.label}`}
            slug="fin-indicatoren"
            sectionId="marktwerking"
            viewType={tab}
            periodHeaders={["Sector", "Jaar"]}
            valueLabel={`${current.label} (%)`}
            dataSource="FOD Economie - Horizontale screening van sectoren"
            dataSourceUrl={data.sourceUrl}
            embedParams={{ part: "margins", measure, series: selected.join(",") }}
          />
        </div>
        <TabsContent value="chart">
          <Card>
            <CardContent className="pt-6">
              {selectedItems.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Geen sectoren geselecteerd. Kies een snelle selectie of voeg sectoren toe.</p>
              ) : (
                <FilterableChart
                  data={rows}
                  series={selectedItems.map((i) => ({ key: i.key, label: i.label, color: colors[i.key] }))}
                  chartType="line"
                  showLegend={selectedItems.length <= 8}
                  showMovingAverage={false}
                  getLabel={(p) => String(p.label)}
                  getSortValue={(p) => Number(p.sortValue)}
                  yAxisLabelAbove={`${current.label} (%)`}
                  yAxisFormatter={(v) => `${nf(v, 0)}%`}
                  tooltipUsesYAxisFormatter
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="table">
          <Card>
            <CardContent className="pt-6">
              <FilterableTable data={tableRows} label={current.label} periodHeaders={["Sector"]} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
        Geglobaliseerd is het totaal over alle bedrijven van de sector, de mediaan het typische bedrijf. Zo kan een
        sector met enkele grote spelers anders scoren dan de doorsnee onderneming. Omzet en aantal ondernemingen zijn
        van {data.turnoverYear.margins}.
      </p>
    </div>
  )
}

export function MarktwerkingExplorer({ data, initial }: { data: MarktwerkingData; initial?: MarktwerkingInitialState }) {
  // Standaard de evolutie van de marges; de screening is een vervolgstap.
  const [view, setView] = React.useState<View>(initial?.part === "screening" ? "screening" : "margins")
  return (
    <div className="space-y-5">
      <Segmented
        value={view}
        options={[
          { value: "margins", label: "Evolutie van de marges" },
          { value: "screening", label: "Screening marktwerking" },
        ]}
        onChange={setView}
        ariaLabel="Onderdeel"
      />
      {view === "screening" ? <ScreeningView data={data} initial={initial} /> : <MarginsView data={data} initial={initial} />}
    </div>
  )
}

export function MarktwerkingDownload({ excel }: { excel?: { href: string; filename: string } }) {
  if (!excel) return null
  return (
    <Button asChild variant="outline" size="sm" className="gap-2">
      <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${excel.href}`} download={excel.filename}>
        <Download className="h-4 w-4" />
        Download alle marktwerking-data in Excel
      </a>
    </Button>
  )
}
