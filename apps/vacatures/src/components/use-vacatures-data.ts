import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

export type VacaturesMetadata = {
  source_provider: string
  source_title: string
  source_url: string
  generated_at: string
  records: number
  monthly_records: number
  received_monthly_occupation_records: number
  open_monthly_records: number
  source_files: string[]
  monthly_source_files: string[]
  received_monthly_occupation_source_files: string[]
  open_monthly_source_files: string[]
  min_period_end: string
  max_period_end: string
  latest_period_end: string
  latest_period_label: string
  latest_period_short: string
  latest_total: number
  latest_month_end: string | null
  latest_month_label: string | null
  latest_month_short: string | null
  latest_month_total: number | null
  latest_open_month_end: string | null
  latest_open_month_label: string | null
  latest_open_month_short: string | null
  latest_open_month_total: number | null
  previous_period_total: number | null
  previous_period_change_abs: number | null
  previous_period_change_pct: number | null
  latest_full_year: number
  latest_full_year_total: number
  previous_full_year: number | null
  previous_full_year_total: number | null
  full_year_change_abs: number | null
  full_year_change_pct: number | null
  data_availability_label: string
  raw_csv_path: string
}

export type TotalRow = {
  period_end: string
  period_year: number
  period_month: number
  period_label: string
  period_short: string
  vacatures: number
  source_file: string
  previous_period_vacatures: number | null
  change_abs: number | null
  change_pct: number | null
}

export type MonthlyTotalRow = {
  period_end: string
  period_year: number
  period_month: number
  period_label: string
  period_short: string
  vacatures: number
}

export type GroupRow = {
  rank: number
  period_end: string
  period_year: number
  period_month: number
  period_label: string
  period_short: string
  hoofdberoepsgroep: string
  vacatures: number
  share_pct: number
}

export type BeroepsgroepRow = GroupRow & {
  beroepsgroep: string
}

export type OccupationRow = BeroepsgroepRow & {
  beroep: string
  source_file: string
}

export type OccupationSeriesRow = {
  period_end: string
  period_year: number
  period_month: number
  period_label: string
  period_short: string
  beroep: string
  vacatures: number
}

export type OccupationOption = {
  beroep: string
  total_vacatures: number
  latest_vacatures: number
}

export type HierarchySeriesRow = {
  period_end: string
  period_year: number
  period_month: number
  period_label: string
  period_short: string
  hoofdberoepsgroep: string
  beroepsgroep: string
  beroep: string
  vacatures: number
}

export type HierarchyOption = {
  hoofdberoepsgroep: string
  beroepsgroep: string
  beroep: string
  total_vacatures: number
  latest_vacatures: number
}

export type VacaturesBundle = {
  metadata: VacaturesMetadata
  totals: TotalRow[]
  monthlyTotals: MonthlyTotalRow[]
  openMonthlyTotals: MonthlyTotalRow[]
  groupsLatest: GroupRow[]
  beroepsgroepenLatest: BeroepsgroepRow[]
  occupationsLatest: OccupationRow[]
  occupationSeries: OccupationSeriesRow[]
  occupationOptions: OccupationOption[]
  hierarchySeries: HierarchySeriesRow[]
  hierarchyOptions: HierarchyOption[]
  receivedMonthlyHierarchySeries: HierarchySeriesRow[]
  receivedHierarchyOptions: HierarchyOption[]
  openMonthlyHierarchySeries: HierarchySeriesRow[]
  openHierarchyOptions: HierarchyOption[]
}

export function useVacaturesData() {
  return useJsonBundle<VacaturesBundle>({
    metadata: "/data/metadata.json",
    totals: "/data/totals.json",
    monthlyTotals: "/data/monthly_totals.json",
    openMonthlyTotals: "/data/open_monthly_totals.json",
    groupsLatest: "/data/groups_latest.json",
    beroepsgroepenLatest: "/data/beroepsgroepen_latest.json",
    occupationsLatest: "/data/occupations_latest.json",
    occupationSeries: "/data/occupation_series.json",
    occupationOptions: "/data/occupation_options.json",
    hierarchySeries: "/data/hierarchy_series.json",
    hierarchyOptions: "/data/hierarchy_options.json",
    receivedMonthlyHierarchySeries: "/data/received_monthly_hierarchy_series.json",
    receivedHierarchyOptions: "/data/received_hierarchy_options.json",
    openMonthlyHierarchySeries: "/data/open_monthly_hierarchy_series.json",
    openHierarchyOptions: "/data/open_hierarchy_options.json",
  })
}
