import type { Option } from "./selection"
import { geoLabels } from "./selection"

export type ComparisonValue = { label: string; value: number | null }
export type ComparisonMetadata = { comparisons?: ComparisonValue[] }
export type ComparisonPoint = {
  sortValue: number
  label: string
  value: number
  periodCells: Array<string | number>
  provisional?: boolean
} & ComparisonMetadata

export type ComparisonDimension = { selected: string[]; options: Option[] }

export function selectionCombinations(dimensions: ComparisonDimension[]) {
  return dimensions.reduce<Array<{ selections: string[][]; label: string }>>(
    (combinations, dimension) =>
      combinations.flatMap((combination) =>
        (dimension.selected.length ? dimension.selected.map((code) => [code]) : [[]]).map((selection) => ({
          selections: [...combination.selections, selection],
          label: [
            combination.label,
            ...selection.map((code) => dimension.options.find((option) => option.code === code)?.label ?? code),
          ].filter(Boolean).join(" · "),
        }))
      ),
    [{ selections: [], label: "" }]
  )
}

export function geoDimension(geos: string[], options: Option[] = []): ComparisonDimension {
  return { selected: geos, options: geos.map((code) => options.find((option) => option.code === code) ?? ({ code, label: geoLabels([code])[0] })) }
}

/** Align on the union of periods: missing source data is null, never a zero or an incomplete sum. */
export function mergeComparisons(groups: Array<{ label: string; points: ComparisonPoint[] }>): ComparisonPoint[] {
  if (groups.length === 1) return groups[0].points
  const periods = new Map<number, ComparisonPoint>()
  const indexed = groups.map((group) => new Map(group.points.map((point) => [point.sortValue, point])))
  for (const group of groups) {
    for (const point of group.points) {
      const previous = periods.get(point.sortValue)
      periods.set(point.sortValue, { ...point, provisional: Boolean(previous?.provisional || point.provisional) })
    }
  }
  return Array.from(periods.values()).sort((a, b) => a.sortValue - b.sortValue).map((point) => ({
    ...point,
    label: point.provisional ? `${String(point.sortValue)}*` : point.label,
    periodCells: [point.provisional ? `${String(point.sortValue)}*` : point.periodCells[0]],
    comparisons: groups.map((group, index) => ({
      label: group.label,
      value: indexed[index].get(point.sortValue)?.value ?? null,
    })),
  }))
}

export function compareSelections(
  dimensions: ComparisonDimension[],
  compute: (selections: string[][]) => ComparisonPoint[]
): ComparisonPoint[] {
  return mergeComparisons(selectionCombinations(dimensions).map(({ selections, label }) => ({ label, points: compute(selections) })))
}

export function comparisonColumns(data: ComparisonMetadata[]): string[] {
  return data.find((point) => point.comparisons)?.comparisons?.map((item) => item.label) ?? []
}

export function comparisonChartData<T extends ComparisonMetadata>(data: T[]) {
  return data.map((point) => ({
    ...point,
    ...Object.fromEntries((point.comparisons ?? []).map((item, index) => [`comparison${index}`, item.value])),
  }))
}

export function comparisonCells(point: ComparisonMetadata, format: (value: number) => string) {
  return (point.comparisons ?? []).map((item) => item.value === null ? "—" : format(item.value))
}
