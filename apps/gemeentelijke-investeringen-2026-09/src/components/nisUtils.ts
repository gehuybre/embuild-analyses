/**
 * Utilities for working with NIS codes and municipality names
 */

export type NisLookup = Record<string, string>

/**
 * Get municipality name from NIS code
 */
export function getMunicipalityName(nisCode: string, lookup?: NisLookup | null): string {
  if (!lookup) return `Gemeente ${nisCode}`
  return lookup[nisCode] || `Gemeente ${nisCode}`
}

/**
 * Get all municipalities sorted by name
 */
export function getAllMunicipalities(lookup?: NisLookup | null): Array<{ nisCode: string; name: string }> {
  if (!lookup) return []
  return Object.entries(lookup)
    .map(([nisCode, name]) => ({ nisCode, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
