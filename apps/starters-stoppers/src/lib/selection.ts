// Meerkeuzefilters voor starters-stoppers. Een lege selectie betekent "alles" (België, alle sectoren, alle werknemersklassen).
// Gekozen waarden worden afzonderlijk vergeleken; aggregatie gebeurt enkel binnen een reeks.

import { ARRONDISSEMENTS, PROVINCES } from "@embuild/shared/lib/geo-utils"

export const BELGIUM = "1000"
export const BRUSSELS_PROVINCE_CODE = "21000" // Brussel bestaat in de data enkel als gewest

export type Option = { code: string; label: string }

export const GEO_REGIONS: Option[] = [
  { code: "2000", label: "Vlaanderen" },
  { code: "3000", label: "Wallonië" },
  { code: "4000", label: "Brussel" },
]

export const GEO_PROVINCES: Array<Option & { regionCode: string }> = PROVINCES.filter(
  (province) => String(province.code) !== BRUSSELS_PROVINCE_CODE
)
  .map((province) => ({ code: String(province.code), label: province.name, regionCode: String(province.regionCode) }))
  .sort((a, b) => a.label.localeCompare(b.label, "nl"))

export type GeoArrondissement = Option & { provinceCode: string; regionCode: string }

// Moeskroen (54000) bestond enkel in de bestanden van 2009 t/m 2017; Brussel-Hoofdstad is het gewest Brussel.
const EXTRA_ARRONDISSEMENTS = [{ code: "54000", name: "Arrondissement Moeskroen", provinceCode: "50000" }]

export const GEO_ARRONDISSEMENTS: GeoArrondissement[] = [...ARRONDISSEMENTS, ...EXTRA_ARRONDISSEMENTS]
  .filter((arrondissement) => arrondissement.code !== "21000")
  .map((arrondissement) => {
    const province = GEO_PROVINCES.find((item) => item.code === String(arrondissement.provinceCode))
    return {
      code: String(arrondissement.code),
      label: `${arrondissement.name.replace(/^Arrondissement /, "")} (${province?.label ?? ""})`,
      provinceCode: String(arrondissement.provinceCode),
      regionCode: province?.regionCode ?? "",
    }
  })
  .sort((a, b) => a.label.localeCompare(b.label, "nl"))

/** Henegouwse arrondissementen waarvan de grenzen in 2018 herschikt werden: de reeksen zijn niet vergelijkbaar over die grens. */
export const REDRAWN_ARRONDISSEMENTS = ["51000", "54000", "55000", "56000", "57000", "58000"]

export function isArrondissement(code: string): boolean {
  return GEO_ARRONDISSEMENTS.some((arrondissement) => arrondissement.code === code)
}

const REGION_CODES = GEO_REGIONS.map((region) => region.code)
const GEO_LABELS = new Map<string, string>([
  [BELGIUM, "België"],
  ...GEO_REGIONS.map((region) => [region.code, region.label] as [string, string]),
  ...GEO_PROVINCES.map((province) => [province.code, province.label] as [string, string]),
  ...GEO_ARRONDISSEMENTS.map((arrondissement) => [arrondissement.code, arrondissement.label] as [string, string]),
])

export function parseList(value: string | null | undefined): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []
}

export function joinList(values: string[]): string | null {
  return values.length > 0 ? values.join(",") : null
}

/**
 * Bewaart ook overlappende gebieden: elke locatie wordt een afzonderlijke vergelijkingsreeks.
 * Arrondissementen bestaan enkel voor de ondernemingstellingen.
 */
export function normalizeGeos(codes: string[], allowArrondissements = false): string[] {
  const unique = Array.from(new Set(codes.filter(Boolean)))
  if (unique.includes(BELGIUM)) return []
  return unique.filter((code) =>
    REGION_CODES.includes(code) ||
    GEO_PROVINCES.some((item) => item.code === code) ||
    (allowArrondissements && isArrondissement(code))
  )
}

export function splitGeos(geos: string[]): { regions: string[]; provinces: string[]; arrondissements: string[] } {
  return {
    regions: geos.filter((code) => REGION_CODES.includes(code)),
    provinces: geos.filter((code) => !REGION_CODES.includes(code) && !isArrondissement(code)),
    arrondissements: geos.filter(isArrondissement),
  }
}

/** Voor de URL van een embed: gewesten, provincies en arrondissementen als aparte, kommagescheiden parameters. */
export function geoEmbedParams(geos: string[]) {
  const { regions, provinces, arrondissements } = splitGeos(geos)
  return { region: joinList(regions), province: joinList(provinces), arrondissement: joinList(arrondissements) }
}

export function geoFromParams(region: string | null, province: string | null, arrondissement: string | null = null, allowArrondissements = false): string[] {
  return normalizeGeos([...parseList(region), ...parseList(province), ...parseList(arrondissement)], allowArrondissements)
}

export function geoLabels(geos: string[]): string[] {
  return geos.length === 0 ? ["België"] : geos.map((code) => GEO_LABELS.get(code) ?? code)
}

/** Korte omschrijving voor titels: één of twee namen, anders het aantal. */
export function describeSelection(labels: string[], noun: string, max = 2): string {
  return labels.length <= max ? labels.join(", ") : `${labels.length} ${noun}`
}

export function describeGeos(geos: string[]): string {
  return describeSelection(geoLabels(geos), "locaties")
}

export function labelsFor(codes: string[], options: Option[]): string[] {
  return codes.map((code) => options.find((option) => option.code === code)?.label ?? code)
}

export function sectorCodes(sectors: string[]): string[] {
  return sectors.length > 0 ? sectors : ["ALL"]
}

export function expectedCells(geos: string[], sectors: string[]): number {
  return Math.max(geos.length, 1) * sectorCodes(sectors).length
}

/**
 * Houdt enkel groepen (maand, jaar) over waarvoor elke gekozen combinatie van locatie en sector data heeft.
 * Zo worden geen onvolledige sommen getoond, bv. een provincie voor 2019-2020 of een sector die NACE 2025 niet meer apart levert.
 */
export function keepCompleteGroups<T>(rows: T[], keyOf: (row: T) => string, cellOf: (row: T) => string, expected: number): T[] {
  const cells = new Map<string, Set<string>>()
  for (const row of rows) {
    const key = keyOf(row)
    const set = cells.get(key) ?? new Set<string>()
    set.add(cellOf(row))
    cells.set(key, set)
  }
  return rows.filter((row) => (cells.get(keyOf(row))?.size ?? 0) >= expected)
}

type GeoSectorRow = { g?: string; n1: string }

/** Rijen met een geocode (`g`). Zonder geselecteerde locatie wordt België (`1000`) genomen. */
export function filterGeoSectorRows<T extends GeoSectorRow>(rows: T[], geos: string[], sectors: string[]): T[] {
  const codes = new Set(sectorCodes(sectors))
  const geoSet = new Set(geos.length > 0 ? geos : [BELGIUM])
  return rows.filter((row) => codes.has(row.n1) && geoSet.has(String(row.g)))
}

/** De nationale maandreeks heeft geen `g`-veld. */
export function filterNationalSectorRows<T extends { n1: string }>(rows: T[], sectors: string[]): T[] {
  const codes = new Set(sectorCodes(sectors))
  return rows.filter((row) => codes.has(row.n1))
}

type EnterpriseRow = { y: number; g: string; n1: string; w: string; vat: number }

/**
 * Telt ondernemingen op voor de gekozen locaties, sectoren en werknemersklassen. Een jaar telt enkel mee als elke gekozen
 * locatie dat jaar data heeft (een "ALL"-rij); ontbrekende sector- of klasserijen betekenen dan nul ondernemingen.
 */
export function filterEnterpriseRows<T extends EnterpriseRow>(rows: T[], geos: string[], sectors: string[], workerClasses: string[]): T[] {
  const geoCodes = geos.length > 0 ? geos : [BELGIUM]
  const available = new Map<number, Set<string>>()
  for (const row of rows) {
    if (row.n1 !== "ALL" || !geoCodes.includes(row.g)) continue
    const set = available.get(row.y) ?? new Set<string>()
    set.add(row.g)
    available.set(row.y, set)
  }
  const completeYears = new Set(Array.from(available.entries()).filter(([, set]) => set.size >= geoCodes.length).map(([year]) => year))
  const classSet = new Set(workerClasses)
  return filterGeoSectorRows(rows, geos, sectors).filter((row) => completeYears.has(row.y) && (classSet.size === 0 || classSet.has(row.w)))
}

type SurvivalRow = { r: string | null; p: string | null; n1: string | null }

export function filterSurvivalRows<T extends SurvivalRow>(rows: T[], geos: string[], sectors: string[]): T[] {
  const sectorSet = new Set(sectors)
  const geoSet = new Set(geos)
  return rows.filter((row) => {
    if (sectorSet.size > 0 && !(row.n1 && sectorSet.has(row.n1))) return false
    if (geoSet.size === 0) return true
    return Boolean((row.p && geoSet.has(String(row.p))) || (row.r && geoSet.has(String(row.r))))
  })
}

export type AnnualPoint = {
  sortValue: number
  periodCells: Array<string | number>
  value: number
  label: string
  provisional?: boolean
}

type AnnualRow = { y: number; g: string; n1: string; fr: number; st: number; p?: number }

/** Telt de jaarcijfers van alle gekozen locaties en sectoren op. Een jaar is voorlopig (*) als de bron het zo markeert. */
export function aggregateAnnualRows(rows: AnnualRow[], metric: "fr" | "st", geos: string[], sectors: string[]): AnnualPoint[] {
  const filtered = keepCompleteGroups(
    filterGeoSectorRows(rows, geos, sectors),
    (row) => String(row.y),
    (row) => `${row.g}|${row.n1}`,
    expectedCells(geos, sectors)
  )
  const grouped = new Map<number, { value: number; provisional: boolean }>()
  for (const row of filtered) {
    const current = grouped.get(row.y) ?? { value: 0, provisional: false }
    current.value += row[metric]
    current.provisional = current.provisional || row.p === 1
    grouped.set(row.y, current)
  }
  return Array.from(grouped.entries())
    .map(([year, { value, provisional }]) => {
      const label = provisional ? `${year}*` : String(year)
      return { sortValue: year, periodCells: [provisional ? label : year], value, label, provisional }
    })
    .sort((a, b) => a.sortValue - b.sortValue)
}

export function formatYearRanges(years: number[]): string {
  if (years.length === 0) return ""
  const sorted = [...years].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let previous = sorted[0]

  for (let index = 1; index < sorted.length; index += 1) {
    const year = sorted[index]
    if (year === previous + 1) {
      previous = year
      continue
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`)
    start = year
    previous = year
  }

  ranges.push(start === previous ? String(start) : `${start}-${previous}`)
  return ranges.join(", ")
}

/** Toelichting bij de ondernemingstellingen op provincie- of arrondissementsniveau. */
export function enterpriseGeoNotes(geos: string[], availableYears: number[], subregionYears: number[] | undefined): string[] {
  const notes: string[] = []
  const hasSubregion = geos.some((code) => !REGION_CODES.includes(code))
  if (hasSubregion && subregionYears && subregionYears.length > 0) {
    const missing = availableYears.filter((year) => !subregionYears.includes(year))
    if (missing.length > 0) {
      notes.push(`Voor ${formatYearRanges(missing)} is er geen Statbel-bronbestand op provincie- of arrondissementsniveau beschikbaar; die waarden blijven leeg. Gewestreeksen blijven zichtbaar voor de jaren waarvoor ze data hebben.`)
    }
  }
  if (geos.some((code) => REDRAWN_ARRONDISSEMENTS.includes(code))) {
    notes.push(
      "De grenzen van de Henegouwse arrondissementen Aat, Moeskroen, Zinnik, Thuin, Doornik en La Louvière werden herschikt: 2008 en vanaf 2018 hanteert Statbel de nieuwe indeling, 2009 tot 2017 de oude. Die reeksen zijn niet vergelijkbaar over die grens (Henegouwen als geheel wel)."
    )
  }
  return notes
}
