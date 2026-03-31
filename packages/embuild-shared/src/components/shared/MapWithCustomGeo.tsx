"use client"

import { MunicipalityMap } from "./MunicipalityMap"

type UnknownRecord = Record<string, unknown>

interface MapWithCustomGeoProps<TData extends UnknownRecord> {
  data: TData[]
  getGeoCode: (item: TData) => string
  getValue: (item: TData) => number
  periods?: string[]
  municipalitiesGeo?: GeoJSON.FeatureCollection
}

export function MapWithCustomGeo<TData extends UnknownRecord>({ 
  data, 
  getGeoCode, 
  getValue, 
  periods, 
  municipalitiesGeo 
}: MapWithCustomGeoProps<TData>) {
  // Example wrapper that accepts a GeoJSON object and passes it to MunicipalityMap
  // Usage: import historicalGeo from "/maps/belgium_municipalities_2000.json" as any
  // <MapWithCustomGeo data={data} getGeoCode={...} getValue={...} municipalitiesGeo={historicalGeo} />
  return (
    <MunicipalityMap
      data={data}
      getGeoCode={getGeoCode}
      getValue={getValue}
      periods={periods}
      showTimeSlider={!!periods?.length}
      municipalitiesGeoOverride={municipalitiesGeo}
      height={560}
    />
  )
}