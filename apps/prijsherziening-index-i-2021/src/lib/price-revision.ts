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

export type MaterialIndex = { year: number; month: number; component: string; value: number }

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
