import type { AggRow, State } from "./types"

export function matches(r: AggRow, st: State, opts: { ignoreGemeente?: boolean; ignoreWm?: boolean } = {}): boolean {
  if (!opts.ignoreWm && st.wm && r.wm !== st.wm) return false
  if (!opts.ignoreGemeente && st.gemeente && r.nis !== st.gemeente) return false
  if (st.groep && r.categorie !== st.groep) return false
  if (st.plaatsing && r.plaatsing !== st.plaatsing) return false
  return true
}

export function filterRows<T extends AggRow>(rows: T[], st: State, opts?: { ignoreGemeente?: boolean; ignoreWm?: boolean }): T[] {
  return rows.filter((r) => matches(r, st, opts))
}
