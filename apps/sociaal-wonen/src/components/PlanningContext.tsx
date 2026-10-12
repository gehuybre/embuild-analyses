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
    <div className="space-y-2">
      {(["kt", "lt"] as Horizon[]).map((h) => {
        const t = totals[h]
        return (
          <p key={h} className="text-sm text-muted-foreground">
            <strong className="text-foreground">{COPY[h].titel}</strong>
            <br />
            {meta.horizons[h].omschrijving}
            <br />
            <span className="tabular-nums">{fmtInt(t.huur)} huurwoningen · {fmtEurCompact(t.kostprijs)}</span>
            <br />
            <span className="tabular-nums">waarvan nieuwbouw {fmtInt(perGroep[h].nieuwbouw.huur)} · renovatie {fmtInt(perGroep[h].renovatie.huur)}</span>
            <br />
            {COPY[h].uitleg}
          </p>
        )
      })}
    </div>
  )
}
