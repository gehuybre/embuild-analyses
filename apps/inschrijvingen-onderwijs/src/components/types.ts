export interface YearlyTotalVlaanderen {
  year: number
  value: number
}

export interface YearlyTotalProvince {
  year: number
  province_code: string
  province_name: string
  value: number
}

export interface YearlyTotalMunicipality extends Record<string, string | number> {
  year: number
  municipality_code: string
  municipality_name: string
  province_code: string
  value: number
}

export interface YearlyByInstellingVlaanderen {
  year: number
  type_onderwijsinstelling_code: string
  type_onderwijsinstelling_name: string
  value: number
}

export interface YearlyByInstellingProvince {
  year: number
  province_code: string
  province_name: string
  type_onderwijsinstelling_code: string
  type_onderwijsinstelling_name: string
  value: number
}

export interface LatestByOpleiding {
  year: number
  opleiding_code: string
  opleiding_name: string
  value: number
}

export interface LatestByStudiegebied {
  year: number
  studiegebied_code: string
  studiegebied_name: string
  value: number
}

export interface YearlyByStudiegebiedVlaanderen {
  year: number
  studiegebied_code: string
  studiegebied_name: string
  value: number
}

export interface ProvinceLookup {
  code: string
  name: string
}

export interface InschrijvingenLookups {
  years: number[]
  latest_year: number
  province_codes_flanders: string[]
  provinces: ProvinceLookup[]
  dimensions: Record<string, Array<{ code: string; name: string }>>
}

export type InstellingSeriesRow = {
  year: number
  universiteit: number
  hogeschool: number
  secundair_onderwijs: number
  totaal: number
}

export type BouwStudieSeriesRow = {
  year: number
  architectuur: number
  industriele_wetenschappen_en_technologie: number
  toegepaste_wetenschappen: number
  totaal_bouw: number
}

export const BOUW_STUDIEGEBIEDEN = [
  "architectuur",
  "industriële wetenschappen en technologie",
  "toegepaste wetenschappen",
] as const

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("nl-BE", {
    maximumFractionDigits: 0,
  }).format(value)
}

export function normalizeProvinceName(name: string): string {
  return name.replace(" (Prov.)", "")
}

function instellingKey(name: string): "universiteit" | "hogeschool" | "secundair_onderwijs" {
  const normalized = name.toLowerCase()
  if (normalized.includes("universiteit")) return "universiteit"
  if (normalized.includes("hogeschool")) return "hogeschool"
  return "secundair_onderwijs"
}

type InstellingInput = {
  year: number
  type_onderwijsinstelling_name: string
  value: number
}

export function buildInstellingSeries(rows: InstellingInput[]): InstellingSeriesRow[] {
  const byYear = new Map<number, InstellingSeriesRow>()
  rows.forEach((row) => {
    const current = byYear.get(row.year) ?? {
      year: row.year,
      universiteit: 0,
      hogeschool: 0,
      secundair_onderwijs: 0,
      totaal: 0,
    }
    const key = instellingKey(row.type_onderwijsinstelling_name)
    current[key] += row.value
    current.totaal += row.value
    byYear.set(row.year, current)
  })
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year)
}

export function buildTotalsSeries(
  vlaanderen: YearlyTotalVlaanderen[],
  provinces: YearlyTotalProvince[],
  selectedProvince: string | null
): YearlyTotalVlaanderen[] {
  if (!selectedProvince) {
    return [...vlaanderen].sort((a, b) => a.year - b.year)
  }
  return provinces
    .filter((row) => row.province_code === selectedProvince)
    .map((row) => ({ year: row.year, value: row.value }))
    .sort((a, b) => a.year - b.year)
}

export function buildBouwStudiegebiedenSeries(
  rows: YearlyByStudiegebiedVlaanderen[]
): BouwStudieSeriesRow[] {
  const included = new Set<string>(BOUW_STUDIEGEBIEDEN)
  const byYear = new Map<number, BouwStudieSeriesRow>()
  rows.forEach((row) => {
    if (!included.has(row.studiegebied_name)) return
    const current = byYear.get(row.year) ?? {
      year: row.year,
      architectuur: 0,
      industriele_wetenschappen_en_technologie: 0,
      toegepaste_wetenschappen: 0,
      totaal_bouw: 0,
    }
    if (row.studiegebied_name === "architectuur") {
      current.architectuur += row.value
    } else if (row.studiegebied_name === "industriële wetenschappen en technologie") {
      current.industriele_wetenschappen_en_technologie += row.value
    } else if (row.studiegebied_name === "toegepaste wetenschappen") {
      current.toegepaste_wetenschappen += row.value
    }
    current.totaal_bouw += row.value
    byYear.set(row.year, current)
  })
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year)
}
