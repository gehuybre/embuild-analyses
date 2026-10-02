import type { AggRow, Groep, State } from "./types"

interface Filterable {
  wm: string
  nis: string | null
  provincie: string
  groep: Groep
  type: string
  procedure: string | null
}

export function matches(r: Filterable, st: State, opts: { ignoreGemeente?: boolean; ignoreWm?: boolean } = {}): boolean {
  if (!opts.ignoreWm && st.wm && r.wm !== st.wm) return false
  if (st.provincie && r.provincie !== st.provincie) return false
  if (!opts.ignoreGemeente && st.gemeente && r.nis !== st.gemeente) return false
  if (st.groep && r.groep !== st.groep) return false
  if (st.type && r.type !== st.type) return false
  if (st.procedure && r.procedure !== st.procedure) return false
  return true
}

export function filterRows<T extends Filterable>(rows: T[], st: State, opts?: { ignoreGemeente?: boolean; ignoreWm?: boolean }): T[] {
  return rows.filter((r) => matches(r, st, opts))
}

export interface Totals {
  huur: number
  kostprijs: number
  maximumprijs_vmsw: number
  bedrag_up: number
  n: number
}

export const emptyTotals = (): Totals => ({ huur: 0, kostprijs: 0, maximumprijs_vmsw: 0, bedrag_up: 0, n: 0 })

export function sumRows(rows: AggRow[]): Totals {
  const t = emptyTotals()
  for (const r of rows) {
    t.huur += r.huur
    t.kostprijs += r.kostprijs
    t.maximumprijs_vmsw += r.maximumprijs_vmsw
    t.bedrag_up += r.bedrag_up
    t.n += r.n
  }
  return t
}

/** Totalen per NIS (rijen zonder NIS tellen niet mee voor de kaart). */
export function byGemeente(rows: AggRow[]): Map<string, Totals & { wms: Set<string> }> {
  const m = new Map<string, Totals & { wms: Set<string> }>()
  for (const r of rows) {
    if (!r.nis) continue
    let t = m.get(r.nis)
    if (!t) {
      t = { ...emptyTotals(), wms: new Set<string>() }
      m.set(r.nis, t)
    }
    t.huur += r.huur
    t.kostprijs += r.kostprijs
    t.maximumprijs_vmsw += r.maximumprijs_vmsw
    t.bedrag_up += r.bedrag_up
    t.n += r.n
    t.wms.add(r.wm)
  }
  return m
}

/** Klassegrenzen (kwantielen) voor de choropleth. Geeft 1 tot k-1 ondergrenzen terug. */
export function quantileBreaks(values: number[], k = 5): number[] {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b)
  if (v.length === 0) return []
  const out: number[] = []
  for (let i = 1; i < k; i++) {
    const q = v[Math.min(v.length - 1, Math.floor((i * v.length) / k))]
    if (!out.length || q > out[out.length - 1]) out.push(q)
  }
  return out.filter((b) => b > v[0])
}

export function classOf(value: number, breaks: number[]): number {
  let c = 0
  for (const b of breaks) if (value >= b) c++
  return c
}
