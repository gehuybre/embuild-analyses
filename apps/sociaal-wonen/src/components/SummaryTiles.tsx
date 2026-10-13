import { fmtEurCompact, fmtInt } from "@/lib/format"
import type { Totals } from "@/lib/filters"

interface Props {
  totals: Totals
  /** Uitsplitsing waarbij beperkte renovatie apart blijft van gewone renovatie. */
  perCategorie: { nieuwbouw: Totals; renovatie: Totals; "beperkte-renovatie": Totals }
  wmCount: number
  gemeenteCount: number
  zonderGemeente: number
}

export function SummaryTiles({ totals, perCategorie, wmCount, gemeenteCount, zonderGemeente }: Props) {
  const tiles = [
    {
      label: "Huurwoningen",
      value: fmtInt(totals.huur),
      sub: `nieuwbouw ${fmtInt(perCategorie.nieuwbouw.huur)} · renovatie ${fmtInt(perCategorie.renovatie.huur)} · beperkte renovatie ${fmtInt(perCategorie["beperkte-renovatie"].huur)}`,
    },
    {
      label: "Geraamde kostprijs",
      value: fmtEurCompact(totals.kostprijs),
      sub: `nieuwbouw ${fmtEurCompact(perCategorie.nieuwbouw.kostprijs)} · renovatie ${fmtEurCompact(perCategorie.renovatie.kostprijs)} · beperkte renovatie ${fmtEurCompact(perCategorie["beperkte-renovatie"].kostprijs)}`,
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
