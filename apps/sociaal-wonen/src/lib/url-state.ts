import { DEFAULT_STATE } from "./types"
import { PLAATSINGEN } from "./types"
import type { Categorie, Plaatsing, Gemeente, Horizon, State, Tab, Woonmaatschappij } from "./types"

export const SLUG = "sociaal-wonen"

/** Leest `sociaal-wonen.x` met terugval op `x`. Ongeldige waarden vallen terug op de standaard. */
export function parseState(search: string, forcedTab?: Tab): State {
  const p = new URLSearchParams(search)
  const get = (k: string) => p.get(`${SLUG}.${k}`) ?? p.get(k)
  const one = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
    v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  const nis = get("gemeente")
  return {
    horizon: one<Horizon>(get("horizon")?.toLowerCase() ?? null, ["kt", "lt"], DEFAULT_STATE.horizon),
    wm: (get("wm") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, ""),
    gemeente: nis && /^\d{5}$/.test(nis) ? nis : "",
    groep: one<"" | Categorie>(get("groep")?.toLowerCase() ?? null, ["nieuwbouw", "vervangingsbouw", "renovatie", "ssi"], ""),
    plaatsing: one<"" | Plaatsing>(get("plaatsing"), ["", ...PLAATSINGEN], ""),
    tab: forcedTab ?? one<Tab>(get("tab"), ["kaart", "tabel", "projecten"], DEFAULT_STATE.tab),
    filters: get("filters") !== "0",
  }
}

/** Verwijst een filter naar iets dat niet bestaat (verouderde link), dan wordt het genegeerd. */
export function normalizeAgainstData(st: State, wms: Woonmaatschappij[], gemeenten: Gemeente[]): State {
  return {
    ...st,
    wm: st.wm && wms.some((w) => w.id === st.wm) ? st.wm : "",
    gemeente: st.gemeente && gemeenten.some((g) => g.nis === st.gemeente) ? st.gemeente : "",
  }
}

/** Query met enkel afwijkingen van de standaard, prefix `sociaal-wonen.`. */
export function toQuery(st: State, opts: { section?: Tab; includeTab?: boolean } = {}): string {
  const q = new URLSearchParams()
  const set = (k: string, v: string, def: string) => {
    if (v && v !== def) q.set(`${SLUG}.${k}`, v)
  }
  set("horizon", st.horizon, DEFAULT_STATE.horizon)
  set("wm", st.wm, "")
  set("gemeente", st.gemeente, "")
  set("groep", st.groep, "")
  set("plaatsing", st.plaatsing, "")
  if (opts.includeTab) set("tab", st.tab, DEFAULT_STATE.tab)
  if (!st.filters) q.set(`${SLUG}.filters`, "0")
  return q.toString()
}
