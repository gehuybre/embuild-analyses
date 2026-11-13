"use client"

import { useMemo } from "react"
import { ChevronRight } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@embuild/shared/components/ui/table"
import type { Comparison } from "./compare"
import {
  ACCENT_DARK,
  ALL_PROGRAMS,
  MONEY_EPSILON,
  NEUTRAL,
  formatEuroCompact,
  formatSignedEuroCompact,
  formatSignedMio,
  type GipBundle,
} from "./model"
import {
  buildBudgetReconciliation,
  filterReconciliationByProgram,
  isExternalFinancingRow,
  type ReconciledProject,
} from "./reconcile"
import { Panel, SectionHeading } from "./ui"

function projectName(row: ReconciledProject) {
  return row.deelproject && row.deelproject !== row.project ? `${row.project} · ${row.deelproject}` : row.project
}

function DifferenceBars({
  comparison,
  selectedProgram,
  onProgramChange,
}: {
  comparison: Comparison
  selectedProgram: string
  onProgramChange: (program: string) => void
}) {
  const max = Math.max(...comparison.diffs.map((row) => Math.abs(row.delta)), 1)
  const hasSelection = selectedProgram !== ALL_PROGRAMS
  return (
    <div className="divide-y">
      {comparison.diffs.map((row) => {
        const selected = row.name === selectedProgram
        const width = (Math.abs(row.delta) / max) * 50
        return (
          <button
            key={row.name}
            type="button"
            aria-pressed={selected}
            onClick={() => onProgramChange(selected ? ALL_PROGRAMS : row.name)}
            className={`grid w-full grid-cols-[minmax(0,1fr)_72px] items-center gap-x-4 gap-y-1 px-2 py-2 text-left transition-colors duration-150 ease-out hover:bg-muted/50 sm:grid-cols-[minmax(120px,240px)_minmax(0,1fr)_72px] ${
              selected ? "bg-muted/60" : ""
            } ${hasSelection && !selected ? "opacity-60" : ""}`}
          >
            <span className="min-w-0 text-sm font-medium leading-snug">
              {row.name}
              {row.scopeChange && (
                <span className="block text-xs font-normal text-muted-foreground">
                  Uit de tabel gehaald (afbakening)
                </span>
              )}
            </span>
            <span className="relative order-last col-span-2 h-4 sm:order-none sm:col-span-1" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <span
                className="absolute inset-y-0.5 rounded-sm transition-[width] duration-300 ease-out"
                style={{
                  width: `${width}%`,
                  background: row.delta < 0 ? ACCENT_DARK : NEUTRAL,
                  ...(row.delta < 0 ? { right: "50%" } : { left: "50%" }),
                }}
              />
            </span>
            <span className="text-right text-sm font-semibold tabular-nums">
              {formatSignedMio(row.delta / 1_000_000)}
            </span>
          </button>
        )
      })}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-2 py-2 text-sm font-semibold">
        <span>Totaal</span>
        <span className="tabular-nums">{formatSignedMio(comparison.delta / 1_000_000)}</span>
      </div>
    </div>
  )
}

function MoverList({ title, rows }: { title: string; rows: ReconciledProject[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Geen projecten in deze selectie.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.key} className="flex items-start justify-between gap-4 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium leading-snug">{projectName(row)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {row.programma} · {formatEuroCompact(row.old2026)} naar {formatEuroCompact(row.new2026)}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {formatSignedEuroCompact(row.delta2026)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-lg border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-4 text-sm font-semibold sm:px-6 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-90" />
        {title}
      </summary>
      <div className="space-y-4 px-4 pb-4 sm:px-6 sm:pb-6">{children}</div>
    </details>
  )
}

export function CompareView({
  gip2025,
  gip2026,
  comparison,
  selectedProgram,
  onProgramChange,
}: {
  gip2025: GipBundle
  gip2026: GipBundle
  comparison: Comparison
  selectedProgram: string
  onProgramChange: (program: string) => void
}) {
  const rows = useMemo(() => buildBudgetReconciliation(gip2025, gip2026), [gip2025, gip2026])
  const scoped = useMemo(() => filterReconciliationByProgram(rows, selectedProgram), [rows, selectedProgram])
  const comparable = useMemo(() => scoped.filter((row) => !isExternalFinancingRow(row)), [scoped])
  const external = useMemo(() => scoped.filter(isExternalFinancingRow), [scoped])
  const decreases = useMemo(
    () => comparable.filter((row) => row.delta2026 < -MONEY_EPSILON).sort((a, b) => a.delta2026 - b.delta2026).slice(0, 5),
    [comparable]
  )
  const increases = useMemo(
    () => comparable.filter((row) => row.delta2026 > MONEY_EPSILON).sort((a, b) => b.delta2026 - a.delta2026).slice(0, 5),
    [comparable]
  )
  const detailRows = useMemo(
    () => [...comparable].sort((a, b) => Math.abs(b.delta2026) - Math.abs(a.delta2026)).slice(0, 40),
    [comparable]
  )
  const scopeLabel = selectedProgram === ALL_PROGRAMS ? "alle programma's" : selectedProgram

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeading
          title="Waar zit het verschil?"
          description="Budget 2026 per programma: nieuwe versie min de planning van juli 2025. Kies een programma om de projecten erachter te zien."
        />
        <Panel>
          <DifferenceBars comparison={comparison} selectedProgram={selectedProgram} onProgramChange={onProgramChange} />
        </Panel>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Grootste verschuivingen" description={`Per project, voor ${scopeLabel}.`} />
        <Panel>
          <div className="grid gap-6 md:grid-cols-2">
            <MoverList title="Grootste dalingen" rows={decreases} />
            <MoverList title="Grootste stijgingen" rows={increases} />
          </div>
        </Panel>
      </section>

      <section className="space-y-4">
        {external.length > 0 && (
          <Disclosure title="Oosterweel en leefbaarheid (andere financiering)">
            <p className="max-w-prose text-sm text-muted-foreground">
              Deze posten worden niet uit het gewone GIP-budget betaald en zitten daarom niet in het totaal en in de
              grafieken hierboven. Ze verklaren wel het grote verschil tussen het tabeltotaal en het gewone budget.
            </p>
            <ul className="divide-y">
              {external.map((row) => (
                <li key={row.key} className="flex items-start justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{projectName(row)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatEuroCompact(row.old2026)} naar {formatEuroCompact(row.new2026)}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatSignedEuroCompact(row.delta2026)}
                  </span>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
        <Disclosure title={`Alle projectverschillen (${detailRows.length} grootste)`}>
          <p className="max-w-prose text-xs text-muted-foreground">
            Projecten zijn op naam en onderdeel aan elkaar gekoppeld. Door herschikkingen en nieuwe namen is dit geen
            sluitende boekhoudkundige aansluiting, maar het toont de grootste bewegingen.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[48%]">Project</TableHead>
                <TableHead className="text-right">Oud 2026</TableHead>
                <TableHead className="text-right">Nieuw 2026</TableHead>
                <TableHead className="text-right">Verschil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium leading-snug">{projectName(row)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{row.programma}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatEuroCompact(row.old2026)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatEuroCompact(row.new2026)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatSignedEuroCompact(row.delta2026)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Disclosure>
      </section>
    </div>
  )
}
