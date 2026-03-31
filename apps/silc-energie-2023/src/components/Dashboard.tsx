"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@embuild/shared/components/ui/select"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
// Import utilities
import {
  type ProcessedData,
  FILTER_CATEGORIES,
  SECTION_CONFIGS,
  getFilteredRow,
  transformRowToChartData,
  validateProcessedData
} from "./data-utils"

interface FilterState {
  geo: string
  leeftijd: string
  activiteitenstatus: string
  inkomenskwintiel: string
}

export function Dashboard() {
  const { data: bundle, loading, error } = useJsonBundle<{
    processed: ProcessedData
  }>({
    processed: "/data/processed_data.json",
  })

  const [currentViews, setCurrentViews] = useState<Record<string, "chart" | "table">>({
    renovatiemaatregelen: "chart",
    verwarmingssystemen: "chart",
    energiebronnen: "chart",
    isolatieverbeteringen: "chart"
  })

  const [filters, setFilters] = useState<FilterState>({
    geo: "Vlaams Gewest",
    leeftijd: "all",
    activiteitenstatus: "all",
    inkomenskwintiel: "all"
  })

  // Validate and use imported data
  const processedData = useMemo(() => {
    if (!bundle?.processed || !validateProcessedData(bundle.processed)) {
      console.error("Invalid processed data structure")
      return null
    }
    return bundle.processed as ProcessedData
  }, [bundle])

  // Get current active filter category and value
  const getActiveFilter = (): { category: string; value: string } => {
    // Priority: leeftijd > activiteitenstatus > inkomenskwintiel > geo
    if (filters.leeftijd !== "all") {
      return { category: "Leeftijd", value: filters.leeftijd }
    } else if (filters.activiteitenstatus !== "all") {
      return { category: "Activiteitenstatus (zelfgedefinieerd)", value: filters.activiteitenstatus }
    } else if (filters.inkomenskwintiel !== "all") {
      return { category: "Inkomenskwintiel", value: filters.inkomenskwintiel }
    } else {
      return { category: "Regio", value: filters.geo }
    }
  }

  // Transform data for each section using shared utilities
  const getSectionData = (sectionName: string) => {
    if (!processedData) return []

    const { category, value } = getActiveFilter()
    const row = getFilteredRow(processedData, sectionName, category, value)
    const config = SECTION_CONFIGS[sectionName]
    return transformRowToChartData(row, config)
  }

  const renovatieData = useMemo(() => getSectionData("renovatiemaatregelen"), [processedData, filters])
  const verwarmingData = useMemo(() => getSectionData("verwarmingssystemen"), [processedData, filters])
  const energiebronData = useMemo(() => getSectionData("energiebronnen"), [processedData, filters])
  const isolatieData = renovatieData // Same data source

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

  if (!processedData) {
    return <div className="p-4">Error loading data. Please check console for details.</div>
  }

  return (
    <div className="space-y-8">
      {/* Filters Section */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Geographic Filter */}
            <div>
              <label className="text-sm font-medium mb-2 block">Regio</label>
              <Select value={filters.geo} onValueChange={(value) => setFilters(prev => ({ ...prev, geo: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_CATEGORIES.Regio.map(region => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Age Filter */}
            <div>
              <label className="text-sm font-medium mb-2 block">Leeftijd</label>
              <Select value={filters.leeftijd} onValueChange={(value) => setFilters(prev => ({ ...prev, leeftijd: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle leeftijden</SelectItem>
                  {FILTER_CATEGORIES.Leeftijd.map(age => (
                    <SelectItem key={age} value={age}>
                      {age}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Activity Status Filter */}
            <div>
              <label className="text-sm font-medium mb-2 block">Activiteitenstatus</label>
              <Select value={filters.activiteitenstatus} onValueChange={(value) => setFilters(prev => ({ ...prev, activiteitenstatus: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statussen</SelectItem>
                  {FILTER_CATEGORIES["Activiteitenstatus (zelfgedefinieerd)"].map(status => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Income Quintile Filter */}
            <div>
              <label className="text-sm font-medium mb-2 block">Inkomenskwintiel</label>
              <Select value={filters.inkomenskwintiel} onValueChange={(value) => setFilters(prev => ({ ...prev, inkomenskwintiel: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle kwintielen</SelectItem>
                  {FILTER_CATEGORIES.Inkomenskwintiel.map(quintile => (
                    <SelectItem key={quintile} value={quintile}>
                      {quintile}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            {filters.leeftijd !== "all" && (
              <p>Gefilterd op: <strong>Leeftijd</strong> ({filters.leeftijd})</p>
            )}
            {filters.leeftijd === "all" && filters.activiteitenstatus !== "all" && (
              <p>Gefilterd op: <strong>Activiteitenstatus</strong> ({filters.activiteitenstatus})</p>
            )}
            {filters.leeftijd === "all" && filters.activiteitenstatus === "all" && filters.inkomenskwintiel !== "all" && (
              <p>Gefilterd op: <strong>Inkomenskwintiel</strong> ({filters.inkomenskwintiel})</p>
            )}
            {filters.leeftijd === "all" && filters.activiteitenstatus === "all" && filters.inkomenskwintiel === "all" && (
              <p>Gefilterd op: <strong>Regio</strong> ({filters.geo})</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 1: Renovatiemaatregelen */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Renovatiemaatregelen (afgelopen 5 jaar)</CardTitle>
          <ExportButtons
            title="Renovatiemaatregelen (afgelopen 5 jaar)"
            slug="silc-energie-2023"
            sectionId="renovatiemaatregelen"
            data={renovatieData}
            viewType={currentViews.renovatiemaatregelen}
          />
        </CardHeader>
        <CardContent>
          <Tabs value={currentViews.renovatiemaatregelen} onValueChange={(v) => setCurrentViews(prev => ({ ...prev, renovatiemaatregelen: v as "chart" | "table" }))}>
            <TabsList>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart">
              <FilterableChart
                data={renovatieData}
                getLabel={(d) => d.label}
                getValue={(d) => d.value}
                chartType="bar"
                layout="horizontal"
                yAxisLabelAbove="Percentage (%)"
              />
            </TabsContent>
            <TabsContent value="table">
              <FilterableTable
                data={renovatieData.map(d => ({ periodCells: [d.label], value: d.value }))}
                label="Percentage (%)"
                periodHeaders={["Categorie"]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Section 2: Verwarmingssystemen */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Verwarmingssystemen</CardTitle>
          <ExportButtons
            title="Verwarmingssystemen"
            slug="silc-energie-2023"
            sectionId="verwarmingssystemen"
            data={verwarmingData}
            viewType={currentViews.verwarmingssystemen}
          />
        </CardHeader>
        <CardContent>
          <Tabs value={currentViews.verwarmingssystemen} onValueChange={(v) => setCurrentViews(prev => ({ ...prev, verwarmingssystemen: v as "chart" | "table" }))}>
            <TabsList>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart">
              <FilterableChart
                data={verwarmingData}
                getLabel={(d) => d.label}
                getValue={(d) => d.value}
                chartType="bar"
                layout="horizontal"
                yAxisLabelAbove="Percentage (%)"
              />
            </TabsContent>
            <TabsContent value="table">
              <FilterableTable
                data={verwarmingData.map(d => ({ periodCells: [d.label], value: d.value }))}
                label="Percentage (%)"
                periodHeaders={["Categorie"]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Section 3: Energiebronnen */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Belangrijkste Energiebronnen voor Verwarming</CardTitle>
          <ExportButtons
            title="Energiebronnen voor verwarming"
            slug="silc-energie-2023"
            sectionId="energiebronnen"
            data={energiebronData}
            viewType={currentViews.energiebronnen}
          />
        </CardHeader>
        <CardContent>
          <Tabs value={currentViews.energiebronnen} onValueChange={(v) => setCurrentViews(prev => ({ ...prev, energiebronnen: v as "chart" | "table" }))}>
            <TabsList>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart">
              <FilterableChart
                data={energiebronData}
                getLabel={(d) => d.label}
                getValue={(d) => d.value}
                chartType="bar"
                layout="horizontal"
                yAxisLabelAbove="Percentage (%)"
              />
            </TabsContent>
            <TabsContent value="table">
              <FilterableTable
                data={energiebronData.map(d => ({ periodCells: [d.label], value: d.value }))}
                label="Percentage (%)"
                periodHeaders={["Categorie"]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Section 4: Isolatieverbeteringen (same as renovatiemaatregelen) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Isolatieverbeteringen Details</CardTitle>
          <ExportButtons
            title="Isolatieverbeteringen"
            slug="silc-energie-2023"
            sectionId="isolatieverbeteringen"
            data={isolatieData}
            viewType={currentViews.isolatieverbeteringen}
          />
        </CardHeader>
        <CardContent>
          <Tabs value={currentViews.isolatieverbeteringen} onValueChange={(v) => setCurrentViews(prev => ({ ...prev, isolatieverbeteringen: v as "chart" | "table" }))}>
            <TabsList>
              <TabsTrigger value="chart">Grafiek</TabsTrigger>
              <TabsTrigger value="table">Tabel</TabsTrigger>
            </TabsList>
            <TabsContent value="chart">
              <FilterableChart
                data={isolatieData}
                getLabel={(d) => d.label}
                getValue={(d) => d.value}
                chartType="bar"
                layout="horizontal"
                yAxisLabelAbove="Percentage (%)"
              />
            </TabsContent>
            <TabsContent value="table">
              <FilterableTable
                data={isolatieData.map(d => ({ periodCells: [d.label], value: d.value }))}
                label="Percentage (%)"
                periodHeaders={["Categorie"]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
