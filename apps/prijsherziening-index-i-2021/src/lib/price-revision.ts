export type LaborIndex = {
  effective_date: string
  initial_effective_date: string | null
  valid_until: string | null
  circular: string
  regime: string
  employer_size: string
  category: string
  value: number
  source_pdf: string | null
  source_page: number | null
}

export type MaterialIndex = { year: number; month: number; component: string; component_orig?: string; value: number }

export const LABOR_REGIME = "offerten vanaf 11/06/2007"
export const LABOR_CATEGORIES = [
  { code: "A", description: "Maritieme- en rivierwerken, grondwerken, wegenwerken en betonwerken, baggerwerken, asfalterings- en bitumenwerken", rsz: "24" },
  { code: "B", description: "Dakbedekkingswerken en opvoegen van gevels", rsz: "54" },
  { code: "C", description: "Bevloerings-, plafonnerings- en bepleisteringswerken", rsz: "44" },
  { code: "D", description: "Andere werken", rsz: "26" },
]
export const LABOR_SIZES = [
  { value: "<10 werklieden", label: "Minder dan 10 werknemers" },
  { value: "10-20 werklieden", label: "10 tot en met 20 werknemers" },
  { value: ">20 werklieden", label: "Meer dan 20 werknemers" },
]

export function matchesLaborSize(row: LaborIndex, size: string): boolean {
  return row.employer_size === size || (size !== "<10 werklieden" && row.employer_size === ">=10 werklieden")
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function calendarDate(year: string, month: string, day: string): string {
  if (!year || !month || !day) return ""
  const lastDay = daysInMonth(Number(year), Number(month))
  return `${year}-${month.padStart(2, "0")}-${String(Math.min(Number(day), lastDay)).padStart(2, "0")}`
}

export function buildLaborChart(rows: LaborIndex[], sizes: string[], categories: string[]) {
  const series = LABOR_SIZES.filter(size => sizes.includes(size.value)).flatMap(size =>
    LABOR_CATEGORIES.filter(category => categories.includes(category.code)).map(category => ({
      id: `size${LABOR_SIZES.indexOf(size)}cat${category.code}`,
      label: `${size.label} · categorie ${category.code}`,
      colorIndex: LABOR_SIZES.indexOf(size) * 4 + LABOR_CATEGORIES.indexOf(category),
      rows: rows.filter(row => row.regime === LABOR_REGIME && matchesLaborSize(row, size.value)
        && row.category === category.code && row.initial_effective_date !== null),
    }))
  )
  const dates = new Set<string>()
  for (const item of series) {
    for (const row of item.rows) {
      if (row.initial_effective_date) dates.add(row.initial_effective_date)
      const end = laborEnd(row, true)
      if (end) {
        dates.add(end)
        dates.add(new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10))
      }
    }
  }
  const points = [...dates].sort().map(date => {
    const values: Record<string, number | null> = {}
    for (const item of series) {
      const row = findLaborIndex(item.rows, date, true)
      values[item.id] = row && Number.isFinite(row.value) && row.value > 0 ? row.value : null
    }
    return { date, timestamp: Date.parse(date), ...values }
  })
  return { series, points }
}

export type MaterialObservation = { date: string; value: number; cell?: string }
export type MaterialSeries = {
  id: string
  label: string
  group: string
  source_url: string
  note: string
  sheet?: string
  table?: string
  observations: MaterialObservation[]
}
export type MaterialSnapshot = {
  source_workbook: string
  source_sha256: string
  snapshot_date: string
  note: string
  series: MaterialSeries[]
}

export function laborStart(row: LaborIndex, initial: boolean): string | null {
  return initial ? row.initial_effective_date : row.effective_date
}

export function laborEnd(row: LaborIndex, initial: boolean): string | null {
  if (!row.valid_until) return null
  if (!initial) return row.valid_until
  if (!row.initial_effective_date) return null
  const offset = Date.parse(row.initial_effective_date) - Date.parse(row.effective_date)
  return new Date(Date.parse(row.valid_until) + offset).toISOString().slice(0, 10)
}

export function findLaborIndex(rows: LaborIndex[], date: string, initial: boolean): LaborIndex | undefined {
  if (!date) return undefined
  const candidates = rows.filter(row => {
    const start = laborStart(row, initial)
    return start !== null && start <= date
  }).sort((a, b) => (laborStart(b, initial) ?? "").localeCompare(laborStart(a, initial) ?? ""))
  const row = candidates[0]
  if (!row) return undefined
  const end = laborEnd(row, initial)
  if (end && date > end) return undefined
  // Without a documented end date, a following publication must bound the period.
  if (!end && !rows.some(next => (laborStart(next, initial) ?? "") > date)) return undefined
  return row
}

export function findMaterialIndex(rows: MaterialIndex[], date: string): MaterialIndex | undefined {
  return rows.find(row => row.component === "Index I-2021"
    && `${row.year}-${String(row.month).padStart(2, "0")}` === date.slice(0, 7))
}

export function previousMaterialMonth(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return ""
  parsed.setUTCDate(1)
  parsed.setUTCMonth(parsed.getUTCMonth() - 1)
  return parsed.toISOString().slice(0, 10)
}

export function findMaterialObservation(series: MaterialSeries, month: string): MaterialObservation | undefined {
  return series.observations.find(row => row.date === month)
}

export function liveMaterialSeries(rows: MaterialIndex[]): MaterialSeries[] {
  const groups = new Map<string, MaterialSeries>()
  for (const row of rows) {
    if (row.component !== "Index I-2021" && !/^\d+$/.test(row.component)) continue
    let series = groups.get(row.component)
    if (!series) {
      series = {
        id: row.component,
        label: row.component === "Index I-2021" ? "I-2021 (algemene materiaalindex)" : `PPI ${row.component} - ${row.component_orig ?? row.component}`,
        group: "FOD Economie",
        source_url: "https://economie.fgov.be/sites/default/files/Files/Entreprises/prix-construction-Indice-I-2021.xlsx",
        note: "Afzonderlijke maandwaarden uit het officiële I-2021-bestand; geen vervanging door oudere maanden.",
        observations: [],
      }
      groups.set(row.component, series)
    }
    series.observations.push({
      date: `${row.year}-${String(row.month).padStart(2, "0")}-01`,
      value: row.value,
    })
  }
  return [...groups.values()].sort((a, b) => {
    if (a.id === b.id) return 0
    if (a.id === "Index I-2021") return -1
    if (b.id === "Index I-2021") return 1
    return a.label.localeCompare(b.label)
  })
}

export function excelRound(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value
  const [mantissa, exponent = "0"] = Math.abs(value).toString().split("e")
  const shifted = Number(`${mantissa}e${Number(exponent) + digits}`)
  return Math.sign(value) * Math.round(shifted) / 10 ** digits
}

export type RevisionMaterial = {
  id: string
  label: string
  weight: number
  initial: number | undefined
  revision: number | undefined
}
type Contribution = { id: string; label: string; share: number; change: number; percentagePoints: number }
export type RevisionResult =
  | { ok: false; error: string }
  | {
    ok: true
    factor: number
    revisedPrice: number
    difference: number
    fixedShare: number
    contributions: Contribution[]
    roundingPercentagePoints: number
  }

export function calculateRevision(input: {
  price: number
  laborShare: number
  materialShare: number
  initialLabor: number | undefined
  revisionLabor: number | undefined
  materials: RevisionMaterial[]
}): RevisionResult {
  const { price, laborShare, materialShare, initialLabor, revisionLabor, materials } = input
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: "Vul een contractprijs groter dan nul in." }
  if ([laborShare, materialShare].some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
    return { ok: false, error: "Vul voor elk aandeel een percentage tussen 0 en 100 in." }
  }
  const remainder = 1 - laborShare - materialShare
  if (remainder < -1e-10) return { ok: false, error: "De aandelen lonen en materialen mogen samen niet meer dan 100% zijn." }
  const fixedShare = Math.max(0, remainder)
  const validIndex = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value > 0
  const contributions: Contribution[] = []
  if (laborShare > 0) {
    if (!validIndex(initialLabor) || !validIndex(revisionLabor)) {
      return { ok: false, error: "Voor een gekozen datum is geen geldige S/s-waarde beschikbaar." }
    }
    const change = excelRound(revisionLabor / initialLabor - 1, 5)
    contributions.push({ id: "labor", label: "Lonen", share: laborShare, change, percentagePoints: 100 * laborShare * change })
  }
  if (materialShare > 0) {
    if (!materials.length || materials.some(row => !Number.isFinite(row.weight) || row.weight < 0 || row.weight > 1)
      || Math.abs(materials.reduce((sum, row) => sum + row.weight, 0) - 1) > 1e-8) {
      return { ok: false, error: "De gewichten binnen het materiaalmandje moeten samen 100% zijn." }
    }
    const ids = materials.map(row => row.id)
    if (new Set(ids).size !== ids.length) return { ok: false, error: "Kies elke materiaalreeks slechts één keer." }
    for (const row of materials) {
      if (row.weight === 0) continue
      if (!validIndex(row.initial) || !validIndex(row.revision)) {
        return { ok: false, error: `${row.label}: geen geldige waarde voor een referentiemaand. Er wordt geen oudere maand als vervanging gebruikt.` }
      }
      const share = materialShare * row.weight
      const change = excelRound(row.revision / row.initial - 1, 5)
      contributions.push({ id: row.id, label: row.label, share, change, percentagePoints: 100 * share * change })
    }
  }
  const unroundedFactor = 1 + contributions.reduce((sum, row) => sum + row.share * row.change, 0)
  const factor = excelRound(unroundedFactor, 5)
  const revisedPrice = excelRound(price * factor, 2)
  if (!Number.isFinite(revisedPrice) || !Number.isFinite(factor) || factor <= 0) {
    return { ok: false, error: "Het berekende bedrag of de indexverhouding is ongeldig of te groot." }
  }
  return {
    ok: true, factor, revisedPrice, fixedShare,
    difference: excelRound(revisedPrice - price, 2), contributions,
    roundingPercentagePoints: 100 * (factor - unroundedFactor),
  }
}
