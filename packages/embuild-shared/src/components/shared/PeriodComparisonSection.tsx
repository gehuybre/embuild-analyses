"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { FilterableChart } from "./FilterableChart"
import { DumbbellChart } from "./DumbbellChart"
import { ExportButtons } from "./ExportButtons"
import { ArrondissementMap, type ColorScaleMode, type ColorScheme } from "./ArrondissementMap"
import { ChevronDown, ChevronUp } from "lucide-react"
import { GeoFilterInline } from "./GeoFilterInline"
import { ARRONDISSEMENTS, PROVINCES, type RegionCode } from "../../lib/geo-utils"

export type PeriodComparisonRow = {
  arrondissementCode: string
  arrondissementName: string
  period1: number
  period2: number
  verschil: number
  percentageChange: number
}

interface PeriodComparisonSectionProps {
  title: string
  data: PeriodComparisonRow[]
  metric: "ren" | "dwell"
  slug: string
  sectionId: string
  period1Label: string
  period2Label: string
  mapColorScheme?: ColorScheme
  mapColorScaleMode?: ColorScaleMode
  mapNeutralFill?: string
}

export function PeriodComparisonSection({
  title,
  data,
  metric,
  slug,
  sectionId,
  period1Label,
  period2Label,
  mapColorScheme = "orange",
  mapColorScaleMode = "positive",
  mapNeutralFill,
}: PeriodComparisonSectionProps) {
  const [currentView, setCurrentView] = useState<"chart" | "table" | "map">("chart")
  const [sortColumn, setSortColumn] = useState<"name" | "period1" | "period2" | "verschil" | "percentageChange">("period1")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [selectedRegion, setSelectedRegion] = useState<RegionCode>("2000")

  const filteredData = useMemo(() => {
    if (selectedRegion === "1000") return data
    const provinceByArrondissement = new Map(ARRONDISSEMENTS.map((arr) => [arr.code, arr.provinceCode]))
    const regionByProvince = new Map(PROVINCES.map((prov) => [prov.code, prov.regionCode]))
    return data.filter((row) => {
      const provinceCode = provinceByArrondissement.get(row.arrondissementCode)
      if (!provinceCode) return false
      return regionByProvince.get(provinceCode) === selectedRegion
    })
  }, [data, selectedRegion])

  // Sort data for table
  const sortedData = useMemo(() => {
    const sorted = [...filteredData]
    sorted.sort((a, b) => {
      let aVal: number | string
      let bVal: number | string

      switch (sortColumn) {
        case "name":
          aVal = a.arrondissementName
          bVal = b.arrondissementName
          break
        case "period1":
          aVal = a.period1
          bVal = b.period1
          break
        case "period2":
          aVal = a.period2
          bVal = b.period2
          break
        case "verschil":
          aVal = a.verschil
          bVal = b.verschil
          break
        case "percentageChange":
          aVal = a.percentageChange
          bVal = b.percentageChange
          break
        default:
          aVal = a.percentageChange
          bVal = b.percentageChange
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal, "nl-BE")
          : bVal.localeCompare(aVal, "nl-BE")
      }

      return sortDirection === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })
    return sorted
  }, [filteredData, sortColumn, sortDirection])

  // Handle column header click
  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("desc")
    }
  }

  // Prepare chart data for period counts (Chart 1: Period 1 vs Period 2)
  const countsChartData = useMemo(() => {
    return filteredData
      .map(row => ({
        name: row.arrondissementName.replace("Arrondissement ", ""),
        period1: row.period1,
        period2: row.period2,
      }))
      .sort((a, b) => {
        const diff = a.period1 - b.period1
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name, "nl-BE")
      })
  }, [filteredData])

  // Prepare chart data for percentage change (Chart 2: % Change)
  const percentageChartData = useMemo(() => {
    return filteredData
      .map(row => ({
        name: row.arrondissementName.replace("Arrondissement ", ""),
        percentageChange: Number.isFinite(row.percentageChange) ? row.percentageChange : 0,
        period1: row.period1,
      }))
      .sort((a, b) => {
        const diff = b.percentageChange - a.percentageChange
        if (diff !== 0) return diff
        return a.name.localeCompare(b.name, "nl-BE")
      })
  }, [filteredData])

  const percentageExportData = useMemo(() => {
    return percentageChartData.map((row) => ({
      label: row.name,
      value: row.percentageChange,
    }))
  }, [percentageChartData])

  // CSV export data
  const csvData = useMemo(() => {
    return filteredData.map(row => ({
      label: row.arrondissementName,
      value: row.period2, // Use period2 as the main value for CSV compatibility
      period1: row.period1,
      period2: row.period2,
      verschil: row.verschil,
      percentageChange: Number.isFinite(row.percentageChange) ? row.percentageChange : 0,
    }))
  }, [filteredData])

  // Map data (arrondissement code -> percentage change)
  const mapData = useMemo(() => {
    return filteredData.map(row => ({
      arrondissementCode: row.arrondissementCode,
      value: Number.isFinite(row.percentageChange) ? row.percentageChange : 0,
    }))
  }, [filteredData])

  // Format percentage for display
  const formatPercentage = (value: number): string => {
    if (!Number.isFinite(value)) return "N/A"
    const sign = value >= 0 ? "+" : ""
    return `${sign}${value.toFixed(1)}%`
  }

  // Format number with sign for verschil column
  const formatVerschil = (value: number): string => {
    const sign = value >= 0 ? "+" : ""
    return `${sign}${value.toLocaleString("nl-BE")}`
  }

  // Get diverging color for percentage values
  const getPercentageColor = (value: number): string => {
    if (!Number.isFinite(value)) return "text-muted-foreground"
    if (value < 0) return "text-red-600"
    if (value > 0) return "text-green-600"
    return "text-muted-foreground"
  }

  // Sort indicator component
  const SortIndicator = ({ column }: { column: typeof sortColumn }) => {
    if (sortColumn !== column) return null
    return sortDirection === "asc" ? (
      <ChevronUp className="inline-block w-4 h-4 ml-1" />
    ) : (
      <ChevronDown className="inline-block w-4 h-4 ml-1" />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-bold">{title}</h3>
        <GeoFilterInline
          selectedRegion={selectedRegion}
          selectedProvince={null}
          onSelectRegion={setSelectedRegion}
          onSelectProvince={() => {}}
          showRegions={true}
          showProvinces={false}
        />
      </div>

      <Tabs defaultValue="chart" onValueChange={(v) => setCurrentView(v as "chart" | "table" | "map")}>
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="chart">Grafiek</TabsTrigger>
            <TabsTrigger value="table">Tabel</TabsTrigger>
            <TabsTrigger value="map">Kaart</TabsTrigger>
          </TabsList>
          <div className="text-sm text-muted-foreground">
            {period1Label} vs {period2Label}
          </div>
        </div>

        {/* Tab 1: Charts */}
        <TabsContent value="chart">
          <div className="space-y-6">
            {/* Chart 1: Period 1 vs Period 2 Counts */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Periodevergelijking per arrondissement</CardTitle>
                  {slug && sectionId && (
                    <ExportButtons
                      data={csvData}
                      title="Periodevergelijking per arrondissement"
                      slug={slug}
                      sectionId={`${sectionId}-aantallen`}
                      viewType="chart"
                      periodHeaders={["Arrondissement"]}
                      valueLabel="Aantal"
                      dataSource="Statbel - Bouwvergunningen"
                      dataSourceUrl="https://statbel.fgov.be/nl/themas/bouwen-wonen/bouwvergunningen"
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <DumbbellChart
                  data={countsChartData}
                  period1Label={period1Label}
                  period2Label={period2Label}
                  xAxisLabelAbove="Aantal"
                />
              </CardContent>
            </Card>

            {/* Chart 2: Percentage Change */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Percentage verandering per arrondissement</CardTitle>
                  {slug && sectionId && (
                    <ExportButtons
                      data={percentageExportData}
                      title="Percentage verandering per arrondissement"
                      slug={slug}
                      sectionId={`${sectionId}-percentage`}
                      viewType="chart"
                      periodHeaders={["Arrondissement"]}
                      valueLabel="% Verandering"
                      dataSource="Statbel - Bouwvergunningen"
                      dataSourceUrl="https://statbel.fgov.be/nl/themas/bouwen-wonen/bouwvergunningen"
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <FilterableChart
                  data={percentageChartData}
                  getLabel={(d) => d.name}
                  getValue={(d) => d.percentageChange}
                  chartType="bar"
                  layout="horizontal"
                  yAxisLabelAbove="% Verandering"
                  showMovingAverage={false}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Table */}
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Data {title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th
                        className="text-left p-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("name")}
                      >
                        Arrondissement <SortIndicator column="name" />
                      </th>
                      <th
                        className="text-right p-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("period1")}
                      >
                        {period1Label} <SortIndicator column="period1" />
                      </th>
                      <th
                        className="text-right p-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("period2")}
                      >
                        {period2Label} <SortIndicator column="period2" />
                      </th>
                      <th
                        className="text-right p-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("verschil")}
                      >
                        Verschil <SortIndicator column="verschil" />
                      </th>
                      <th
                        className="text-right p-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("percentageChange")}
                      >
                        % Verandering <SortIndicator column="percentageChange" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedData.map((row, idx) => (
                      <tr
                        key={row.arrondissementCode}
                        className={idx % 2 === 0 ? "bg-muted/30" : ""}
                      >
                        <td className="p-2">{row.arrondissementName}</td>
                        <td className="text-right p-2">
                          {row.period1.toLocaleString("nl-BE")}
                        </td>
                        <td className="text-right p-2">
                          {row.period2.toLocaleString("nl-BE")}
                        </td>
                        <td className="text-right p-2">{formatVerschil(row.verschil)}</td>
                        <td className={`text-right p-2 font-medium ${getPercentageColor(row.percentageChange)}`}>
                          {formatPercentage(row.percentageChange)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Map */}
        <TabsContent value="map">
          <Card>
            <CardHeader>
              <CardTitle>% Verandering per Arrondissement</CardTitle>
            </CardHeader>
            <CardContent>
              <ArrondissementMap
                data={mapData}
                getGeoCode={(d) => d.arrondissementCode}
                getValue={(d) => d.value}
                formatValue={(v) => formatPercentage(v)}
                tooltipLabel="% Verandering"
                height={500}
                colorScheme={mapColorScheme}
                colorScaleMode={mapColorScaleMode}
                neutralFill={mapNeutralFill}
                showMunicipalityBoundaries={false}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
