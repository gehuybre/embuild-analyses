"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { MeasureFilter } from "./MeasureFilter"
import { TimeSeriesSection } from "@embuild/shared/components/shared/TimeSeriesSection"
import { EnergiekaartSection } from "./EnergiekaartSection"
import { EnergiekaartChart } from "./EnergiekaartChart"
import { EnergiekaartTable } from "./EnergiekaartTable"
import { formatScaledEuro, getCurrencyLabel, getCurrencyScale } from "./formatters"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

// Define type locally to avoid circular dependencies
export interface YearlyDataRow {
  jaar: number
  maatregel: string
  aantal: number
  bedrag: number
  aantal_beschermd: number
  bedrag_beschermd: number
  // Add other properties if needed
  [key: string]: any
}

// Helper component removed, using shared EnergiekaartSection
const DATA_PATHS = {
  data: "/data/data_yearly.json",
  measures: "/data/measures.json",
} as const

export function EnergiekaartDashboard() {
  const [selectedMeasure, setSelectedMeasure] = useState<string>("Totaal")
  const { data: bundle, loading, error } = useJsonBundle<{
    data: YearlyDataRow[]
    measures: string[]
  }>(DATA_PATHS)

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  const data = bundle.data
  const measures = bundle.measures

  return (
    <div className="space-y-12">
      {/* Total Subsidies Count */}
      <EnergiekaartSection
        title="Aantal toegekende premies"
        data={data as YearlyDataRow[]}
        metric="aantal"
        label="Aantal premies"
        slug="energiekaart-premies"
        sectionId="aantal-premies"
        dataSource="Vlaams Energieagentschap - Energiekaart"
        dataSourceUrl="https://apps.energiesparen.be/energiekaart/vlaanderen/premies-res-tijdreeks-algemeen"
        selectedMeasure={selectedMeasure}
        headerControls={
          <MeasureFilter
            measures={measures}
            selectedMeasure={selectedMeasure}
            onMeasureChange={setSelectedMeasure}
          />
        }
      />

      {/* Total Amount */}
      <EnergiekaartSection
        title="Totaal bedrag premies"
        data={data as YearlyDataRow[]}
        metric="bedrag"
        label="Bedrag (€)"
        slug="energiekaart-premies"
        sectionId="bedrag-premies"
        dataSource="Vlaams Energieagentschap - Energiekaart"
        dataSourceUrl="https://apps.energiesparen.be/energiekaart/vlaanderen/premies-res-tijdreeks-algemeen"
        selectedMeasure={selectedMeasure}
        isCurrency={true}
        headerControls={
          <MeasureFilter
            measures={measures}
            selectedMeasure={selectedMeasure}
            onMeasureChange={setSelectedMeasure}
          />
        }
      />

      {/* Protected Consumers Count */}
      <EnergiekaartSection
        title="Aantal premies voor beschermde afnemers"
        data={data as YearlyDataRow[]}
        metric="aantal_beschermd"
        label="Aantal premies (beschermde afnemers)"
        slug="energiekaart-premies"
        sectionId="aantal-beschermd"
        dataSource="Vlaams Energieagentschap - Energiekaart"
        dataSourceUrl="https://apps.energiesparen.be/energiekaart/vlaanderen/premies-res-tijdreeks-algemeen"
        selectedMeasure={selectedMeasure}
        headerControls={
          <MeasureFilter
            measures={measures}
            selectedMeasure={selectedMeasure}
            onMeasureChange={setSelectedMeasure}
          />
        }
      />

      {/* Protected Consumers Amount */}
      <EnergiekaartSection
        title="Totaal bedrag premies voor beschermde afnemers"
        data={data as YearlyDataRow[]}
        metric="bedrag_beschermd"
        label="Bedrag (€) (beschermde afnemers)"
        slug="energiekaart-premies"
        sectionId="bedrag-beschermd"
        dataSource="Vlaams Energieagentschap - Energiekaart"
        dataSourceUrl="https://apps.energiesparen.be/energiekaart/vlaanderen/premies-res-tijdreeks-algemeen"
        selectedMeasure={selectedMeasure}
        isCurrency={true}
        headerControls={
          <MeasureFilter
            measures={measures}
            selectedMeasure={selectedMeasure}
            onMeasureChange={setSelectedMeasure}
          />
        }
      />
    </div>
  )
}
