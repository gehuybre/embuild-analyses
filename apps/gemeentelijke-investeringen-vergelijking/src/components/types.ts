export interface OldNew {
  old: number
  new: number
}

export interface SummaryRow extends OldNew {
  rapportjaar: number
  cells_both: number
  cells_identical: number
  cells_only_old: number
  cells_only_new: number
  municipalities: number
  municipalities_in_both: number
  municipalities_over_5pct: number
  cells_changed: number
}

export interface BoekjaarRow extends OldNew {
  Rapportjaar: number
  Boekjaar: number
}

export interface DomeinRow extends OldNew {
  Rapportjaar: number
  BV_domein: string
}

export interface FieldRow extends OldNew {
  Rapportjaar: number
  BV_domein: string
  Beleidsveld: string
}

export interface MunicipalityRow extends OldNew {
  Rapportjaar: number
  NIS_code: string
  naam: string
}

export interface RekRow extends OldNew {
  Rapportjaar: number
  Niveau_3: string
}

export interface VersionInfo {
  key: string
  label: string
  slug: string
}

/** Eén vergelijking (paar van versies), zoals ze in comparison.json staat. */
export interface Comparison {
  key: string
  old: string
  new: string
  summary: SummaryRow[]
  by_boekjaar: BoekjaarRow[]
  by_domein: DomeinRow[]
  by_field: FieldRow[]
  municipalities: MunicipalityRow[]
  rek: RekRow[]
}

export interface ComparisonFile {
  generated: string
  versions: VersionInfo[]
  windows: Record<string, [number, number]>
  comparisons: Comparison[]
}

/** Een vergelijking met de twee versies uitgeschreven, zoals de secties ze gebruiken. */
export interface ComparisonData extends Omit<Comparison, "old" | "new"> {
  generated: string
  versions: Record<"old" | "new", VersionInfo>
}
