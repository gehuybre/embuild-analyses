"use client"

import { fmtEurCompact, fmtInt } from "@/lib/format"
import type { Totals } from "@/lib/filters"
import type { Horizon, Meta } from "@/lib/types"

interface Props {
  horizon: Horizon
  onChange: (h: Horizon) => void
  /** Totalen per horizon met dezelfde filters. Naast elkaar getoond, nooit opgeteld. */
  totals: Record<Horizon, Totals>
  /** Uitsplitsing naar soort werken: het grootste deel is renovatie, dat mag het totaal niet als nieuwbouw laten lezen. */
  perGroep: Record<Horizon, { nieuwbouw: Totals; renovatie: Totals }>
  meta: Meta
}

const COPY: Record<Horizon, { titel: string; uitleg: string }> = {
  kt: { titel: "Korte termijn", uitleg: "Dossier klaar voor aanbesteding. Projectdetails beschikbaar." },
  lt: { titel: "Lange termijn", uitleg: "Voorontwerp geadviseerd. Timing en bedragen nog minder zeker, enkel cijfers per gemeente." },
}

export function HorizonSwitch({ horizon, onChange, totals, perGroep, meta }: Props) {
  return (
    <div role="radiogroup" aria-label="Planningshorizon" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {(["kt", "lt"] as Horizon[]).map((h) => {
        const active = h === horizon
        const t = totals[h]
        return (
          <button
            key={h}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(h)}
            className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/60"}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{COPY[h].titel}</span>
              <span className="text-xs text-muted-foreground">{meta.horizons[h].omschrijving}</span>
            </div>
            <div className="mt-1 text-sm tabular-nums">
              {fmtInt(t.huur)} huurwoningen · {fmtEurCompact(t.kostprijs)}
            </div>
            <div className="mt-0.5 text-xs tabular-nums">
              waarvan nieuwbouw {fmtInt(perGroep[h].nieuwbouw.huur)} · renovatie {fmtInt(perGroep[h].renovatie.huur)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{COPY[h].uitleg}</div>
          </button>
        )
      })}
    </div>
  )
}
