import { describe, it, expect } from "vitest"
import processedData from "../../../analyses/silc-energie-2023/results/processed_data.json"
import { FILTER_CATEGORIES, getFilteredRow, transformRowToChartData } from "../../../analyses/silc-energie-2023/src/data-utils"

describe("SILC data-utils (integration)", () => {
  it("Activiteitenstatus options align with source data", () => {
    const opts = FILTER_CATEGORIES["Activiteitenstatus (zelfgedefinieerd)"]
    expect(opts).toContain("Werkloos")
    expect(opts).toContain("Gepensioneerd")
    expect(opts).toContain("Andere inactief")
  })

  it("getFilteredRow finds a row for 'Werkloos' and transformation returns data", () => {
    const row = getFilteredRow(processedData as any, "renovatiemaatregelen", "Activiteitenstatus (zelfgedefinieerd)", "Werkloos")
    expect(row).not.toBeNull()

    const config = {
      dataKey: "Isolatie verbeterd",
      series: [
        { key: "eenMaatregel", label: "Één maatregel", columnIndex: 3 }
      ]
    }

    const chartData = transformRowToChartData(row as any, config as any)
    expect(chartData.length).toBeGreaterThan(0)
  })
})
