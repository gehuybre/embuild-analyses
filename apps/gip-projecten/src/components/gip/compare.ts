import { EXTERNAL_FINANCING_PROJECTS, type GipBundle } from "./model"

export type ProgramDiff = {
  name: string
  old: number
  next: number
  delta: number
  /** Programma werd in de nieuwe versie uit de tabel gehaald (afbakening, geen echte besparing) */
  scopeChange: boolean
}

export type Comparison = {
  oldTotal: number
  newTotal: number
  delta: number
  pct: number
  tableTotal: number
  externalNew: number
  externalOld: number
  diffs: ProgramDiff[]
}

// Budget 2026 per programma, zonder de posten met andere financiering (tol en overkappingsfonds)
function programTotals2026(gip: GipBundle) {
  const totals = new Map<string, number>()
  gip.programSummary.forEach((program) => totals.set(program.name, program.budget2026))
  let external = 0
  gip.projects.forEach((project) => {
    if (!EXTERNAL_FINANCING_PROJECTS.has(project.project)) return
    totals.set(project.programma, (totals.get(project.programma) ?? 0) - project.budget2026)
    external += project.budget2026
  })
  return { totals, external }
}

export function buildComparison(gip2025: GipBundle, gip2026: GipBundle): Comparison {
  const before = programTotals2026(gip2025)
  const after = programTotals2026(gip2026)
  const names = Array.from(new Set([...before.totals.keys(), ...after.totals.keys()]))
  const diffs = names
    .map((name) => {
      const old = before.totals.get(name) ?? 0
      const next = after.totals.get(name) ?? 0
      return { name, old, next, delta: next - old, scopeChange: old > 0 && next === 0 }
    })
    .sort((a, b) => a.delta - b.delta)
  const oldTotal = diffs.reduce((sum, row) => sum + row.old, 0)
  const newTotal = diffs.reduce((sum, row) => sum + row.next, 0)
  return {
    oldTotal,
    newTotal,
    delta: newTotal - oldTotal,
    pct: oldTotal ? ((newTotal - oldTotal) / oldTotal) * 100 : 0,
    tableTotal: gip2026.metadata.total_budget,
    externalNew: after.external,
    externalOld: before.external,
    diffs,
  }
}
