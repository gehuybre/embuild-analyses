import { getDataPath } from "./path-utils"
import {
  getArrondissementForMunicipality,
  getProvinceForMunicipality,
  getRegionForMunicipality,
  type ArrondissementCode,
  type MunicipalityCode,
  type ProvinceCode,
} from "./geo-utils"

/**
 * Load municipality list from GeoJSON
 *
 * This function loads the full list of Belgian municipalities from the GeoJSON file.
 * Use this to populate the MunicipalitySearch component.
 *
 * @returns Promise resolving to array of municipalities with code and name
 */
export async function loadMunicipalities(): Promise<
  Array<{ code: string; name: string }>
> {
  const geoUrl = getDataPath("/maps/belgium_municipalities.json")

  try {
    const response = await fetch(geoUrl)
    if (!response.ok) {
      throw new Error("Failed to fetch municipalities")
    }

    const geoData = await response.json()

    return geoData.features.map((feature: any) => ({
      code: String(feature.properties?.code ?? ""),
      name: String(feature.properties?.LAU_NAME ?? ""),
    }))
  } catch (error) {
    console.error("Failed to load municipalities:", error)
    return []
  }
}

/**
 * Aggregates municipality-level data to arrondissement level.
 *
 * This function groups municipality data by arrondissement and sums numeric values.
 * It's used for runtime aggregation to display municipality data on arrondissement maps.
 *
 * @param data - Array of municipality-level data rows
 * @param getMunicipalityCode - Function to extract municipality code from data row
 * @param getValue - Function to extract numeric value from data row
 * @returns Array of {arrondissementCode, value} objects
 *
 * @example
 * const municipalityData = [{m: 11001, permits: 50}, {m: 11002, permits: 120}]
 * const arrData = aggregateMunicipalityToArrondissement(
 *   municipalityData,
 *   d => d.m,
 *   d => d.permits
 * )
 * // Returns: [{arrondissementCode: '11000', value: 170}]
 */
export function aggregateMunicipalityToArrondissement<T>(
  data: T[],
  getMunicipalityCode: (item: T) => number | string,
  getValue: (item: T) => number
): Array<{ arrondissementCode: ArrondissementCode; value: number }> {
  const aggregated = new Map<ArrondissementCode, number>()

  for (const item of data) {
    const munCode = getMunicipalityCode(item)
    const arrCode = getArrondissementForMunicipality(munCode)

    if (!arrCode) {
      // Skip municipalities without arrondissement mapping
      continue
    }

    const value = getValue(item)
    const currentValue = aggregated.get(arrCode) || 0
    aggregated.set(arrCode, currentValue + value)
  }

  return Array.from(aggregated.entries()).map(([arrondissementCode, value]) => ({
    arrondissementCode,
    value,
  }))
}

/**
 * Expands region/province-level data to municipality level.
 *
 * This function takes data aggregated at region or province level and expands it to
 * municipality level by assigning the same value to all municipalities in that region/province.
 *
 * @param data - Array of region/province-level data rows
 * @param getGeoCode - Function to extract region/province code from data row
 * @param getValue - Function to extract value from data row
 * @param geoLevel - 'region' or 'province' to determine expansion level
 * @param municipalities - Array of municipality objects with code and name
 * @returns Array of municipality-level data objects
 *
 * @example
 * const regionData = [
 *   { regionCode: '2000', heatingGas: 72.1 },
 *   { regionCode: '3000', heatingGas: 44.5 }
 * ]
 * const municipalities = await loadMunicipalities()
 * const municipalityData = expandGeoToMunicipalities(
 *   regionData,
 *   d => d.regionCode,
 *   d => d.heatingGas,
 *   'region',
 *   municipalities
 * )
 * // Returns array with all Flemish municipalities having heatingGas: 72.1, etc.
 */
export function expandGeoToMunicipalities<T>(
  data: T[],
  getGeoCode: (item: T) => string,
  getValue: (item: T) => number,
  geoLevel: 'region' | 'province' = 'region',
  municipalities: Array<{ code: string; name: string }>
): Array<{ municipalityCode: MunicipalityCode; value: number } & T> {
  const result: Array<{ municipalityCode: MunicipalityCode; value: number } & T> = []

  for (const municipality of municipalities) {
    const munCode = municipality.code
    let geoCode: string

    if (geoLevel === 'region') {
      // Get region code from municipality
      const regionCode = getRegionForMunicipality(Number(munCode))
      if (!regionCode) {
        continue
      }
      geoCode = regionCode
    } else {
      // Get province code from municipality
      const provinceCode = getProvinceForMunicipality(Number(munCode))
      if (!provinceCode) {
        continue
      }
      geoCode = provinceCode
    }

    // Find matching data row
    const dataRow = data.find(d => getGeoCode(d) === geoCode)
    if (dataRow) {
      result.push({
        municipalityCode: munCode as MunicipalityCode,
        value: getValue(dataRow),
        ...dataRow
      })
    }
  }

  return result
}
