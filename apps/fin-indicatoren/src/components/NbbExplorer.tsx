"use client"

import * as React from "react"
import { Card, CardContent } from "@embuild/shared/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@embuild/shared/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import {
  FilterLabel,
  PresetChips,
  SelectedChips,
  SeriesPicker,
  assignColors,
  type PickerGroup,
  type PickerItem,
  type Preset,
} from "./explorer-controls"

type SeriesConfig = { key: string; label: string; color: string }
type ChartPoint = { label: string; sortValue: number; [key: string]: string | number | null }
type TableRow = {
  periodCells: [string]
  sortValue: number
  [key: string]: string | number | string[]
}

export type NbbIndicator = {
  code: string
  label: string
  theme: string
  kind: "percent" | "ratio" | "days" | "currency"
  summary: string
  yAxisLabel: string
  series: SeriesConfig[]
  chartData: ChartPoint[]
  tableData: TableRow[]
}

export type NbbChapter = {
  key: string
  title: string
  indicators: NbbIndicator[]
}

export type NbbGuideItem = { code: string; label: string; theme: string; formula: string; reading: string }
export type NbbModelGuideItem = { code: string; label: string; meaning: string; interpretation: string }

const GROUP_LABELS: Record<string, string> = {
  "peer-sectors": "Hoofdsectoren",
  subsectors: "Bouwsubsectoren",
  models: "Jaarrekeningmodel (bouw vs alle sectoren)",
}

function formatBelgianNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function axisFormatterFor(kind: NbbIndicator["kind"]) {
  if (kind === "percent") return (value: number) => `${formatBelgianNumber(value, 0)}%`
  if (kind === "ratio") return (value: number) => formatBelgianNumber(value, 2)
  if (kind === "days") return (value: number) => formatBelgianNumber(value, 0)
  return undefined
}

export function NbbExplorer({
  chapters,
  guide,
  modelGuide,
}: {
  chapters: NbbChapter[]
  guide: NbbGuideItem[]
  modelGuide?: NbbModelGuideItem[]
}) {
  const indicatorCodes = chapters[0]?.indicators.map((item) => item.code) ?? []
  const [indicatorCode, setIndicatorCode] = React.useState(indicatorCodes[0] ?? "")
  const [selected, setSelected] = React.useState<string[]>(["PU300", "alle_T"])

  // Alle reeksen uit de drie vergelijkingen, met groep en voorkeurskleur.
  const { groups, itemByKey, chapterOfKey } = React.useMemo(() => {
    const itemMap = new Map<string, PickerItem>()
    const chapterMap = new Map<string, string>()
    const pickerGroups: PickerGroup[] = chapters.map((chapter) => {
      const first = chapter.indicators[0]
      const items = (first?.series ?? []).map((series) => {
        const item: PickerItem = { key: series.key, label: series.label, color: series.color }
        itemMap.set(series.key, item)
        chapterMap.set(series.key, chapter.key)
        return item
      })
      return { key: chapter.key, label: GROUP_LABELS[chapter.key] ?? chapter.title, items }
    })
    return { groups: pickerGroups, itemByKey: itemMap, chapterOfKey: chapterMap }
  }, [chapters])

  const presets: Preset[] = React.useMemo(() => {
    const keysOf = (chapterKey: string) => groups.find((g) => g.key === chapterKey)?.items.map((i) => i.key) ?? []
    return [
      { key: "bouw-alle", label: "Bouw vs alle sectoren", keys: ["PU300", "alle_T"] },
      { key: "sectoren", label: "Alle hoofdsectoren", keys: keysOf("peer-sectors") },
      { key: "subsectoren", label: "Bouwsubsectoren", keys: keysOf("subsectors") },
      { key: "modellen", label: "Per jaarrekeningmodel", keys: keysOf("models") },
    ]
  }, [groups])

  const selectedItems = selected.map((key) => itemByKey.get(key)).filter((item): item is PickerItem => Boolean(item))
  const colors = React.useMemo(() => assignColors(selectedItems), [selectedItems])

  const indicatorsByTheme = React.useMemo(() => {
    const themes = new Map<string, NbbIndicator[]>()
    for (const indicator of chapters[0]?.indicators ?? []) {
      themes.set(indicator.theme, [...(themes.get(indicator.theme) ?? []), indicator])
    }
    return [...themes.entries()]
  }, [chapters])

  const indicatorPerChapter = chapters
    .map((chapter) => ({
      chapterKey: chapter.key,
      indicator: chapter.indicators.find((item) => item.code === indicatorCode),
    }))
    .filter((entry): entry is { chapterKey: string; indicator: NbbIndicator } => Boolean(entry.indicator))
  const current = indicatorPerChapter[0]?.indicator
  const guideItem = guide.find((item) => item.code === indicatorCode)

  const chartData = React.useMemo(() => {
    const rows = new Map<number, ChartPoint>()
    for (const { indicator } of indicatorPerChapter) {
      for (const point of indicator.chartData) {
        const target = rows.get(point.sortValue) ?? { label: point.label, sortValue: point.sortValue }
        for (const key of selected) {
          if (key in point) target[key] = point[key]
        }
        rows.set(point.sortValue, target)
      }
    }
    return [...rows.values()].sort((a, b) => a.sortValue - b.sortValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorCode, selected, chapters])

  const series = selectedItems.map((item) => ({ key: item.key, label: item.label, color: colors[item.key] }))

  const tableData = React.useMemo(() => {
    const byLabel = new Map<string, TableRow>()
    for (const { indicator } of indicatorPerChapter) {
      for (const row of indicator.tableData) byLabel.set(row.periodCells[0], row)
    }
    return selectedItems
      .map((item, index) => {
        const row = byLabel.get(item.label)
        return row ? { ...row, sortValue: selectedItems.length - index } : null
      })
      .filter((row): row is TableRow => row !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicatorCode, selected, chapters])

  const activeSummaries = indicatorPerChapter
    .filter(({ chapterKey }) => selected.some((key) => chapterOfKey.get(key) === chapterKey))
    .map(({ chapterKey, indicator }) => ({ chapterKey, text: indicator.summary }))

  if (!current) return null

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div>
            <FilterLabel>Snelle selectie</FilterLabel>
            <PresetChips presets={presets} selected={selected} onPick={setSelected} />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[260px]">
              <FilterLabel>Indicator</FilterLabel>
              <Select value={indicatorCode} onValueChange={setIndicatorCode}>
                <SelectTrigger className="h-9 w-full min-w-[260px]" aria-label="Indicator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {indicatorsByTheme.map(([theme, items]) => (
                    <SelectGroup key={theme}>
                      <SelectLabel>{theme}</SelectLabel>
                      {items.map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Reeksen</FilterLabel>
              <SeriesPicker groups={groups} selected={selected} onChange={setSelected} colors={colors} />
            </div>
          </div>

          <SelectedChips
            items={selectedItems}
            colors={colors}
            onRemove={(key) => setSelected((prev) => prev.filter((item) => item !== key))}
          />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{current.theme}</p>
        <h3 className="text-xl font-semibold text-foreground">{current.label}</h3>
        {guideItem ? (
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            {guideItem.formula} {guideItem.reading}
          </p>
        ) : null}
      </div>

      <Tabs defaultValue="chart" className="space-y-4">
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>
        <TabsContent value="chart">
          <Card>
            <CardContent className="pt-6">
              {series.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Geen reeksen geselecteerd. Kies een snelle selectie of voeg reeksen toe.
                </p>
              ) : (
                <FilterableChart
                  data={chartData}
                  series={series}
                  chartType="line"
                  showLegend={series.length <= 8}
                  showMovingAverage={false}
                  getLabel={(point) => String(point.label)}
                  getSortValue={(point) => Number(point.sortValue)}
                  yAxisLabelAbove={current.yAxisLabel}
                  yAxisFormatter={axisFormatterFor(current.kind)}
                  isCurrency={current.kind === "currency"}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="table">
          <Card>
            <CardContent className="pt-6">
              <FilterableTable data={tableData} label={current.label} periodHeaders={["Reeks"]} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {activeSummaries.length > 0 ? (
        <ul className="max-w-4xl list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
          {activeSummaries.map((item) => (
            <li key={item.chapterKey}>{item.text}</li>
          ))}
        </ul>
      ) : null}

      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Indicatorengids en modellen van jaarrekening
        </summary>
        <div className="mt-4 space-y-5">
          <ul className="space-y-3 pl-5">
            {guide.map((item) => (
              <li key={item.code} className="space-y-0.5 marker:text-muted-foreground">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {item.formula} {item.reading}
                </p>
              </li>
            ))}
          </ul>
          {modelGuide ? (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-semibold text-foreground">Modellen van jaarrekening</p>
              {modelGuide.map((item) => (
                <div key={item.code} className="space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {item.code} - {item.label}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">{item.meaning}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{item.interpretation}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  )
}
