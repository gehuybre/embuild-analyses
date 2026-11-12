"use client"

import { useMemo, useState } from "react"
import { Download, ExternalLink } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@embuild/shared/components/ui/table"
import { downloadCsv } from "@/lib/csv"
import { CATEGORIE_LABELS } from "@/lib/types"
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
  pageSize?: number
  onSelectNis?: (nis: string) => void
  onSelectWm?: (wm: string) => void
}

export function PlanningTable({ rows, wms, gemeenten, horizon, meta, pageSize = DEFAULT_PAGE, onSelectNis, onSelectWm }: Props) {
  const [sort, setSort] = useState<Sort>({ key: "gemeente", dir: "asc" })
  const [limit, setLimit] = useState(pageSize)
  const wmById = useMemo(() => new Map(wms.map((w) => [w.id, w])), [wms])
  const gemByNis = useMemo(() => new Map(gemeenten.map((g) => [g.nis, g])), [gemeenten])
  const gemName = (r: AggRow) => (r.nis ? gemByNis.get(r.nis)?.naam ?? r.nis : r.gemeente_label ?? "–")

  const sorted = useMemo(() => {
    const val = (r: AggRow): string | null => {
      switch (sort.key) {
        case "wm": return wmById.get(r.wm)?.naam ?? r.wm
        case "provincie": return r.provincie
        case "gemeente": return gemName(r)
        case "categorie": return CATEGORIE_LABELS[r.categorie]
        case "huur": return r.huur_categorie
        case "kostprijs": return r.kostprijs_categorie
        default: return null
      }
    }
    return [...rows].sort((a, b) => compare(val(a), val(b), sort.dir))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, wmById, gemByNis])

  function exportCsv() {
    downloadCsv(
      `sociaal-wonen-${horizon}-categorieen.csv`,
      [
        `Sociale woonprogrammatie, ${meta.horizons[horizon].label.toLowerCase()}`,
        `Bron: ${meta.bron}`,
        "Categorieën per woonmaatschappij, gemeente en werksoort; algemene totalen en exacte waarden zijn weggelaten.",
        `Gedownload op ${new Date().toLocaleDateString("nl-BE")}`,
      ],
      ["Woonmaatschappij", "Provincie", "Gemeente", "Soort werken", "Plaatsingsprocedure", "Huurwoningen (categorie)", "Kostprijs (categorie)"],
      sorted.map((r) => [
        wmById.get(r.wm)?.naam ?? r.wm,
        r.provincie,
        gemName(r),
        CATEGORIE_LABELS[r.categorie],
        r.plaatsing,
        r.huur_categorie,
        r.kostprijs_categorie,
      ])
    )
  }

  if (rows.length === 0) {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">Geen planning gevonden voor deze filters.</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span />
        <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Woonmaatschappij" k="wm" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, false))} />
              <SortableHead label="Provincie" k="provincie" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, false))} />
              <SortableHead label="Gemeente" k="gemeente" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, false))} />
              <SortableHead label="Soort werken" k="categorie" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, false))} />
              <TableHead>Plaatsingsprocedure</TableHead>
              <SortableHead label="Huurwoningen (categorie)" k="huur" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, false))} />
              <SortableHead label="Kostprijs" k="kostprijs" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k, false))} />
              <TableHead className="w-10"><span className="sr-only">Website</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.slice(0, limit).map((r, i) => (
              <TableRow key={`${r.wm}-${r.nis ?? r.gemeente_label}-${r.categorie}-${i}`}>
                <TableCell className="whitespace-nowrap">
                  <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelectWm?.(r.wm)}>
                    {wmById.get(r.wm)?.naam ?? r.wm}
                  </button>
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.provincie}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.nis ? (
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelectNis?.(r.nis!)}>
                      {gemName(r)}
                    </button>
                  ) : gemName(r)}
                </TableCell>
                <TableCell className="whitespace-nowrap">{CATEGORIE_LABELS[r.categorie]}</TableCell>
                <TableCell className="whitespace-nowrap">{r.plaatsing}</TableCell>
                <TableCell className="whitespace-nowrap">{r.huur_categorie}</TableCell>
                <TableCell className="whitespace-nowrap">{r.kostprijs_categorie}</TableCell>
                <TableCell>
                  {wmById.get(r.wm)?.url && (
                    <a href={wmById.get(r.wm)!.url} target="_blank" rel="noopener noreferrer" aria-label={`Website van ${wmById.get(r.wm)!.naam}`} className="text-primary hover:opacity-70">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {sorted.length > limit && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setLimit((l) => l + pageSize)}>
          Meer tonen
        </Button>
      )}
    </div>
  )
}
