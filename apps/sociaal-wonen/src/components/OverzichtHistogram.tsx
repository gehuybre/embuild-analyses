"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { CATEGORIE_LABELS } from "@/lib/types"
import type { AggRow, Categorie, Meta } from "@/lib/types"

const COLORS: Record<Categorie, string> = {
  nieuwbouw: "#1e3a8a",
  vervangingsbouw: "#2563eb",
  renovatie: "#60a5fa",
  ssi: "#94a3b8",
}
const ORDER: Categorie[] = ["nieuwbouw", "vervangingsbouw", "renovatie", "ssi"]
const SHORT: Record<Categorie, string> = { nieuwbouw: "Nieuwbouw", vervangingsbouw: "Vervangingsbouw", renovatie: "Renovatie", ssi: "Sloop en Infrastructuur" }

type Point = { klasse: string } & Partial<Record<Categorie, number>>

function histogram(rows: AggRow[], labels: string[], pick: (r: AggRow) => string): Point[] {
  const points: Point[] = labels.map((klasse) => ({ klasse }))
  for (const r of rows) {
    const p = points.find((x) => x.klasse === pick(r))
    if (p) p[r.categorie] = (p[r.categorie] ?? 0) + 1
  }
  return points.filter((p, i) => ORDER.some((c) => (p[c] ?? 0) > 0) || (i > 0 && i < labels.length - 1))
}

function Chart({ title, data }: { title: string; data: Point[] }) {
  const used = ORDER.filter((c) => data.some((p) => (p[c] ?? 0) > 0))
  return (
    <figure className="min-w-0 space-y-1" aria-label={title}>
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.3} />
            <XAxis dataKey="klasse" tick={{ fontSize: 11 }} interval={0} tickFormatter={(v: string) => v.replace("Minder dan ", "< ").replace("Meer dan ", "> ").replace("Niet beschikbaar in bron", "n.b.")} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => [`${v} verrichtingen`, name]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {used.map((c) => (
              <Bar key={c} dataKey={c} name={SHORT[c]} stackId="a" fill={COLORS[c]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

/** Histogram van het aantal verrichtingen per grootteklasse; toont enkel klassen, nooit exacte waarden. */
export function OverzichtHistogram({ rows, meta, horizonLabel }: { rows: AggRow[]; meta: Meta; horizonLabel: string }) {
  const counts = useMemo(() => histogram(rows, meta.count_bands.filter((l) => l !== "Geen huurwoningen"), (r) => r.huur_categorie), [rows, meta])
  const costs = useMemo(() => histogram(rows, meta.cost_bands, (r) => r.kostprijs_categorie), [rows, meta])
  if (rows.length === 0) return null
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Overzicht per grootteklasse">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Overzicht per grootteklasse ({horizonLabel === "Korte termijn" ? "korte termijn" : "meerjarenplanning"})</h2>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Chart title="Verrichtingen per aantal huurwoningen" data={counts} />
        <Chart title="Verrichtingen per kostprijs" data={costs} />
      </div>
    </section>
  )
}
