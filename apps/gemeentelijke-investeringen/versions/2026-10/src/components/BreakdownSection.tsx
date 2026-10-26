"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { AnalysisOnly } from "@embuild/shared/components/shared/AnalysisOnly"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import { useIsEmbedRoute } from "@embuild/shared/lib/use-is-embed-route"
import { SLUG } from "@/lib/sections"
import {
  CUBE_SOURCE, DOMAIN_COLORS, FLANDERS, GeoFilter, ToggleGroup, geoName, isMunicipality, perInhabitant, projectsLink,
  useGeoData, useGeoIndex, type CubeSource, type GeoData,
} from "./geo"

const SOURCE_URL = "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien"
const PERIODS = [2014, 2020, 2026] as const
const TOP_ACCOUNTS = 9
const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const euroCents = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })

export type Metric = "total" | "capita"

interface Item {
  key: string
  label: string
  detail?: string
  value: number
  color: string
  category?: string
  children: { label: string; value: number }[]
}

type Group = { label: string; detail?: string; category?: string; byYear: Map<number, number>; children: Map<string, Map<number, number>> }

function addTo(map: Map<number, number>, year: number, amount: number) {
  map.set(year, (map.get(year) ?? 0) + amount)
}

function measure(byYear: Map<number, number>, metric: Metric, population: GeoData["population"]) {
  return metric === "total"
    ? Array.from(byYear.values()).reduce((sum, value) => sum + value, 0)
    : perInhabitant(byYear, population)
}

export function BreakdownSection({
  kind,
  initialGeo = FLANDERS,
  initialMetric = "total",
  initialPeriod = 2026,
  initialSource = "latest",
}: {
  kind: "bv" | "rek"
  initialGeo?: string
  initialMetric?: Metric
  initialPeriod?: number
  initialSource?: CubeSource
}) {
  const isEmbed = useIsEmbedRoute()
  const [geo, setGeo] = useState(initialGeo)
  const [metric, setMetric] = useState<Metric>(initialMetric)
  const [period, setPeriod] = useState<number>((PERIODS as readonly number[]).includes(initialPeriod) ? initialPeriod : 2026)
  const [source, setSource] = useState<CubeSource>(initialSource)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  useEffect(() => setGeo(initialGeo), [initialGeo])
  const { data: index } = useGeoIndex()
  const { data, error } = useGeoData(geo)
  const effectiveSource: CubeSource = period === 2026 ? "latest" : source
  const sectionId = kind === "bv" ? "investments-bv-breakdown" : "investments-rek-breakdown"
  const baseTitle = kind === "bv" ? "Verdeling per beleidsdomein" : "Verdeling per algemene rekening (REK)"
  const place = geoName(index, geo)
  const title = `${baseTitle} - ${place}, ${period}-${period + 5}`

  const groupsByPeriod = useMemo(() => {
    if (!index || !data) return null
    const sourceIndex = CUBE_SOURCE[effectiveSource]
    return new Map(PERIODS.map((start) => {
      const groups = new Map<string, Group>()
      for (const [rowSource, year, subdomain, account, amount] of data.cube) {
        if (rowSource !== sourceIndex || year < start || year > start + 5) continue
        const sub = index.subdomains[subdomain]
        const domain = index.domains[sub.domain]
        const accountInfo = index.accounts[account]
        const key = kind === "bv" ? domain.label : accountInfo.label
        if (!groups.has(key)) {
          groups.set(key, kind === "bv"
            ? { label: domain.name, category: domain.project_category, byYear: new Map(), children: new Map() }
            : { label: accountInfo.label, detail: `${accountInfo.group} ${index.scope[accountInfo.group]}`, byYear: new Map(), children: new Map() })
        }
        const group = groups.get(key)!
        addTo(group.byYear, year, amount)
        const childKey = kind === "bv" ? sub.name : domain.name
        if (!group.children.has(childKey)) group.children.set(childKey, new Map())
        addTo(group.children.get(childKey)!, year, amount)
      }
      return [start, groups] as const
    }))
  }, [index, data, effectiveSource, kind])

  const items: Item[] = useMemo(() => {
    if (!groupsByPeriod || !data || !index) return []
    const groups = groupsByPeriod.get(period as typeof PERIODS[number]) ?? new Map<string, Group>()
    const ranked = Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        label: group.label,
        detail: group.detail,
        category: group.category,
        value: measure(group.byYear, metric, data.population),
        children: Array.from(group.children.entries())
          .map(([label, byYear]) => ({ label, value: measure(byYear, metric, data.population) }))
          .filter((child) => Math.abs(child.value) >= 0.005)
          .sort((a, b) => b.value - a.value),
      }))
      .sort((a, b) => b.value - a.value)
    const colored = ranked.map((item) => ({
      ...item,
      color: kind === "bv"
        ? DOMAIN_COLORS[index.domains.findIndex((domain) => domain.label === item.key) % DOMAIN_COLORS.length]
        : CHART_SERIES_COLORS[0],
    }))
    if (kind === "bv" || colored.length <= TOP_ACCOUNTS + 1) return colored
    const rest = colored.slice(TOP_ACCOUNTS)
    return [
      ...colored.slice(0, TOP_ACCOUNTS),
      {
        key: "other",
        label: `Overige rekeningen (${rest.length})`,
        value: rest.reduce((sum, item) => sum + item.value, 0),
        color: CHART_SERIES_COLORS[1],
        children: rest.map((item) => ({ label: item.label, value: item.value })),
      },
    ]
  }, [groupsByPeriod, period, metric, data, index, kind])

  // One scale across the three periods keeps the bars comparable when switching periods.
  const maxValue = useMemo(() => {
    if (!groupsByPeriod || !data) return 1
    let max = 1
    groupsByPeriod.forEach((groups) => groups.forEach((group) => {
      max = Math.max(max, measure(group.byYear, metric, data.population))
    }))
    return Math.max(max, ...items.map((item) => item.value))
  }, [groupsByPeriod, data, metric, items])

  const format = (value: number) => metric === "total" ? euro.format(value) : euroCents.format(value)
  const municipality = isMunicipality(index, geo) ? geo : null
  const linkTarget = isEmbed ? "_blank" : undefined
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <section id={sectionId} className="scroll-mt-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle><h2 className="text-xl font-semibold">{title}</h2></CardTitle>
            <ExportButtons
              data={items.map((item) => ({ label: item.label, value: Math.round(item.value * 100) / 100 }))}
              title={title}
              slug={SLUG}
              sectionId={sectionId}
              viewType="table"
              periodHeaders={[kind === "bv" ? "Beleidsdomein" : "Algemene rekening"]}
              valueLabel={metric === "total" ? "Bouwinvesteringen (euro)" : "Bouwinvesteringen per inwoner (euro)"}
              dataSource="ABB BBC-DR, bouwscope op economische rekeningen, oktober 2026"
              dataSourceUrl={SOURCE_URL}
              embedParams={{
                geo: geo === FLANDERS ? null : geo,
                metric: metric === "total" ? null : metric,
                periode: period === 2026 ? null : period,
                bron: effectiveSource === "latest" ? null : effectiveSource,
              }}
            />
          </div>
          <AnalysisOnly>
            <p className="text-sm text-muted-foreground">
              {kind === "bv"
                ? "Bouwinvesteringen per beleidsdomein, opgeteld over de zes boekjaren van de gekozen planperiode. Klik op een domein voor de subdomeinen."
                : "De negen algemene rekeningen met de hoogste bouwinvesteringen, opgeteld over de gekozen planperiode, plus de overige rekeningen."}
            </p>
          </AnalysisOnly>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {index && <GeoFilter index={index} value={geo} onChange={setGeo} />}
            <ToggleGroup
              label="Periode"
              value={period}
              onChange={setPeriod}
              options={PERIODS.map((start) => ({ value: start, label: `${start}-${start + 5}` }))}
            />
            <ToggleGroup
              label="Bron"
              value={effectiveSource}
              onChange={setSource}
              options={[
                { value: "latest", label: "Meest recent plan" },
                { value: "actual", label: "Jaarrekening", disabled: period === 2026 },
              ]}
            />
            <ToggleGroup
              label="Weergave"
              value={metric}
              onChange={setMetric}
              options={[{ value: "total", label: "Totaal" }, { value: "capita", label: "Per inwoner" }]}
            />
          </div>
          {!data ? (
            <p className="text-sm text-muted-foreground" role="status">
              {error ? `Fout bij het laden van ${place}: ${error}` : `Gegevens voor ${place} laden...`}
            </p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Geen bouwinvesteringen voor deze selectie.</p>
          ) : (
            <ol className="space-y-3" aria-label={title}>
              {items.map((item, position) => {
                const isOpen = expanded.has(item.key)
                const toggle = () => setExpanded((current) => {
                  const next = new Set(current)
                  if (next.has(item.key)) next.delete(item.key)
                  else next.add(item.key)
                  return next
                })
                return (
                  <li key={item.key} className="rounded-lg border p-3 space-y-2">
                    <button
                      type="button"
                      onClick={toggle}
                      aria-expanded={isOpen}
                      className="w-full rounded text-left hover:bg-muted/50"
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="flex items-start gap-2">
                          <span className="w-4 shrink-0 text-muted-foreground" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                          <span>
                            <span className="text-sm font-medium">{position + 1}. {item.label}</span>
                            {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
                          </span>
                        </span>
                        <span className="text-sm font-bold tabular-nums">{format(item.value)}</span>
                      </span>
                    </button>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(0, item.value / maxValue) * 100}%`, backgroundColor: item.color }}
                      />
                    </div>
                    {isOpen && (
                      <div className="border-t pt-2 text-sm space-y-1">
                        <ul className="space-y-1">
                          {item.children.map((child) => (
                            <li key={child.label} className="flex justify-between gap-3 text-muted-foreground">
                              <span>{child.label}</span>
                              <span className="tabular-nums">{format(child.value)}</span>
                            </li>
                          ))}
                        </ul>
                        {municipality && item.category && period === 2026 && (
                          <a
                            className="inline-block pt-1 font-medium underline"
                            href={projectsLink({ nis: municipality, category: item.category })}
                            target={linkTarget}
                            rel={linkTarget ? "noopener" : undefined}
                          >
                            Bekijk de projecten van {place} in {item.label.toLowerCase()}
                          </a>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          {data && items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {metric === "total" ? "Totaal" : "Totaal per inwoner"} {place}, {period}-{period + 5}
              {" "}({effectiveSource === "latest" ? "meest recent plan" : "jaarrekening"}): {format(total)}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Bron: <a className="underline" href={SOURCE_URL}>ABB BBC-DR</a>, bouwscope op economische rekeningen.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
