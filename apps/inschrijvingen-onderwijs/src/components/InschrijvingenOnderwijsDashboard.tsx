"use client"

import { useMemo, useState } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { ExportButtons } from "@embuild/shared/components/shared/ExportButtons"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { MapSection } from "@embuild/shared/components/shared/MapSection"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@embuild/shared/components/ui/tabs"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import {
  buildBouwStudiegebiedenSeries,
  buildInstellingSeries,
  buildTotalsSeries,
  formatInteger,
  normalizeProvinceName,
  BOUW_STUDIEGEBIEDEN,
  type InschrijvingenLookups,
  type LatestByOpleiding,
  type LatestByStudiegebied,
  type YearlyByInstellingProvince,
  type YearlyByInstellingVlaanderen,
  type YearlyByStudiegebiedVlaanderen,
  type YearlyTotalMunicipality,
  type YearlyTotalProvince,
  type YearlyTotalVlaanderen,
} from "./types"

type SectionView = "chart" | "table"
type TotalSectionView = "chart" | "table" | "map"

type Bundle = {
  lookups: InschrijvingenLookups
  yearlyTotalsVlaanderen: YearlyTotalVlaanderen[]
  yearlyTotalsProvinces: YearlyTotalProvince[]
  yearlyTotalsMunicipalities: YearlyTotalMunicipality[]
  yearlyByInstellingVlaanderen: YearlyByInstellingVlaanderen[]
  yearlyByInstellingProvinces: YearlyByInstellingProvince[]
  yearlyByStudiegebiedVlaanderen: YearlyByStudiegebiedVlaanderen[]
  latestByOpleidingVlaanderen: LatestByOpleiding[]
  latestByStudiegebiedVlaanderen: LatestByStudiegebied[]
}

export function InschrijvingenOnderwijsDashboard() {
  const { data: bundle, loading, error } = useJsonBundle<Bundle>({
    lookups: "/data/lookups.json",
    yearlyTotalsVlaanderen: "/data/yearly_totals_vlaanderen.json",
    yearlyTotalsProvinces: "/data/yearly_totals_provinces.json",
    yearlyTotalsMunicipalities: "/data/yearly_totals_municipalities.json",
    yearlyByInstellingVlaanderen: "/data/yearly_by_instelling_vlaanderen.json",
    yearlyByInstellingProvinces: "/data/yearly_by_instelling_provinces.json",
    yearlyByStudiegebiedVlaanderen: "/data/yearly_by_studiegebied_vlaanderen.json",
    latestByOpleidingVlaanderen: "/data/latest_by_opleiding_vlaanderen.json",
    latestByStudiegebiedVlaanderen: "/data/latest_by_studiegebied_vlaanderen.json",
  })

  const [selectedProvince, setSelectedProvince] = useState<string | null>(null)

  if (loading) {
    return <div className="p-8 text-center">Data laden...</div>
  }

  if (error || !bundle) {
    const hint =
      error?.includes("404")
        ? "De data voor deze analyse staat nog niet live op de data-repo. Publiceer eerst de nieuwe JSON-bestanden in de `data` repo."
        : null
    return (
      <div className="p-8 text-center text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
        {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-3 rounded-md border p-4">
        <label htmlFor="province-filter" className="text-sm font-medium">
          Provinciefilter:
        </label>
        <select
          id="province-filter"
          className="h-9 rounded-md border px-3 text-sm"
          value={selectedProvince ?? ""}
          onChange={(event) => {
            const value = event.target.value
            setSelectedProvince(value || null)
          }}
        >
          <option value="">Vlaanderen (totaal)</option>
          {bundle.lookups.provinces.map((province) => (
            <option key={province.code} value={province.code}>
              {normalizeProvinceName(province.name)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Filter geldt voor totalen en type onderwijsinstelling.
        </p>
      </div>

      <TotaleInschrijvingenSection
        lookups={bundle.lookups}
        yearlyTotalsVlaanderen={bundle.yearlyTotalsVlaanderen}
        yearlyTotalsProvinces={bundle.yearlyTotalsProvinces}
        yearlyTotalsMunicipalities={bundle.yearlyTotalsMunicipalities}
        selectedProvince={selectedProvince}
      />

      <TypeOnderwijsinstellingSection
        yearlyByInstellingVlaanderen={bundle.yearlyByInstellingVlaanderen}
        yearlyByInstellingProvinces={bundle.yearlyByInstellingProvinces}
        selectedProvince={selectedProvince}
      />

      <BouwStudiegebiedenSection
        yearlyByStudiegebiedVlaanderen={bundle.yearlyByStudiegebiedVlaanderen}
      />

      <OpleidingenSection
        latestYear={bundle.lookups.latest_year}
        data={bundle.latestByOpleidingVlaanderen}
      />

      <StudiegebiedenSection
        latestYear={bundle.lookups.latest_year}
        data={bundle.latestByStudiegebiedVlaanderen}
      />
    </div>
  )
}

function BouwStudiegebiedenSection({
  yearlyByStudiegebiedVlaanderen,
}: {
  yearlyByStudiegebiedVlaanderen: YearlyByStudiegebiedVlaanderen[]
}) {
  const [viewType, setViewType] = useState<SectionView>("chart")
  const serie = useMemo(
    () => buildBouwStudiegebiedenSeries(yearlyByStudiegebiedVlaanderen),
    [yearlyByStudiegebiedVlaanderen]
  )

  const exportData = serie.map((row) => ({
    label: String(row.year),
    value: row.totaal_bouw,
    periodCells: [
      row.year,
      formatInteger(row.architectuur),
      formatInteger(row.industriele_wetenschappen_en_technologie),
      formatInteger(row.toegepaste_wetenschappen),
      formatInteger(row.totaal_bouw),
    ],
  }))

  const tableData = serie.map((row) => ({
    sortValue: row.year,
    periodCells: [
      row.year,
      formatInteger(row.architectuur),
      formatInteger(row.industriele_wetenschappen_en_technologie),
      formatInteger(row.toegepaste_wetenschappen),
      formatInteger(row.totaal_bouw),
    ],
    value: row.totaal_bouw,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Bouwgerelateerde studiegebieden (Vlaanderen)</h2>
        <ExportButtons
          data={exportData}
          title="Bouwgerelateerde studiegebieden"
          slug="inschrijvingen-onderwijs"
          sectionId="bouw-studiegebieden"
          viewType={viewType}
          periodHeaders={[
            "Jaar",
            "Architectuur",
            "Industriële wetenschappen en technologie",
            "Toegepaste wetenschappen",
            "Totaal bouwgerelateerd",
          ]}
          valueLabel="Totaal bouwgerelateerd"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Selectie studiegebieden: {BOUW_STUDIEGEBIEDEN.join(", ")}.
      </p>

      <Tabs value={viewType} onValueChange={(value) => setViewType(value as SectionView)}>
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          <FilterableChart
            data={serie.map((row) => ({ ...row, sortValue: row.year }))}
            chartType="line"
            getLabel={(row) => String(row.year)}
            series={[
              { key: "architectuur", label: "Architectuur", color: CHART_SERIES_COLORS[0] },
              {
                key: "industriele_wetenschappen_en_technologie",
                label: "Industriële wetenschappen en technologie",
                color: CHART_SERIES_COLORS[1],
              },
              {
                key: "toegepaste_wetenschappen",
                label: "Toegepaste wetenschappen",
                color: CHART_SERIES_COLORS[2],
              },
              { key: "totaal_bouw", label: "Totaal bouwgerelateerd", color: CHART_SERIES_COLORS[3] },
            ]}
            yAxisLabelAbove="Aantal inschrijvingen"
            showMovingAverage={false}
          />
        </TabsContent>

        <TabsContent value="table">
          <FilterableTable
            data={tableData}
            periodHeaders={[
              "Jaar",
              "Architectuur",
              "Industriële wetenschappen en technologie",
              "Toegepaste wetenschappen",
              "Totaal bouwgerelateerd",
            ]}
            label="Totaal bouwgerelateerd"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TotaleInschrijvingenSection({
  lookups,
  yearlyTotalsVlaanderen,
  yearlyTotalsProvinces,
  yearlyTotalsMunicipalities,
  selectedProvince,
}: {
  lookups: InschrijvingenLookups
  yearlyTotalsVlaanderen: YearlyTotalVlaanderen[]
  yearlyTotalsProvinces: YearlyTotalProvince[]
  yearlyTotalsMunicipalities: YearlyTotalMunicipality[]
  selectedProvince: string | null
}) {
  const [viewType, setViewType] = useState<TotalSectionView>("chart")

  const totalsSeries = useMemo(
    () => buildTotalsSeries(yearlyTotalsVlaanderen, yearlyTotalsProvinces, selectedProvince),
    [yearlyTotalsVlaanderen, yearlyTotalsProvinces, selectedProvince]
  )

  const mapSeries = useMemo(() => {
    if (!selectedProvince) {
      return yearlyTotalsMunicipalities
    }
    return yearlyTotalsMunicipalities.filter((row) => row.province_code === selectedProvince)
  }, [yearlyTotalsMunicipalities, selectedProvince])

  const selectedProvinceName = useMemo(() => {
    if (!selectedProvince) return "Vlaanderen"
    const province = lookups.provinces.find((item) => item.code === selectedProvince)
    return province ? normalizeProvinceName(province.name) : selectedProvince
  }, [lookups.provinces, selectedProvince])

  const exportData = totalsSeries.map((row) => ({
    label: String(row.year),
    value: row.value,
    periodCells: [row.year, formatInteger(row.value)],
  }))

  const chartData = totalsSeries.map((row) => ({
    year: row.year,
    value: row.value,
    sortValue: row.year,
  }))

  const tableData = totalsSeries.map((row) => ({
    sortValue: row.year,
    periodCells: [row.year, formatInteger(row.value)],
    value: row.value,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">
          Totale inschrijvingen ({selectedProvinceName})
        </h2>
        <ExportButtons
          data={exportData}
          title={`Totale inschrijvingen ${selectedProvinceName}`}
          slug="inschrijvingen-onderwijs"
          sectionId="totale-inschrijvingen"
          viewType={viewType}
          periodHeaders={["Jaar", "Inschrijvingen"]}
          valueLabel="Inschrijvingen"
          embedParams={{ province: selectedProvince }}
        />
      </div>

      <Tabs value={viewType} onValueChange={(value) => setViewType(value as TotalSectionView)}>
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
          <TabsTrigger value="map">Kaart</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="space-y-4">
          <FilterableChart
            data={chartData}
            chartType="line"
            getLabel={(row) => String(row.year)}
            getValue={(row) => row.value}
            yAxisLabelAbove="Aantal inschrijvingen"
            showMovingAverage={false}
          />
        </TabsContent>

        <TabsContent value="table">
          <FilterableTable
            data={tableData}
            periodHeaders={["Jaar", "Inschrijvingen"]}
            label="Inschrijvingen"
          />
        </TabsContent>

        <TabsContent value="map" className="space-y-4">
          <MapSection
            data={mapSeries}
            getGeoCode={(row) => row.municipality_code}
            getValue={(row) => row.value}
            getPeriod={(row) => row.year}
            periods={lookups.years}
            initialPeriod={lookups.latest_year}
            showTimeSlider={true}
            tooltipLabel="Inschrijvingen"
            showProvinceBoundaries={true}
            showSearch={true}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TypeOnderwijsinstellingSection({
  yearlyByInstellingVlaanderen,
  yearlyByInstellingProvinces,
  selectedProvince,
}: {
  yearlyByInstellingVlaanderen: YearlyByInstellingVlaanderen[]
  yearlyByInstellingProvinces: YearlyByInstellingProvince[]
  selectedProvince: string | null
}) {
  const [viewType, setViewType] = useState<SectionView>("chart")

  const instellingSourceRows = useMemo(() => {
    if (!selectedProvince) return yearlyByInstellingVlaanderen
    return yearlyByInstellingProvinces.filter((row) => row.province_code === selectedProvince)
  }, [selectedProvince, yearlyByInstellingVlaanderen, yearlyByInstellingProvinces])

  const instellingSeries = useMemo(
    () => buildInstellingSeries(instellingSourceRows),
    [instellingSourceRows]
  )

  const chartData = instellingSeries.map((row) => ({
    ...row,
    sortValue: row.year,
  }))

  const tableData = instellingSeries.map((row) => ({
    sortValue: row.year,
    periodCells: [
      row.year,
      formatInteger(row.universiteit),
      formatInteger(row.hogeschool),
      formatInteger(row.secundair_onderwijs),
      formatInteger(row.totaal),
    ],
    value: row.totaal,
  }))

  const exportData = instellingSeries.map((row) => ({
    label: String(row.year),
    value: row.totaal,
    periodCells: [
      row.year,
      formatInteger(row.universiteit),
      formatInteger(row.hogeschool),
      formatInteger(row.secundair_onderwijs),
      formatInteger(row.totaal),
    ],
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Verdeling naar type onderwijsinstelling</h2>
        <ExportButtons
          data={exportData}
          title="Verdeling naar type onderwijsinstelling"
          slug="inschrijvingen-onderwijs"
          sectionId="type-instelling"
          viewType={viewType}
          periodHeaders={["Jaar", "Universiteit", "Hogeschool", "Secundair onderwijs", "Totaal"]}
          valueLabel="Totaal"
          embedParams={{ province: selectedProvince }}
        />
      </div>

      <Tabs value={viewType} onValueChange={(value) => setViewType(value as SectionView)}>
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="space-y-4">
          <FilterableChart
            data={chartData}
            chartType="line"
            getLabel={(row) => String(row.year)}
            series={[
              { key: "universiteit", label: "Universiteit", color: CHART_SERIES_COLORS[0] },
              { key: "hogeschool", label: "Hogeschool", color: CHART_SERIES_COLORS[1] },
              { key: "secundair_onderwijs", label: "Secundair onderwijs", color: CHART_SERIES_COLORS[2] },
            ]}
            yAxisLabelAbove="Aantal inschrijvingen"
            showMovingAverage={false}
          />
        </TabsContent>

        <TabsContent value="table">
          <FilterableTable
            data={tableData}
            periodHeaders={["Jaar", "Universiteit", "Hogeschool", "Secundair onderwijs", "Totaal"]}
            label="Totaal"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function OpleidingenSection({
  latestYear,
  data,
}: {
  latestYear: number
  data: LatestByOpleiding[]
}) {
  const [viewType, setViewType] = useState<SectionView>("chart")

  const chartRows = data.slice(0, 12).map((row) => ({
    label: row.opleiding_name,
    value: row.value,
  }))

  const tableRows = data.map((row) => ({
    sortValue: row.value,
    periodCells: [row.opleiding_name, formatInteger(row.value)],
    value: row.value,
  }))

  const exportData = data.map((row) => ({
    label: row.opleiding_name,
    value: row.value,
    periodCells: [row.opleiding_name, formatInteger(row.value)],
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Top opleidingen ({latestYear})</h2>
        <ExportButtons
          data={exportData}
          title={`Top opleidingen ${latestYear}`}
          slug="inschrijvingen-onderwijs"
          sectionId="opleiding"
          viewType={viewType}
          periodHeaders={["Opleiding", "Inschrijvingen"]}
          valueLabel="Inschrijvingen"
        />
      </div>

      <Tabs value={viewType} onValueChange={(value) => setViewType(value as SectionView)}>
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          <FilterableChart
            data={chartRows}
            chartType="bar"
            layout="horizontal"
            getLabel={(row) => row.label}
            getValue={(row) => row.value}
            yAxisLabelAbove="Aantal inschrijvingen"
            showMovingAverage={false}
          />
        </TabsContent>

        <TabsContent value="table">
          <FilterableTable
            data={tableRows}
            periodHeaders={["Opleiding", "Inschrijvingen"]}
            label="Inschrijvingen"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StudiegebiedenSection({
  latestYear,
  data,
}: {
  latestYear: number
  data: LatestByStudiegebied[]
}) {
  const [viewType, setViewType] = useState<SectionView>("chart")

  const chartRows = data.slice(0, 15).map((row) => ({
    label: row.studiegebied_name,
    value: row.value,
  }))

  const tableRows = data.map((row) => ({
    sortValue: row.value,
    periodCells: [row.studiegebied_name, formatInteger(row.value)],
    value: row.value,
  }))

  const exportData = data.map((row) => ({
    label: row.studiegebied_name,
    value: row.value,
    periodCells: [row.studiegebied_name, formatInteger(row.value)],
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Top studiegebieden ({latestYear})</h2>
        <ExportButtons
          data={exportData}
          title={`Top studiegebieden ${latestYear}`}
          slug="inschrijvingen-onderwijs"
          sectionId="studiegebied"
          viewType={viewType}
          periodHeaders={["Studiegebied", "Inschrijvingen"]}
          valueLabel="Inschrijvingen"
        />
      </div>

      <Tabs value={viewType} onValueChange={(value) => setViewType(value as SectionView)}>
        <TabsList>
          <TabsTrigger value="chart">Grafiek</TabsTrigger>
          <TabsTrigger value="table">Tabel</TabsTrigger>
        </TabsList>

        <TabsContent value="chart">
          <FilterableChart
            data={chartRows}
            chartType="bar"
            layout="horizontal"
            getLabel={(row) => row.label}
            getValue={(row) => row.value}
            yAxisLabelAbove="Aantal inschrijvingen"
            showMovingAverage={false}
          />
        </TabsContent>

        <TabsContent value="table">
          <FilterableTable
            data={tableRows}
            periodHeaders={["Studiegebied", "Inschrijvingen"]}
            label="Inschrijvingen"
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
