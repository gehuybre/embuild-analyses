"use client"

import { ExternalLink, X } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@embuild/shared/components/ui/table"
import { CATEGORIE_LABELS } from "@/lib/types"
import type { AggRow, Gemeente, Horizon, Woonmaatschappij } from "@/lib/types"

interface Props {
  nis: string
  wmId: string
  gemeenten: Gemeente[]
  wms: Woonmaatschappij[]
  rows: Record<Horizon, AggRow[]>
  onClear: () => void
  onSelectWm: (id: string) => void
}

export function SelectionDetails({ nis, wmId, gemeenten, wms, rows, onClear, onSelectWm }: Props) {
  const municipality = gemeenten.find((g) => g.nis === nis)
  const areaWm = municipality ? wms.find((w) => w.id === municipality.wm_id) : undefined
  const selectedWm = !municipality && wmId ? wms.find((w) => w.id === wmId) : undefined

  if (!municipality && !selectedWm) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Selecteer een gemeente op de kaart of een woonmaatschappij om de afzonderlijke verrichtingen te bekijken.
      </div>
    )
  }

  const scopedRows = (horizon: Horizon) => rows[horizon].filter((row) =>
    municipality ? row.nis === municipality.nis : row.wm === selectedWm!.id
  )

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-live="polite">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{municipality?.naam ?? selectedWm?.naam}</h2>
          <p className="text-sm text-muted-foreground">
            {municipality
              ? `${municipality.provincie} · werkingsgebied van ${areaWm?.naam ?? "onbekend"}`
              : `${selectedWm?.provincie} · ${selectedWm?.werkingsgebied_label}`}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClear} aria-label="Selectie wissen">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        {areaWm && <a className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href={areaWm.url} target="_blank" rel="noopener noreferrer">Website van {areaWm.naam}<ExternalLink className="h-3.5 w-3.5" /></a>}
        {selectedWm && <a className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href={selectedWm.url} target="_blank" rel="noopener noreferrer">Website van {selectedWm.naam}<ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(["kt", "lt"] as Horizon[]).map((horizon) => {
          const scoped = scopedRows(horizon)
          return (
            <section key={horizon} className="space-y-2 rounded-md border p-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {horizon === "kt" ? "Korte termijn" : "Meerjarenplanning"}
              </h3>
              {scoped.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen verrichtingen voor deze selectie.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {municipality && <TableHead>Woonmaatschappij</TableHead>}
                        <TableHead>Soort werken</TableHead>
                        <TableHead>Huurwoningen</TableHead>
                        <TableHead>Kostprijs</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scoped.map((row, index) => {
                        const wm = wms.find((item) => item.id === row.wm)
                        return (
                          <TableRow key={`${row.wm}-${row.categorie}-${index}`}>
                            {municipality && (
                              <TableCell>
                                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onSelectWm(row.wm)}>
                                  {wm?.naam ?? row.wm}
                                </button>
                              </TableCell>
                            )}
                            <TableCell>{CATEGORIE_LABELS[row.categorie]}</TableCell>
                            <TableCell>{row.huur_categorie}</TableCell>
                            <TableCell>{row.kostprijs_categorie}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}
