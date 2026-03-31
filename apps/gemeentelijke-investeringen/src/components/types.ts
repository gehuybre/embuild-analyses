export interface InvestmentByDomain {
  year: number
  municipality: string
  domain_code: string
  domain_name: string
  subdomain_code: string | null
  subdomain_name: string | null
  value: number
  metric: 'total' | 'per_capita'
}

export interface InvestmentByCategory {
  year: number
  municipality: string
  category: string | null
  category_l1: string | null
  value: number
  metric: 'total' | 'per_capita'
}

export interface Lookups {
  domains: Array<{
    domain_code: string
    domain_name: string
  }>
  subdomeinen: Array<{
    subdomein_code: string
    subdomein_name: string
  }>
  municipalities: Array<{
    municipality: string
    nis_code: string | null
  }>
}

export interface Metadata {
  total_municipalities: number
  bv_latest_year: number
  bv_earliest_year: number
  total_domains: number
  total_subdomeinen: number
  total_records: number
  municipalities_with_nis: number
  is_kostenpost_truncated: boolean
}
