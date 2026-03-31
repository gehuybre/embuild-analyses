"use client"

import * as React from "react"
import type { ArrondissementData, MunicipalityData } from "./types"
import { GebouwenparkSection } from "./GebouwenparkSection"
import { HuishoudensSection } from "./HuishoudensSection"
import { VergunningenSection } from "./VergunningenSection"
import { CorrelatiesSection } from "./CorrelatiesSection"
import { VergelijkingSection } from "./VergelijkingSection"
import { getDataPath } from "@embuild/shared/lib/path-utils"
import Papa from "papaparse"
import { useInitializeFiltersWithDefaults, useGeoFilters } from "@embuild/shared/lib/stores/embed-filters-store"

type SectionType = "gebouwenpark" | "huishoudens" | "vergunningen" | "correlaties" | "vergelijking"
type ViewType = "chart" | "table"

export function BetaalbaarArrEmbed({
  section,
  viewType,
}: {
  section: SectionType
  viewType: ViewType
}) {
  useInitializeFiltersWithDefaults("betaalbaar-arr")
  const { selectedArrondissement } = useGeoFilters()

  const [municipalitiesData, setMunicipalitiesData] = React.useState<MunicipalityData[]>([])
  const [arrondissementsData, setArrondissementsData] = React.useState<ArrondissementData[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    async function loadData() {
      try {
        const municipalitiesPath = getDataPath("/data/municipalities.csv")
        const arrondissementsPath = getDataPath("/data/arrondissements.csv")
        const [municipalitiesResponse, arrondissementsResponse] = await Promise.all([
          fetch(municipalitiesPath),
          fetch(arrondissementsPath),
        ])

        // Check HTTP status codes before reading the body to provide clearer errors
        if (!municipalitiesResponse.ok) {
          throw new Error(`Failed to fetch municipalities CSV (${municipalitiesPath}): ${municipalitiesResponse.status} ${municipalitiesResponse.statusText}`)
        }
        if (!arrondissementsResponse.ok) {
          throw new Error(`Failed to fetch arrondissements CSV (${arrondissementsPath}): ${arrondissementsResponse.status} ${arrondissementsResponse.statusText}`)
        }

        const [municipalitiesText, arrondissementsText] = await Promise.all([
          municipalitiesResponse.text(),
          arrondissementsResponse.text(),
        ])

        const normalizeHeader = (header: string) => header.trim().replace(/-/g, "_")

        // Use PapaParse to correctly handle quoted values and embedded commas
        const municipalitiesParsed = Papa.parse(municipalitiesText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizeHeader,
        })

        if (municipalitiesParsed.errors && municipalitiesParsed.errors.length > 0) {
          console.warn("betaalbaar-arr embed: CSV parse errors for municipalities", municipalitiesParsed.errors)
        }

        const municipalities: MunicipalityData[] = (municipalitiesParsed.data as Record<string, string>[]).map((raw) => {
          const row: any = {}
          Object.entries(raw).forEach(([header, valueRaw]) => {
            const value = valueRaw?.trim()

            if (header === "HH_available") {
              row[header] = value === "True" || value === "true"
            } else if (header === "CD_REFNIS" || header === "CD_SUP_REFNIS" || header === "TX_REFNIS_NL") {
              row[header] = value
            } else {
              row[header] = value === "" || value === "nan" ? null : parseFloat(value as string)
            }
          })

          return row as MunicipalityData
        })

        const arrondissementsParsed = Papa.parse(arrondissementsText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizeHeader,
        })

        if (arrondissementsParsed.errors && arrondissementsParsed.errors.length > 0) {
          console.warn("betaalbaar-arr embed: CSV parse errors for arrondissements", arrondissementsParsed.errors)
        }

        const arrondissements: ArrondissementData[] = (arrondissementsParsed.data as Record<string, string>[]).map((raw) => {
          const row: any = {}
          Object.entries(raw).forEach(([header, valueRaw]) => {
            const value = valueRaw?.trim()

            if (header === "CD_ARR" || header === "TX_ARR_NL") {
              row[header] = value
            } else {
              row[header] = value === "" || value === "nan" ? null : parseFloat(value as string)
            }
          })

          return row as ArrondissementData
        })

        if (municipalities.length === 0 || arrondissements.length === 0) {
          console.warn("betaalbaar-arr embed: parsed CSVs are empty", { municipalitiesLength: municipalities.length, arrondissementsLength: arrondissements.length })
          setError("Geen data beschikbaar.")
          setLoading(false)
          return
        }

        setMunicipalitiesData(municipalities)
        setArrondissementsData(arrondissements)
        setLoading(false)
      } catch (err) {
        console.error("Failed to load betaalbaar-arr embed data:", err)
        setError("Kon data niet laden.")
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const arrNameByCode = React.useMemo(() => {
    const map = new Map<string, string>()
    arrondissementsData.forEach(arr => {
      if (arr.CD_ARR && arr.TX_ARR_NL) {
        map.set(arr.CD_ARR, arr.TX_ARR_NL)
      }
    })
    return map
  }, [arrondissementsData])

  const filteredMunicipalities = React.useMemo(() => {
    if (!selectedArrondissement || selectedArrondissement === "all") {
      return municipalitiesData
    }
    return municipalitiesData.filter(d => d.CD_SUP_REFNIS === selectedArrondissement)
  }, [municipalitiesData, selectedArrondissement])

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">Data laden...</div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-muted-foreground">{error}</div>
    )
  }

  return (
    <div className="p-4">
      {section === "gebouwenpark" && (
        <GebouwenparkSection data={filteredMunicipalities} />
      )}
      {section === "huishoudens" && (
        <HuishoudensSection data={filteredMunicipalities} />
      )}
      {section === "vergunningen" && (
        <VergunningenSection data={filteredMunicipalities} />
      )}
      {section === "correlaties" && (
        <CorrelatiesSection data={filteredMunicipalities} />
      )}
      {section === "vergelijking" && (
        <VergelijkingSection data={filteredMunicipalities} />
      )}

      <div className="mt-4 text-xs text-muted-foreground text-center">
        <span>Bron: Statbel, Vlaamse Overheid</span>
      </div>
    </div>
  )
}
