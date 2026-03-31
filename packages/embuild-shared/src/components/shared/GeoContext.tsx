"use client"

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { RegionCode, ProvinceCode, ArrondissementCode, MunicipalityCode } from '../../lib/geo-utils';

export type GeoLevel = 'region' | 'province' | 'arrondissement' | 'municipality';

interface GeoContextType {
  level: GeoLevel;
  setLevel: (level: GeoLevel) => void;
  selectedRegion: RegionCode;
  setSelectedRegion: (code: RegionCode) => void;
  selectedProvince: ProvinceCode | null;
  setSelectedProvince: (code: ProvinceCode | null) => void;
  selectedArrondissement: ArrondissementCode | null;
  setSelectedArrondissement: (code: ArrondissementCode | null) => void;
  selectedMunicipality: MunicipalityCode | null;
  setSelectedMunicipality: (code: MunicipalityCode | null) => void;
}

const GeoContext = createContext<GeoContextType | undefined>(undefined);

// Simpler geo selection context for analyses that don't need the full complexity
export interface SimpleGeoSelection {
  type: 'all' | 'region' | 'province' | 'arrondissement' | 'municipality'
  code?: string
}

export interface SimpleGeoContextType {
  selection: SimpleGeoSelection
  setSelection: (selection: SimpleGeoSelection) => void
}

export const SimpleGeoContext = createContext<SimpleGeoContextType>({
  selection: { type: 'all' },
  setSelection: () => {}
});

export function GeoProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<GeoLevel>('region');
  const [selectedRegion, setSelectedRegion] = useState<RegionCode>('1000'); // Default to Belgium
  const [selectedProvince, setSelectedProvince] = useState<ProvinceCode | null>(null);
  const [selectedArrondissement, setSelectedArrondissement] = useState<ArrondissementCode | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState<MunicipalityCode | null>(null);

  return (
    <GeoContext.Provider
      value={{
        level,
        setLevel,
        selectedRegion,
        setSelectedRegion,
        selectedProvince,
        setSelectedProvince,
        selectedArrondissement,
        setSelectedArrondissement,
        selectedMunicipality,
        setSelectedMunicipality,
      }}
    >
      {children}
    </GeoContext.Provider>
  );
}

export function GeoProviderWithDefaults({
  children,
  initialLevel = "region",
  initialRegion = "1000",
  initialProvince = null,
  initialArrondissement = null,
  initialMunicipality = null,
}: {
  children: ReactNode
  initialLevel?: GeoLevel
  initialRegion?: RegionCode
  initialProvince?: ProvinceCode | null
  initialArrondissement?: ArrondissementCode | null
  initialMunicipality?: MunicipalityCode | null
}) {
  const [level, setLevel] = useState<GeoLevel>(initialLevel)
  const [selectedRegion, setSelectedRegion] = useState<RegionCode>(initialRegion)
  const [selectedProvince, setSelectedProvince] = useState<ProvinceCode | null>(initialProvince)
  const [selectedArrondissement, setSelectedArrondissement] = useState<ArrondissementCode | null>(initialArrondissement)
  const [selectedMunicipality, setSelectedMunicipality] = useState<MunicipalityCode | null>(initialMunicipality)

  return (
    <GeoContext.Provider
      value={{
        level,
        setLevel,
        selectedRegion,
        setSelectedRegion,
        selectedProvince,
        setSelectedProvince,
        selectedArrondissement,
        setSelectedArrondissement,
        selectedMunicipality,
        setSelectedMunicipality,
      }}
    >
      {children}
    </GeoContext.Provider>
  )
}

export function useGeo() {
  const context = useContext(GeoContext);
  if (context === undefined) {
    throw new Error('useGeo must be used within a GeoProvider');
  }
  return context;
}
