// Migratie van btw-plichtige ondernemingen tussen de gewesten (Statbel move_nl.xlsx).
// Eén record = aantal ondernemingen dat in jaar `y` met de maatschappelijke zetel van gewest `o` naar gewest `d` verhuisde.
// De uitsplitsingen (`dim`) zijn aparte kruistabellen: ze kunnen niet met elkaar gecombineerd worden.
// Meerdere gewesten of categorieën worden opgeteld; bij meerdere gewesten tellen enkel verhuizingen over de grens van de groep.

import { describeSelection } from "@/lib/selection"

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

export type FilterItem = { label: string; value: string }

export const MIGRATION_REGION_OPTIONS = [
  { code: "2000", label: "Vlaanderen" },
  { code: "3000", label: "Wallonië" },
  { code: "4000", label: "Brussel" },
]
export const MIGRATION_DIM_OPTIONS: Array<{ code: MigrationDim; label: string; allLabel: string; noun: string }> = [
  { code: "tot", label: "Totaal", allLabel: "Alle ondernemingen", noun: "categorieën" },
  { code: "cls", label: "Werknemersklasse", allLabel: "Alle werknemersklassen", noun: "klassen" },
  { code: "nace", label: "Sector", allLabel: "Alle sectoren", noun: "sectoren" },
  { code: "type", label: "Rechtsvorm", allLabel: "Alle rechtsvormen", noun: "rechtsvormen" },
]

export function migrationCategoryOptions(data: MigrationData | null, dim: MigrationDim) {
  if (!data) return []
  if (dim === "cls") return data.classes.map((item) => ({ code: item.code, label: item.nl }))
  if (dim === "nace") return data.sectors.map((item) => ({ code: item.code, label: `${item.code} — ${item.nl}` }))
  if (dim === "type") return data.types.map((item) => ({ code: item.code, label: item.nl }))
  return []
}

export function migrationRegionLabel(code: string) {
  return MIGRATION_REGION_OPTIONS.find((option) => option.code === code)?.label ?? code
}

const REGION_CODES = MIGRATION_REGION_OPTIONS.map((option) => option.code)

/** Alle drie de gewesten kiezen is hetzelfde als geen keuze (alle gewesten). */
export function normalizeMigrationRegions(regions: string[]): string[] {
  const unique = Array.from(new Set(regions.filter((code) => REGION_CODES.includes(code))))
  return unique.length >= REGION_CODES.length ? [] : unique
}

/** Tegenpartijen mogen niet in de gekozen groep gewesten zelf zitten. */
export function normalizeCounterparts(counterparts: string[], regions: string[]): string[] {
  return Array.from(new Set(counterparts.filter((code) => REGION_CODES.includes(code) && !regions.includes(code))))
}

export type MigrationSelection = {
  dim: MigrationDim
  categories: string[]
  regions: string[]
  counterparts: string[]
}

/**
 * Reeks per jaar.
 * - geen gewest gekozen: totaal aantal verhuizingen tussen gewesten.
 * - gewest(en) gekozen: instroom = verhuizingen van buiten de groep naar de groep, uitstroom = omgekeerd.
 *   Met tegenpartijen tellen enkel de verhuizingen tussen de groep en die tegenpartijen.
 * Instroom bevat ook ondernemingen waarvan het oorspronkelijke gewest onbekend is (enkel zonder tegenpartijen).
 */
export function buildMigrationSeries(data: MigrationData, options: MigrationSelection): MigrationPoint[] {
  const dim = options.dim === "tot" || options.categories.length === 0 ? "tot" : options.dim
  const categories = dim === "tot" ? null : new Set(options.categories)
  const regions = new Set(options.regions)
  const counterparts = new Set(options.counterparts)
  const byYear = new Map<number, MigrationPoint>(
    data.years.map((year) => [year, { sortValue: year, year, inflow: 0, outflow: 0, net: 0, total: 0 }])
  )

  for (const record of data.records) {
    if (record.dim !== dim || (categories && !categories.has(record.k))) continue
    const point = byYear.get(record.y)
    if (!point) continue
    point.total += record.n

    if (regions.size === 0) continue
    if (regions.has(record.d) && !regions.has(record.o) && (counterparts.size === 0 || counterparts.has(record.o))) point.inflow += record.n
    if (regions.has(record.o) && !regions.has(record.d) && (counterparts.size === 0 || counterparts.has(record.d))) point.outflow += record.n
  }

  const points = Array.from(byYear.values()).sort((a, b) => a.sortValue - b.sortValue)
  for (const point of points) point.net = point.inflow - point.outflow
  return points
}

function regionNames(codes: string[]) {
  return codes.map(migrationRegionLabel)
}

export function migrationTitle(selection: Pick<MigrationSelection, "regions" | "counterparts">, categoryLabels: string[] = []) {
  let title = "Migratie tussen de gewesten"
  if (selection.regions.length > 0) {
    title = `Migratie van ondernemingen - ${regionNames(selection.regions).join(" + ")}`
    if (selection.counterparts.length > 0) title += ` en ${regionNames(selection.counterparts).join(" + ")}`
  }
  return categoryLabels.length > 0 ? `${title} - ${describeSelection(categoryLabels, "categorieën")}` : title
}

export type MigrationMatrixRow = {
  code: string
  label: string
  cells: Record<string, number | null> // per bestemming; null op de diagonaal
  outflow: number | null
}

export type MigrationMatrix = {
  rows: MigrationMatrixRow[]
  inflow: Record<string, number>
}

/** Herkomst-bestemmingtabel voor één jaar. De rij "Onbekend" verschijnt enkel als er ondernemingen zonder gekend oorspronkelijk gewest zijn. */
export function buildMigrationMatrix(
  data: MigrationData,
  options: { dim: MigrationDim; categories: string[]; year: number }
): MigrationMatrix {
  const dim = options.dim === "tot" || options.categories.length === 0 ? "tot" : options.dim
  const categories = dim === "tot" ? null : new Set(options.categories)
  const counts = new Map<string, number>()
  for (const record of data.records) {
    if (record.y !== options.year || record.dim !== dim) continue
    if (categories && !categories.has(record.k)) continue
    const key = `${record.o}|${record.d}`
    counts.set(key, (counts.get(key) ?? 0) + record.n)
  }

  const destinations = REGION_CODES
  const originCodes = [...destinations, "0000"]
  const rows: MigrationMatrixRow[] = originCodes
    .map((code) => {
      const cells: Record<string, number | null> = {}
      for (const destination of destinations) {
        cells[destination] = code === destination ? null : counts.get(`${code}|${destination}`) ?? 0
      }
      const known = code !== "0000"
      const outflow = known ? destinations.reduce((sum, destination) => sum + (cells[destination] ?? 0), 0) : null
      const label = code === "0000" ? "Onbekend" : migrationRegionLabel(code)
      return { code, label, cells, outflow }
    })
    .filter((row) => row.code !== "0000" || destinations.some((destination) => (row.cells[destination] ?? 0) > 0))

  const inflow: Record<string, number> = {}
  for (const destination of destinations) {
    inflow[destination] = rows.reduce((sum, row) => sum + (row.cells[destination] ?? 0), 0)
  }
  return { rows, inflow }
}

export function migrationCategoryLabels(data: MigrationData, dim: MigrationDim, categories: string[]): string[] {
  const options = migrationCategoryOptions(data, dim)
  return categories.map((code) => options.find((option) => option.code === code)?.label ?? code)
}

export function migrationFilterItems(
  data: MigrationData,
  options: MigrationSelection & {
    year?: number | null
    omitRegion?: boolean // de herkomst-bestemmingtabel omvat alle gewesten
  }
): FilterItem[] {
  const items: FilterItem[] = []
  if (!options.omitRegion) {
    items.push({ label: "Gewest", value: options.regions.length > 0 ? regionNames(options.regions).join(", ") : "Alle gewesten" })
    if (options.regions.length > 0) {
      items.push({
        label: "Tegenpartij",
        value: options.counterparts.length > 0 ? regionNames(options.counterparts).join(", ") : "Alle andere gewesten",
      })
    }
  }
  const dimOption = MIGRATION_DIM_OPTIONS.find((option) => option.code === options.dim) ?? MIGRATION_DIM_OPTIONS[0]
  items.push({ label: "Uitsplitsing", value: dimOption.label })
  if (options.dim !== "tot") {
    items.push({
      label: dimOption.label,
      value: options.categories.length > 0 ? migrationCategoryLabels(data, options.dim, options.categories).join(", ") : dimOption.allLabel,
    })
  }
  if (options.year) items.push({ label: "Jaar", value: String(options.year) })
  return items
}
