"use client"

import * as React from "react"
import type { MunicipalityData } from "./types"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { DataTable } from "./DataTable"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { useEmbedFilters, useGeoFilters } from "@embuild/shared/lib/stores/embed-filters-store"

interface GebouwenparkSectionProps {
  data: MunicipalityData[]
}

const columns = [
  { key: "TX_REFNIS_NL", header: "Gemeente", format: "text" as const, sortable: true },
  { key: "Huizen_totaal_2025", header: "Huizen 2025", format: "number" as const, sortable: true },
  { key: "Appartementen_2025", header: "Appartementen 2025", format: "number" as const, sortable: true },
]

export function GebouwenparkSection({ data }: GebouwenparkSectionProps) {
  const currentView = useEmbedFilters((state) => state.currentView)
  const { selectedHighlightMunicipality } = useGeoFilters()

  const highlightedName = React.useMemo(() => {
    if (!selectedHighlightMunicipality) return null
    return data.find(d => d.CD_REFNIS === selectedHighlightMunicipality)?.TX_REFNIS_NL ?? null
  }, [data, selectedHighlightMunicipality])

  const cleanData = data.filter(d => d.Huizen_totaal_2025 != null && d.Huizen_totaal_2025 > 0)

  // Map data for export
  const exportData = cleanData.map(d => ({
    label: d.TX_REFNIS_NL,
    value: d.Huizen_totaal_2025 ?? 0,
    Appartementen_2025: d.Appartementen_2025 ?? 0
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Gebouwenpark 2025</h2>
          <p className="text-muted-foreground">
            Analyse van woningvoorraad: totaal aantal huizen en appartementen per gemeente.
          </p>
        </div>
        <ExportButtons
          data={exportData}
          title="Gebouwenpark 2025"
          slug="betaalbaar-arr"
          sectionId="gebouwenpark"
          viewType={currentView === "map" ? "map" : "chart"}
          periodHeaders={["Gemeente"]}
          valueLabel="Huizen 2025"
          dataSource="Statbel, Vlaamse Overheid"
          dataSourceUrl="https://statbel.fgov.be/"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Houses */}
        <div>
          <h3 className="text-lg font-medium mb-3">Aantal huizen</h3>
          <FilterableChart
            data={cleanData.sort((a, b) => (b.Huizen_totaal_2025 ?? 0) - (a.Huizen_totaal_2025 ?? 0)).slice(0, 20)}
            getLabel={(d) => d.TX_REFNIS_NL}
            getValue={(d) => d.Huizen_totaal_2025 ?? 0}
            chartType="bar"
            yAxisLabelAbove="Aantal huizen"
            highlightLabel={highlightedName}
          />
        </div>

        {/* Apartments */}
        <div>
          <h3 className="text-lg font-medium mb-3">Aantal appartementen</h3>
          <FilterableChart
            data={cleanData.sort((a, b) => (b.Appartementen_2025 ?? 0) - (a.Appartementen_2025 ?? 0)).slice(0, 20)}
            getLabel={(d) => d.TX_REFNIS_NL}
            getValue={(d) => d.Appartementen_2025 ?? 0}
            chartType="bar"
            yAxisLabelAbove="Aantal appartementen"
            highlightLabel={highlightedName}
          />
        </div>
      </div>

      {/* Apartments ratio */}
      <div>
        <h3 className="text-lg font-medium mb-3">Ratio appartementen t.o.v. totaal huizen (%)</h3>
        <FilterableChart
          data={cleanData
            .map(d => ({
              ...d,
              ratio: ((d.Appartementen_2025 ?? 0) / (d.Huizen_totaal_2025 ?? 1) * 100)
            }))
            .sort((a, b) => b.ratio - a.ratio)
            .slice(0, 20)}
          getLabel={(d) => d.TX_REFNIS_NL}
          getValue={(d) => (d.Appartementen_2025 ?? 0) / (d.Huizen_totaal_2025 ?? 1) * 100}
          chartType="bar"
          yAxisLabelAbove="Percentage"
          highlightLabel={highlightedName}
        />
      </div>

      <DataTable data={cleanData} columns={columns} />
    </div>
  )
}
