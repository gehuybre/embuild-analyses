import { DEFAULT_STATE, PROVINCIES, TYPE_ORDER } from "./types"
import type { Gemeente, Groep, Horizon, Metric, Modus, State, Tab, Woonmaatschappij } from "./types"

export const SLUG = "sociaal-wonen"

/** Leest `sociaal-wonen.x` met terugval op `x`. Ongeldige waarden vallen terug op de standaard. */
export function parseState(search: string, forcedTab?: Tab): State {
  const p = new URLSearchParams(search)
  const get = (k: string) => p.get(`${SLUG}.${k}`) ?? p.get(k)
  const one = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
    v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
  const upper = (v: string | null) => (v ? v.toUpperCase() : null)

  const nis = get("gemeente")
  return {
    horizon: one<Horizon>(get("horizon")?.toLowerCase() ?? null, ["kt", "lt"], DEFAULT_STATE.horizon),
    wm: (get("wm") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, ""),
    provincie: one(upper(get("provincie")), PROVINCIES, "" as never) as string,
    gemeente: nis && /^\d{5}$/.test(nis) ? nis : "",
    groep: one<"" | Groep>(get("groep")?.toLowerCase() ?? null, ["nieuwbouw", "renovatie"], ""),
    type: one(upper(get("type")), TYPE_ORDER, "" as never) as string,
    procedure: (get("procedure") ?? "").replace(/[\u0000-\u001f<>]/g, "").slice(0, 60),
    modus: one<Modus>(get("modus"), ["wm", "gemeente"], DEFAULT_STATE.modus),
    metric: one<Metric>(get("metric"), ["huur", "kostprijs"], DEFAULT_STATE.metric),
    tab: forcedTab ?? one<Tab>(get("tab"), ["kaart", "tabel", "projecten"], DEFAULT_STATE.tab),
    filters: get("filters") !== "0",
  }
}

/** Verwijst een filter naar iets dat niet bestaat (verouderde link), dan wordt het genegeerd. */
export function normalizeAgainstData(st: State, wms: Woonmaatschappij[], gemeenten: Gemeente[], procedures: string[]): State {
  return {
    ...st,
    wm: st.wm && wms.some((w) => w.id === st.wm) ? st.wm : "",
    gemeente: st.gemeente && gemeenten.some((g) => g.nis === st.gemeente) ? st.gemeente : "",
    procedure: st.procedure && procedures.includes(st.procedure) ? st.procedure : "",
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
  set("provincie", st.provincie, "")
  set("gemeente", st.gemeente, "")
  set("groep", st.groep, "")
  set("type", st.type, "")
  set("procedure", st.procedure, "")
  const kaart = (opts.section ?? st.tab) === "kaart"
  if (kaart) {
    set("modus", st.modus, DEFAULT_STATE.modus)
    set("metric", st.metric, DEFAULT_STATE.metric)
  }
  if (opts.includeTab) set("tab", st.tab, DEFAULT_STATE.tab)
  if (!st.filters) q.set(`${SLUG}.filters`, "0")
  return q.toString()
}
