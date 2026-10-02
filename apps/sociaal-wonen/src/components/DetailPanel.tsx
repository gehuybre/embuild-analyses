"use client"

import { ExternalLink, X } from "lucide-react"
import { Button, buttonVariants } from "@embuild/shared/components/ui/button"
import { cn } from "@embuild/shared/lib/utils"
import { sumRows } from "@/lib/filters"
import { fmtEurCompact, fmtInt, titleCaseProv } from "@/lib/format"
import type { AggRow, Gemeente, Horizon, Woonmaatschappij } from "@/lib/types"

interface Props {
  nis: string
  wmId: string
  gemeenten: Gemeente[]
  wms: Woonmaatschappij[]
  /** Rijen per horizon, gefilterd op alles behalve gemeente en woonmaatschappij. */
  rows: Record<Horizon, AggRow[]>
  onClear: () => void
  onSelectWm: (id: string) => void
}

function WebsiteButton({ wm, primary }: { wm: Woonmaatschappij; primary?: boolean }) {
  return (
    <a
      href={wm.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: primary ? "default" : "outline", size: "sm" }), "no-underline")}
    >
      Naar de website van {wm.naam}
      <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
    </a>
  )
}

export function DetailPanel({ nis, wmId, gemeenten, wms, rows, onClear, onSelectWm }: Props) {
  const wmById = new Map(wms.map((w) => [w.id, w]))
  const gem = nis ? gemeenten.find((g) => g.nis === nis) : undefined
  const areaWm = gem ? wmById.get(gem.wm_id) : undefined
  const focusWm = !gem && wmId ? wmById.get(wmId) : undefined

  if (!gem && !focusWm) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Klik op een gemeente of kies een woonmaatschappij om de planning te bekijken en door te klikken naar de website van de juiste woonmaatschappij.
      </div>
    )
  }

  const scoped = (h: Horizon) => rows[h].filter((r) => (gem ? r.nis === gem.nis : r.wm === focusWm!.id))

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-live="polite">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold leading-tight">{gem ? gem.naam : focusWm!.naam}</h3>
          <p className="text-sm text-muted-foreground">
            {gem
              ? `${titleCaseProv(gem.provincie)} · werkingsgebied van ${areaWm?.naam ?? "onbekend"}${areaWm?.werkingsgebied_label ? ` (${areaWm.werkingsgebied_label})` : ""}`
              : `${titleCaseProv(focusWm!.provincie)} · ${focusWm!.werkingsgebied_label} · ${focusWm!.gemeenten.length} ${focusWm!.gemeenten.length === 1 ? "gemeente" : "gemeenten"} in het werkingsgebied`}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClear} aria-label="Selectie wissen">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {gem && areaWm && <WebsiteButton wm={areaWm} primary />}
        {focusWm && <WebsiteButton wm={focusWm} primary />}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["kt", "lt"] as Horizon[]).map((h) => {
          const r = scoped(h)
          const t = sumRows(r)
          // per woonmaatschappij (bij een gemeente kunnen meerdere WM's plannen hebben)
          const perWm = new Map<string, AggRow[]>()
          r.forEach((x) => perWm.set(x.wm, [...(perWm.get(x.wm) ?? []), x]))
          return (
            <div key={h} className="rounded-md border p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{h === "kt" ? "Korte termijn" : "Lange termijn"}</div>
              {r.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Geen planning.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm font-medium tabular-nums">{fmtInt(t.huur)} huurwoningen · {fmtEurCompact(t.kostprijs)}</p>
                  {gem && (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {Array.from(perWm.entries()).map(([id, list]) => {
                        const w = wmById.get(id)
                        const wt = sumRows(list)
                        return (
                          <li key={id} className="flex flex-wrap items-center justify-between gap-x-2">
                            <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelectWm(id)}>{w?.naam ?? id}</button>
                            <span className="tabular-nums text-muted-foreground">{fmtInt(wt.huur)} woningen · {fmtEurCompact(wt.kostprijs)}</span>
                            {w && id !== gem.wm_id && (
                              <a href={w.url} target="_blank" rel="noopener noreferrer" className="basis-full text-xs text-primary hover:underline">
                                Website van {w.naam}
                              </a>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
