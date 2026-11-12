export type Horizon = "kt" | "lt"
export type Categorie = "nieuwbouw" | "vervangingsbouw" | "renovatie" | "ssi"
export type Plaatsing = "Reguliere procedure" | "CBO" | "D&B"
export const PLAATSINGEN: Plaatsing[] = ["Reguliere procedure", "CBO", "D&B"]
export const CATEGORIE_LABELS: Record<Categorie, string> = {
  nieuwbouw: "Nieuwbouw",
  vervangingsbouw: "Vervangingsbouw",
  renovatie: "Renovatie",
  ssi: "Sloop en Infrastructuur",
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

/** Eén geanonimiseerde bronregel; waarden zijn uitsluitend categorieën. */
export interface AggRow {
  wm: string
  nis: string | null
  gemeente_label: string | null
  provincie: string
  categorie: Categorie
  plaatsing: Plaatsing
  huur_categorie: string
  kostprijs_categorie: string
}

export interface AggFile {
  horizon: Horizon
  peildatum: string
  rijen: AggRow[]
}

export interface MunicipalityBand {
  nis: string | null
  naam: string
  huur_categorie: string
  kostprijs_categorie: string
}

export interface MunicipalityFile {
  horizon: Horizon
  gemeenten: MunicipalityBand[]
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
  categories: Record<Categorie, string>
  count_bands: string[]
  cost_bands: string[]
  horizons: Record<Horizon, { label: string; omschrijving: string }>
}

export type Tab = "kaart" | "tabel" | "projecten"
export type Metric = "huur" | "kostprijs"

export interface State {
  horizon: Horizon
  wm: string
  gemeente: string
  groep: "" | Categorie
  plaatsing: "" | Plaatsing
  tab: Tab
  filters: boolean
}

export const DEFAULT_STATE: State = {
  horizon: "kt",
  wm: "",
  gemeente: "",
  groep: "",
  plaatsing: "",
  tab: "kaart",
  filters: true,
}
