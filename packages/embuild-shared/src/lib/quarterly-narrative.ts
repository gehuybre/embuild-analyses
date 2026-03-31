export type QuarterlySeriesPoint = {
  index: number
  label: string
  value: number
}

type NarrativeOptions = {
  subject: string
  place: string
  series: QuarterlySeriesPoint[]
  valueFormatter?: (n: number) => string
  percentFormatter?: (ratio: number) => string
}

function defaultValueFormatter(n: number) {
  return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 }).format(n)
}

function defaultPercentFormatter(ratio: number) {
  return new Intl.NumberFormat("nl-BE", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(ratio)
}

function describePctChange(ratio: number, percentFormatter: (ratio: number) => string) {
  if (!Number.isFinite(ratio)) return null
  if (ratio === 0) return { text: "evenveel", preposition: "als" as const }
  const pct = percentFormatter(Math.abs(ratio))
  return { text: `${pct} ${ratio > 0 ? "meer" : "minder"}`, preposition: "dan" as const }
}

function pctChange(current: number, baseline: number) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null
  if (baseline === 0) return null
  return current / baseline - 1
}

function average(values: number[]) {
  if (!values.length) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return sum / values.length
}

function rolling4Average(seriesByIndex: Map<number, QuarterlySeriesPoint>) {
  const indices = Array.from(seriesByIndex.keys()).sort((a, b) => a - b)
  const sums: number[] = []

  indices.forEach((i) => {
    const p0 = seriesByIndex.get(i)
    const p1 = seriesByIndex.get(i - 1)
    const p2 = seriesByIndex.get(i - 2)
    const p3 = seriesByIndex.get(i - 3)
    if (!p0 || !p1 || !p2 || !p3) return
    sums.push(p0.value + p1.value + p2.value + p3.value)
  })

  return average(sums)
}

export function buildQuarterlyNarrative({
  subject,
  place,
  series,
  valueFormatter = defaultValueFormatter,
  percentFormatter = defaultPercentFormatter,
}: NarrativeOptions) {
  const cleaned = series
    .filter((p) => Number.isFinite(p.index) && Number.isFinite(p.value))
    .sort((a, b) => a.index - b.index)

  if (!cleaned.length) return null

  const byIndex = new Map<number, QuarterlySeriesPoint>()
  cleaned.forEach((p) => byIndex.set(p.index, p))

  const latest = cleaned[cleaned.length - 1]
  const sameQuarterLastYear = byIndex.get(latest.index - 4) ?? null

  const avgQuarter = average(cleaned.map((p) => p.value))
  const avg4 = rolling4Average(byIndex)

  const comparisons1: string[] = []
  if (sameQuarterLastYear) {
    const ratio = pctChange(latest.value, sameQuarterLastYear.value)
    const desc = ratio === null ? null : describePctChange(ratio, percentFormatter)
    comparisons1.push(
      desc
        ? `${desc.text} ${desc.preposition} hetzelfde kwartaal vorig jaar`
        : `niet vergelijkbaar met hetzelfde kwartaal vorig jaar`
    )
  }
  if (avgQuarter !== null) {
    const ratio = pctChange(latest.value, avgQuarter)
    const desc = ratio === null ? null : describePctChange(ratio, percentFormatter)
    comparisons1.push(
      desc
        ? `${desc.text} ${desc.preposition} het gemiddelde van alle beschikbare kwartalen`
        : `niet vergelijkbaar met het gemiddelde van alle beschikbare kwartalen`
    )
  }

  const latestText = [
    `Het aantal ${subject} in ${place} bedroeg in het laatst beschikbare kwartaal (${latest.label}) ${valueFormatter(latest.value)}.`,
    comparisons1.length ? `Dit is ${comparisons1.join(" en ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ")

  const last4Points = [latest.index - 3, latest.index - 2, latest.index - 1, latest.index]
    .map((idx) => byIndex.get(idx))
    .filter(Boolean) as QuarterlySeriesPoint[]

  if (last4Points.length < 4) {
    return { latest: latestText, last4: null }
  }

  const sum4 = last4Points.reduce((a, p) => a + p.value, 0)
  const sum4PrevYearPoints = [latest.index - 7, latest.index - 6, latest.index - 5, latest.index - 4]
    .map((idx) => byIndex.get(idx))
    .filter(Boolean) as QuarterlySeriesPoint[]
  const sum4PrevYear = sum4PrevYearPoints.length === 4 ? sum4PrevYearPoints.reduce((a, p) => a + p.value, 0) : null

  const comparisons4: string[] = []
  if (sum4PrevYear !== null) {
    const ratio = pctChange(sum4, sum4PrevYear)
    const desc = ratio === null ? null : describePctChange(ratio, percentFormatter)
    comparisons4.push(
      desc
        ? `${desc.text} ${desc.preposition} dezelfde periode een jaar eerder`
        : `niet vergelijkbaar met dezelfde periode een jaar eerder`
    )
  }
  if (avg4 !== null) {
    const ratio = pctChange(sum4, avg4)
    const desc = ratio === null ? null : describePctChange(ratio, percentFormatter)
    comparisons4.push(
      desc
        ? `${desc.text} ${desc.preposition} het gemiddelde van alle 4-kwartaalperiodes`
        : `niet vergelijkbaar met het gemiddelde van alle 4-kwartaalperiodes`
    )
  }

  const last4Text = [
    `Over de laatste 4 beschikbare kwartalen (tot en met ${latest.label}) gaat het om ${valueFormatter(sum4)} ${subject}.`,
    comparisons4.length ? `Dit is ${comparisons4.join(" en ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ")

  return { latest: latestText, last4: last4Text }
}
