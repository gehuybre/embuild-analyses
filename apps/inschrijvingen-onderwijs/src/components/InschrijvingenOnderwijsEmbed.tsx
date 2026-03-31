"use client"

import { useMemo } from "react"
import { FilterableChart } from "@embuild/shared/components/shared/FilterableChart"
import { FilterableTable } from "@embuild/shared/components/shared/FilterableTable"
import { MapSection } from "@embuild/shared/components/shared/MapSection"
import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"
import { CHART_SERIES_COLORS } from "@embuild/shared/lib/chart-theme"
import type { ProvinceCode } from "@embuild/shared/lib/geo-utils"
import {
  buildBouwStudiegebiedenSeries,
  buildInstellingSeries,
  buildTotalsSeries,
  formatInteger,
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

type ViewType = "chart" | "table" | "map"

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

export type InschrijvingenOnderwijsSection =
  | "totale-inschrijvingen"
  | "type-instelling"
  | "bouw-studiegebieden"
  | "opleiding"
  | "studiegebied"

interface InschrijvingenOnderwijsEmbedProps {
  section: InschrijvingenOnderwijsSection
  viewType: ViewType
  province: ProvinceCode | null
}

export function InschrijvingenOnderwijsEmbed({
  section,
  viewType,
  province,
}: InschrijvingenOnderwijsEmbedProps) {
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

  if (loading) {
    return <div className="p-4">Data laden...</div>
  }

  if (error || !bundle) {
    const hint =
      error?.includes("404")
        ? "Data nog niet gepubliceerd op de data-repo."
        : null
    return (
      <div className="p-4 text-sm text-destructive">
        Fout bij het laden van data: {error ?? "Onbekende fout"}
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    )
  }

  if (section === "totale-inschrijvingen") {
    return (
      <TotaleInschrijvingenEmbed
        viewType={viewType}
        selectedProvince={province ?? null}
        lookups={bundle.lookups}
        yearlyTotalsVlaanderen={bundle.yearlyTotalsVlaanderen}
        yearlyTotalsProvinces={bundle.yearlyTotalsProvinces}
        yearlyTotalsMunicipalities={bundle.yearlyTotalsMunicipalities}
      />
    )
  }

  if (section === "type-instelling") {
    return (
      <TypeOnderwijsinstellingEmbed
        viewType={viewType === "map" ? "chart" : viewType}
        selectedProvince={province ?? null}
        yearlyByInstellingVlaanderen={bundle.yearlyByInstellingVlaanderen}
        yearlyByInstellingProvinces={bundle.yearlyByInstellingProvinces}
      />
    )
  }

  if (section === "bouw-studiegebieden") {
    return (
      <BouwStudiegebiedenEmbed
        viewType={viewType === "map" ? "chart" : viewType}
        data={bundle.yearlyByStudiegebiedVlaanderen}
      />
    )
  }

  if (section === "opleiding") {
    return (
      <RankingEmbed
        viewType={viewType === "map" ? "chart" : viewType}
        data={bundle.latestByOpleidingVlaanderen.map((row) => ({
          label: row.opleiding_name,
          value: row.value,
        }))}
        maxBars={12}
      />
    )
  }

  if (section === "studiegebied") {
    return (
      <RankingEmbed
        viewType={viewType === "map" ? "chart" : viewType}
        data={bundle.latestByStudiegebiedVlaanderen.map((row) => ({
          label: row.studiegebied_name,
          value: row.value,
        }))}
        maxBars={15}
      />
    )
  }

  return null
}

function BouwStudiegebiedenEmbed({
  viewType,
  data,
}: {
  viewType: "chart" | "table"
  data: YearlyByStudiegebiedVlaanderen[]
}) {
  const serie = useMemo(() => buildBouwStudiegebiedenSeries(data), [data])

  if (viewType === "table") {
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
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Selectie studiegebieden: {BOUW_STUDIEGEBIEDEN.join(", ")}.
      </p>
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
    </div>
  )
}

function TotaleInschrijvingenEmbed({
  viewType,
  selectedProvince,
  lookups,
  yearlyTotalsVlaanderen,
  yearlyTotalsProvinces,
  yearlyTotalsMunicipalities,
}: {
  viewType: ViewType
  selectedProvince: string | null
  lookups: InschrijvingenLookups
  yearlyTotalsVlaanderen: YearlyTotalVlaanderen[]
  yearlyTotalsProvinces: YearlyTotalProvince[]
  yearlyTotalsMunicipalities: YearlyTotalMunicipality[]
}) {
  const totalsSeries = useMemo(
    () => buildTotalsSeries(yearlyTotalsVlaanderen, yearlyTotalsProvinces, selectedProvince),
    [yearlyTotalsVlaanderen, yearlyTotalsProvinces, selectedProvince]
  )

  const mapSeries = useMemo(() => {
    if (!selectedProvince) return yearlyTotalsMunicipalities
    return yearlyTotalsMunicipalities.filter((row) => row.province_code === selectedProvince)
  }, [yearlyTotalsMunicipalities, selectedProvince])

  if (viewType === "map") {
    return (
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
        showSearch={false}
      />
    )
  }

  if (viewType === "table") {
    const tableData = totalsSeries.map((row) => ({
      sortValue: row.year,
      periodCells: [row.year, formatInteger(row.value)],
      value: row.value,
    }))
    return (
      <FilterableTable
        data={tableData}
        periodHeaders={["Jaar", "Inschrijvingen"]}
        label="Inschrijvingen"
      />
    )
  }

  return (
    <FilterableChart
      data={totalsSeries.map((row) => ({ ...row, sortValue: row.year }))}
      chartType="line"
      getLabel={(row) => String(row.year)}
      getValue={(row) => row.value}
      yAxisLabelAbove="Aantal inschrijvingen"
      showMovingAverage={false}
    />
  )
}

function TypeOnderwijsinstellingEmbed({
  viewType,
  selectedProvince,
  yearlyByInstellingVlaanderen,
  yearlyByInstellingProvinces,
}: {
  viewType: "chart" | "table"
  selectedProvince: string | null
  yearlyByInstellingVlaanderen: YearlyByInstellingVlaanderen[]
  yearlyByInstellingProvinces: YearlyByInstellingProvince[]
}) {
  const sourceRows = useMemo(() => {
    if (!selectedProvince) return yearlyByInstellingVlaanderen
    return yearlyByInstellingProvinces.filter((row) => row.province_code === selectedProvince)
  }, [selectedProvince, yearlyByInstellingVlaanderen, yearlyByInstellingProvinces])

  const instellingSeries = useMemo(() => buildInstellingSeries(sourceRows), [sourceRows])

  if (viewType === "table") {
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
    return (
      <FilterableTable
        data={tableData}
        periodHeaders={["Jaar", "Universiteit", "Hogeschool", "Secundair onderwijs", "Totaal"]}
        label="Totaal"
      />
    )
  }

  return (
    <FilterableChart
      data={instellingSeries.map((row) => ({ ...row, sortValue: row.year }))}
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
  )
}

function RankingEmbed({
  viewType,
  data,
  maxBars,
}: {
  viewType: "chart" | "table"
  data: Array<{ label: string; value: number }>
  maxBars: number
}) {
  if (viewType === "table") {
    const tableData = data.map((row) => ({
      sortValue: row.value,
      periodCells: [row.label, formatInteger(row.value)],
      value: row.value,
    }))
    return (
      <FilterableTable
        data={tableData}
        periodHeaders={["Categorie", "Inschrijvingen"]}
        label="Inschrijvingen"
      />
    )
  }

  return (
    <FilterableChart
      data={data.slice(0, maxBars)}
      chartType="bar"
      layout="horizontal"
      getLabel={(row) => row.label}
      getValue={(row) => row.value}
      yAxisLabelAbove="Aantal inschrijvingen"
      showMovingAverage={false}
    />
  )
}
