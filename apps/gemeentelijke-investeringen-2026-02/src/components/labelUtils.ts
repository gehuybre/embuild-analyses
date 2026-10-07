/**
 * Utility functions for stripping prefixes from BV and REK labels
 */

/**
 * Strips numeric prefixes from BV domain, subdomein, and beleidsveld labels
 * Examples:
 * - "0 Algemene financiering" -> "Algemene financiering"
 * - "011 Algemene diensten" -> "Algemene diensten"
 * - "0200 Wegen" -> "Wegen"
 * - "REK221-0 gebouwen" -> "gebouwen"
 */
export function stripPrefix(label: string): string {
  if (!label) return label

  // Pattern matches:
  // - Hierarchical: "I.1.A ", "I.2 "
  // - Numeric/Slash: "0 ", "011 ", "0200 ", "038/9 "
  // - REK codes: "REK221-0 ", "REK123 "
  return label.replace(/^([A-Z]\.[\d\.]+[A-Z]?\s+|[\d/]+\s+|REK[\d-]+\s+)/g, '').trim()
}

/**
 * Strips prefixes from an array of labels
 */
export function stripPrefixes(labels: string[]): string[] {
  return labels.map(stripPrefix)
}

const BV_DOMAINS_GROUPED_AS_OTHER = new Set([
  "Algemeen bestuur",
  "Algemene financiering",
])

export const BV_OTHER_DOMAIN_LABEL = "Andere"

export function normalizeBvDomainLabel(label: string): string {
  const stripped = stripPrefix(label)
  return BV_DOMAINS_GROUPED_AS_OTHER.has(stripped) ? BV_OTHER_DOMAIN_LABEL : stripped
}
