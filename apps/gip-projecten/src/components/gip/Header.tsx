"use client"

import type { Comparison, ProgramDiff } from "./compare"
import { ACCENT, ACCENT_DARK, NEUTRAL, formatEuroCompact, formatMio, formatSignedMio } from "./model"

const percentFormatter = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1, signDisplay: "exceptZero" })

// De grootste bewegers in de richting van het totaal, opgebouwd uit de data
function topMovers(comparison: Comparison): ProgramDiff[] {
  const down = comparison.delta < 0
  return comparison.diffs
    .filter((row) => (down ? row.delta < 0 : row.delta > 0))
    .sort((a, b) => (down ? a.delta - b.delta : b.delta - a.delta))
    .slice(0, 2)
}

export function Header({ comparison }: { comparison: Comparison }) {
  const down = comparison.delta < 0
  const movers = topMovers(comparison)
  const total = comparison.newTotal + comparison.externalNew
  const ordinaryShare = total ? (comparison.newTotal / total) * 100 : 100

  return (
    <header className="grid gap-6 rounded-lg border bg-card p-4 shadow-sm sm:p-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:gap-8">
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">
          Gewoon investeringsbudget 2026 · Mobiliteit en Openbare Werken
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-5xl font-semibold tracking-tight tabular-nums">
            {formatMio(comparison.newTotal / 1_000_000)}
          </span>
          <span
            className="rounded-full px-3 py-1 text-sm font-semibold tabular-nums"
            style={{ background: "#D9E1E2", color: ACCENT_DARK }}
          >
            {formatSignedMio(comparison.delta / 1_000_000)} ({percentFormatter.format(comparison.pct)}%)
          </span>
        </div>
        <div className="space-y-2">
          <p className="max-w-prose text-sm leading-relaxed">
            {formatMio(Math.abs(comparison.delta) / 1_000_000)} {down ? "minder" : "meer"} dan de planning van juli 2025.
          </p>
          {movers.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {movers.map((row) => (
                <li key={row.name} className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2">
                  <span className="font-medium tabular-nums text-foreground">{formatSignedMio(row.delta / 1_000_000)}</span>
                  <span>
                    {row.name}
                    {row.scopeChange ? " (uit de tabel gehaald)" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {comparison.externalNew > 0 && (
        <div className="space-y-3 border-t pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0">
          <p className="text-sm font-medium text-muted-foreground">
            Tabeltotaal {formatEuroCompact(comparison.tableTotal)}
          </p>
          <div
            className="flex h-3 overflow-hidden rounded-full"
            style={{ background: NEUTRAL }}
            role="img"
            aria-label={`Gewoon budget ${formatEuroCompact(comparison.newTotal)} van ${formatEuroCompact(total)}`}
          >
            <div className="transition-[width] duration-300 ease-out" style={{ width: `${ordinaryShare}%`, background: ACCENT }} />
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} />
                Gewoon budget
              </dt>
              <dd className="font-medium tabular-nums">{formatMio(comparison.newTotal / 1_000_000)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: NEUTRAL }} />
                Andere financiering
              </dt>
              <dd className="font-medium tabular-nums">{formatMio(comparison.externalNew / 1_000_000)}</dd>
            </div>
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Oosterweel via tolinkomsten, leefbaarheidsprojecten via het overkappingsfonds.
          </p>
        </div>
      )}
    </header>
  )
}
