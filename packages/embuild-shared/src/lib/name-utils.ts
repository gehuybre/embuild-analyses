export function formatMunicipalityName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return trimmed

  const cap = (s: string) => {
    const lower = s.toLowerCase()
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }

  if (trimmed.includes("-")) {
    return trimmed
      .split("-")
      .map((part) => cap(part.trim()))
      .join("-")
  }

  return cap(trimmed)
}
