export interface NbbRentePoint {
  period: string
  sortValue: number
  rate: number
}

export interface NbbRenteMetadata {
  sourceProvider: string
  sourceTitle: string
  sourceUrl: string
  sourcePublicationDate: string
  latestPeriod: string
  latestRate: number
  minRate: number
  maxRate: number
  observationCount: number
  fetchedAt: string
  responseSha256: string
  series: {
    frequency: string
    item: string
    sector: string
    instrument: string
    maturity: string
    quartile: string
    factor: string
  }
}

export interface InflationForecastAnnualPoint {
  year: number
  cpiIndex: number
  cpiGrowthRate: number
  healthIndex: number
  healthGrowthRate: number
}

export interface InflationForecastMonthlyPoint {
  period: string
  sortValue: number
  cpiIndex: number | null
  cpiGrowthRate: number | null
  healthIndex: number | null
  healthGrowthRate: number | null
  smoothedHealthIndex: number | null
  pivotalIndex: number | null
}

export interface InflationForecast {
  sheetName: string
  forecastMonth: string
  forecastSortValue: number
  forecastYear: number
  forecastMonthNumber: number
  forecastLabel: string
  sourcePublicationDate: string
  title: string
  cpiIndexLabel: string
  healthIndexLabel: string
  monthlyPoints: InflationForecastMonthlyPoint[]
  annualPoints: InflationForecastAnnualPoint[]
}

export interface InflationForecastMetadata {
  sourceProvider: string
  sourceTitle: string
  sourceUrl: string
  sourceDownloadUrl: string
  workbookLastModified: string | null
  latestForecastMonth: string
  latestForecastLabel: string
  latestSourcePublicationDate: string
  forecastCount: number
  comparableBaseIndexLabel: string
  comparableForecastMonths: string[]
  comparableForecastLabels: string[]
  comparableForecastCount: number
  comparisonPeriodStart: string | null
  comparisonPeriodEnd: string | null
  fetchedAt: string
  responseSha256: string
}
