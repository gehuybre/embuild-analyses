"use client"

import { EnergiekaartSection } from "./EnergiekaartSection"
import type { YearlyDataRow } from "./EnergiekaartDashboard"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

interface EnergiekaartPremiesEmbedProps {
  section: "aantal-premies" | "bedrag-premies" | "aantal-beschermd" | "bedrag-beschermd"
  measure?: string
}

export function EnergiekaartPremiesEmbed({
  section,
  measure = "Totaal",
}: EnergiekaartPremiesEmbedProps) {
  const { data: bundle, loading, error } = useJsonBundle<{
    data: YearlyDataRow[]
  }>({
    data: "/data/data_yearly.json",
  })

  if (loading) {
    return <div className="p-4">Data laden...</div>
  }

  if (error || !bundle) {
    return (
      <div className="p-4 text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
      </div>
    )
  }

  // Configuration based on section
  const sectionConfig = {
    "aantal-premies": {
      title: "Aantal toegekende premies",
      metric: "aantal" as keyof YearlyDataRow,
      label: "Aantal premies",
      isCurrency: false,
    },
    "bedrag-premies": {
      title: "Totaal bedrag premies",
      metric: "bedrag" as keyof YearlyDataRow,
      label: "Bedrag (€)",
      isCurrency: true,
    },
    "aantal-beschermd": {
      title: "Aantal premies beschermde afnemers",
      metric: "aantal_beschermd" as keyof YearlyDataRow,
      label: "Aantal premies (beschermde afnemers)",
      isCurrency: false,
    },
    "bedrag-beschermd": {
      title: "Totaal bedrag premies beschermde afnemers",
      metric: "bedrag_beschermd" as keyof YearlyDataRow,
      label: "Bedrag (€) (beschermde afnemers)",
      isCurrency: true,
    },
  }

  const config = sectionConfig[section]

  // Filter data by measure
  const filteredData = bundle.data.filter(
    (row) => row.maatregel === measure
  ) as YearlyDataRow[]

  return (
    <div className="p-4">
      <EnergiekaartSection
        title={config.title}
        data={filteredData}
        metric={config.metric}
        label={config.label}
        slug="energiekaart-premies"
        sectionId={section}
        dataSource="Vlaams Energieagentschap - Energiekaart"
        dataSourceUrl="https://apps.energiesparen.be/energiekaart/vlaanderen/premies-res-tijdreeks-algemeen"
        selectedMeasure={measure}
        isCurrency={config.isCurrency}
      />
    </div>
  )
}
