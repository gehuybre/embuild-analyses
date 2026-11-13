"use client"

import type { Comparison } from "./compare"
import { formatEuroCompact, formatMio } from "./model"

const percentFormatter = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1, signDisplay: "exceptZero" })

// De zin wordt uit de data opgebouwd, zodat ze altijd klopt met de cijfers
function headlineSentence(comparison: Comparison) {
  const direction = comparison.delta < 0 ? "minder" : "meer"
  const movers = comparison.diffs
    .filter((row) => (comparison.delta < 0 ? row.delta < 0 : row.delta > 0))
    .sort((a, b) => (comparison.delta < 0 ? a.delta - b.delta : b.delta - a.delta))
    .slice(0, 2)
    .map((row) => row.name.toLowerCase())
  const reason = movers.length ? `, vooral door ${movers.join(" en ")}` : ""
  return `${formatMio(Math.abs(comparison.delta) / 1_000_000)} ${direction} gewoon investeringsbudget in 2026 dan de planning van juli 2025${reason}.`
}

export function Header({ comparison }: { comparison: Comparison }) {
  const externalNote = comparison.externalNew > 0
  return (
    <header className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Gewoon investeringsbudget 2026 (Mobiliteit en Openbare Werken)
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            {formatMio(comparison.newTotal / 1_000_000)}
          </span>
          <span className="text-lg font-semibold tabular-nums text-[#3F6B72]">
            {comparison.delta < 0 ? "-" : "+"}
            {formatMio(Math.abs(comparison.delta) / 1_000_000)} ({percentFormatter.format(comparison.pct)}%)
          </span>
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">{headlineSentence(comparison)}</p>
      </div>
      {externalNote && (
        <p className="max-w-prose text-sm text-muted-foreground">
          De tabel telt {formatEuroCompact(comparison.tableTotal)}. Daarvan wordt {formatEuroCompact(comparison.externalNew)}{" "}
          buiten het gewone budget gefinancierd (Oosterweel via tolinkomsten, leefbaarheidsprojecten via het
          overkappingsfonds). Die staan niet in het bedrag hierboven.
        </p>
      )}
    </header>
  )
}
