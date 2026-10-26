"use client"

import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { AnalysisOnly } from "@embuild/shared/components/shared/AnalysisOnly"
import { createAutoScaledFormatter } from "@embuild/shared/lib/number-formatters"
import { useIsEmbedRoute } from "@embuild/shared/lib/use-is-embed-route"
import { SLUG } from "@/lib/sections"
import {
  CUBE_SOURCE, DOMAIN_COLORS, FLANDERS, GeoFilter, LabeledSelect, geoName, isMunicipality, projectsLink,
  useGeoData, useGeoIndex, type GeoIndex,
} from "./geo"

const SECTION = "investments-planned-2026-2031"
const SOURCE_URL = "https://lokaalbestuur.vlaanderen.be/financien/bbc-dr/gemeente-financien"
const YEARS = [2026, 2027, 2028, 2029, 2030, 2031]
const euro = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })

/** Account filter values: "" (all), "g:<Niveau 5 group>" or "a:<account index>". */
function accountMatcher(index: GeoIndex, value: string) {
  if (value.startsWith("g:")) {
    const group = value.slice(2)
    return (account: number) => index.accounts[account]?.group === group
  }
  if (value.startsWith("a:")) {
    const selected = Number(value.slice(2))
    return (account: number) => account === selected
  }
  return () => true
}

function projectAccount(index: GeoIndex, value: string) {
  if (value.startsWith("g:")) return index.accounts.find((account) => account.group === value.slice(2))?.project_account
  if (value.startsWith("a:")) return index.accounts[Number(value.slice(2))]?.project_account
  return undefined
}

function accountLabel(index: GeoIndex, value: string) {
  if (value.startsWith("g:")) return `${value.slice(2)} ${index.scope[value.slice(2)]}`
  if (value.startsWith("a:")) return index.accounts[Number(value.slice(2))]?.label ?? value
  return "alle rekeningen"
}

export function PlannedYearlySection({
  viewType = "chart",
  initialGeo = FLANDERS,
  initialDomain = "",
  initialAccount = "",
}: {
  viewType?: "chart" | "table"
  initialGeo?: string
  initialDomain?: string
  initialAccount?: string
}) {
  const isEmbed = useIsEmbedRoute()
  const [view, setView] = useState<"chart" | "table">(viewType)
  const [geo, setGeo] = useState(initialGeo)
  const [domain, setDomain] = useState(initialDomain)
  const [account, setAccount] = useState(initialAccount)
  useEffect(() => setView(viewType), [viewType])
  useEffect(() => setGeo(initialGeo), [initialGeo])
  const { data: index } = useGeoIndex()
  const { data, error } = useGeoData(geo)
  const place = geoName(index, geo)
  const municipality = isMunicipality(index, geo) ? geo : null
  const domainIndex = domain === "" ? null : Number(domain)
  const visibleDomains = useMemo(
    () => index ? index.domains.map((entry, position) => ({ ...entry, position }))
      .filter((entry) => domainIndex === null || entry.position === domainIndex) : [],
    [index, domainIndex],
  )

  const rows = useMemo(() => {
    if (!index || !data) return []
    const matches = accountMatcher(index, account)
    const byYear = new Map(YEARS.map((year) => [year, new Array<number>(index.domains.length).fill(0)]))
    for (const [source, year, subdomain, accountIndex, amount] of data.cube) {
      if (source !== CUBE_SOURCE.latest || !byYear.has(year) || !matches(accountIndex)) continue
      byYear.get(year)![index.subdomains[subdomain].domain] += amount
    }
    return YEARS.map((year) => {
      const values = byYear.get(year)!
      const row: Record<string, number> = { year }
      let total = 0
      visibleDomains.forEach(({ position }) => {
        row[`d${position}`] = values[position]
        total += values[position]
      })
      row.total = total
      return row
    })
  }, [index, data, account, visibleDomains])

  const domainName = domainIndex === null ? null : index?.domains[domainIndex]?.name
  const title = `Geplande bouwinvesteringen per jaar, 2026-2031 - ${place}`
    + (domainName ? `, ${domainName.toLowerCase()}` : "")
    + (index && account ? `, ${accountLabel(index, account)}` : "")
  const { formatter, scaleLabel } = createAutoScaledFormatter(rows.map((row) => row.total), true)
  const accountForProjects = index ? projectAccount(index, account) : undefined
  const linkFor = (year: number, position: number) => municipality && index
    ? projectsLink({
      nis: municipality,
      category: index.domains[position].project_category,
      year,
      account: accountForProjects,
    })
    : null
  const openProjects = (year: number, position: number) => {
    const href = linkFor(year, position)
    if (!href) return
    if (isEmbed) window.open(href, "_blank", "noopener")
    else window.location.assign(href)
  }
  const csvData = rows.flatMap((row) => visibleDomains.map(({ name, position }) => ({
    label: String(row.year),
    periodCells: [row.year, name],
    value: Math.round(row[`d${position}`] * 100) / 100,
  })))
  const linkTarget = isEmbed ? "_blank" : undefined

  return (
    <section id={SECTION} className="scroll-mt-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle><h2 className="text-xl font-semibold">{title}</h2></CardTitle>
            <ExportButtons
              data={csvData}
              title={title}
              slug={SLUG}
              sectionId={SECTION}
              viewType={view}
              periodHeaders={["Boekjaar", "Beleidsdomein"]}
              valueLabel="Geplande bouwinvesteringen (euro)"
              dataSource="ABB BBC-DR, meest recent meerjarenplan 2026-2031, bouwscope op economische rekeningen"
              dataSourceUrl={SOURCE_URL}
              embedParams={{ geo: geo === FLANDERS ? null : geo, domein: domain || null, rekening: account || null }}
            />
          </div>
          <AnalysisOnly>
            <p className="text-sm text-muted-foreground">
              Geplande bouwinvesteringen volgens het meest recente meerjarenplan 2026-2031, per boekjaar en beleidsdomein.
              Kies een gemeente en klik op een balk of tabelcel om de concrete projecten van dat domein en jaar te bekijken.
            </p>
          </AnalysisOnly>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {index && <GeoFilter index={index} value={geo} onChange={setGeo} />}
            {index && (
              <LabeledSelect label="Beleidsdomein" value={domain} onChange={setDomain}>
                <option value="">Alle domeinen</option>
                {index.domains.map((entry, position) => <option key={entry.label} value={position}>{entry.name}</option>)}
              </LabeledSelect>
            )}
            {index && (
              <LabeledSelect label="Rekening" value={account} onChange={setAccount}>
                <option value="">Alle rekeningen in de bouwscope</option>
                {Object.entries(index.scope).map(([group, label]) => (
                  <optgroup key={group} label={`${group} ${label}`}>
                    <option value={`g:${group}`}>Alle: {label}</option>
                    {index.accounts.map((entry, position) => entry.group === group && (
                      <option key={entry.label} value={`a:${position}`}>{entry.label}</option>
                    ))}
                  </optgroup>
                ))}
              </LabeledSelect>
            )}
          </div>
          {!data ? (
            <p className="text-sm text-muted-foreground" role="status">
              {error ? `Fout bij het laden van ${place}: ${error}` : `Gegevens voor ${place} laden...`}
            </p>
          ) : (
            <Tabs value={view} onValueChange={(value) => setView(value === "table" ? "table" : "chart")}>
              <TabsList aria-label={`Weergave ${title}`}>
                <TabsTrigger value="chart">Grafiek</TabsTrigger>
                <TabsTrigger value="table">Tabel</TabsTrigger>
              </TabsList>
              <TabsContent value="chart" className="space-y-3 mt-4">
                <p className="text-sm font-medium">Geplande bouwinvesteringen (in {scaleLabel} euro)</p>
                <div className="overflow-x-auto">
                  <div className="h-[420px] min-w-[420px]" aria-label={title}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 420, height: 420 }}>
                      <BarChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 10 }} accessibilityLayer>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={formatter} width={75} />
                        <Tooltip
                          formatter={(value, name) => [typeof value === "number" ? euro.format(value) : value, name]}
                          labelFormatter={(label) => `Boekjaar ${label}`}
                        />
                        {visibleDomains.map(({ name, position }) => (
                          <Bar
                            key={position}
                            dataKey={`d${position}`}
                            name={name}
                            stackId="domains"
                            fill={DOMAIN_COLORS[position % DOMAIN_COLORS.length]}
                            isAnimationActive={false}
                            cursor={municipality ? "pointer" : undefined}
                            onClick={(entry) => {
                              const year = Number((entry as { payload?: { year?: number } }).payload?.year)
                              if (year) openProjects(year, position)
                            }}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Kleuren per beleidsdomein">
                  {visibleDomains.map(({ name, position }) => (
                    <li key={position} className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: DOMAIN_COLORS[position % DOMAIN_COLORS.length] }} aria-hidden="true" />
                      {name}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">
                  {municipality
                    ? "Klik op een balk om de projecten van dit domein en jaar in de projectbrowser te openen."
                    : "Kies een gemeente om door te klikken naar de concrete projecten."}
                </p>
              </TabsContent>
              <TabsContent value="table" className="mt-4">
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{title}, euro per boekjaar en beleidsdomein</caption>
                    <thead className="bg-muted/50">
                      <tr>
                        <th scope="col" className="p-2 text-left">Beleidsdomein</th>
                        {YEARS.map((year) => <th key={year} scope="col" className="p-2 text-right">{year}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDomains.map(({ name, position }) => (
                        <tr key={position} className="border-t">
                          <th scope="row" className="p-2 text-left font-normal">{name}</th>
                          {rows.map((row) => {
                            const value = row[`d${position}`]
                            const href = value > 0 ? linkFor(row.year, position) : null
                            return (
                              <td key={row.year} className="p-2 text-right tabular-nums">
                                {href
                                  ? <a className="underline" href={href} target={linkTarget} rel={linkTarget ? "noopener" : undefined}
                                    aria-label={`Projecten ${name} ${row.year}: ${euro.format(value)}`}>{euro.format(value)}</a>
                                  : euro.format(value)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                      {visibleDomains.length > 1 && (
                        <tr className="border-t font-semibold">
                          <th scope="row" className="p-2 text-left">Totaal</th>
                          {rows.map((row) => <td key={row.year} className="p-2 text-right tabular-nums">{euro.format(row.total)}</td>)}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          )}
          <p className="text-sm text-muted-foreground">
            Bron: <a className="underline" href={SOURCE_URL}>ABB BBC-DR</a>, meest recent meerjarenplan 2026-2031.
            <AnalysisOnly>
              {" "}Projecten in de projectbrowser omvatten de volledige rekeninggroep (bv. ook roerende goederen) en tellen
              daarom niet altijd exact op tot deze bouwbedragen.
            </AnalysisOnly>
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
