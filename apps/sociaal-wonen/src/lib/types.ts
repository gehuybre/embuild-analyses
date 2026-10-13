export type Horizon = "kt" | "lt"
export type Groep = "nieuwbouw" | "renovatie"
export type Categorie = Groep | "beperkte-renovatie"
export const CATEGORIE_LABELS: Record<Categorie, string> = {
  nieuwbouw: "Nieuwbouw",
  renovatie: "Renovatie",
  "beperkte-renovatie": "Beperkte renovatie",
}

export interface Woonmaatschappij {
  id: string
  naam: string
  url: string
  werkingsgebied_label: string
  provincie: string
  kleur: string
  gemeenten: string[]
}

export interface Gemeente {
  nis: string
  naam: string
  provincie: string
  wm_id: string
  bron: string
}

/** Geaggregeerde rij: nooit projectvelden. */
export interface AggRow {
  wm: string
  nis: string | null
  gemeente_label: string | null
  provincie: string
  groep: Groep
  categorie: Categorie
  type: string
  /** Kolom "Extra info" uit de bron (bv. CBO 2024-1, D&B 2019, Raamcontract, Beperkte renovatie). */
  procedure: string | null
  huur: number
  kostprijs: number
  maximumprijs_vmsw: number
  bedrag_up: number
  n: number
  n_maximumprijs: number
  jaar_min: number | null
  jaar_max: number | null
}

export interface AggFile {
  horizon: Horizon
  peildatum: string
  rijen: AggRow[]
}

/** Projectrij: enkel beschikbaar voor KT. */
export interface Project {
  projectomschrijving: string
  wm: string
  nis: string | null
  gemeente_label: string | null
  provincie: string
  groep: Groep
  categorie: Categorie
  type: string
  huur: number | null
  kostprijs: number | null
  maximumprijs_vmsw: number | null
  bedrag_up: number | null
  datum_beslissing: string | null
  procedure: string | null
}

export interface ProjectFile {
  horizon: Horizon
  peildatum: string
  projecten: Project[]
}

export interface MapGemeente {
  nis: string
  naam: string
  provincie: string
  d: string
  cx: number
  cy: number
}

export interface MapData {
  width: number
  height: number
  gemeenten: MapGemeente[]
  provincies: { naam: string; d: string }[]
}

export interface Meta {
  peildatum: string
  lastUpdated: string
  bron: string
  types: Record<string, string>
  categories: Record<Categorie, string>
  horizons: Record<Horizon, { label: string; omschrijving: string }>
}

export type Tab = "kaart" | "tabel" | "projecten"
export type Modus = "wm" | "gemeente"
export type Metric = "huur" | "kostprijs"

export interface State {
  horizon: Horizon
  wm: string
  gemeente: string
  groep: "" | Categorie
  type: string
  procedure: string
  modus: Modus
  metric: Metric
  tab: Tab
  filters: boolean
}

export const DEFAULT_STATE: State = {
  horizon: "kt",
  wm: "",
  gemeente: "",
  groep: "",
  type: "",
  procedure: "",
  modus: "wm",
  metric: "huur",
  tab: "kaart",
  filters: true,
}

export const TYPE_ORDER = ["NB", "VVP", "RVP", "GW", "VEP", "REP", "ONBEKEND"] as const
