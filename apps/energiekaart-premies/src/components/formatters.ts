"use client"

export type CurrencyScale = {
  divisor: number
  suffix: "" | "k" | "mln"
}

export function getCurrencyScale(values: number[]): CurrencyScale {
  const maxAbs = values.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0)
  if (maxAbs >= 1_000_000) return { divisor: 1_000_000, suffix: "mln" }
  if (maxAbs >= 1_000) return { divisor: 1_000, suffix: "k" }
  return { divisor: 1, suffix: "" }
}

function formatMax5Digits(value: number): string {
  return new Intl.NumberFormat("nl-BE", {
    maximumSignificantDigits: 5,
  }).format(value)
}

export function formatScaledNumber(value: number, scale: CurrencyScale): string {
  const scaled = value / scale.divisor
  const formatted = formatMax5Digits(scaled)
  return scale.suffix ? `${formatted} ${scale.suffix}` : formatted
}

export function formatScaledEuro(value: number, scale: CurrencyScale): string {
  const scaled = value / scale.divisor
  const formatted = formatMax5Digits(scaled)
  return scale.suffix ? `€ ${formatted} ${scale.suffix}` : `€ ${formatted}`
}

export function getCurrencyLabel(baseLabel: string, scale: CurrencyScale): string {
  if (scale.suffix === "mln") return baseLabel.replace("(€)", "(mln €)")
  if (scale.suffix === "k") return baseLabel.replace("(€)", "(k €)")
  return baseLabel
}
