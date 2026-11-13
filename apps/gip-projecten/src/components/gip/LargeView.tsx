"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts"
import { ACCENT, ACCENT_DARK, TRACK, formatMio, integerFormatter, type GipBundle } from "./model"
import { Panel, SectionHeading } from "./ui"

export function LargeView({ gip2025, gip2026 }: { gip2025: GipBundle; gip2026: GipBundle }) {
  // De versie van 2026 bevat geen meerjarige doorkijk: toon dan de laatst beschikbare (juli 2025)
  const source = gip2026.bigProjects.length ? gip2026 : gip2025
  const fallback = source === gip2025 && gip2026.bigProjects.length === 0

  const stats = useMemo(() => {
    const projects = source.bigProjects.filter((project) => project.level === "project")
    const years = Object.keys(projects[0]?.impact_mio ?? {})
    const perYear = years.map((year) => ({
      year,
      impact: projects.reduce((sum, project) => sum + (project.impact_mio[year] ?? 0), 0),
    }))
    const peak = perYear.reduce((best, point) => (point.impact > best.impact ? point : best), perYear[0] ?? { year: "", impact: 0 })
    const capex = projects.reduce((sum, project) => sum + project.total_mio, 0)
    const top = [...projects].sort((a, b) => b.total_mio - a.total_mio).slice(0, 8)
    return { projects, perYear, peak, capex, top }
  }, [source])

  if (!stats.projects.length) {
    return <Panel><p className="text-sm text-muted-foreground">Er is geen doorkijk voor de grote projecten beschikbaar.</p></Panel>
  }

  const maxTotal = Math.max(...stats.top.map((row) => row.total_mio), 1)

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeading
          title={`Grote projecten tot ${stats.perYear[stats.perYear.length - 1]?.year}`}
          description={
            fallback
              ? "Laatst beschikbare doorkijk (juli 2025). De actualisatie van 2026 bevat geen nieuwe meerjarige tabel."
              : "Verwachte jaarlijkse budgetimpact van de grote projecten."
          }
        />
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Totaalbudget {stats.projects.length} projecten</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatMio(stats.capex)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Piekjaar {stats.peak.year}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatMio(stats.peak.impact)}</dd>
          </div>
        </dl>
        <Panel>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.perYear} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={TRACK} vertical={false} />
              <XAxis dataKey="year" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 12 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={84}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${integerFormatter.format(Number(value))} mln`}
              />
              <RechartsTooltip
                cursor={{ fill: TRACK }}
                formatter={(value) => [formatMio(Number(value)), "Budgetimpact"]}
                labelFormatter={(label) => `Jaar ${label}`}
              />
              <Bar dataKey="impact" radius={[4, 4, 0, 0]}>
                {stats.perYear.map((point) => (
                  <Cell key={point.year} fill={point.year === stats.peak.year ? ACCENT_DARK : ACCENT} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Grootste projecten" description="Totaalbudget per project." />
        <Panel>
          <ul className="space-y-4">
            {stats.top.map((row) => (
              <li key={row.project} className="space-y-2">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="min-w-0 truncate font-medium">{row.project}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatMio(row.total_mio)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${(row.total_mio / maxTotal) * 100}%`, background: ACCENT }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </div>
  )
}
