import { fmtEurCompact, fmtInt } from "@/lib/format"
import type { Totals } from "@/lib/filters"

interface Props {
  totals: Totals
  /** Uitsplitsing naar soort werken, zodat renovatie-aantallen niet als nieuwbouw gelezen worden. */
  perGroep: { nieuwbouw: Totals; renovatie: Totals }
  wmCount: number
  gemeenteCount: number
  zonderGemeente: number
}

export function SummaryTiles({ totals, perGroep, wmCount, gemeenteCount, zonderGemeente }: Props) {
  const tiles = [
    {
      label: "Huurwoningen",
      value: fmtInt(totals.huur),
      sub: `nieuwbouw ${fmtInt(perGroep.nieuwbouw.huur)} · renovatie ${fmtInt(perGroep.renovatie.huur)}`,
    },
    {
      label: "Geraamde kostprijs",
      value: fmtEurCompact(totals.kostprijs),
      sub: `nieuwbouw ${fmtEurCompact(perGroep.nieuwbouw.kostprijs)} · renovatie ${fmtEurCompact(perGroep.renovatie.kostprijs)}`,
    },
    { label: "Woonmaatschappijen", value: fmtInt(wmCount) },
    { label: "Gemeenten", value: fmtInt(gemeenteCount) },
  ]
  return (
    <div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{t.label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">{t.value}</dd>
            {t.sub && <dd className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{t.sub}</dd>}
          </div>
        ))}
      </dl>
      {zonderGemeente > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Waarvan {fmtInt(zonderGemeente)} huurwoningen zonder (eenduidige) gemeente: ze staan in de tabel, niet op de kaart.
        </p>
      )}
    </div>
  )
}
