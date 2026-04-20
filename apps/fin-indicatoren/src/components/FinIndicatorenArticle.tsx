"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@embuild/shared/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { cn } from "@embuild/shared/lib/utils"

type IndicatorGuideItem = {
  code: string
  label: string
  theme: string
  formula: string
  reading: string
}

type SeriesConfig = {
  key: string
  label: string
  color: string
}

type ChartPoint = {
  label: string
  sortValue: number
  [key: string]: string | number | null
}

type TableRow = {
  periodCells: [string]
  sortValue: number
  [key: string]: string | number | string[]
}

type ChapterIndicator = {
  code: string
  label: string
  theme: string
  kind: "percent" | "ratio" | "days" | "currency"
  summary: string
  tableLabel: string
  yAxisLabel: string
  highlightSeriesKey?: string
  series: SeriesConfig[]
  chartData: ChartPoint[]
  tableData: TableRow[]
  latestYear: number
}

type ModelGuideItem = {
  code: string
  label: string
  meaning: string
  interpretation: string
}

type Chapter = {
  key: string
  title: string
  intro: string
  indicators: ChapterIndicator[]
  modelGuide?: ModelGuideItem[]
}

export type FinIndicatorenArticleData = {
  title: string
  lead: string
  minYear: number
  latestYear: number
  sourceUrl: string
  indicatorGuide: IndicatorGuideItem[]
  chapters: Chapter[]
}

function formatBelgianNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function axisFormatterFor(kind: ChapterIndicator["kind"]) {
  if (kind === "percent") {
    return (value: number) => `${formatBelgianNumber(value, 0)}%`
  }
  if (kind === "ratio") {
    return (value: number) => formatBelgianNumber(value, 2)
  }
  if (kind === "days") {
    return (value: number) => formatBelgianNumber(value, 0)
  }
  return undefined
}

function SeriesSelector({
  indicator,
  selectedKey,
  onChange,
}: {
  indicator: ChapterIndicator
  selectedKey: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)

  const selectedLabel = React.useMemo(() => {
    if (selectedKey === "all") return "Alle reeksen"
    return indicator.series.find((item) => item.key === selectedKey)?.label ?? "Alle reeksen"
  }, [indicator.series, selectedKey])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 min-w-[180px] justify-between gap-2">
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[260px] p-0">
        <Command>
          <CommandList>
            <CommandGroup heading="Reeks">
              <CommandItem
                value="Alle reeksen"
                onSelect={() => {
                  onChange("all")
                  setOpen(false)
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4", selectedKey === "all" ? "opacity-100" : "opacity-0")}
                />
                Alle reeksen
              </CommandItem>
              {indicator.series.map((seriesItem) => (
                <CommandItem
                  key={seriesItem.key}
                  value={seriesItem.label}
                  onSelect={() => {
                    onChange(seriesItem.key)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedKey === seriesItem.key ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {seriesItem.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function IndicatorPanel({ indicator }: { indicator: ChapterIndicator }) {
  const yAxisFormatter = axisFormatterFor(indicator.kind)
  const [activeSeriesFilter, setActiveSeriesFilter] = React.useState("all")
  const allSeriesKeys = React.useMemo(() => indicator.series.map((item) => item.key), [indicator.series])

  React.useEffect(() => {
    setActiveSeriesFilter("all")
  }, [indicator.code])

  const visibleKeys = React.useMemo(() => {
    if (activeSeriesFilter === "all") return allSeriesKeys
    return [activeSeriesFilter]
  }, [activeSeriesFilter, allSeriesKeys])

  const filteredTableData = React.useMemo(() => {
    if (activeSeriesFilter === "all") return indicator.tableData
    const selectedSeries = indicator.series.find((item) => item.key === activeSeriesFilter)
    if (!selectedSeries) return indicator.tableData

    return indicator.tableData.filter((row) => {
      const label = Array.isArray(row.periodCells) ? row.periodCells[0] : null
      return label === selectedSeries.label
    })
  }, [activeSeriesFilter, indicator.series, indicator.tableData])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {indicator.theme}
        </p>
        <h3 className="text-xl font-semibold text-foreground">{indicator.label}</h3>
        <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
          {indicator.summary}
        </p>
      </div>

      <Tabs defaultValue="chart" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
          </TabsList>
          <SeriesSelector
            indicator={indicator}
            selectedKey={activeSeriesFilter}
            onChange={setActiveSeriesFilter}
          />
        </div>

        <TabsContent value="chart">
          <Card>
            <CardContent className="pt-6">
              <FilterableChart
                data={indicator.chartData}
                series={indicator.series}
                chartType="line"
                showMovingAverage={false}
                getLabel={(point) => String(point.label)}
                getSortValue={(point) => Number(point.sortValue)}
                yAxisLabelAbove={indicator.yAxisLabel}
                yAxisFormatter={yAxisFormatter}
                isCurrency={indicator.kind === "currency"}
                legendVisibleKeys={visibleKeys}
                highlightSeriesKey={indicator.highlightSeriesKey ?? null}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table">
          <Card>
            <CardContent className="pt-6">
              <FilterableTable
                data={filteredTableData}
                label={indicator.label}
                periodHeaders={[indicator.tableLabel]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ChapterSection({ chapter }: { chapter: Chapter }) {
  const defaultIndicator = chapter.indicators[0]?.code

  return (
    <section className="space-y-5">
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground">
          {chapter.title}
        </h2>
        <p className="max-w-4xl text-base leading-7 text-muted-foreground">
          {chapter.intro}
        </p>
      </div>

      {chapter.modelGuide ? (
        <Card>
          <CardHeader>
            <CardTitle>Modellen van jaarrekening</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {chapter.modelGuide.map((item) => (
              <div key={item.code} className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {item.code} - {item.label}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">{item.meaning}</p>
                <p className="text-sm leading-6 text-muted-foreground">{item.interpretation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue={defaultIndicator} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {chapter.indicators.map((indicator) => (
            <TabsTrigger key={indicator.code} value={indicator.code}>
              {indicator.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {chapter.indicators.map((indicator) => (
          <TabsContent key={indicator.code} value={indicator.code}>
            <IndicatorPanel indicator={indicator} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

export function FinIndicatorenArticle({
  article,
}: {
  article: FinIndicatorenArticleData
}) {
  return (
    <div className="not-prose space-y-12">
      <section className="space-y-4">
        <p className="max-w-4xl text-lg leading-8 text-muted-foreground">
          {article.lead}
        </p>
        <p className="text-sm text-muted-foreground">
          Beschikbare reeks: {article.minYear} t.e.m. {article.latestYear}. Bron:{" "}
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Nationale Bank van België
          </a>
          .
        </p>
      </section>

      <section className="space-y-5">
        <div className="space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            Indicatorengids
          </h2>
          <p className="max-w-4xl text-base leading-7 text-muted-foreground">
            Hieronder staan de gebruikte financiële indicatoren met hun formule en leeswijzer.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <ul className="space-y-4 pl-5">
              {article.indicatorGuide.map((item) => (
                <li key={item.code} className="space-y-1 marker:text-muted-foreground">
                  <p className="text-base font-semibold text-foreground">{item.label}</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {item.formula} {item.reading}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {article.chapters.map((chapter) => (
        <ChapterSection key={chapter.key} chapter={chapter} />
      ))}
    </div>
  )
}
