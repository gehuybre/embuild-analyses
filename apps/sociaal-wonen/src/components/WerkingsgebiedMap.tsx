"use client"

import { useMemo, useRef, useState } from "react"
import { Minus, Plus, RotateCcw } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { classOf, quantileBreaks } from "@/lib/filters"
import type { Totals } from "@/lib/filters"
import { fmtEurCompact, fmtInt } from "@/lib/format"
import type { Gemeente, Horizon, MapData, Metric, Modus, Woonmaatschappij } from "@/lib/types"

type ByNis = Map<string, Totals & { wms: Set<string> }>

interface Props {
  map: MapData
  gemeenten: Gemeente[]
  wms: Woonmaatschappij[]
  /** Totalen per gemeente, per horizon, met dezelfde filters. Nooit opgeteld. */
  data: Record<Horizon, ByNis>
  horizon: Horizon
  modus: Modus
  metric: Metric
  wm: string
  selectedNis: string
  onSelectNis: (nis: string) => void
  onSelectWm: (id: string) => void
}

// Sequentieel blauw, 5 klassen (licht naar donker)
const CLASS_COLORS = ["#dbeafe", "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a"]
const NO_DATA = "#eceff3"
const DIMMED = "#e5e7eb"

export function WerkingsgebiedMap({ map, gemeenten, wms, data, horizon, modus, metric, wm, selectedNis, onSelectNis, onSelectWm }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [hover, setHover] = useState<{ nis: string; x: number; y: number } | null>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null)

  const gemByNis = useMemo(() => new Map(gemeenten.map((g) => [g.nis, g])), [gemeenten])
  const wmById = useMemo(() => new Map(wms.map((w) => [w.id, w])), [wms])
  const current = data[horizon]
  const value = (t: Totals | undefined) => (t ? (metric === "huur" ? t.huur : t.kostprijs) : 0)

  const values = useMemo(() => Array.from(current.values()).map(value), [current, metric]) // eslint-disable-line react-hooks/exhaustive-deps
  const breaks = useMemo(() => quantileBreaks(values, 5), [values])
  const maxValue = useMemo(() => Math.max(0, ...values), [values])
  const fmt = (v: number) => (metric === "huur" ? `${fmtInt(v)} woningen` : fmtEurCompact(v))

  function fillFor(nis: string): string {
    const g = gemByNis.get(nis)
    if (modus === "wm") {
      if (!g) return NO_DATA
      if (wm && g.wm_id !== wm) return DIMMED
      return wmById.get(g.wm_id)?.kleur ?? NO_DATA
    }
    const v = value(current.get(nis))
    return v > 0 ? CLASS_COLORS[Math.min(CLASS_COLORS.length - 1, classOf(v, breaks))] : NO_DATA
  }

  function zoom(factor: number) {
    setView((v) => {
      const k = Math.min(8, Math.max(1, v.k * factor))
      // zoom rond het midden van de kaart
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
  function onPointerUp() {
    window.setTimeout(() => (drag.current = null), 0)
  }

  const hoverG = hover ? gemByNis.get(hover.nis) : undefined
  const hoverWm = hoverG ? wmById.get(hoverG.wm_id) : undefined
  const selected = selectedNis ? map.gemeenten.find((m) => m.nis === selectedNis) : undefined
  const dots = useMemo(
    () => (modus === "wm" ? map.gemeenten.filter((m) => value(current.get(m.nis)) > 0) : []),
    [modus, map, current, metric] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className="relative rounded-lg border bg-card select-none touch-pan-y">
        <svg
          viewBox={`0 0 ${map.width} ${map.height}`}
          className="w-full h-auto block"
          role="img"
          aria-label={
            modus === "wm"
              ? "Kaart van Vlaanderen met het werkingsgebied van elke woonmaatschappij"
              : `Kaart van Vlaanderen met ${metric === "huur" ? "het aantal geplande huurwoningen" : "de geplande kostprijs"} per gemeente`
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
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
              <path
                key={p.naam}
                d={p.d}
                fill="none"
                stroke="#475569"
                strokeWidth={0.9}
                strokeOpacity={0.55}
                fillRule="evenodd"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
            {dots.map((m) => {
              const t = current.get(m.nis)
              const v = value(t)
              const r = (2.2 + 8 * Math.sqrt(v / (maxValue || 1))) / Math.sqrt(view.k)
              // Holle bol: geen enkele planning hier komt van de woonmaatschappij van dit werkingsgebied
              const outside = !t?.wms.has(gemByNis.get(m.nis)?.wm_id ?? "")
              return outside ? (
                <circle key={m.nis} cx={m.cx} cy={m.cy} r={r} fill="#ffffff" fillOpacity={0.75} stroke="#111827" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              ) : (
                <circle key={m.nis} cx={m.cx} cy={m.cy} r={r} fill="#111827" fillOpacity={0.82} stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              )
            })}
            {selected && (
              <path d={selected.d} fill="none" stroke="#111827" strokeWidth={2.2} fillRule="evenodd" vectorEffect="non-scaling-stroke" pointerEvents="none" />
            )}
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

        {hover && hoverG && (
          <div
            className="pointer-events-none absolute z-10 w-60 rounded-md border bg-popover p-2.5 text-xs text-popover-foreground shadow-md"
            style={{ left: Math.min(hover.x + 12, (wrapRef.current?.clientWidth ?? 600) - 250), top: Math.max(hover.y - 8, 4), transform: hover.y > 220 ? "translateY(-100%)" : undefined }}
          >
            <div className="text-sm font-semibold">{hoverG.naam}</div>
            <div className="text-muted-foreground">
              Werkingsgebied: {hoverWm?.naam ?? "onbekend"}
            </div>
            <dl className="mt-1.5 space-y-0.5">
              {(["kt", "lt"] as Horizon[]).map((h) => {
                const t = data[h].get(hover.nis)
                return (
                  <div key={h} className={h === horizon ? "font-medium" : "text-muted-foreground"}>
                    <dt className="inline">{h === "kt" ? "Korte termijn" : "Lange termijn"}: </dt>
                    <dd className="inline">{t ? `${fmtInt(t.huur)} huurwoningen, ${fmtEurCompact(t.kostprijs)}` : "geen planning"}</dd>
                  </div>
                )
              })}
            </dl>
            {modus === "wm" && current.get(hover.nis) && !current.get(hover.nis)!.wms.has(hoverG.wm_id) && (
              <div className="mt-1 text-[11px]">Planning van een woonmaatschappij buiten haar huidig werkingsgebied.</div>
            )}
            <div className="mt-1 text-[11px] text-muted-foreground">Klik voor details en de website van de woonmaatschappij</div>
          </div>
        )}
      </div>

      {modus === "gemeente" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Legende">
          <span className="font-medium">{metric === "huur" ? "Huurwoningen" : "Kostprijs"} per gemeente:</span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-3 w-4 rounded-sm border" style={{ background: NO_DATA }} /> geen planning
          </span>
          {values.length > 0 &&
            Array.from({ length: breaks.length + 1 }, (_, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <i className="inline-block h-3 w-4 rounded-sm" style={{ background: CLASS_COLORS[i] }} />
                {breaks.length === 0 ? "met planning" : i === 0 ? `minder dan ${fmt(breaks[0])}` : `vanaf ${fmt(breaks[i - 1])}`}
              </span>
            ))}
        </div>
      ) : (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Kleur = werkingsgebied (januari 2025). Volle bol = gemeente met planning van de woonmaatschappij van dat werkingsgebied. Holle bol = planning van een woonmaatschappij buiten haar huidig werkingsgebied, bv. projecten die nog moeten worden overgedragen. Grootte volgens {metric === "huur" ? "aantal huurwoningen" : "kostprijs"}.
            </span>
            {wm && (
              <button type="button" className="underline underline-offset-2" onClick={() => onSelectWm("")}>
                Toon alle woonmaatschappijen
              </button>
            )}
          </div>
          <ul className="grid max-h-44 grid-cols-1 gap-x-4 gap-y-0.5 overflow-auto rounded-md border p-2 text-xs sm:grid-cols-2 lg:grid-cols-3" aria-label="Woonmaatschappijen">
            {wms.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => onSelectWm(w.id === wm ? "" : w.id)}
                  aria-pressed={w.id === wm}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted ${w.id === wm ? "bg-muted font-semibold" : ""}`}
                >
                  <i className="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ background: w.kleur }} />
                  <span className="truncate">{w.naam}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
