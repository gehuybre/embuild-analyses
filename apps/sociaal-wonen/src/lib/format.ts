const eur = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
const int = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 })
const dec1 = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export const fmtInt = (n: number | null | undefined) => (n == null ? "–" : int.format(n))
export const fmtEur = (n: number | null | undefined) => (n == null ? "–" : eur.format(n))

/** 83 027 439 -> "€ 83,0 mln", 1 951 252 058 -> "€ 1,95 mld". */
export function fmtEurCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `€ ${new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n / 1e9)} mld`
  if (abs >= 1e6) return `€ ${dec1.format(n / 1e6)} mln`
  if (abs >= 1e3) return `€ ${int.format(n / 1e3)} dzd`
  return `€ ${int.format(n)}`
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

export function titleCaseProv(p: string): string {
  return p
    .toLowerCase()
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("-")
}
