"use client"

import { useMemo, useState } from "react"
import { Download, ExternalLink } from "lucide-react"
import { Badge } from "@embuild/shared/components/ui/badge"
import { Button } from "@embuild/shared/components/ui/button"
import { Input } from "@embuild/shared/components/ui/input"
import { Table, TableBody, TableCell, TableHeader, TableRow, TableHead } from "@embuild/shared/components/ui/table"
import { downloadCsv } from "@/lib/csv"
import { fmtDate, fmtEur, fmtInt, titleCaseProv } from "@/lib/format"
import type { Gemeente, Meta, Project, Woonmaatschappij } from "@/lib/types"
import { SortableHead, compare, nextSort } from "./SortableHead"
import type { Sort } from "./SortableHead"

const DEFAULT_PAGE = 100

interface Props {
  projects: Project[]
  wms: Woonmaatschappij[]
  gemeenten: Gemeente[]
  meta: Meta
  /** Kleiner in embeds, zodat de iframe niet onnodig hoog wordt. */
  pageSize?: number
}

/** Enkel voor de KT-horizon. Wordt nooit gerenderd met LT-data. */
export function ProjectTable({ projects, wms, gemeenten, meta, pageSize = DEFAULT_PAGE }: Props) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<Sort>({ key: "kostprijs", dir: "desc" })
  const [limit, setLimit] = useState(pageSize)
  const wmById = useMemo(() => new Map(wms.map((w) => [w.id, w])), [wms])
  const gemByNis = useMemo(() => new Map(gemeenten.map((g) => [g.nis, g])), [gemeenten])
  const gemName = (p: Project) => (p.nis ? gemByNis.get(p.nis)?.naam ?? p.nis : p.gemeente_label ?? "–")

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const f = needle
      ? projects.filter((p) => `${p.projectomschrijving} ${gemName(p)} ${wmById.get(p.wm)?.naam ?? ""} ${p.procedure ?? ""}`.toLowerCase().includes(needle))
      : projects
    const val = (p: Project): string | number | null => {
      switch (sort.key) {
        case "wm": return wmById.get(p.wm)?.naam ?? p.wm
        case "gemeente": return gemName(p)
        case "omschrijving": return p.projectomschrijving
        case "type": return p.type
        case "procedure": return p.procedure
        case "huur": return p.huur
        case "kostprijs": return p.kostprijs
        case "up": return p.bedrag_up
        case "datum": return p.datum_beslissing
        default: return null
      }
    }
    return [...f].sort((a, b) => compare(val(a), val(b), sort.dir))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, q, sort, wmById, gemByNis])

  const onSort = (k: string) => setSort((s) => nextSort(s, k, ["huur", "kostprijs", "up", "datum"].includes(k)))

  function exportCsv() {
    downloadCsv(
      "sociaal-wonen-kt-projecten.csv",
      [
        "Sociale huurplanning, korte termijn: verrichtingen klaar voor aanbesteding",
        `Bron: ${meta.bron}`,
        "Datum = datum opname programmatie",
        `Gedownload op ${new Date().toLocaleDateString("nl-BE")}`,
      ],
      ["Woonmaatschappij", "Website", "Provincie", "Gemeente", "Projectomschrijving", "Type", "Procedure", "Aantal huurwoningen", "Kostprijs (EUR)", "Maximumprijs VMSW (EUR)", "Bedrag UP (EUR)", "Datum opname programmatie"],
      list.map((p) => [
        wmById.get(p.wm)?.naam ?? p.wm, wmById.get(p.wm)?.url ?? "", titleCaseProv(p.provincie), gemName(p), p.projectomschrijving,
        p.type, p.procedure ?? "", p.huur, p.kostprijs, p.maximumprijs_vmsw, p.bedrag_up, p.datum_beslissing,
      ])
    )
  }

  return (
    <div className="space-y-2">
      <p className="rounded-md border border-dashed bg-muted/40 p-2.5 text-xs text-muted-foreground">
        Projectdetails zijn enkel beschikbaar voor de korte termijnplanning (verrichtingen klaar voor aanbesteding). Voor de lange termijn tonen we alleen cijfers per woonmaatschappij en gemeente.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(pageSize) }} placeholder="Zoek in projecten, gemeente of woonmaatschappij" className="max-w-sm" aria-label="Zoek in projecten" />
        <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">Geen projecten gevonden voor deze filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Woonmaatschappij" k="wm" sort={sort} onSort={onSort} />
                <SortableHead label="Gemeente" k="gemeente" sort={sort} onSort={onSort} />
                <SortableHead label="Project" k="omschrijving" sort={sort} onSort={onSort} />
                <SortableHead label="Type" k="type" sort={sort} onSort={onSort} />
                <SortableHead label="Procedure" k="procedure" sort={sort} onSort={onSort} />
                <SortableHead label="Huur" k="huur" sort={sort} onSort={onSort} align="right" />
                <SortableHead label="Kostprijs" k="kostprijs" sort={sort} onSort={onSort} align="right" />
                <SortableHead label="Subsidiabel (UP)" k="up" sort={sort} onSort={onSort} align="right" title="Bedrag UP: subsidiabel bedrag" />
                <SortableHead label="Opname programmatie" k="datum" sort={sort} onSort={onSort} />
                <TableHead className="w-10"><span className="sr-only">Website</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.slice(0, limit).map((p, i) => {
                const w = wmById.get(p.wm)
                return (
                  <TableRow key={`${p.wm}-${p.projectomschrijving}-${i}`}>
                    <TableCell className="whitespace-nowrap">{w?.naam ?? p.wm}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.nis ? gemName(p) : <span className="italic text-muted-foreground">{gemName(p)}</span>}</TableCell>
                    <TableCell className="min-w-48 max-w-72 whitespace-normal">
                      {p.projectomschrijving || "–"}
                    </TableCell>
                    <TableCell><Badge variant="secondary" title={meta.types[p.type]}>{p.type === "ONBEKEND" ? "?" : p.type}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{p.procedure ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtInt(p.huur)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtEur(p.kostprijs)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtEur(p.bedrag_up)}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(p.datum_beslissing)}</TableCell>
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
          </Table>
        </div>
      )}
      {list.length > limit && (
        <Button type="button" variant="ghost" size="sm" onClick={() => setLimit((l) => l + pageSize)}>
          Toon meer ({fmtInt(list.length - limit)} resterend)
        </Button>
      )}
    </div>
  )
}
