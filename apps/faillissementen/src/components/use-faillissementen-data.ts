import { useJsonBundle } from "@embuild/shared/lib/use-json-bundle"

export type FaillissementenBundle = {
  monthlyConstruction: unknown[]
  monthlyTotals: unknown[]
  monthlyBySector: unknown[]
  monthlyBySectorProvince: unknown[]
  monthlyProvinces: unknown[]
  monthlyProvincesConstruction: unknown[]
  yearlyConstruction: unknown[]
  yearlyTotals: unknown[]
  yearlyBySector: unknown[]
  yearlyBySectorProvince: unknown[]
  yearlyByDuration: unknown[]
  yearlyByDurationConstruction: unknown[]
  yearlyByDurationProvince: unknown[]
  yearlyByDurationProvinceConstruction: unknown[]
  yearlyByDurationSector: unknown[]
  yearlyByWorkers: unknown[]
  yearlyByWorkersConstruction: unknown[]
  yearlyByWorkersProvince: unknown[]
  yearlyByWorkersProvinceConstruction: unknown[]
  yearlyByWorkersSector: unknown[]
  lookups: unknown
  metadata: unknown
  provincesConstruction: unknown[]
  provincesData: unknown[]
}

export function useFaillissementenData() {
  return useJsonBundle<FaillissementenBundle>({
    monthlyConstruction: "/data/monthly_construction.json",
    monthlyTotals: "/data/monthly_totals.json",
    monthlyBySector: "/data/monthly_by_sector.json",
    monthlyBySectorProvince: "/data/monthly_by_sector_province.json",
    monthlyProvinces: "/data/monthly_provinces.json",
    monthlyProvincesConstruction: "/data/monthly_provinces_construction.json",
    yearlyConstruction: "/data/yearly_construction.json",
    yearlyTotals: "/data/yearly_totals.json",
    yearlyBySector: "/data/yearly_by_sector.json",
    yearlyBySectorProvince: "/data/yearly_by_sector_province.json",
    yearlyByDuration: "/data/yearly_by_duration.json",
    yearlyByDurationConstruction: "/data/yearly_by_duration_construction.json",
    yearlyByDurationProvince: "/data/yearly_by_duration_province.json",
    yearlyByDurationProvinceConstruction: "/data/yearly_by_duration_province_construction.json",
    yearlyByDurationSector: "/data/yearly_by_duration_sector.json",
    yearlyByWorkers: "/data/yearly_by_workers.json",
    yearlyByWorkersConstruction: "/data/yearly_by_workers_construction.json",
    yearlyByWorkersProvince: "/data/yearly_by_workers_province.json",
    yearlyByWorkersProvinceConstruction: "/data/yearly_by_workers_province_construction.json",
    yearlyByWorkersSector: "/data/yearly_by_workers_sector.json",
    lookups: "/data/lookups.json",
    metadata: "/data/metadata.json",
    provincesConstruction: "/data/provinces_construction.json",
    provincesData: "/data/provinces.json",
  })
}
