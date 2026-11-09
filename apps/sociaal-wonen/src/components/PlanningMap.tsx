"use client"

import { useMemo, useRef, useState } from "react"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { CATEGORIE_LABELS } from "@/lib/types"
import type { AggRow, Gemeente, MapData, Meta, Metric, Horizon, Woonmaatschappij } from "@/lib/types"

interface Props {
  map: MapData
  rows: Record<Horizon, AggRow[]>
  gemeenten: Gemeente[]
  wms: Woonmaatschappij[]
  horizon: Horizon
  metric: Metric
  meta: Meta
  wm: string
  selectedNis: string
  onSelectNis: (nis: string) => void
  onSelectWm: (wm: string) => void
}

const CLASS_COLORS = ["#dbeafe", "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a"]
const NO_DATA = "#eceff3"
type MapMode = "werkingsgebied" | "categorie"

export function PlanningMap({ map, rows, gemeenten, wms, horizon, metric, meta, wm, selectedNis, onSelectNis, onSelectWm }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [hover, setHover] = useState<{ nis: string; x: number; y: number } | null>(null)
  const mode: MapMode = "werkingsgebied"
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)
  const labels = metric === "huur" ? meta.count_bands : meta.cost_bands
  const municipalityByNis = useMemo(() => new Map(gemeenten.map((g) => [g.nis, g])), [gemeenten])
  const wmById = useMemo(() => new Map(wms.map((w) => [w.id, w])), [wms])
  const rowsByNis = useMemo(() => {
    const result = {} as Record<Horizon, Map<string, AggRow[]>>
    for (const h of ["kt", "lt"] as Horizon[]) {
      result[h] = new Map()
      for (const row of rows[h]) {
        if (!row.nis) continue
        result[h].set(row.nis, [...(result[h].get(row.nis) ?? []), row])
      }
    }
    return result
  }, [rows])
  const selected = useMemo(() => map.gemeenten.find((m) => m.nis === selectedNis), [map.gemeenten, selectedNis])

  function getBand(nis: string, h: Horizon): string | null {
    const entries = rowsByNis[h].get(nis) ?? []
    const field = metric === "huur" ? "huur_categorie" : "kostprijs_categorie"
    return entries
      .map((row) => row[field])
      .filter((label) => labels.includes(label))
      .sort((a, b) => labels.indexOf(b) - labels.indexOf(a))[0] ?? null
  }

  function fillFor(nis: string): string {
    if (mode === "werkingsgebied") {
      const municipality = municipalityByNis.get(nis)
      const area = municipality ? wmById.get(municipality.wm_id) : undefined
      if (wm && municipality?.wm_id !== wm) return "#e5e7eb"
      return area?.kleur ?? NO_DATA
    }
    const band = getBand(nis, horizon)
    const rank = band == null ? -1 : labels.indexOf(band)
    return rank < 0 ? NO_DATA : CLASS_COLORS[Math.min(CLASS_COLORS.length - 1, rank)]
  }

  function zoom(factor: number) {
    setView((v) => {
      const k = Math.min(8, Math.max(1, v.k * factor))
      const cx = map.width / 2
      const cy = map.height / 2
      return k === 1 ? { k, x: 0, y: 0 } : { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k }
    })
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d || e.buttons === 0) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved && view.k > 1) {
      const rect = wrapRef.current?.getBoundingClientRect()
      const scale = rect ? map.width / rect.width : 1
      setView((v) => ({ ...v, x: d.vx + dx * scale, y: d.vy + dy * scale }))
      setHover(null)
    }
  }

  const hoveredMunicipality = hover ? map.gemeenten.find((g) => g.nis === hover.nis) : undefined
  const hoveredArea = hoveredMunicipality ? municipalityByNis.get(hoveredMunicipality.nis) : undefined
  const markerMunicipalities = useMemo(
    () => map.gemeenten.filter((m) => (rowsByNis[horizon].get(m.nis) ?? []).length > 0),
    [map.gemeenten, rowsByNis, horizon]
  )

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative select-none rounded-lg border bg-card touch-pan-y">
        <svg
          viewBox={`0 0 ${map.width} ${map.height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={mode === "werkingsgebied" ? "Kaart van Vlaanderen met werkingsgebieden van woonmaatschappijen" : `Kaart van Vlaanderen met ${metric === "huur" ? "woningenaantallen" : "kostprijzen"} in categorieën per gemeente`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => window.setTimeout(() => (drag.current = null), 0)}
          onPointerLeave={() => setHover(null)}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {map.gemeenten.map((m) => (
              <path
                key={m.nis}
                d={m.d}
                fill={fillFor(m.nis)}
                fillRule="evenodd"
                stroke="#ffffff"
                strokeWidth={0.6}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer transition-[fill] duration-150"
                onPointerMove={(e) => {
                  if (e.buttons) return
                  const rect = wrapRef.current?.getBoundingClientRect()
                  if (rect) setHover({ nis: m.nis, x: e.clientX - rect.left, y: e.clientY - rect.top })
                }}
                onClick={() => {
                  if (drag.current?.moved) return
                  onSelectNis(m.nis === selectedNis ? "" : m.nis)
                }}
              />
            ))}
            {map.provincies.map((p) => (
              <path key={p.naam} d={p.d} fill="none" stroke="#475569" strokeWidth={0.9} strokeOpacity={0.55} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            ))}
            {mode === "werkingsgebied" && markerMunicipalities.map((m) => (
              <circle key={m.nis} cx={m.cx} cy={m.cy} r={2.2 / Math.sqrt(view.k)} fill="#111827" fillOpacity={0.82}
                stroke="#ffffff" strokeWidth={0.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            ))}
            {selected && <path d={selected.d} fill="none" stroke="#111827" strokeWidth={2.2} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          </g>
        </svg>

        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <Button type="button" size="icon" variant="outline" className="h-8 w-8 bg-background" onClick={() => zoom(1.6)} aria-label="Inzoomen">
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" className="h-8 w-8 bg-background" onClick={() => zoom(1 / 1.6)} aria-label="Uitzoomen">
            <Minus className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" className="h-8 w-8 bg-background" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="Zoom herstellen">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {hover && hoveredMunicipality && (
          <div
            className="pointer-events-none absolute z-10 w-60 rounded-md border bg-popover p-2.5 text-xs text-popover-foreground shadow-md"
            style={{ left: Math.min(hover.x + 12, (wrapRef.current?.clientWidth ?? 600) - 250), top: Math.max(hover.y - 8, 4), transform: hover.y > 220 ? "translateY(-100%)" : undefined }}
          >
            <div className="font-semibold">{hoveredMunicipality.naam}</div>
            {mode === "werkingsgebied" && (
              <div className="text-muted-foreground">Werkingsgebied: {wmById.get(hoveredArea?.wm_id ?? "")?.naam ?? "onbekend"}</div>
            )}
            <dl className="mt-1.5 space-y-0.5">
              {(["kt", "lt"] as Horizon[]).map((h) => (
                <div key={h} className={h === horizon ? "font-medium" : "text-muted-foreground"}>
                  <dt>{h === "kt" ? "Korte termijn" : "Meerjarenplanning"}:</dt>
                  <dd>
                    {(rowsByNis[h].get(hoveredMunicipality.nis) ?? []).length === 0 ? "geen planning" : (
                      <ul className="list-disc pl-4">
                        {(rowsByNis[h].get(hoveredMunicipality.nis) ?? []).map((row, i) => (
                          <li key={`${row.wm}-${row.categorie}-${i}`}>
                            {CATEGORIE_LABELS[row.categorie]} · {metric === "huur" ? row.huur_categorie : row.kostprijs_categorie}
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-1 text-[11px] text-muted-foreground">Klik voor de verrichtingen in deze gemeente</div>
          </div>
        )}
      </div>

      {mode === "werkingsgebied" ? (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Kleur = werkingsgebied (januari 2025). Een stip markeert een gemeente met een verrichting in de gekozen planning.</span>
            {wm && <button type="button" className="underline underline-offset-2" onClick={() => onSelectWm("")}>Toon alle woonmaatschappijen</button>}
          </div>
          <ul className="grid max-h-44 grid-cols-1 gap-x-4 gap-y-0.5 overflow-auto rounded-md border p-2 text-xs sm:grid-cols-2 lg:grid-cols-3" aria-label="Woonmaatschappijen">
            {wms.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => onSelectWm(w.id === wm ? "" : w.id)} aria-pressed={w.id === wm}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted ${w.id === wm ? "bg-muted font-semibold" : ""}`}>
                  <i className="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: w.kleur }} />
                  <span className="truncate">{w.naam}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Legende">
          <span className="font-medium">{metric === "huur" ? "Huurwoningen" : "Kostprijs"} per gemeente:</span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-4 rounded-sm border" style={{ background: NO_DATA }} /> geen planning
          </span>
          {labels.map((label, index) => (
            <span key={label} className="inline-flex items-center gap-1">
              <i className="inline-block h-3 w-4 rounded-sm" style={{ background: CLASS_COLORS[Math.min(CLASS_COLORS.length - 1, index)] }} />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
