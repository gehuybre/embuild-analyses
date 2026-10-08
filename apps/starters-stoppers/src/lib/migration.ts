// Migratie van btw-plichtige ondernemingen tussen de gewesten (Statbel move_nl.xlsx).
// Eén record = aantal ondernemingen dat in jaar `y` met de maatschappelijke zetel van gewest `o` naar gewest `d` verhuisde.
// De uitsplitsingen (`dim`) zijn aparte kruistabellen: ze kunnen niet met elkaar gecombineerd worden.

export type MigrationDim = "tot" | "cls" | "nace" | "type"

export type MigrationRecord = {
  y: number
  dim: MigrationDim
  k: string
  o: string
  d: string
  n: number
}

export type MigrationData = {
  latestYear: number
  years: number[]
  sourceUrl?: string
  classes: Array<{ code: string; nl: string }>
  sectors: Array<{ code: string; nl: string }>
  types: Array<{ code: string; nl: string }>
  records: MigrationRecord[]
}

export type MigrationPoint = {
  sortValue: number
  year: number
  inflow: number
  outflow: number
  net: number
  total: number
}

export const MIGRATION_ALL = "1000"
export const MIGRATION_REGION_OPTIONS = [
  { code: "2000", label: "Vlaanderen" },
  { code: "3000", label: "Wallonië" },
  { code: "4000", label: "Brussel" },
]
export const MIGRATION_DIM_OPTIONS: Array<{ code: MigrationDim; label: string; allLabel: string }> = [
  { code: "tot", label: "Totaal", allLabel: "Alle ondernemingen" },
  { code: "cls", label: "Werknemersklasse", allLabel: "Alle werknemersklassen" },
  { code: "nace", label: "Sector", allLabel: "Alle sectoren" },
  { code: "type", label: "Rechtsvorm", allLabel: "Alle rechtsvormen" },
]

export function migrationCategoryOptions(data: MigrationData | null, dim: MigrationDim) {
  if (!data) return []
  if (dim === "cls") return data.classes.map((item) => ({ code: item.code, label: item.nl }))
  if (dim === "nace") return data.sectors.map((item) => ({ code: item.code, label: `${item.code} — ${item.nl}` }))
  if (dim === "type") return data.types.map((item) => ({ code: item.code, label: item.nl }))
  return []
}

export function migrationRegionLabel(code: string) {
  if (code === MIGRATION_ALL) return "Alle gewesten"
  return MIGRATION_REGION_OPTIONS.find((option) => option.code === code)?.label ?? code
}

/**
 * Reeks per jaar voor één gewest (of alle gewesten samen).
 * - `region` = "1000": totaal aantal verhuizingen tussen gewesten.
 * - `region` = gewest, `counterpart` = null: alle instroom (naar het gewest) en uitstroom (uit het gewest).
 * - `region` = gewest, `counterpart` = ander gewest: enkel de verhuizingen tussen die twee gewesten.
 * Instroom bevat ook ondernemingen waarvan het oorspronkelijke gewest onbekend is.
 */
export function buildMigrationSeries(
  data: MigrationData,
  options: { dim: MigrationDim; category: string | null; region: string; counterpart: string | null }
): MigrationPoint[] {
  const key = options.dim === "tot" ? "ALL" : options.category ?? "ALL"
  const dim = options.dim === "tot" || !options.category ? "tot" : options.dim
  const byYear = new Map<number, MigrationPoint>(
    data.years.map((year) => [year, { sortValue: year, year, inflow: 0, outflow: 0, net: 0, total: 0 }])
  )

  for (const record of data.records) {
    if (record.dim !== dim || (dim !== "tot" && record.k !== key)) continue
    const point = byYear.get(record.y)
    if (!point) continue
    point.total += record.n

    if (options.region === MIGRATION_ALL) continue
    const counterpartMatches = (other: string) => !options.counterpart || other === options.counterpart
    if (record.d === options.region && counterpartMatches(record.o)) point.inflow += record.n
    if (record.o === options.region && counterpartMatches(record.d)) point.outflow += record.n
  }

  const points = Array.from(byYear.values()).sort((a, b) => a.sortValue - b.sortValue)
  for (const point of points) point.net = point.inflow - point.outflow
  return points
}

export function migrationTitle(region: string, counterpart: string | null, categoryLabel?: string | null) {
  let title = "Migratie tussen de gewesten"
  if (region !== MIGRATION_ALL) {
    title = counterpart
      ? `Migratie van ondernemingen - ${migrationRegionLabel(region)} en ${migrationRegionLabel(counterpart)}`
      : `Migratie van ondernemingen - ${migrationRegionLabel(region)}`
  }
  return categoryLabel ? `${title} - ${categoryLabel}` : title
}
