/**
 * Type definitions for municipal investment projects
 */

export interface Project {
  municipality: string
  nis_code: string
  bd_code: string
  bd_short: string
  bd_long: string
  ap_code: string
  ap_short: string
  ap_long: string
  ac_code: string
  ac_short: string
  ac_long: string
  total_amount: number
  amount_per_capita: number
  yearly_amounts: {
    "2026": number
    "2027": number
    "2028": number
    "2029": number
    "2030": number
    "2031": number
  }
  yearly_per_capita: {
    "2026": number
    "2027": number
    "2028": number
    "2029": number
    "2030": number
    "2031": number
  }
  categories: string[]
}

export interface CategoryProjectPreview {
  ac_code: string
  ac_short: string
  ac_long?: string
  ap_code?: string
  ap_short?: string
  ap_long?: string
  bd_code?: string
  bd_short?: string
  bd_long?: string
  municipality: string
  nis_code: string
  total_amount: number
  amount_per_capita?: number
  yearly_amounts: Record<string, number>
  yearly_per_capita?: Record<string, number>
  categories?: string[]
}

export interface CategoryMetadata {
  id: string
  label: string
  project_count: number
  total_amount: number
  data_file?: string
  largest_projects: CategoryProjectPreview[]
}

export interface MunicipalityIndexEntry {
  nis_code: string
  municipality: string
  file: string
  project_count: number
  total_amount: number
}

export interface ProjectMetadata {
  total_projects: number
  total_amount: number
  municipalities: number
  chunks: number
  chunk_size: number
  category_top_projects_limit?: number
  categories: {
    [key: string]: CategoryMetadata
  }
}

export interface ProjectFilters {
  nis_code?: string
  categories?: string[]
  searchQuery?: string
}

export type SortOption = "amount-desc" | "amount-asc" | "municipality" | "category"
