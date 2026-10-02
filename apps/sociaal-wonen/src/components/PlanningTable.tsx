"use client"

import { useMemo, useState } from "react"
import { Download, ExternalLink } from "lucide-react"
import { Badge } from "@embuild/shared/components/ui/badge"
import { Button } from "@embuild/shared/components/ui/button"
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow, TableHead } from "@embuild/shared/components/ui/table"
import { downloadCsv } from "@/lib/csv"
import { sumRows } from "@/lib/filters"
import { fmtEur, fmtInt, titleCaseProv } from "@/lib/format"
import type { AggRow, Gemeente, Horizon, Meta, Woonmaatschappij } from "@/lib/types"
import { SortableHead, compare, nextSort } from "./SortableHead"
import type { Sort } from "./SortableHead"

const DEFAULT_PAGE = 100

interface Props {
  rows: AggRow[]
  wms: Woonmaatschappij[]
  gemeenten: Gemeente[]
  horizon: Horizon
  meta: Meta
  onSelectNis: (nis: string) => void
  onSelectWm: (id: string) => void
  /** Kleiner in embeds, zodat de iframe niet onnodig hoog wordt. */
  pageSize?: number
}

export function PlanningTable({ rows, wms, gemeenten, horizon, meta, onSelectNis, onSelectWm, pageSize = DEFAULT_PAGE }: Props) {
  const [sort, setSort] = useState<Sort>({ key: "kostprijs", dir: "desc" })
  const [limit, setLimit] = useState(pageSize)
  const wmById = useMemo(() => new Map(wms.map((w) => [w.id, w])), [wms])
  const gemByNis = useMemo(() => new Map(gemeenten.map((g) => [g.nis, g])), [gemeenten])
  const gemName = (r: AggRow) => (r.nis ? gemByNis.get(r.nis)?.naam ?? r.nis : r.gemeente_label ?? "–")

  const sorted = useMemo(() => {
    const val = (r: AggRow): string | number | null => {
      switch (sort.key) {
        case "wm": return wmById.get(r.wm)?.naam ?? r.wm
        case "provincie": return r.provincie
        case "gemeente": return gemName(r)
        case "type": return r.type
        case "procedure": return r.procedure
        case "huur": return r.huur
        case "kostprijs": return r.kostprijs
        case "max": return r.maximumprijs_vmsw || null
        case "up": return r.bedrag_up
        default: return null
      }
    }
    return [...rows].sort((a, b) => compare(val(a), val(b), sort.dir) || compare(gemName(a), gemName(b), "asc"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, wmById, gemByNis])

  const totals = useMemo(() => sumRows(rows), [rows])
  const onSort = (k: string) => setSort((s) => nextSort(s, k, ["huur", "kostprijs", "max", "up"].includes(k)))
  const shown = sorted.slice(0, limit)

  function exportCsv() {
    downloadCsv(
      `sociaal-wonen-${horizon}-planning.csv`,
      [
        `Sociale huurplanning, ${meta.horizons[horizon].label.toLowerCase()} (${meta.horizons[horizon].omschrijving})`,
        `Bron: ${meta.bron}`,
        "Kostprijs = geraamde kostprijs van de werken; Maximumprijs VMSW = FS4-plafond; Bedrag UP = subsidiabel bedrag",
        `Gedownload op ${new Date().toLocaleDateString("nl-BE")}`,
      ],
      ["Woonmaatschappij", "Website", "Provincie", "Gemeente", "NIS", "Type", "Procedure", "Aantal huurwoningen", "Kostprijs (EUR)", "Maximumprijs VMSW (EUR)", "Bedrag UP (EUR)", "Aantal verrichtingen"],
      sorted.map((r) => [
        wmById.get(r.wm)?.naam ?? r.wm, wmById.get(r.wm)?.url ?? "", titleCaseProv(r.provincie), gemName(r), r.nis ?? "",
        r.type, r.procedure ?? "", r.huur, r.kostprijs, r.n_maximumprijs ? r.maximumprijs_vmsw : "", r.bedrag_up, r.n,
      ])
    )
  }

  if (rows.length === 0) {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">Geen planning gevonden voor deze combinatie van filters.</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {fmtInt(rows.length)} rijen (woonmaatschappij x gemeente x type x procedure). SSI-projecten zijn niet inbegrepen.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Woonmaatschappij" k="wm" sort={sort} onSort={onSort} />
              <SortableHead label="Provincie" k="provincie" sort={sort} onSort={onSort} />
              <SortableHead label="Gemeente" k="gemeente" sort={sort} onSort={onSort} />
              <SortableHead label="Type" k="type" sort={sort} onSort={onSort} />
              <SortableHead label="Procedure" k="procedure" sort={sort} onSort={onSort} title="Kolom Extra info uit de bron: bv. CBO, D&B, raamcontract, beperkte renovatie" />
              <SortableHead label="Huurwoningen" k="huur" sort={sort} onSort={onSort} align="right" />
              <SortableHead label="Kostprijs" k="kostprijs" sort={sort} onSort={onSort} align="right" title="Geraamde kostprijs van de werken" />
              <SortableHead label="Max. prijs VMSW" k="max" sort={sort} onSort={onSort} align="right" title="FS4-plafond. Niet ingevuld voor alle verrichtingen." />
              <SortableHead label="Subsidiabel (UP)" k="up" sort={sort} onSort={onSort} align="right" title="Bedrag UP: subsidiabel bedrag, berekend op basis van kostprijs en maximumprijs" />
              <TableHead className="w-10"><span className="sr-only">Website</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r, i) => {
              const w = wmById.get(r.wm)
              return (
                <TableRow key={`${r.wm}-${r.nis ?? r.gemeente_label}-${r.type}-${i}`}>
                  <TableCell className="whitespace-nowrap">
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelectWm(r.wm)}>{w?.naam ?? r.wm}</button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{titleCaseProv(r.provincie)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.nis ? (
                      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelectNis(r.nis!)}>{gemName(r)}</button>
                    ) : (
                      <span className="italic text-muted-foreground">{gemName(r)}</span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="secondary" title={meta.types[r.type]}>{r.type === "ONBEKEND" ? "?" : r.type}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{r.procedure ?? "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(r.huur)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtEur(r.kostprijs)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {r.n_maximumprijs ? (
                      <>
                        {fmtEur(r.maximumprijs_vmsw)}
                        {r.n_maximumprijs < r.n && <span title="Niet voor alle verrichtingen ingevuld">*</span>}
                      </>
                    ) : "–"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtEur(r.bedrag_up)}</TableCell>
                  <TableCell>
                    {w && (
                      <a href={w.url} target="_blank" rel="noopener noreferrer" aria-label={`Website van ${w.naam}`} className="text-primary hover:opacity-70">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5} className="font-semibold">Totaal ({horizon.toUpperCase()}, volgens filters)</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{fmtInt(totals.huur)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">{fmtEur(totals.kostprijs)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">{fmtEur(totals.maximumprijs_vmsw)}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">{fmtEur(totals.bedrag_up)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {sorted.length > limit && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setLimit((l) => l + pageSize)}>
          Toon meer ({fmtInt(sorted.length - limit)} resterend)
        </Button>
      )}
    </div>
  )
}
