"use client"

import { fmtEurCompact, fmtInt } from "@/lib/format"
import type { Totals } from "@/lib/filters"
import type { Horizon, Meta } from "@/lib/types"

interface Props {
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

export function PlanningContext({ totals, perGroep, meta }: Props) {
  return (
    <div className="grid grid-cols-1 gap-6 py-2 md:grid-cols-2 md:gap-10">
      {(["kt", "lt"] as Horizon[]).map((h) => {
        const t = totals[h]
        return (
          <section key={h} className="min-w-0 space-y-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{COPY[h].titel}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{meta.horizons[h].omschrijving}.</p>
            </div>
            <div className="space-y-1">
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm tabular-nums text-foreground">
                <span><strong className="text-lg font-semibold">{fmtInt(t.huur)}</strong> huurwoningen</span>
                <span><strong className="text-lg font-semibold">{fmtEurCompact(t.kostprijs)}</strong> geraamde kostprijs</span>
              </p>
              <p className="text-sm leading-relaxed tabular-nums text-muted-foreground">
                Waarvan {fmtInt(perGroep[h].nieuwbouw.huur)} nieuwbouw en {fmtInt(perGroep[h].renovatie.huur)} renovatie.
              </p>
            </div>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{COPY[h].uitleg}</p>
          </section>
        )
      })}
    </div>
  )
}
