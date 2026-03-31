"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { MunicipalityMap } from "@embuild/shared/components/shared/MunicipalityMap"
import { expandGeoToMunicipalities, loadMunicipalities } from "@embuild/shared/lib/map-utils"
import { getDataPath } from "@embuild/shared/lib/path-utils"
import {
  type ProcessedData,
  SECTION_CONFIGS,
  FILTER_CATEGORIES,
  getFilteredRow,
  validateProcessedData
} from "./data-utils"

interface SilcEnergieEmbedProps {
  section: string
}

export function SilcEnergieEmbed({ section }: SilcEnergieEmbedProps) {
  const [municipalities, setMunicipalities] = useState<Array<{ code: string; name: string }>>([])
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null)

  // Load data
  useEffect(() => {
    Promise.all([
      loadMunicipalities(),
      fetch(getDataPath("/data/processed_data.json")).then(res => res.json())
    ]).then(([muns, data]) => {
      setMunicipalities(muns)
      if (validateProcessedData(data)) {
        setProcessedData(data)
      } else {
        console.error("Invalid processed data structure")
      }
    }).catch(console.error)
  }, [])

  // Get data for current section using shared utilities
  const getSectionData = () => {
    if (!processedData) return { chartData: [], mapData: [], series: [] }

    const config = SECTION_CONFIGS[section]
    if (!config) {
      console.error(`Unknown section: ${section}`)
      return { chartData: [], mapData: [], series: [] }
    }

    const regions = FILTER_CATEGORIES.Regio

    // Get data for each region
    const chartData = regions.map(region => {
      const row = getFilteredRow(processedData, section, "Regio", region)
      const result: any = { label: region }

      // Add named properties for each series
      config.series.forEach(s => {
        result[s.key] = Number(row?.[s.columnIndex.toString()]) || 0
      })

      // Calculate total value for map (sum of renovation measures or primary heating)
      if (section === "renovatiemaatregelen" || section === "isolatieverbeteringen") {
        result.value = result.eenMaatregel + result.tweeMaatregelen + result.driePlusMaatregelen
      } else if (section === "verwarmingssystemen") {
        result.value = result.centraleVerwarming
      } else if (section === "energiebronnen") {
        result.value = result.aardgas
      }

      return result
    })

    // Expand to municipality level for maps
    let mapData: any[] = []
    if (municipalities.length && chartData.length) {
      const regionMapping: Record<string, string> = {
        "België": "1000",
        "Brussels Hoofdstedelijk Gewest": "4000",
        "Vlaams Gewest": "2000",
        "Waals Gewest": "3000"
      }

      const regionData = chartData
        .filter(d => d.label !== "België") // Exclude national average for map
        .map(d => ({
          regionCode: regionMapping[d.label] || "1000",
          value: d.value
        }))

      mapData = expandGeoToMunicipalities(
        regionData,
        d => d.regionCode,
        d => d.value,
        'region',
        municipalities
      )
    }

    return {
      chartData,
      mapData,
      series: config.series.map(s => ({ key: s.key, label: s.label }))
    }
  }

  const { chartData, mapData, series } = getSectionData()

  if (!processedData) {
    return <div className="flex justify-center items-center h-64">Loading...</div>
  }

  const sectionTitles: Record<string, string> = {
    renovatiemaatregelen: "Renovatiemaatregelen",
    verwarmingssystemen: "Verwarmingssystemen",
    energiebronnen: "Energiebronnen",
    isolatieverbeteringen: "Isolatieverbeteringen"
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{sectionTitles[section] || section}</CardTitle>
        </CardHeader>
        <CardContent>
          <FilterableChart
            data={chartData}
            getLabel={(d) => d.label}
            getValue={(d) => d.value}
            series={series}
            yAxisLabelAbove="Percentage (%)"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data {sectionTitles[section] || section}</CardTitle>
        </CardHeader>
        <CardContent>
          <FilterableTable
            data={chartData}
            label="Percentage"
            periodHeaders={["Regio"]}
          />
        </CardContent>
      </Card>

      {mapData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Kaart {sectionTitles[section] || section}</CardTitle>
          </CardHeader>
          <CardContent>
            <MunicipalityMap
              data={mapData}
              getGeoCode={(d) => d.municipalityCode}
              getValue={(d) => d.value}
              tooltipLabel="Percentage"
              showProvinceBoundaries={true}
              height={500}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
