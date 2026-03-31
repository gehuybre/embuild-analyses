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
