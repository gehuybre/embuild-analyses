"use client"

import React, { useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Button } from "@embuild/shared/components/ui/button"
import { Badge } from "@embuild/shared/components/ui/badge"
import { fetchInvesteringenJson } from "@embuild/shared/lib/investeringen-data"
import { CHART_THEME } from "@embuild/shared/lib/chart-theme"
import type { ComparisonData, ComparisonFile, OldNew } from "./types"
import {
  formatMillions,
  formatNumber,
  formatShare,
  formatSignedMillions,
  formatSignedPercent,
  stripPrefix,
} from "./format"

const DIFF_COLOR = "var(--color-chart-2)"

const DOMAIN_SHORT: Record<string, string> = {
  "Algemene financiering": "Alg. financiering",
  "Algemeen bestuur": "Alg. bestuur",
  "Zich verplaatsen en mobiliteit": "Mobiliteit",
  "Natuur en milieubeheer": "Natuur en milieu",
  "Ondernemen en werken": "Ondernemen",
  "Wonen en ruimtelijke ordening": "Wonen en RO",
  "Cultuur en vrije tijd": "Cultuur en vrije tijd",
  "Leren en onderwijs": "Onderwijs",
  "Zorg en opvang": "Zorg",
  "Veiligheidszorg": "Veiligheid",
}

const REK_LABELS: Record<string, string> = {
  "I.1.A": "Financiële vaste activa",
  "I.1.B": "Materiële vaste activa",
  "I.1.C": "Immateriële vaste activa",
  "I.1.D": "Toegestane investeringssubsidies",
}

const HISTOGRAM_BUCKETS = [
  { label: "meer dan 10% lager", test: (r: number) => r < -0.1 },
  { label: "5 tot 10% lager", test: (r: number) => r >= -0.1 && r < -0.05 },
  { label: "1 tot 5% lager", test: (r: number) => r >= -0.05 && r < -0.01 },
  { label: "binnen 1%", test: (r: number) => r >= -0.01 && r <= 0.01 },
  { label: "1 tot 5% hoger", test: (r: number) => r > 0.01 && r <= 0.05 },
  { label: "5 tot 10% hoger", test: (r: number) => r > 0.05 && r <= 0.1 },
  { label: "meer dan 10% hoger", test: (r: number) => r > 0.1 },
]

function ratio(pair: OldNew): number {
  return pair.old === 0 ? Number.NaN : pair.new / pair.old - 1
}

function sumPairs(rows: OldNew[]): OldNew {
  return rows.reduce((acc, row) => ({ old: acc.old + row.old, new: acc.new + row.new }), { old: 0, new: 0 })
}

function YearToggle({
  years,
  value,
  onChange,
}: {
  years: number[]
  value: number
  onChange: (year: number) => void
}) {
  return (
    <div role="group" aria-label="Rapportjaar" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Rapportjaar</span>
      {years.map((year) => (
        <Button
          key={year}
          size="sm"
          variant={value === year ? "default" : "outline"}
          aria-pressed={value === year}
          onClick={() => onChange(year)}
        >
          {year}
        </Button>
      ))}
    </div>
  )
}

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string
  title: string
  intro?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t pt-12 space-y-4">
      <h2 className="m-0 text-2xl font-semibold">{title}</h2>
      {intro && <p className="m-0 text-sm text-muted-foreground">{intro}</p>}
      {children}
    </section>
  )
}

const tooltipStyle = {
  backgroundColor: CHART_THEME.tooltip.backgroundColor,
  color: CHART_THEME.tooltip.color,
  borderRadius: CHART_THEME.tooltip.borderRadius,
  border: CHART_THEME.tooltip.border,
  fontSize: 12,
}

const DEFAULT_PAIR = "mei_sep"

export function ComparisonDashboard() {
  const [file, setFile] = useState<ComparisonFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pairKey, setPairKey] = useState(DEFAULT_PAIR)
  const [year, setYear] = useState(2026)

  useEffect(() => {
    let cancelled = false
    fetchInvesteringenJson<ComparisonFile>("/data/comparison.json")
      .then((result) => {
        if (!cancelled) setFile(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Fout bij het laden van de data")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const data = useMemo<ComparisonData | null>(() => {
    if (!file) return null
    const comparison = file.comparisons.find((item) => item.key === pairKey) ?? file.comparisons[0]
    const byKey = new Map(file.versions.map((version) => [version.key, version]))
    const { old: oldKey, new: newKey, ...rest } = comparison
    return {
      ...rest,
      generated: file.generated,
      versions: { old: byKey.get(oldKey)!, new: byKey.get(newKey)! },
    }
  }, [file, pairKey])

  if (error) {
    return <p role="alert" className="text-destructive">Fout bij het laden van de vergelijking: {error}</p>
  }
  if (!file || !data) {
    return <p className="text-muted-foreground">Vergelijking laden...</p>
  }

  const labelOf = (key: string) => file.versions.find((version) => version.key === key)?.label ?? key

  return (
    <div className="space-y-12">
      <div role="group" aria-label="Te vergelijken versies" className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Vergelijk</span>
        {file.comparisons.map((comparison) => (
          <Button
            key={comparison.key}
            size="sm"
            variant={data.versions.old.key === comparison.old && data.versions.new.key === comparison.new ? "default" : "outline"}
            aria-pressed={data.versions.old.key === comparison.old && data.versions.new.key === comparison.new}
            onClick={() => setPairKey(comparison.key)}
          >
            {labelOf(comparison.old)} met {labelOf(comparison.new)}
          </Button>
        ))}
      </div>
      <Loaded data={data} year={year} setYear={setYear} />
    </div>
  )
}

function Loaded({
  data,
  year,
  setYear,
}: {
  data: ComparisonData
  year: number
  setYear: (year: number) => void
}) {
  const years = data.summary.map((row) => row.rapportjaar)
  const oldLabel = data.versions.old.label
  const newLabel = data.versions.new.label
  const oldSentence = oldLabel.toLowerCase()
  const newSentence = newLabel.toLowerCase()
  const oldUrl = `/analyses/${data.versions.old.slug}/`
  const newUrl = `/analyses/${data.versions.new.slug}/`
  const summary = data.summary.find((row) => row.rapportjaar === year)!

  const domainData = useMemo(
    () =>
      data.by_domein
        .filter((row) => row.Rapportjaar === year)
        .map((row) => {
          const name = stripPrefix(row.BV_domein)
          return { name: DOMAIN_SHORT[name] ?? name, old: row.old, new: row.new, diff: row.new - row.old }
        })
        .sort((a, b) => a.diff - b.diff),
    [data, year],
  )

  const diffAxis = useMemo(() => {
    const min = Math.min(0, ...domainData.map((row) => row.diff)) / 1e6
    const max = Math.max(0, ...domainData.map((row) => row.diff)) / 1e6
    const step = [5, 10, 20, 25, 50, 100, 200].find((candidate) => (max - min) / candidate <= 6) ?? 200
    const start = Math.floor(min / step) * step
    const end = Math.ceil(max / step) * step
    const ticks: number[] = []
    for (let value = start; value <= end; value += step) ticks.push(value * 1e6)
    return { domain: [start * 1e6, end * 1e6] as [number, number], ticks }
  }, [domainData])

  const fieldRows = useMemo(
    () =>
      data.by_field
        .filter((row) => row.Rapportjaar === year)
        .map((row) => ({
          code: row.Beleidsveld.split(" ")[0],
          name: stripPrefix(row.Beleidsveld),
          old: row.old,
          new: row.new,
          diff: row.new - row.old,
        })),
    [data, year],
  )
  const decreases = useMemo(() => [...fieldRows].sort((a, b) => a.diff - b.diff).slice(0, 8), [fieldRows])
  const increases = useMemo(() => [...fieldRows].sort((a, b) => b.diff - a.diff).slice(0, 8), [fieldRows])
  const totalDiff = summary.new - summary.old

  const boekjaarData = useMemo(
    () =>
      data.by_boekjaar
        .filter((row) => row.Rapportjaar === year)
        .sort((a, b) => a.Boekjaar - b.Boekjaar)
        .map((row) => ({ jaar: String(row.Boekjaar), old: row.old, new: row.new, diff: row.new - row.old })),
    [data, year],
  )

  const municipalityRows = useMemo(
    () => data.municipalities.filter((row) => row.Rapportjaar === year),
    [data, year],
  )
  const histogram = useMemo(
    () =>
      HISTOGRAM_BUCKETS.map((bucket) => ({
        name: bucket.label,
        aantal: municipalityRows.filter((row) => row.old > 0 && bucket.test(row.new / row.old - 1)).length,
      })),
    [municipalityRows],
  )
  const biggestMunicipalityDiffs = useMemo(
    () =>
      [...municipalityRows]
        .map((row) => ({ ...row, diff: row.new - row.old }))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 10),
    [municipalityRows],
  )

  const rekRows = useMemo(
    () => data.rek.filter((row) => row.Rapportjaar === year).sort((a, b) => a.Niveau_3.localeCompare(b.Niveau_3)),
    [data, year],
  )

  return (
    <div className="space-y-12">
      <aside role="note" aria-label="Over deze vergelijking" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{oldLabel}</Badge>
          <span aria-hidden="true">tegenover</span>
          <Badge variant="secondary">{newLabel}</Badge>
          <a href={oldUrl} className="text-primary hover:underline">Open de versie van {oldSentence}</a>
          <a href={newUrl} className="text-primary hover:underline">Open de versie van {newSentence}</a>
        </div>
        <p className="m-0 text-muted-foreground">
          Alle bedragen zijn nominale investeringsuitgaven in miljoen euro, binnen de legislatuur van elk
          rapportjaar (2014-2019, 2020-2025 en 2026-2031), zoals in de analyses zelf. De cijfers gelden voor
          gemeente en OCMW samen (of district). De versie van februari 2026 is een reconstructie uit de exports van
          januari 2026 (zie de pagina van die versie).
        </p>
        <p className="m-0 mt-2 text-muted-foreground">
          Op 7 oktober 2026 is een verwerkingsfout hersteld in de versies van februari en mei: sommige cellen hadden een foute
          schaal (990.000 stond als 9.900, 23 als 230). De eerder gepubliceerde totalen lagen daardoor voor 2014 en 2020
          ongeveer 1,1% en 0,6% te laag (februari ook 2,3% voor 2026). Alle cijfers op deze pagina zijn de gecorrigeerde.
        </p>
      </aside>

      <div className="space-y-3">
        <YearToggle years={years} value={year} onChange={setYear} />
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{oldLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMillions(summary.old)} M</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{newLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatMillions(summary.new)} M</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Verschil</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatSignedMillions(totalDiff)} M
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  ({formatSignedPercent(ratio(summary), 2)})
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Section
        id="scope"
        title="Waarom de totalen verschillen"
        intro={
          <>
            Volgens de filters in de exports hebben alle drie de versies dezelfde scope: terreinen en gebouwen, wegen en
            overige infrastructuur, erfgoed, onroerende goederen (I.1.B.2.a) en toegestane investeringssubsidies. De
            totalen zijn dus vergelijkbaar.
          </>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Rapportjaar</th>
                <th className="py-2 pr-4 text-right font-medium">{oldLabel} (M)</th>
                <th className="py-2 pr-4 text-right font-medium">{newLabel} (M)</th>
                <th className="py-2 pr-4 text-right font-medium">Verschil (M)</th>
                <th className="py-2 pr-4 text-right font-medium">Verschil</th>
                <th className="py-2 text-right font-medium">Cellen op de euro gelijk</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.map((row) => (
                <tr key={row.rapportjaar} className={row.rapportjaar === year ? "bg-muted/40" : undefined}>
                  <td className="py-2 pr-4">{row.rapportjaar}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatMillions(row.old)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatMillions(row.new)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatSignedMillions(row.new - row.old)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatSignedPercent(ratio(row), 2)}</td>
                  <td className="py-2 text-right tabular-nums">{formatShare(row.cells_identical / row.cells_both)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-xs text-muted-foreground">
          Een cel is een combinatie van gemeente, beleidsveld en boekjaar. Cellen die enkel in één van beide versies
          voorkomen (voor {year}: {summary.cells_only_old} enkel in {oldSentence}, {summary.cells_only_new} enkel in {newSentence}) tellen
          niet mee in dat aandeel.
        </p>
        {summary.cells_changed === 0 ? (
          <p className="m-0 text-sm">
            In rapportjaar {year} zijn alle {formatNumber(summary.cells_both)} cellen die in beide versies voorkomen op de
            euro gelijk.
          </p>
        ) : (
          <p className="m-0 text-sm">
            In rapportjaar {year} zijn {formatNumber(summary.cells_changed)} cellen gewijzigd. Het gaat om verschillen in de
            gegevens: gemeenten die hun meerjarenplan hebben aangepast of, voor 2026 in de februariversie, nog niet
            hadden ingediend. Dat is een vermoeden: de data vermelden de oorzaak niet. Bij de rapportjaren 2014 en 2020
            zijn de verschillen klein, omdat die plannen afgesloten zijn.
          </p>
        )}
      </Section>

      <Section
        id="boekjaren"
        title={`Per boekjaar, rapportjaar ${year}`}
        intro={`Verschil tussen de versies van ${newSentence} en ${oldSentence} per boekjaar binnen de legislatuur, in miljoen euro. De absolute bedragen liggen in beide versies dicht bij elkaar; de tabel toont ze.`}
      >
        <div className="h-[300px] w-full" role="img" aria-label={`Staafgrafiek van het verschil per boekjaar, rapportjaar ${year}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={boekjaarData} margin={CHART_THEME.margin}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
              <XAxis dataKey="jaar" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatSignedMillions(v)} width={56} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                formatter={(value) => [`${formatSignedMillions(Number(value))} M`, "Verschil"]}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="diff" fill={DIFF_COLOR} radius={4} maxBarSize={40} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Toon als tabel</summary>
          <table className="mt-2 w-full">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Boekjaar</th>
                <th className="py-2 pr-4 text-right font-medium">{oldLabel} (M)</th>
                <th className="py-2 pr-4 text-right font-medium">{newLabel} (M)</th>
                <th className="py-2 text-right font-medium">Verschil (M)</th>
              </tr>
            </thead>
            <tbody>
              {boekjaarData.map((row) => (
                <tr key={row.jaar}>
                  <td className="py-1.5 pr-4">{row.jaar}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(row.old)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(row.new)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatSignedMillions(row.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Section>

      <Section
        id="domeinen"
        title={`Per beleidsdomein, rapportjaar ${year}`}
        intro={`Verschil tussen de versies van ${newSentence} en ${oldSentence} in miljoen euro. Een negatieve waarde betekent dat de nieuwe versie lager uitkomt.`}
      >
        <div className="w-full" style={{ height: Math.max(280, domainData.length * 36 + 40) }} role="img" aria-label={`Staafgrafiek van het verschil per beleidsdomein, rapportjaar ${year}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={domainData} layout="vertical" margin={{ ...CHART_THEME.margin, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} horizontal={false} />
              <XAxis type="number" domain={diffAxis.domain} ticks={diffAxis.ticks} tick={{ fontSize: 12 }} tickFormatter={(v: number) => formatSignedMillions(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={130} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                formatter={(value) => [`${formatSignedMillions(Number(value))} M`, "Verschil"]}
              />
              <ReferenceLine x={0} stroke="var(--border)" />
              <Bar dataKey="diff" radius={4} maxBarSize={20} isAnimationActive={false}>
                {domainData.map((row) => (
                  <Cell key={row.name} fill={DIFF_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Toon als tabel</summary>
          <table className="mt-2 w-full">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Beleidsdomein</th>
                <th className="py-2 pr-4 text-right font-medium">{oldLabel} (M)</th>
                <th className="py-2 pr-4 text-right font-medium">{newLabel} (M)</th>
                <th className="py-2 text-right font-medium">Verschil (M)</th>
              </tr>
            </thead>
            <tbody>
              {[...domainData].sort((a, b) => a.name.localeCompare(b.name, "nl")).map((row) => (
                <tr key={row.name}>
                  <td className="py-1.5 pr-4">{row.name}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(row.old)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(row.new)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatSignedMillions(row.diff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Section>

      <Section
        id="beleidsvelden"
        title={`Grootste verschuivingen per beleidsveld, rapportjaar ${year}`}
        intro="De acht beleidsvelden met de sterkste daling en de sterkste stijging, in miljoen euro."
      >
        <div className="space-y-8">
          <FieldTable title="Grootste dalingen" rows={decreases} oldLabel={oldLabel} newLabel={newLabel} />
          <FieldTable title="Grootste stijgingen" rows={increases} oldLabel={oldLabel} newLabel={newLabel} />
        </div>
      </Section>

      <Section
        id="gemeenten"
        title={`Per gemeente, rapportjaar ${year}`}
        intro={`${summary.municipalities_over_5pct} van de ${summary.municipalities_in_both} gemeenten die in beide versies voorkomen wijken meer dan 5% af${summary.municipalities > summary.municipalities_in_both ? `. ${summary.municipalities - summary.municipalities_in_both} gemeenten komen in slechts één versie voor` : ''}.`}
      >
        <div className="h-[300px] w-full" role="img" aria-label={`Staafgrafiek van het aantal gemeenten per klasse van afwijking, rapportjaar ${year}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ ...CHART_THEME.margin, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_THEME.gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={64} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={40} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                formatter={(value) => [String(value), "Gemeenten"]}
              />
              <Bar dataKey="aantal" fill={DIFF_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left font-medium">Grootste verschillen in miljoen euro</caption>
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Gemeente</th>
                <th className="py-2 pr-4 text-right font-medium">{oldLabel} (M)</th>
                <th className="py-2 pr-4 text-right font-medium">{newLabel} (M)</th>
                <th className="py-2 pr-4 text-right font-medium">Verschil (M)</th>
                <th className="py-2 text-right font-medium">Verschil</th>
              </tr>
            </thead>
            <tbody>
              {biggestMunicipalityDiffs.map((row) => (
                <tr key={row.NIS_code}>
                  <td className="py-1.5 pr-4">{row.naam}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(row.old)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(row.new)}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{formatSignedMillions(row.diff)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatSignedPercent(ratio(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="rek"
        title={`Economische rekening, rapportjaar ${year}`}
        intro="Categorieën die in een versie niet voorkomen tellen als 0 en staan als niet opgenomen in de tabel. De versie van september 2026 heeft een smallere scope dan de andere twee: financiële vaste activa (I.1.A) en immateriële vaste activa (I.1.C) zijn niet opgenomen. De REK van februari 2026 bevat voor 2026 slechts 275 gemeenten."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium">Categorie</th>
                <th className="py-2 pr-4 text-right font-medium">{oldLabel} (M)</th>
                <th className="py-2 pr-4 text-right font-medium">{newLabel} (M)</th>
                <th className="py-2 text-right font-medium">Verschil (M)</th>
              </tr>
            </thead>
            <tbody>
              {rekRows.map((row) => {
                const code = row.Niveau_3.split(" ")[0]
                return (
                  <tr key={row.Niveau_3}>
                    <td className="py-1.5 pr-4">
                      {code} {REK_LABELS[code] ?? stripPrefix(row.Niveau_3)}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(row.old)}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{row.new === 0 && row.old !== 0 ? "niet opgenomen" : formatMillions(row.new)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatSignedMillions(row.new - row.old)}</td>
                  </tr>
                )
              })}
              <tr className="border-t font-medium">
                <td className="py-1.5 pr-4">Totaal</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(sumPairs(rekRows).old)}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{formatMillions(sumPairs(rekRows).new)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatSignedMillions(sumPairs(rekRows).new - sumPairs(rekRows).old)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <p className="m-0 text-xs text-muted-foreground">
        Gegenereerd op {data.generated} uit de verwerkte gegevens van beide versies.
      </p>
    </div>
  )
}

function FieldTable({
  title,
  rows,
  oldLabel,
  newLabel,
}: {
  title: string
  rows: Array<{ code: string; name: string; old: number; new: number; diff: number }>
  oldLabel: string
  newLabel: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-left font-medium">{title}</caption>
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-3 font-medium">Beleidsveld</th>
            <th className="py-2 pr-3 text-right font-medium">{oldLabel}</th>
            <th className="py-2 pr-3 text-right font-medium">{newLabel}</th>
            <th className="py-2 text-right font-medium">Verschil</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <td className="py-1.5 pr-3">{row.name}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatMillions(row.old)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatMillions(row.new)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatSignedMillions(row.diff)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
