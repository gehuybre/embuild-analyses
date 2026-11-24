export const SLUG = "gemeentelijke-investeringen-2026-10"

export const COMPARISON_SECTIONS = [
  "investments-yearly-actual",
  "investments-yearly-actual-real",
  "investments-yearly-latest",
  "investments-yearly-original",
] as const

export const SECTIONS = [
  ...COMPARISON_SECTIONS,
  "investments-bv",
  "investments-bv-indexed",
  "investments-share-total",
  "investments-share-yearly",
  "investments-bv-breakdown",
  "investments-rek-breakdown",
  "investments-planned-2026-2031",
] as const

export type ComparisonSection = typeof COMPARISON_SECTIONS[number]
export type Section = typeof SECTIONS[number]

export const PROJECTS_PATH = "/analyses/bouwprojecten-gemeenten-2026-09/"
/** Vanuit een embed: losse standalone projectbrowser (Cloudflare Pages), zonder link naar de volledige site. */
export const PROJECTS_EMBED_PATH = "https://gemeenten-projectbrowser.pages.dev/embed/bouwprojecten-gemeenten-2026-09/projectbrowser/"
