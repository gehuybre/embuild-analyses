"use client"

import * as React from "react"
import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@embuild/shared/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@embuild/shared/components/ui/table"
import { MunicipalityMap } from "@embuild/shared/components/shared/MunicipalityMap"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { getDataPath } from "@embuild/shared/lib/path-utils"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"

type TimeSeriesData = {
  year: number
  bezette_oppervlakte: number
  totale_oppervlakte: number
  bezettingsgraad: number
  onbezette_oppervlakte: number
}

type GeoData = {
  nis_code: string
  gemeente: string
  bezette_oppervlakte: number
  totale_oppervlakte: number
  bezettingsgraad: number
  onbezette_oppervlakte: number
  year: number
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDecimal(n: number): string {
  return new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n)
}

export function BedrijventerreinenDashboard() {
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([])
  const [geoData, setGeoData] = useState<GeoData[]>([])
  const [loading, setLoading] = useState(true)

  // Load data on mount
  React.useEffect(() => {
    async function loadData() {
      try {
        const TIME_SERIES_PATH = getDataPath("/data/time_series.json")
        const GEO_DATA_PATH = getDataPath("/data/geographic_data.json")

        const [tsResponse, geoResponse] = await Promise.all([
          fetch(TIME_SERIES_PATH),
          fetch(GEO_DATA_PATH),
        ])

        if (!tsResponse.ok || !geoResponse.ok) {
          throw new Error(`HTTP error! status: ${tsResponse.status}, ${geoResponse.status}`)
        }

        const tsData = await tsResponse.json()
        const geoDataJson = await geoResponse.json()

        setTimeSeriesData(tsData)
        setGeoData(geoDataJson)
        setLoading(false)
      } catch (error) {
        console.error("Error loading data:", error)
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return <div className="p-8 text-center">Loading...</div>
  }

  return (
    <div className="space-y-8">
      {/* Time Series Section */}
      <TimeSeriesSection data={timeSeriesData} />

      {/* Geographic Section */}
      <GeographicSection data={geoData} />
    </div>
  )
}

function TimeSeriesSection({ data }: { data: TimeSeriesData[] }) {
  const [activeView, setActiveView] = useState<"chart" | "table">("chart")

  // Prepare export data
  const exportData = useMemo(() => {
    return data.map((d) => ({
      label: d.year.toString(),
      value: d.bezettingsgraad,
      periodCells: [
        d.year,
        formatDecimal(d.totale_oppervlakte),
        formatDecimal(d.bezette_oppervlakte),
        formatDecimal(d.onbezette_oppervlakte),
        formatDecimal(d.bezettingsgraad),
      ],
    }))
  }, [data])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Evolutie Vlaams Gewest (2014-2025)</h2>
        <ExportButtons
          data={exportData}
          title="Evolutie Vlaams Gewest"
          slug="bedrijventerreinen-vlaanderen"
          sectionId="evolutie"
          viewType={activeView}
          periodHeaders={["Jaar", "Totale oppervlakte (ha)", "Bezette oppervlakte (ha)", "Onbezette oppervlakte (ha)", "Bezettingsgraad (%)"]}
          valueLabel="Bezettingsgraad (%)"
        />
      </div>

      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "chart" | "table")}>
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bezettingsgraad (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis domain={[75, 90]} />
                  <Tooltip formatter={(value) => value ? `${formatDecimal(Number(value))}%` : "-"} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="bezettingsgraad"
                    name="Bezettingsgraad (%)"
                    stroke="var(--color-chart-1)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Oppervlaktes (ha)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip formatter={(value) => value ? formatNumber(Number(value)) : "-"} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="bezette_oppervlakte"
                    name="Bezette oppervlakte (ha)"
                    stackId="1"
                    stroke="var(--color-chart-2)"
                    fill="var(--color-chart-2)"
                  />
                  <Area
                    type="monotone"
                    dataKey="onbezette_oppervlakte"
                    name="Onbezette oppervlakte (ha)"
                    stackId="1"
                    stroke="var(--color-chart-3)"
                    fill="var(--color-chart-3)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table">
          <SimpleTable data={data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SimpleTable({ data }: { data: TimeSeriesData[] }) {
  const [sortKey, setSortKey] = useState<keyof TimeSeriesData>("year")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [data, sortKey, sortDirection])

  const handleSort = (key: keyof TimeSeriesData) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDirection("desc")
    }
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer" onClick={() => handleSort("year")}>
              Jaar {sortKey === "year" && (sortDirection === "asc" ? "↑" : "↓")}
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => handleSort("totale_oppervlakte")}>
              Totale oppervlakte (ha) {sortKey === "totale_oppervlakte" && (sortDirection === "asc" ? "↑" : "↓")}
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => handleSort("bezette_oppervlakte")}>
              Bezette oppervlakte (ha) {sortKey === "bezette_oppervlakte" && (sortDirection === "asc" ? "↑" : "↓")}
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => handleSort("onbezette_oppervlakte")}>
              Onbezette oppervlakte (ha) {sortKey === "onbezette_oppervlakte" && (sortDirection === "asc" ? "↑" : "↓")}
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => handleSort("bezettingsgraad")}>
              Bezettingsgraad (%) {sortKey === "bezettingsgraad" && (sortDirection === "asc" ? "↑" : "↓")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((d, i) => (
            <TableRow key={i}>
              <TableCell>{d.year}</TableCell>
              <TableCell className="text-right">{formatDecimal(d.totale_oppervlakte)}</TableCell>
              <TableCell className="text-right">{formatDecimal(d.bezette_oppervlakte)}</TableCell>
              <TableCell className="text-right">{formatDecimal(d.onbezette_oppervlakte)}</TableCell>
              <TableCell className="text-right">{formatDecimal(d.bezettingsgraad)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function GeographicSection({ data }: { data: GeoData[] }) {
  const [activeView, setActiveView] = useState<"chart" | "table" | "map">("map")

  // Sort data by bezettingsgraad for chart/table
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.bezettingsgraad - a.bezettingsgraad)
  }, [data])

  const topMunicipalities = useMemo(() => {
    return sortedData.slice(0, 20)
  }, [sortedData])

  // Prepare export data
  const exportData = useMemo(() => {
    return sortedData.map((d) => ({
      label: d.gemeente,
      value: d.bezettingsgraad,
      periodCells: [
        d.gemeente,
        formatDecimal(d.totale_oppervlakte),
        formatDecimal(d.bezette_oppervlakte),
        formatDecimal(d.onbezette_oppervlakte),
        formatDecimal(d.bezettingsgraad),
      ],
    }))
  }, [sortedData])

  const latestYear = data[0]?.year || 2025

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Bezettingsgraad per gemeente ({latestYear})</h2>
        <ExportButtons
          data={exportData}
          title={`Bezettingsgraad per gemeente (${latestYear})`}
          slug="bedrijventerreinen-vlaanderen"
          sectionId="gemeenten"
          viewType={activeView}
          periodHeaders={[
            "Gemeente",
            "Totale oppervlakte (ha)",
            "Bezette oppervlakte (ha)",
            "Onbezette oppervlakte (ha)",
            "Bezettingsgraad (%)",
          ]}
          valueLabel="Bezettingsgraad (%)"
        />
      </div>

      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "chart" | "table" | "map")}>
        <TabsList>
          <TabsTrigger value="map">Kaart</TabsTrigger>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <MunicipalityMap
            data={data}
            getGeoCode={(d) => d.nis_code}
            getValue={(d) => d.bezettingsgraad}
            showProvinceBoundaries={true}
            formatValue={(v) => `${formatDecimal(v)}%`}
            colorScheme="blue"
            height={600}
          />
        </TabsContent>

        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>Top 20 gemeenten met hoogste bezettingsgraad</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={topMunicipalities} layout="horizontal" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="category" dataKey="gemeente" angle={-45} textAnchor="end" height={150} />
                  <YAxis type="number" domain={[0, 100]} />
                  <Tooltip formatter={(value) => value ? `${formatDecimal(Number(value))}%` : "-"} />
                  <Bar dataKey="bezettingsgraad" fill="var(--color-chart-1)" name="Bezettingsgraad (%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table">
          <GeoTable data={sortedData} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function GeoTable({ data }: { data: GeoData[] }) {
  const [sortKey, setSortKey] = useState<keyof GeoData>("bezettingsgraad")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  const [showAll, setShowAll] = useState(false)

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [data, sortKey, sortDirection])

  const displayData = showAll ? sortedData : sortedData.slice(0, 20)

  const handleSort = (key: keyof GeoData) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDirection("desc")
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => handleSort("gemeente")}>
                Gemeente {sortKey === "gemeente" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("totale_oppervlakte")}>
                Totale oppervlakte (ha) {sortKey === "totale_oppervlakte" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("bezette_oppervlakte")}>
                Bezette oppervlakte (ha) {sortKey === "bezette_oppervlakte" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("onbezette_oppervlakte")}>
                Onbezette oppervlakte (ha) {sortKey === "onbezette_oppervlakte" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => handleSort("bezettingsgraad")}>
                Bezettingsgraad (%) {sortKey === "bezettingsgraad" && (sortDirection === "asc" ? "↑" : "↓")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayData.map((d, i) => (
              <TableRow key={i}>
                <TableCell>{d.gemeente}</TableCell>
                <TableCell className="text-right">{formatDecimal(d.totale_oppervlakte)}</TableCell>
                <TableCell className="text-right">{formatDecimal(d.bezette_oppervlakte)}</TableCell>
                <TableCell className="text-right">{formatDecimal(d.onbezette_oppervlakte)}</TableCell>
                <TableCell className="text-right">{formatDecimal(d.bezettingsgraad)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!showAll && data.length > 20 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setShowAll(true)}>
            <ChevronDown className="mr-2 h-4 w-4" />
            Toon alle {data.length} gemeenten
          </Button>
        </div>
      )}

      {showAll && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setShowAll(false)}>
            <ChevronUp className="mr-2 h-4 w-4" />
            Toon alleen top 20
          </Button>
        </div>
      )}
    </div>
  )
}
