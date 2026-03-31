/**
 * NIS Code Fusion Mapping for 2025 Municipal Mergers
 *
 * This utility handles the mapping of old NIS codes to new NIS codes
 * for municipalities that merged in 2025.
 *
 * Source: embuild-analyses/shared-data/nis/fusies-2025.csv
 */

export interface NisFusion {
  oldCodes: string[]
  newCode: string
  newName: string
}

/**
 * 2025 Municipal Fusions
 * Format: old codes → new code
 */
export const NIS_FUSIONS_2025: NisFusion[] = [
  {
    oldCodes: ['11002', '11007'],
    newCode: '11002',
    newName: 'Antwerpen'
  },
  {
    oldCodes: ['23023', '23024', '23032'],
    newCode: '23106',
    newName: 'Pajottegem'
  },
  {
    oldCodes: ['37012', '37018'],
    newCode: '37021',
    newName: 'Wingene'
  },
  {
    oldCodes: ['37007', '37015'],
    newCode: '37022',
    newName: 'Tielt'
  },
  {
    oldCodes: ['44012', '44048'],
    newCode: '44086',
    newName: 'Nazareth-De Pinte'
  },
  {
    oldCodes: ['44034', '44073'],
    newCode: '44087',
    newName: 'Lochristi'
  },
  {
    oldCodes: ['46014', '44045'],
    newCode: '46029',
    newName: 'Lokeren'
  },
  {
    oldCodes: ['44040', '44043'],
    newCode: '44088',
    newName: 'Merelbeke-Melle'
  },
  {
    oldCodes: ['46003', '46013', '11056'],
    newCode: '46030',
    newName: 'Beveren-Kruibeke-Zwijndrecht'
  },
  {
    oldCodes: ['73006', '73032'],
    newCode: '73110',
    newName: 'Bilzen-Hoeselt'
  },
  {
    oldCodes: ['73009', '73083'],
    newCode: '73111',
    newName: 'Tongeren-Borgloon'
  },
  {
    oldCodes: ['71069', '71057'],
    newCode: '71071',
    newName: 'Tessenderlo-Ham'
  },
  {
    oldCodes: ['71022', '73040'],
    newCode: '71072',
    newName: 'Hasselt'
  },
  {
    oldCodes: ['82003', '82005'],
    newCode: '82039',
    newName: 'Bastogne'
  },
]

/**
 * Map of old NIS code → new NIS code
 */
const OLD_TO_NEW_MAP = new Map<string, string>()
NIS_FUSIONS_2025.forEach(fusion => {
  fusion.oldCodes.forEach(oldCode => {
    OLD_TO_NEW_MAP.set(oldCode, fusion.newCode)
  })
})

/**
 * Normalize a NIS code to the current (2025) code
 *
 * @param nisCode - The NIS code to normalize
 * @returns The current NIS code (post-fusion)
 */
export function normalizeNisCode(nisCode: string | number | null | undefined): string | null {
  if (nisCode === null || nisCode === undefined) return null

  const code = String(nisCode).padStart(5, '0')

  // Return new code if fusion occurred, otherwise return original
  return OLD_TO_NEW_MAP.get(code) ?? code
}

/**
 * Check if a NIS code was part of a 2025 fusion
 */
export function wasFused(nisCode: string | number): boolean {
  const code = String(nisCode).padStart(5, '0')
  return OLD_TO_NEW_MAP.has(code)
}

/**
 * Get fusion info for a NIS code
 */
export function getFusionInfo(nisCode: string | number): NisFusion | null {
  const code = String(nisCode).padStart(5, '0')
  return NIS_FUSIONS_2025.find(f =>
    f.oldCodes.includes(code) || f.newCode === code
  ) ?? null
}

/**
 * Get old component codes for a new fusion code
 */
export function getConstituents(newCode: string | number): string[] {
  const code = String(newCode).padStart(5, '0')
  const fusion = NIS_FUSIONS_2025.find(f => f.newCode === code)
  return fusion ? fusion.oldCodes : []
}

/**
 * Aggregate data by normalizing NIS codes first
 * Useful for combining data from fused municipalities
 *
 * @param data - Array of data items with NIS codes
 * @param getNisCode - Function to extract NIS code from item
 * @param getValue - Function to extract value to aggregate
 * @param aggregator - How to combine values (default: sum)
 * @returns Map of normalized NIS code → aggregated value
 */
export function aggregateByNormalizedNis<T>(
  data: T[],
  getNisCode: (item: T) => string | number | null | undefined,
  getValue: (item: T) => number | null | undefined,
  aggregator: 'sum' | 'avg' | 'max' | 'min' = 'sum'
): Map<string, number> {
  const grouped = new Map<string, number[]>()

  for (const item of data) {
    const rawCode = getNisCode(item)
    const normalizedCode = normalizeNisCode(rawCode)
    if (!normalizedCode) continue

    const value = getValue(item)
    if (typeof value !== 'number' || !Number.isFinite(value)) continue

    if (!grouped.has(normalizedCode)) {
      grouped.set(normalizedCode, [])
    }
    grouped.get(normalizedCode)!.push(value)
  }

  const result = new Map<string, number>()

  for (const [code, values] of grouped) {
    if (values.length === 0) continue

    let aggregatedValue: number
    switch (aggregator) {
      case 'sum':
        aggregatedValue = values.reduce((a, b) => a + b, 0)
        break
      case 'avg':
        aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length
        break
      case 'max':
        aggregatedValue = Math.max(...values)
        break
      case 'min':
        aggregatedValue = Math.min(...values)
        break
    }

    result.set(code, aggregatedValue)
  }

  return result
}
