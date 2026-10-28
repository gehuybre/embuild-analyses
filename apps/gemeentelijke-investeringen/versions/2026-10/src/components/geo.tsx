"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import { getLocalPublicPath, withDeployVersion } from "@embuild/shared/lib/path-utils"
import { PROJECTS_PATH } from "@/lib/sections"

export const FLANDERS = "vlaanderen"
// Ten distinguishable colours, one per BV domain (0-9), shared by the domain charts.
export const DOMAIN_COLORS = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#7f7f7f",
]
export const CUBE_SOURCE = { latest: 0, actual: 1 } as const
export type CubeSource = keyof typeof CUBE_SOURCE

export interface GeoIndex {
  cube_sources: CubeSource[]
  domains: { label: string; name: string; project_category: string }[]
  subdomains: { label: string; name: string; domain: number }[]
  accounts: { label: string; group: string; project_account: string }[]
  scope: Record<string, string>
  provinces: Record<string, string>
  municipalities: { code: string; name: string; province: string }[]
}

type SeriesKey = "latest" | "original" | "actual"

export interface GeoData {
  code: string
  name: string
  type: "region" | "province" | "municipality"
  municipality_count: number
  population: Record<string, number>
  series: Record<SeriesKey, { amounts: Record<string, number>; municipalities: Record<string, number> }>
  /** Rows: [source index, book year, subdomain index, account index, euro]. */
  cube: [number, number, number, number, number][]
}

const cache = new Map<string, Promise<unknown>>()

function loadJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const request = fetch(withDeployVersion(getLocalPublicPath(path))).then((response) => {
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
      return response.json()
    })
    request.catch(() => cache.delete(path))
    cache.set(path, request)
  }
  return cache.get(path) as Promise<T>
}

export function useJson<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({
    path: null, data: null, error: null,
  })
  useEffect(() => {
    if (!path) return
    let cancelled = false
    loadJson<T>(path)
      .then((data) => { if (!cancelled) setState({ path, data, error: null }) })
      .catch((error: Error) => { if (!cancelled) setState({ path, data: null, error: error.message }) })
    return () => { cancelled = true }
  }, [path])
  return {
    data: state.path === path ? state.data : null,
    error: state.path === path ? state.error : null,
  }
}

export const useGeoIndex = () => useJson<GeoIndex>("/data/geo/index.json")

export function useGeoData(code: string) {
  return useJson<GeoData>(/^(vlaanderen|\d{5})$/.test(code) ? `/data/geo/${code}.json` : null)
}

export interface DomainSummary {
  source: "latest"
  municipalities: Record<string, { population: Record<string, number>; domains: Record<string, Record<string, number>> }>
}

export const useDomainSummary = () => useJson<DomainSummary>("/data/municipality_domain_year.json")

/** NIS codes of the municipalities inside a region, province or single municipality selection. */
export function geoMembers(index: GeoIndex, code: string) {
  if (code === FLANDERS) return index.municipalities.map((entry) => entry.code)
  if (index.provinces[code]) return index.municipalities.filter((entry) => entry.province === code).map((entry) => entry.code)
  return index.municipalities.some((entry) => entry.code === code) ? [code] : []
}

export function isMunicipality(index: GeoIndex | null, code: string) {
  return Boolean(index?.municipalities.some((municipality) => municipality.code === code))
}

export function geoName(index: GeoIndex | null, code: string) {
  if (code === FLANDERS) return "Vlaanderen"
  return index?.provinces[code]
    ?? index?.municipalities.find((municipality) => municipality.code === code)?.name
    ?? code
}

/** Sum of amount / population per book year, so multi-year periods stay comparable per inhabitant. */
/** Round axis step (1, 2, 2.5 or 5 × 10^n) giving at most five intervals. */
export function niceStep(largest: number) {
  if (largest <= 0) return 1
  const raw = largest / 5
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((step) => step >= raw)!
}

export function perInhabitant(amountsByYear: Map<number, number>, population: Record<string, number>) {
  let total = 0
  amountsByYear.forEach((amount, year) => {
    const inhabitants = population[String(year)]
    if (inhabitants) total += amount / inhabitants
  })
  return total
}

export function projectsLink({ nis, category, year, account }: {
  nis: string
  category?: string
  year?: number
  account?: string
}) {
  const params = new URLSearchParams({ gemeente: nis })
  if (category) params.set("categorie", category)
  if (year) params.set("jaar", String(year))
  if (account) params.set("rekening", account)
  return `${PROJECTS_PATH}?${params.toString()}`
}

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm"

export function GeoFilter({ index, value, onChange }: {
  index: GeoIndex
  value: string
  onChange: (code: string) => void
}) {
  const id = useId()
  const municipality = index.municipalities.find((entry) => entry.code === value)
  const province = municipality?.province ?? (index.provinces[value] ? value : "")
  const options = index.municipalities.filter((entry) => !province || entry.province === province)
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium" htmlFor={`${id}-province`}>
        Provincie
        <select
          id={`${id}-province`}
          className={selectClass}
          value={province}
          onChange={(event) => onChange(event.target.value || FLANDERS)}
        >
          <option value="">Heel Vlaanderen</option>
          {Object.entries(index.provinces).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium" htmlFor={`${id}-municipality`}>
        Gemeente
        <select
          id={`${id}-municipality`}
          className={selectClass}
          value={municipality?.code ?? ""}
          onChange={(event) => onChange(event.target.value || province || FLANDERS)}
        >
          <option value="">{province ? `Alle gemeenten in ${index.provinces[province]}` : "Alle gemeenten"}</option>
          {options.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
        </select>
      </label>
    </div>
  )
}

export function LabeledSelect({ label, value, onChange, children }: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <label className="flex flex-col gap-1 text-xs font-medium" htmlFor={id}>
      {label}
      <select id={id} className={`${selectClass} max-w-[22rem]`} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  )
}

export function ToggleGroup<T extends string | number>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-1 text-xs font-medium" role="group" aria-label={label}>
      {label}
      <div className="flex gap-1">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            disabled={option.disabled}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
              option.value === value ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
