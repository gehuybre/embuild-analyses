/**
 * Centralized loader for embed data
 *
 * Data is fetched at runtime from the data host (supports external Pages repo).
 * When adding a new embeddable section:
 * 1. Add the config to EMBED_CONFIGS in embed-config.ts
 * 2. Ensure the data is published under /analyses/<slug>/results/
 */

import type { EmbedDataRow, MunicipalityData, StandardEmbedDataRow } from "./embed-types"
import { validateMunicipalityData } from "./embed-types"
import { transformToEmbedDataRows, validateStandardEmbedDataRow } from "./embed-data-transformers"
import { applyDataConstraints } from "./embed-data-constraints"
import { getEmbedConfig, type StandardEmbedConfig } from "./embed-config"
import { getDataPath } from "./path-utils"

/**
 * Data module type - matches the structure returned by dynamic imports
 */
export interface EmbedDataModule {
  data: EmbedDataRow[]
  municipalities: MunicipalityData[]
}

type BaseEmbedData = {
  data: StandardEmbedDataRow[]
  municipalities: MunicipalityData[]
}

const baseDataCache = new Map<string, Promise<BaseEmbedData>>()
const moduleCache = new Map<string, Promise<EmbedDataModule | null>>()

async function loadBaseData(config: StandardEmbedConfig): Promise<BaseEmbedData> {
  const cacheKey = `${config.dataPath}|${config.municipalitiesPath}`
  const cached = baseDataCache.get(cacheKey)
  if (cached) return cached

  const loader = (async () => {
    const dataUrl = getDataPath(`/analyses/${config.dataPath}`)
    const municipalitiesUrl = getDataPath(`/analyses/${config.municipalitiesPath}`)

    const [dataRes, municipalitiesRes] = await Promise.all([
      fetch(dataUrl),
      fetch(municipalitiesUrl),
    ])

    if (!dataRes.ok) {
      throw new Error(`Failed to load embed data: ${config.dataPath} (${dataRes.status})`)
    }
    if (!municipalitiesRes.ok) {
      throw new Error(`Failed to load municipalities: ${config.municipalitiesPath} (${municipalitiesRes.status})`)
    }

    const validatedQuarterly = validateStandardEmbedDataRow(
      (await dataRes.json()) as unknown
    ) as StandardEmbedDataRow[]

    const filtered = config.constraints
      ? applyDataConstraints(validatedQuarterly, config.constraints)
      : validatedQuarterly

    const municipalities = validateMunicipalityData(
      (await municipalitiesRes.json()) as unknown
    )

    return { data: filtered, municipalities }
  })()

  baseDataCache.set(cacheKey, loader)
  return loader
}

/**
 * Registry of all embed data modules
 * Maps "slug/section" to the imported data and municipalities
 *
 * Note: Data is validated and transformed lazily on first access.
 * Raw data (StandardEmbedDataRow format) is transformed to display format (EmbedDataRow)
 * using the metric specified in the embed config.
 * Data constraints are applied before transformation to ensure consistency with main blog.
 */
/**
 * Get embed data module for a specific slug/section combination
 *
 * Loads embed data asynchronously from the data host (supports external Pages repo).
 *
 * @param slug - Analysis slug
 * @param section - Section identifier
 * @returns Data module or null if not found
 */
export async function getEmbedDataModule(
  slug: string,
  section: string
): Promise<EmbedDataModule | null> {
  const key = `${slug}/${section}`
  const cached = moduleCache.get(key)
  if (cached) return cached

  const loader = (async () => {
    const config = getEmbedConfig(slug, section)
    if (!config || config.type !== "standard") {
      return null
    }

    try {
      const base = await loadBaseData(config)
      return {
        data: transformToEmbedDataRows(base.data, config.metric),
        municipalities: base.municipalities,
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown embed data error")
      console.error("[embed-data-registry] Failed to load embed data:", err)
      return null
    }
  })()

  moduleCache.set(key, loader)
  return loader
}

/**
 * Check if embed data is registered for a slug/section
 */
export function hasEmbedData(slug: string, section: string): boolean {
  const config = getEmbedConfig(slug, section)
  return !!config && config.type === "standard"
}
