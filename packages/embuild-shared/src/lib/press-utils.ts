/**
 * Press Release Reference Utilities
 *
 * Utility functions for working with press release references in blog posts.
 * Used by the PressReferences component.
 */

export interface PressReference {
  id: string
  title: string
  date: string // ISO 8601 date (YYYY-MM-DD)
  url: string
  excerpt: string
}

export interface PressReferencesData {
  query: string
  generated_at: string
  references: PressReference[]
}

/**
 * Format an ISO date string to Dutch locale format
 *
 * @param isoDate - ISO 8601 date string (YYYY-MM-DD)
 * @returns Formatted date (e.g., "20 juni 2025")
 *
 * @example
 * formatPressDate("2025-06-20") // "20 juni 2025"
 */
export function formatPressDate(isoDate: string): string {
  const date = new Date(isoDate)
  return new Intl.DateTimeFormat("nl-BE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

/**
 * Group press references by year
 *
 * @param references - Array of press references
 * @returns Map of year to references, sorted descending (newest first)
 *
 * @example
 * const grouped = groupPressByYear(references)
 * for (const [year, refs] of grouped) {
 *   console.log(`${year}: ${refs.length} references`)
 * }
 */
export function groupPressByYear(
  references: PressReference[]
): Map<number, PressReference[]> {
  const grouped = new Map<number, PressReference[]>()

  for (const ref of references) {
    const year = new Date(ref.date).getFullYear()
    if (!grouped.has(year)) {
      grouped.set(year, [])
    }
    grouped.get(year)!.push(ref)
  }

  // Sort years descending (newest first)
  return new Map([...grouped.entries()].sort((a, b) => b[0] - a[0]))
}

/**
 * Truncate excerpt text to a maximum length
 *
 * Truncates at the last space before maxLength to avoid cutting words.
 * Adds "..." if truncated.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with "..." if needed
 *
 * @example
 * truncateExcerpt("This is a long text...", 10) // "This is..."
 */
export function truncateExcerpt(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  // Truncate at last space before maxLength to avoid cutting words
  const truncated = text.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(" ")

  return lastSpace > 0
    ? truncated.slice(0, lastSpace) + "..."
    : truncated + "..."
}
