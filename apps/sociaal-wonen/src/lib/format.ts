export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–"
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}
