export type RegionCode = '2000' | '3000' | '4000' | '1000'; // 1000 for Belgium
export type ProvinceCode = string;
export type ArrondissementCode = string;
export type MunicipalityCode = string;

export interface Region {
  code: RegionCode;
  name: string;
}

export interface Province {
  code: ProvinceCode;
  name: string;
  regionCode: RegionCode;
}

export interface Arrondissement {
  code: ArrondissementCode;
  name: string;
  provinceCode: ProvinceCode;
}

export interface Municipality {
  code: number;
  name: string;
}

export const REGIONS: Region[] = [
  { code: '1000', name: 'België' },
  { code: '2000', name: 'Vlaanderen' },
  { code: '3000', name: 'Wallonië' },
  { code: '4000', name: 'Brussel' },
];

export const PROVINCES: Province[] = [
  { code: '10000', name: 'Antwerpen', regionCode: '2000' },
  { code: '70000', name: 'Limburg', regionCode: '2000' },
  { code: '40000', name: 'Oost-Vlaanderen', regionCode: '2000' },
  { code: '20001', name: 'Vlaams-Brabant', regionCode: '2000' },
  { code: '30000', name: 'West-Vlaanderen', regionCode: '2000' },
  { code: '20002', name: 'Waals-Brabant', regionCode: '3000' },
  { code: '50000', name: 'Henegouwen', regionCode: '3000' },
  { code: '60000', name: 'Luik', regionCode: '3000' },
  { code: '80000', name: 'Luxemburg', regionCode: '3000' },
  { code: '90000', name: 'Namen', regionCode: '3000' },
  { code: '21000', name: 'Brussel', regionCode: '4000' },
];

export const ARRONDISSEMENTS: Arrondissement[] = [
  // Antwerpen (10000)
  { code: '11000', name: 'Arrondissement Antwerpen', provinceCode: '10000' },
  { code: '12000', name: 'Arrondissement Mechelen', provinceCode: '10000' },
  { code: '13000', name: 'Arrondissement Turnhout', provinceCode: '10000' },
  // Brussel (21000)
  { code: '21000', name: 'Arrondissement Brussel-Hoofdstad', provinceCode: '21000' },
  // Vlaams-Brabant (20001)
  { code: '23000', name: 'Arrondissement Halle-Vilvoorde', provinceCode: '20001' },
  { code: '24000', name: 'Arrondissement Leuven', provinceCode: '20001' },
  // Waals-Brabant (20002)
  { code: '25000', name: 'Arrondissement Nijvel', provinceCode: '20002' },
  // West-Vlaanderen (30000)
  { code: '31000', name: 'Arrondissement Brugge', provinceCode: '30000' },
  { code: '32000', name: 'Arrondissement Diksmuide', provinceCode: '30000' },
  { code: '33000', name: 'Arrondissement Ieper', provinceCode: '30000' },
  { code: '34000', name: 'Arrondissement Kortrijk', provinceCode: '30000' },
  { code: '35000', name: 'Arrondissement Oostende', provinceCode: '30000' },
  { code: '36000', name: 'Arrondissement Roeselare', provinceCode: '30000' },
  { code: '37000', name: 'Arrondissement Tielt', provinceCode: '30000' },
  { code: '38000', name: 'Arrondissement Veurne', provinceCode: '30000' },
  // Oost-Vlaanderen (40000)
  { code: '41000', name: 'Arrondissement Aalst', provinceCode: '40000' },
  { code: '42000', name: 'Arrondissement Dendermonde', provinceCode: '40000' },
  { code: '43000', name: 'Arrondissement Eeklo', provinceCode: '40000' },
  { code: '44000', name: 'Arrondissement Gent', provinceCode: '40000' },
  { code: '45000', name: 'Arrondissement Oudenaarde', provinceCode: '40000' },
  { code: '46000', name: 'Arrondissement Sint-Niklaas', provinceCode: '40000' },
  // Henegouwen (50000)
  { code: '51000', name: 'Arrondissement Aat', provinceCode: '50000' },
  { code: '52000', name: 'Arrondissement Charleroi', provinceCode: '50000' },
  { code: '53000', name: 'Arrondissement Bergen', provinceCode: '50000' },
  { code: '55000', name: 'Arrondissement Zinnik', provinceCode: '50000' },
  { code: '56000', name: 'Arrondissement Thuin', provinceCode: '50000' },
  { code: '57000', name: 'Arrondissement Doornik-Moeskroen', provinceCode: '50000' },
  { code: '58000', name: 'Arrondissement La Louvière', provinceCode: '50000' },
  // Luik (60000)
  { code: '61000', name: 'Arrondissement Hoei', provinceCode: '60000' },
  { code: '62000', name: 'Arrondissement Luik', provinceCode: '60000' },
  { code: '63000', name: 'Arrondissement Verviers', provinceCode: '60000' },
  { code: '64000', name: 'Arrondissement Borgworm', provinceCode: '60000' },
  // Limburg (70000)
  { code: '71000', name: 'Arrondissement Hasselt', provinceCode: '70000' },
  { code: '72000', name: 'Arrondissement Maaseik', provinceCode: '70000' },
  { code: '73000', name: 'Arrondissement Tongeren', provinceCode: '70000' },
  // Luxemburg (80000)
  { code: '81000', name: 'Arrondissement Aarlen', provinceCode: '80000' },
  { code: '82000', name: 'Arrondissement Bastenaken', provinceCode: '80000' },
  { code: '83000', name: 'Arrondissement Marche-en-Famenne', provinceCode: '80000' },
  { code: '84000', name: 'Arrondissement Neufchâteau', provinceCode: '80000' },
  { code: '85000', name: 'Arrondissement Virton', provinceCode: '80000' },
  // Namen (90000)
  { code: '91000', name: 'Arrondissement Dinant', provinceCode: '90000' },
  { code: '92000', name: 'Arrondissement Namen', provinceCode: '90000' },
  { code: '93000', name: 'Arrondissement Philippeville', provinceCode: '90000' },
];

export function getRegionForProvince(provinceCode: ProvinceCode): RegionCode | undefined {
  return PROVINCES.find(p => p.code === provinceCode)?.regionCode;
}

/**
 * Gets all province codes for a given region.
 *
 * @param regionCode - Region code (e.g., '2000' for Vlaanderen)
 * @returns Array of province codes belonging to the region
 */
export function getProvincesForRegion(regionCode: RegionCode): ProvinceCode[] {
  return PROVINCES
    .filter(p => p.regionCode === regionCode)
    .map(p => p.code);
}

export function getProvinceForMunicipality(
  municipalityCode: number
): ProvinceCode | undefined {
  const code = municipalityCode.toString();
  if (code.startsWith('21')) return '21000'; // Brussels

  const prefix = code.substring(0, 1);
  const prefix2 = code.substring(0, 2);

  if (prefix === '1') return '10000'; // Antwerpen
  if (prefix === '7') return '70000'; // Limburg
  if (prefix === '4') return '40000'; // Oost-Vlaanderen
  if (prefix === '3') return '30000'; // West-Vlaanderen
  if (prefix2 === '23' || prefix2 === '24') return '20001'; // Vlaams-Brabant
  if (prefix === '2') return '20002'; // Waals-Brabant
  if (prefix === '5') return '50000'; // Henegouwen
  if (prefix === '6') return '60000'; // Luik
  if (prefix === '8') return '80000'; // Luxemburg
  if (prefix === '9') return '90000'; // Namen

  return undefined;
}

export function getRegionForMunicipality(
  municipalityCode: number
): RegionCode | undefined {
  const provCode = getProvinceForMunicipality(municipalityCode);
  return provCode ? getRegionForProvince(provCode) : undefined;
}

/**
 * Determines if a municipality code belongs to a Flemish municipality.
 * Flemish municipalities are those NOT from Wallonia (5,6,8,9), Brussels (21), or Walloon Brabant (2x excluding 23/24).
 *
 * @param code - Municipality NIS code as string or number
 * @returns true if municipality is in Flanders, false otherwise
 */
export function isFlemishMunicipality(code: string | number): boolean {
  const codeStr = String(code);
  const firstChar = codeStr.charAt(0);
  const firstTwo = codeStr.substring(0, 2);

  // Flemish = NOT (Walloon 5,6,8,9 OR Brussels 21 OR Walloon Brabant 2x excluding 23,24)
  if (['5', '6', '8', '9'].includes(firstChar)) return false;
  if (firstTwo === '21') return false;
  if (firstChar === '2' && firstTwo !== '23' && firstTwo !== '24') return false;

  return true;
}

/**
 * Maps a municipality code to its arrondissement code.
 * Uses the first 2 digits of the 5-digit NIS code to determine the arrondissement.
 *
 * @param municipalityCode - Municipality NIS code (5 digits)
 * @returns Arrondissement code (5 digits) or undefined if not found
 */
export function getArrondissementForMunicipality(municipalityCode: number | string): ArrondissementCode | undefined {
  const code = municipalityCode.toString().padStart(5, '0');
  const prefix2 = code.substring(0, 2);

  // Map 2-digit prefix to arrondissement code
  const arrCode = prefix2 + '000';

  // Validate that this arrondissement exists
  const exists = ARRONDISSEMENTS.some(arr => arr.code === arrCode);
  return exists ? arrCode : undefined;
}

/**
 * Gets the province code for an arrondissement.
 *
 * @param arrondissementCode - Arrondissement code
 * @returns Province code or undefined if not found
 */
export function getProvinceForArrondissement(arrondissementCode: ArrondissementCode): ProvinceCode | undefined {
  return ARRONDISSEMENTS.find(arr => arr.code === arrondissementCode)?.provinceCode;
}

/**
 * Gets the region code for an arrondissement.
 *
 * @param arrondissementCode - Arrondissement code
 * @returns Region code or undefined if not found
 */
export function getRegionForArrondissement(arrondissementCode: ArrondissementCode): RegionCode | undefined {
  const provinceCode = getProvinceForArrondissement(arrondissementCode);
  return provinceCode ? getRegionForProvince(provinceCode) : undefined;
}
