"use client"

import { useMemo, useState } from "react"
import { Download, ExternalLink } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Input } from "@embuild/shared/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@embuild/shared/components/ui/table"
import { downloadCsv } from "@/lib/csv"
import { CATEGORIE_LABELS } from "@/lib/types"
import type { AggRow, Gemeente, Horizon, Meta, Woonmaatschappij } from "@/lib/types"

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

export function VerrichtingenTable({ rows, wms, gemeenten, horizon, meta, pageSize = 100, onSelectNis, onSelectWm }: Props) {
  const [query, setQuery] = useState("")
  const [limit, setLimit] = useState(pageSize)
  const wmById = useMemo(() => new Map(wms.map((w) => [w.id, w])), [wms])
  const gemByNis = useMemo(() => new Map(gemeenten.map((g) => [g.nis, g])), [gemeenten])
  const list = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("nl")
    return needle ? rows.filter((row) => {
      const municipality = row.nis ? gemByNis.get(row.nis)?.naam ?? "" : row.gemeente_label ?? ""
      const company = wmById.get(row.wm)?.naam ?? row.wm
      return `${municipality} ${company} ${CATEGORIE_LABELS[row.categorie]}`.toLocaleLowerCase("nl").includes(needle)
    }) : rows
  }, [rows, query, gemByNis, wmById])

  function exportCsv() {
    downloadCsv(
      `sociaal-wonen-${horizon}-verrichtingen.csv`,
      [
        `Sociale woonprogrammatie, afzonderlijke verrichtingen (${meta.horizons[horizon].label.toLowerCase()})`,
        `Bron: ${meta.bron}`,
        "Projectomschrijvingen en exacte aantallen en bedragen zijn weggelaten.",
        `Gedownload op ${new Date().toLocaleDateString("nl-BE")}`,
      ],
      ["Woonmaatschappij", "Provincie", "Gemeente", "Soort werken", "Plaatsingsprocedure", "Huurwoningen (categorie)", "Kostprijs (categorie)"],
      list.map((row) => [
        wmById.get(row.wm)?.naam ?? row.wm,
        row.provincie,
        row.nis ? gemByNis.get(row.nis)?.naam ?? row.nis : row.gemeente_label ?? "Gemeente niet vermeld",
        CATEGORIE_LABELS[row.categorie],
        row.plaatsing,
        row.huur_categorie,
        row.kostprijs_categorie,
      ])
    )
  }

  if (list.length === 0) {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">Geen verrichtingen gevonden voor deze filters.</p>
  }

  return (
    <div className="space-y-2">
      <p className="rounded-md border border-dashed bg-muted/40 p-2.5 text-xs text-muted-foreground">
        Elke rij is een afzonderlijke verrichting. Projectomschrijvingen en exacte aantallen en bedragen zijn niet opgenomen.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(pageSize) }}
          placeholder="Zoek woonmaatschappij, gemeente of categorie" className="max-w-sm" aria-label="Zoek verrichtingen" />
        <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Woonmaatschappij</TableHead>
              <TableHead>Provincie</TableHead>
              <TableHead>Gemeente</TableHead>
              <TableHead>Soort werken</TableHead>
              <TableHead>Plaatsingsprocedure</TableHead>
              <TableHead>Huurwoningen (categorie)</TableHead>
              <TableHead>Kostprijs (categorie)</TableHead>
              <TableHead className="w-10"><span className="sr-only">Website</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.slice(0, limit).map((row, index) => {
              const wm = wmById.get(row.wm)
              const municipality = row.nis ? gemByNis.get(row.nis)?.naam ?? row.nis : row.gemeente_label ?? "Gemeente niet vermeld"
              return (
                <TableRow key={`${row.wm}-${row.nis ?? row.gemeente_label}-${row.categorie}-${index}`}>
                  <TableCell className="whitespace-nowrap">
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelectWm?.(row.wm)}>
                      {wm?.naam ?? row.wm}
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.provincie}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.nis ? (
                      <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelectNis?.(row.nis!)}>
                        {municipality}
                      </button>
                    ) : municipality}
                  </TableCell>
                  <TableCell>{CATEGORIE_LABELS[row.categorie]}</TableCell>
                  <TableCell>{row.plaatsing}</TableCell>
                  <TableCell>{row.huur_categorie}</TableCell>
                  <TableCell>{row.kostprijs_categorie}</TableCell>
                  <TableCell>
                    {wm && (
                      <a href={wm.url} target="_blank" rel="noopener noreferrer" aria-label={`Website van ${wm.naam}`} className="text-primary hover:opacity-70">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {list.length > limit && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setLimit((current) => current + pageSize)}>
          Meer tonen
        </Button>
      )}
    </div>
  )
}
