const nf0 = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export function formatNumber(value: number): string {
  return nf0.format(value)
}

/** Bedrag in miljoen euro, zonder eenheid: 13.529 */
export function formatMillions(euro: number): string {
  return nf0.format(euro / 1e6)
}

/** Verschil in miljoen euro met teken: +35 of -88 (echt minteken) */
export function formatSignedMillions(euro: number): string {
  const value = Math.round(euro / 1e6)
  if (value === 0) return "0"
  return `${value > 0 ? "+" : "−"}${nf0.format(Math.abs(value))}`
}

export function formatSignedPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "n.v.t."
  const pct = ratio * 100
  const text = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Math.abs(pct))
  if (Math.abs(pct) < Math.pow(10, -digits) / 2) return `${text}%`
  return `${pct > 0 ? "+" : "−"}${text}%`
}

export function formatShare(ratio: number): string {
  return `${nf1.format(ratio * 100)}%`
}

export function stripPrefix(label: string): string {
  return label ? label.replace(/^([A-Z]\.[\d.]+[A-Z]?\s+|[\d/]+\s+)/, "").trim() : label
}
