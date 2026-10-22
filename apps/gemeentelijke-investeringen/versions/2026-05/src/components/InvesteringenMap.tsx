"use client"

import React, { useMemo } from 'react'
import { MunicipalityMap } from "@embuild/shared/components/shared/MunicipalityMap"
import { getConstituents } from "@embuild/shared/lib/nis-fusion-utils"

interface MapData {
  municipality: string
  value: number
  nis_code?: string | null
}

interface InvesteringenMapProps {
  data: MapData[]
  selectedMetric: 'total' | 'per_capita'
  title?: string
}

const formatNumber = (num: number) => new Intl.NumberFormat('nl-BE').format(Math.round(num))
const formatCurrency = (num: number) => `€ ${formatNumber(num)}`

export function InvesteringenMap({ data, selectedMetric, title }: InvesteringenMapProps) {
  // Transform data for map, expanding merged municipalities to constituent shapes
  const mapData = useMemo(() => {
    return data
      .filter(d => d.nis_code) // Only include municipalities with NIS codes
      .flatMap(d => {
        const constituents = getConstituents(d.nis_code!)

        // If merged municipality, distribute value to constituent shapes for rendering
        if (constituents.length > 0) {
          return constituents.map(oldCode => ({
            municipalityCode: oldCode,
            municipalityName: d.municipality,
            value: d.value, // Same value shown for all constituent shapes
          }))
        }

        // Regular municipality - pass through as-is
        return [{
          municipalityCode: d.nis_code!,
          municipalityName: d.municipality,
          value: d.value,
        }]
      })
  }, [data])

  // Create a name lookup map (since multiple shapes can have the same code, we just need one name per code)
  const nameLookup = useMemo(() => {
    const m = new Map<string, string>()
    mapData.forEach(d => {
      m.set(d.municipalityCode, d.municipalityName)
    })
    return m
  }, [mapData])

  const valueLabel = selectedMetric === 'total' ? 'Totale investering' : 'Investering per inwoner'

  if (mapData.length === 0) {
    return (
      <div className="w-full p-8 text-center text-muted-foreground">
        Geen kaartdata beschikbaar
      </div>
    )
  }

  return (
    <div className="w-full">
      {title && <h3 className="text-lg font-semibold mb-4">{title}</h3>}
      <MunicipalityMap
        data={mapData}
        getGeoCode={(d) => d.municipalityCode}
        getValue={(d) => d.value}
        getGeoName={(code) => nameLookup.get(code) || null}
        formatValue={formatCurrency}
        tooltipLabel={valueLabel}
        colorScheme="orange"
        showProvinceBoundaries={false}
      />
    </div>
  )
}
