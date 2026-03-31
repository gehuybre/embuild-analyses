/**
 * Centralized configuration for embeddable analysis sections
 *
 * This file defines all embeddable sections across analyses in one place.
 * To add a new embeddable section:
 * 1. Add an entry to EMBED_CONFIGS with the analysis slug and section details
 * 2. The system will automatically generate routes and handle data loading
 */

import { validateEmbedPath } from "./embed-path-validation"
import type { EmbedDataConstraints } from "./embed-data-constraints"
import type { KnownMetricKey } from "./embed-types"

export type EmbedType = "standard" | "custom"

export interface StandardEmbedConfig {
  type: "standard"
  /** Display title for the embed */
  title: string
  /** Path to the data JSON file (relative to analyses folder) */
  dataPath: string
  /** Path to municipalities JSON file (relative to analyses folder) */
  municipalitiesPath: string
  /** Metric key to display */
  metric: KnownMetricKey
  /** Label for the metric (e.g., "Aantal") */
  label?: string
  /** Height of the iframe in pixels (default: 500) */
  height?: number
  /** Data constraints for filtering and aggregation */
  constraints?: EmbedDataConstraints
}

export interface CustomEmbedConfig {
  type: "custom"
  /** Display title for the embed */
  title: string
  /** Component name to render (must be registered in EmbedClient) */
  component: string
  /** Height of the iframe in pixels (default: 500) */
  height?: number
}

export type EmbedConfig = StandardEmbedConfig | CustomEmbedConfig

export interface AnalysisEmbedConfig {
  /** Analysis slug */
  slug: string
  /** Map of section IDs to their configurations */
  sections: Record<string, EmbedConfig>
}

/**
 * Main embed configuration registry
 * Add new embeddable sections here
 */
export const EMBED_CONFIGS: AnalysisEmbedConfig[] = [
  {
    slug: "vergunningen-goedkeuringen",
    sections: {
      renovatie: {
        type: "custom",
        title: "Renovatie (Gebouwen)",
        component: "VergunningenEmbed",
        height: 700,
      },
      "nieuwbouw-dwell": {
        type: "custom",
        title: "Nieuwbouw (Woningen totaal)",
        component: "VergunningenEmbed",
        height: 700,
      },
      "nieuwbouw-apt": {
        type: "custom",
        title: "Nieuwbouw (Appartementen)",
        component: "VergunningenEmbed",
        height: 700,
      },
      "nieuwbouw-house": {
        type: "custom",
        title: "Nieuwbouw (Eengezinswoningen)",
        component: "VergunningenEmbed",
        height: 700,
      },
      // Legacy redirect for backward compatibility
      nieuwbouw: {
        type: "custom",
        title: "Nieuwbouw (Woningen totaal)",
        component: "VergunningenEmbed",
        height: 700,
      },
      // Period comparison sections
      "renovatie-vergelijking": {
        type: "custom",
        title: "Renovatie - vergelijking 2019-2021 vs 2022-2025",
        component: "PeriodComparisonEmbed",
        height: 700,
      },
      "renovatie-vergelijking-aantallen": {
        type: "custom",
        title: "Renovatie - vergelijking 2019-2021 vs 2022-2025 (aantallen)",
        component: "PeriodComparisonEmbed",
        height: 520,
      },
      "renovatie-vergelijking-percentage": {
        type: "custom",
        title: "Renovatie - vergelijking 2019-2021 vs 2022-2025 (% verandering)",
        component: "PeriodComparisonEmbed",
        height: 520,
      },
      "nieuwbouw-vergelijking": {
        type: "custom",
        title: "Nieuwbouw - vergelijking 2019-2021 vs 2022-2025",
        component: "PeriodComparisonEmbed",
        height: 700,
      },
      "nieuwbouw-vergelijking-aantallen": {
        type: "custom",
        title: "Nieuwbouw - vergelijking 2019-2021 vs 2022-2025 (aantallen)",
        component: "PeriodComparisonEmbed",
        height: 520,
      },
      "nieuwbouw-vergelijking-percentage": {
        type: "custom",
        title: "Nieuwbouw - vergelijking 2019-2021 vs 2022-2025 (% verandering)",
        component: "PeriodComparisonEmbed",
        height: 520,
      },
    },
  },
  {
    slug: "starters-stoppers",
    sections: {
      starters: {
        type: "custom",
        title: "Aantal starters",
        component: "StartersStoppersEmbed",
      },
      stoppers: {
        type: "custom",
        title: "Aantal stoppers",
        component: "StartersStoppersEmbed",
      },
      survival: {
        type: "custom",
        title: "Overlevingskans",
        component: "StartersStoppersEmbed",
      },
    },
  },
  {
    slug: "vastgoed-verkopen",
    sections: {
      transacties: {
        type: "custom",
        title: "Aantal transacties",
        component: "VastgoedVerkopenEmbed",
      },
      prijzen: {
        type: "custom",
        title: "Mediaanprijs",
        component: "VastgoedVerkopenEmbed",
      },
      "transacties-kwartaal": {
        type: "custom",
        title: "Transacties per kwartaal",
        component: "VastgoedVerkopenEmbed",
      },
      "prijzen-kwartaal": {
        type: "custom",
        title: "Mediaanprijs per kwartaal",
        component: "VastgoedVerkopenEmbed",
      },
    },
  },
  {
    slug: "faillissementen",
    sections: {
      evolutie: {
        type: "custom",
        title: "Evolutie faillissementen",
        component: "FaillissementenEmbed",
      },
      leeftijd: {
        type: "custom",
        title: "Bedrijfsleeftijd",
        component: "FaillissementenEmbed",
      },
      bedrijfsgrootte: {
        type: "custom",
        title: "Bedrijfsgrootte",
        component: "FaillissementenEmbed",
      },
      sectoren: {
        type: "custom",
        title: "Sectorvergelijking",
        component: "FaillissementenEmbed",
      },
    },
  },
  {
    slug: "huishoudensgroei",
    sections: {
      evolutie: {
        type: "custom",
        title: "Evolutie aantal huishoudens",
        component: "HuishoudensgroeiEmbed",
      },
      ranking: {
        type: "custom",
        title: "Gemeenten ranking",
        component: "HuishoudensgroeiEmbed",
      },
      "size-breakdown": {
        type: "custom",
        title: "Samenstelling huishoudens",
        component: "HuishoudensgroeiEmbed",
      },
    },
  },
  {
    slug: "energiekaart-premies",
    sections: {
      "aantal-premies": {
        type: "custom",
        title: "Aantal toegekende premies",
        component: "EnergiekaartPremiesEmbed",
        height: 700,
      },
      "bedrag-premies": {
        type: "custom",
        title: "Totaal bedrag premies",
        component: "EnergiekaartPremiesEmbed",
        height: 700,
      },
      "aantal-beschermd": {
        type: "custom",
        title: "Aantal premies beschermde afnemers",
        component: "EnergiekaartPremiesEmbed",
        height: 700,
      },
      "bedrag-beschermd": {
        type: "custom",
        title: "Bedrag premies beschermde afnemers",
        component: "EnergiekaartPremiesEmbed",
        height: 700,
      },
    },
  },
  {
    slug: "epc-labelverdeling",
    sections: {
      "residential-aa": {
        type: "custom",
        title: "Residentieel: Aandeel A+A",
        component: "EpcLabelverdelingEmbed",
        height: 600,
      },
      "non-residential-aa": {
        type: "custom",
        title: "Niet-residentieel: Aandeel A+A",
        component: "EpcLabelverdelingEmbed",
        height: 600,
      },
      "residential-ef": {
        type: "custom",
        title: "Residentieel: Aandeel E+F",
        component: "EpcLabelverdelingEmbed",
        height: 600,
      },
      "non-residential-ef": {
        type: "custom",
        title: "Niet-residentieel: Aandeel E+F",
        component: "EpcLabelverdelingEmbed",
        height: 600,
      },
    },
  },
  {
    slug: "vergunningen-aanvragen",
    sections: {
      nieuwbouw: {
        type: "custom",
        title: "Nieuwbouw vergunningen",
        component: "VergunningenAanvragenEmbed",
        height: 600,
      },
      verbouw: {
        type: "custom",
        title: "Verbouw vergunningen",
        component: "VergunningenAanvragenEmbed",
        height: 600,
      },
      sloop: {
        type: "custom",
        title: "Sloop vergunningen",
        component: "VergunningenAanvragenEmbed",
        height: 600,
      },
    },
  },
  {
    slug: "gebouwenpark",
    sections: {
      evolutie: {
        type: "custom",
        title: "Evolutie gebouwenpark",
        component: "GebouwenparkEmbed",
        height: 600,
      },
    },
  },
  {
    slug: "nbb-rente",
    sections: {
      "hypothecaire-rente": {
        type: "custom",
        title: "Hypothecaire rente op nieuwe contracten (> 10 jaar rentevast)",
        component: "NbbRenteEmbed",
        height: 720,
      },
    },
  },
  {
    slug: "gemeentelijke-investeringen",
    sections: {
      "investments-bv": {
        type: "custom",
        title: "Investeringen per beleidsdomein",
        component: "InvesteringenEmbed",
        height: 700,
      },
      "investments-bv-indexed": {
        type: "custom",
        title: "Geindexeerde investeringsbedragen",
        component: "InvesteringenBVIndexedEmbed",
        height: 700,
      },
      "investments-bv-top-fields": {
        type: "custom",
        title: "Top Beleidsvelden (BV)",
        component: "InvesteringenEmbed",
        height: 700,
      },
      "investments-bv-difference": {
        type: "custom",
        title: "Verschil Investeringen per Beleidsdomein (Vlaanderen)",
        component: "InvesteringenBVDifferenceEmbed",
        height: 700,
      },
      "investments-rek": {
        type: "custom",
        title: "Investeringen per Economische Rekening (REK)",
        component: "InvesteringenEmbed",
        height: 700,
      },
      "bv-category-breakdown": {
        type: "custom",
        title: "Verdeling per Beleidsveld (BV)",
        component: "InvesteringenCategoryEmbed",
        height: 800,
      },
      "rek-category-breakdown": {
        type: "custom",
        title: "Verdeling per Algemene Rekening (REK)",
        component: "InvesteringenCategoryEmbed",
        height: 800,
      },
      "investments-bv-distribution": {
        type: "custom",
        title: "Gemeentelijke Investeringen per Domein - Verdeling",
        component: "InvesteringenBVScatterEmbed",
        height: 800,
      },
      "investments-rek-distribution": {
        type: "custom",
        title: "Gemeentelijke Investeringen per Rekening - Verdeling",
        component: "InvesteringenREKScatterEmbed",
        height: 800,
      },
    },
  },
  {
    slug: "bouwprojecten-gemeenten",
    sections: {
      projectbrowser: {
        type: "custom",
        title: "Projectbrowser - Gemeentelijke Investeringen",
        component: "BouwprojectenEmbed",
        height: 800,
      },
    },
  },
  {
    slug: "bouwondernemers",
    sections: {
      overview: {
        type: "custom",
        title: "Overzicht bouwondernemers",
        component: "BouwondernemersEmbed",
        height: 600,
      },
      "by-sector": {
        type: "custom",
        title: "Bouwondernemers per sector",
        component: "BouwondernemersEmbed",
        height: 600,
      },
      "by-gender": {
        type: "custom",
        title: "Bouwondernemers per geslacht",
        component: "BouwondernemersEmbed",
        height: 600,
      },
      "by-region": {
        type: "custom",
        title: "Bouwondernemers per regio",
        component: "BouwondernemersEmbed",
        height: 600,
      },
      "by-age": {
        type: "custom",
        title: "Bouwondernemers per leeftijd",
        component: "BouwondernemersEmbed",
        height: 600,
      },
    },
  },
  {
    slug: "betaalbaar-arr",
    sections: {
      gebouwenpark: {
        type: "custom",
        title: "Gebouwenpark per arrondissement",
        component: "BetaalbaarArrEmbed",
        height: 700,
      },
      huishoudens: {
        type: "custom",
        title: "Huishoudensgroei per arrondissement",
        component: "BetaalbaarArrEmbed",
        height: 700,
      },
      vergunningen: {
        type: "custom",
        title: "Bouwvergunningen per arrondissement",
        component: "BetaalbaarArrEmbed",
        height: 700,
      },
      correlaties: {
        type: "custom",
        title: "Correlaties wonen per arrondissement",
        component: "BetaalbaarArrEmbed",
        height: 800,
      },
      vergelijking: {
        type: "custom",
        title: "Vergelijking arrondissementen",
        component: "BetaalbaarArrEmbed",
        height: 700,
      },
    },
  },
  {
    slug: "silc-energie-2023",
    sections: {
      renovatiemaatregelen: {
        type: "custom",
        title: "Renovatiemaatregelen (afgelopen 5 jaar)",
        component: "SilcEnergieEmbed",
        height: 800,
      },
      verwarmingssystemen: {
        type: "custom",
        title: "Verwarmingssystemen",
        component: "SilcEnergieEmbed",
        height: 800,
      },
      energiebronnen: {
        type: "custom",
        title: "Belangrijkste Energiebronnen voor Verwarming",
        component: "SilcEnergieEmbed",
        height: 800,
      },
      isolatieverbeteringen: {
        type: "custom",
        title: "Isolatieverbeteringen Details",
        component: "SilcEnergieEmbed",
        height: 800,
      },
    },
  },
  {
    slug: "arbeiders-bedienden",
    sections: {
      "evolution-by-type": {
        type: "custom",
        title: "Evolutie arbeiders vs bedienden",
        component: "ArbeidersBediendenEmbed",
        height: 600,
      },
      "evolution-by-gender": {
        type: "custom",
        title: "Verdeling naar geslacht",
        component: "ArbeidersBediendenEmbed",
        height: 600,
      },
    },
  },
  {
    slug: "inschrijvingen-onderwijs",
    sections: {
      "totale-inschrijvingen": {
        type: "custom",
        title: "Totale inschrijvingen",
        component: "InschrijvingenOnderwijsEmbed",
        height: 700,
      },
      "type-instelling": {
        type: "custom",
        title: "Verdeling type onderwijsinstelling",
        component: "InschrijvingenOnderwijsEmbed",
        height: 700,
      },
      "bouw-studiegebieden": {
        type: "custom",
        title: "Bouwgerelateerde studiegebieden",
        component: "InschrijvingenOnderwijsEmbed",
        height: 700,
      },
      opleiding: {
        type: "custom",
        title: "Top opleidingen",
        component: "InschrijvingenOnderwijsEmbed",
        height: 700,
      },
      studiegebied: {
        type: "custom",
        title: "Top studiegebieden",
        component: "InschrijvingenOnderwijsEmbed",
        height: 700,
      },
    },
  },
]

/**
 * Validate standard embed configuration in development mode
 */
function validateStandardConfig(config: StandardEmbedConfig, slug: string, section: string): void {
  // Only validate in development mode (localhost)
  if (typeof window === 'undefined' ||
      (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) {
    return;
  }

  const issues: string[] = []

  // Validate dataPath
  const dataPathResult = validateEmbedPath(config.dataPath, "dataPath", slug)
  if (!dataPathResult.valid) {
    issues.push(...dataPathResult.errors)
  }

  // Validate municipalitiesPath
  const municipalitiesPathResult = validateEmbedPath(
    config.municipalitiesPath,
    "municipalitiesPath",
    slug
  )
  if (!municipalitiesPathResult.valid) {
    issues.push(...municipalitiesPathResult.errors)
  }

  // Check required fields are present and non-empty
  if (!config.title || config.title.trim() === "") {
    issues.push("title is required and must not be empty")
  }

  if (!config.metric || config.metric.trim() === "") {
    issues.push("metric is required and must not be empty")
  }

  // Log validation issues as warnings
  if (issues.length > 0) {
    console.warn(
      `[embed-config] Validation issues for ${slug}/${section}:\n` +
      issues.map((issue) => `  - ${issue}`).join("\n")
    )
  }
}

/**
 * Get embed configuration for a specific analysis and section
 */
export function getEmbedConfig(slug: string, section: string): EmbedConfig | null {
  const analysisConfig = EMBED_CONFIGS.find((a) => a.slug === slug)
  if (!analysisConfig) return null

  const config = analysisConfig.sections[section] ?? null

  // Validate standard configs in development
  if (config && config.type === "standard") {
    validateStandardConfig(config, slug, section)
  }

  return config
}

/**
 * Get all embeddable sections as static params for Next.js
 */
export function getAllEmbedParams(): Array<{ slug: string; section: string }> {
  const params: Array<{ slug: string; section: string }> = []
  for (const analysis of EMBED_CONFIGS) {
    for (const section of Object.keys(analysis.sections)) {
      params.push({ slug: analysis.slug, section })
    }
  }
  return params
}

/**
 * Check if an analysis/section combination is embeddable
 */
export function isEmbeddable(slug: string, section: string): boolean {
  return getEmbedConfig(slug, section) !== null
}

/**
 * Get all valid section names for a specific analysis
 */
export function getValidSections(slug: string): string[] {
  const analysisConfig = EMBED_CONFIGS.find((a) => a.slug === slug)
  if (!analysisConfig) return []
  return Object.keys(analysisConfig.sections)
}
