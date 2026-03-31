"use client"

import React, { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@embuild/shared/components/ui/table"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import residentialAAData from "@/components/data/residential_aa_share.json"
import residentialEFData from "@/components/data/residential_ef_share.json"
import nonResidentialAAData from "@/components/data/non_residential_aa_share.json"
import nonResidentialEFData from "@/components/data/non_residential_ef_share.json"

type DataPoint = {
  year: number
  building_type: string
  share: number
  label_a_plus_a?: number
  label_e_f?: number
  total: number
}

type GrowthStats = {
  building_type: string
  growth_2019_2022: number
  growth_2023_2025: number
}

function calculateGrowthStats(data: DataPoint[]): GrowthStats[] {
  const stats = new Map<string, GrowthStats>()

  const buildingTypes = [...new Set(data.map((d) => d.building_type))]

  buildingTypes.forEach((type) => {
    const typeData = data.filter((d) => d.building_type === type).sort((a, b) => a.year - b.year)

    const data_2019 = typeData.find((d) => d.year === 2019)?.share ?? 0
    const data_2022 = typeData.find((d) => d.year === 2022)?.share ?? 0
    const data_2023 = typeData.find((d) => d.year === 2023)?.share ?? 0
    const data_2025 = typeData.find((d) => d.year === 2025)?.share ?? 0

    const growth_2019_2022 = data_2019 > 0 ? ((data_2022 - data_2019) / 3) : 0
    const growth_2023_2025 = data_2023 > 0 ? ((data_2025 - data_2023) / 2) : 0

    stats.set(type, {
      building_type: type,
      growth_2019_2022,
      growth_2023_2025,
    })
  })

  return Array.from(stats.values())
}

function ChartSection({
  title,
  description,
  data,
  slug,
  sectionId,
  yAxisLabel,
  shareType,
}: {
  title: string
  description: string
  data: DataPoint[]
  slug: string
  sectionId: string
  yAxisLabel: string
  shareType: "aa" | "ef"
}) {
  const [activeView, setActiveView] = useState<"chart" | "table">("chart")
  const [selectedBuildingTypes, setSelectedBuildingTypes] = useState<Set<string>>(new Set())

  // Get unique building types
  const buildingTypes = useMemo(
    () => [...new Set(data.map((d) => d.building_type))],
    [data]
  )

  // Initialize selected building types on first load
  useMemo(() => {
    if (selectedBuildingTypes.size === 0) {
      setSelectedBuildingTypes(new Set(buildingTypes))
    }
  }, [buildingTypes, selectedBuildingTypes])

  // Calculate growth statistics
  const growthStats = useMemo(() => calculateGrowthStats(data), [data])

  // Prepare chart data grouped by year with building types as series
  const chartData = useMemo(() => {
    const grouped = new Map<number, any>()
    data.forEach((d) => {
      if (!grouped.has(d.year)) {
        grouped.set(d.year, { year: d.year })
      }
      grouped.get(d.year)[d.building_type] = d.share
    })
    return Array.from(grouped.values()).sort((a, b) => a.year - b.year)
  }, [data])

  // Prepare export data
  const exportData = useMemo(() => {
    return data
      .sort((a, b) => b.year - a.year || a.building_type.localeCompare(b.building_type))
      .map((d) => ({
        label: `${d.year} - ${d.building_type}`,
        value: d.share,
        periodCells: [
          d.year,
          d.building_type,
          `${d.share.toFixed(2)}%`,
          (shareType === "aa" ? d.label_a_plus_a : d.label_e_f) ?? 0,
          d.total,
        ] as (string | number)[],
      }))
  }, [data, shareType])

  const toggleBuildingType = (type: string) => {
    const newSelected = new Set(selectedBuildingTypes)
    if (newSelected.has(type)) {
      newSelected.delete(type)
    } else {
      newSelected.add(type)
    }
    setSelectedBuildingTypes(newSelected)
  }

  const filteredChartData = useMemo(() => {
    return chartData.map((year) => {
      const filtered: any = { year: year.year }
      buildingTypes.forEach((type) => {
        if (selectedBuildingTypes.has(type)) {
          filtered[type] = year[type]
        }
      })
      return filtered
    })
  }, [chartData, selectedBuildingTypes, buildingTypes])

  const activeSeries = useMemo(
    () => buildingTypes.filter((type) => selectedBuildingTypes.has(type)),
    [buildingTypes, selectedBuildingTypes]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-gray-600 mt-2">{description}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Growth Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {growthStats.map((stat) => (
            <div
              key={stat.building_type}
              className="border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-slate-100"
            >
              <h3 className="font-semibold text-sm text-gray-700 mb-3">{stat.building_type}</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Gem. jaarlijkse toename 2019-2022</p>
                  <p className={`text-lg font-bold ${stat.growth_2019_2022 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stat.growth_2019_2022 > 0 ? '+' : ''}{stat.growth_2019_2022.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Gem. jaarlijkse toename 2023-2025</p>
                  <p className={`text-lg font-bold ${stat.growth_2023_2025 >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stat.growth_2023_2025 > 0 ? '+' : ''}{stat.growth_2023_2025.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Tabs
          value={activeView}
          onValueChange={(v) => setActiveView(v as "chart" | "table")}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="chart">Grafiek</TabsTrigger>
                <TabsTrigger value="table">Tabel</TabsTrigger>
              </TabsList>
              <ExportButtons
                data={exportData}
                title={title}
                slug={slug}
                sectionId={sectionId}
                viewType={activeView}
                periodHeaders={[
                  "Jaar",
                  "Gebouwtype",
                  "Aandeel (%)",
                  shareType === "aa" ? "Aantal A+A" : "Aantal E+F",
                  "Totaal",
                ]}
                valueLabel={shareType === "aa" ? "Aandeel A+A (%)" : "Aandeel E+F (%)"}
                embedParams={{
                  type: Array.from(selectedBuildingTypes).join(","),
                }}
              />
            </div>

            {/* Building Type Filters */}
            <div className="border-b pb-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">Filter gebouwtypes:</p>
              <div className="flex flex-wrap gap-2">
                {buildingTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleBuildingType(type)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedBuildingTypes.has(type)
                        ? 'bg-gray-700 text-white hover:bg-gray-800'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <TabsContent value="chart" className="space-y-4">
            {activeSeries.length > 0 ? (
              <FilterableChart
                data={filteredChartData}
                getLabel={(d) => d.year.toString()}
                getValue={(d, metric) => d[metric as string] ?? 0}
                yAxisLabelAbove={yAxisLabel}
                series={activeSeries.map((type) => ({
                  key: type,
                  label: type,
                }))}
                chartType="bar"
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                Selecteer minstens één gebouwtype om de grafiek weer te geven
              </div>
            )}
          </TabsContent>

          <TabsContent value="table">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jaar</TableHead>
                    <TableHead>Gebouwtype</TableHead>
                    <TableHead className="text-right">
                      {shareType === "aa" ? "Aandeel A+A (%)" : "Aandeel E+F (%)"}
                    </TableHead>
                    <TableHead className="text-right">
                      {shareType === "aa" ? "Aantal A+A" : "Aantal E+F"}
                    </TableHead>
                    <TableHead className="text-right">Totaal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data
                    .filter((d) => selectedBuildingTypes.has(d.building_type))
                    .sort((a, b) => b.year - a.year || a.building_type.localeCompare(b.building_type))
                    .map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{row.year}</TableCell>
                        <TableCell>{row.building_type}</TableCell>
                        <TableCell className="text-right">{row.share.toFixed(2)}%</TableCell>
                        <TableCell className="text-right">
                          {shareType === "aa" ? row.label_a_plus_a ?? 0 : row.label_e_f ?? 0}
                        </TableCell>
                        <TableCell className="text-right">{row.total}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export function EpcLabelverdelingDashboard() {
  return (
    <div className="space-y-8">
      <ChartSection
        title="Residentieel: Aandeel van label A en A+ gebouwen"
        description="Percentage van gebouwen met label A of A+ uit het totaal aantal residentiële gebouwen. Dit toont in welke mate we reeds voldoen aan de doelstelling van minstens label A."
        data={residentialAAData as DataPoint[]}
        slug="epc-labelverdeling"
        sectionId="residential-aa"
        yAxisLabel="Aandeel (%)"
        shareType="aa"
      />

      <ChartSection
        title="Niet-residentieel: Aandeel van label A en A+ gebouwen"
        description="Percentage van gebouwen met label A of A+ uit het totaal aantal niet-residentiële gebouwen. Dit toont in welke mate we reeds voldoen aan de doelstelling van minstens label A."
        data={nonResidentialAAData as DataPoint[]}
        slug="epc-labelverdeling"
        sectionId="non-residential-aa"
        yAxisLabel="Aandeel (%)"
        shareType="aa"
      />

      <ChartSection
        title="Residentieel: Aandeel van label E en F gebouwen (niet voldoen aan D)"
        description="Percentage van gebouwen met label E of F (niet voldoen aan minstens label D) uit het totaal aantal residentiële gebouwen. Dit toont welk aandeel van gebouwen nog niet aan de doelstelling voldoet."
        data={residentialEFData as DataPoint[]}
        slug="epc-labelverdeling"
        sectionId="residential-ef"
        yAxisLabel="Aandeel (%)"
        shareType="ef"
      />

      <ChartSection
        title="Niet-residentieel: Aandeel van label E en F gebouwen (niet voldoen aan D)"
        description="Percentage van gebouwen met label E of F (niet voldoen aan minstens label D) uit het totaal aantal niet-residentiële gebouwen. Dit toont welk aandeel van gebouwen nog niet aan de doelstelling voldoet."
        data={nonResidentialEFData as DataPoint[]}
        slug="epc-labelverdeling"
        sectionId="non-residential-ef"
        yAxisLabel="Aandeel (%)"
        shareType="ef"
      />
    </div>
  )
}
