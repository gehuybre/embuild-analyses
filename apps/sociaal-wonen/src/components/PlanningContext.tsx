"use client"

import { fmtEurCompact, fmtInt } from "@/lib/format"
import type { Totals } from "@/lib/filters"
import type { Horizon, Meta } from "@/lib/types"

interface Props {
  /** Totalen per horizon met dezelfde filters. Naast elkaar getoond, nooit opgeteld. */
  totals: Record<Horizon, Totals>
  /** Uitsplitsing waarbij beperkte renovatie niet in de gewone renovatiecategorie wordt meegeteld. */
  perCategorie: Record<Horizon, { nieuwbouw: Totals; renovatie: Totals; "beperkte-renovatie": Totals }>
  meta: Meta
}

const COPY: Record<Horizon, { titel: string; uitleg: string }> = {
  kt: { titel: "Korte termijn", uitleg: "Dossier klaar voor aanbesteding. Projectdetails beschikbaar." },
  lt: { titel: "Lange termijn", uitleg: "Voorontwerp geadviseerd. Timing en bedragen nog minder zeker, enkel cijfers per gemeente." },
}

export function PlanningContext({ totals, perCategorie, meta }: Props) {
  return (
    <div className="space-y-1 py-2">
      <p className="text-xs text-muted-foreground">
        Dit overzicht toont alle soorten werken, ongeacht de filter &quot;Soort werken&quot;. De tegels, kaart en tabel volgen wel de actieve filters.
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
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
                Waarvan {fmtInt(perCategorie[h].nieuwbouw.huur)} nieuwbouw, {fmtInt(perCategorie[h].renovatie.huur)} renovatie en {fmtInt(perCategorie[h]["beperkte-renovatie"].huur)} beperkte renovatie.
              </p>
            </div>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{COPY[h].uitleg}</p>
          </section>
        )
      })}
      </div>
    </div>
  )
}
