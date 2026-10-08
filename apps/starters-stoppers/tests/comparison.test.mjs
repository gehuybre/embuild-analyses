import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire, registerHooks } from "node:module"
import { fileURLToPath } from "node:url"
import test from "node:test"

const require = createRequire(new URL("../package.json", import.meta.url))
const ts = require("typescript")
const app = new URL("../", import.meta.url)
const shared = new URL("../../packages/embuild-shared/src/", app)

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return { url: new URL(`src/${specifier.slice(2)}.ts`, app).href, shortCircuit: true }
    if (specifier === "@embuild/shared/lib/geo-utils") return { url: new URL("lib/geo-utils.ts", shared).href, shortCircuit: true }
    if (context.parentURL?.endsWith(".ts") && specifier.startsWith("./") && !specifier.endsWith(".ts")) {
      return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText
      return { format: "module", source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

const { compareSelections, geoDimension, mergeComparisons, comparisonChartData, comparisonCells } = await import("../src/lib/comparison.ts")
const { normalizeGeos, geoFromParams, geoEmbedParams, aggregateAnnualRows, filterEnterpriseRows } = await import("../src/lib/selection.ts")
const { buildMigrationComparisonSeries, buildMigrationSeries, buildMigrationMatrix, normalizeMigrationRegions } = await import("../src/lib/migration.ts")
const { aggregateBankruptcies, bankruptcyRatePerThousand } = await import("../src/lib/bankruptcy.ts")
const point = (year, value) => ({ sortValue: year, label: String(year), periodCells: [year], value })
const json = (name) => JSON.parse(readFileSync(new URL(`public/data/${name}.json`, app), "utf8"))

test("overlapping geographies and all three regions survive filters and embed round trips", () => {
  const geos = ["2000", "3000", "20001", "23000"]
  assert.deepEqual(normalizeGeos([...geos, "2000"], true), geos)
  assert.deepEqual(normalizeGeos(geos), geos.slice(0, 3))
  assert.deepEqual(normalizeGeos(["2000", "3000", "4000"]), ["2000", "3000", "4000"])
  const params = geoEmbedParams(geos)
  assert.deepEqual(geoFromParams(params.region, params.province, params.arrondissement, true), geos)
  assert.deepEqual(normalizeMigrationRegions(["2000", "3000", "4000"]), ["2000", "3000", "4000"])
})

test("every geography, sector and worker-class combination is independent", () => {
  const data = compareSelections([
    geoDimension(["2000", "3000", "20001"]),
    { selected: ["F", "G"], options: [{ code: "F", label: "Bouw" }, { code: "G", label: "Handel" }] },
    { selected: ["00", "01"], options: [{ code: "00", label: "Zonder personeel" }, { code: "01", label: "Met personeel" }] },
  ], ([geos, sectors, classes]) => [point(2024, Number(geos[0]) + (sectors[0] === "F" ? 10 : 20) + Number(classes[0]))])
  assert.equal(data[0].comparisons.length, 12)
  assert.equal(data[0].comparisons[0].label, "Vlaanderen · Bouw · Zonder personeel")
  assert.equal(data[0].comparisons[0].value, 2010)
  assert.equal(data[0].comparisons[11].value, 20022)
})

test("empty and single selections preserve the existing series", () => {
  const original = [point(2024, 42)]
  assert.equal(compareSelections([geoDimension([])], () => original), original)
  assert.equal(compareSelections([geoDimension(["2000"])], () => original), original)
})

test("period union preserves zeros, missing data and provisional labels", () => {
  const data = mergeComparisons([
    { label: "Vlaanderen", points: [point(2020, 0), { ...point(2024, 10), provisional: true }] },
    { label: "Vlaams-Brabant", points: [point(2024, 5)] },
  ])
  assert.deepEqual(data[0].comparisons.map((item) => item.value), [0, null])
  assert.deepEqual(comparisonCells(data[0], String), ["0", "—"])
  assert.equal(comparisonChartData(data)[0].comparison1, null)
  assert.equal(data[1].label, "2024*")
})

test("annual counts match the source separately for Vlaanderen, Wallonie and Vlaams-Brabant", () => {
  const rows = [...json("vat_yearly_flows"), ...json("vat_yearly_flows_provinces")]
  const geos = ["2000", "3000", "20001"]
  const result = compareSelections([geoDimension(geos)], ([selection]) => aggregateAnnualRows(rows, "fr", selection, []))
  const year = result.find((point) => point.sortValue === 2024)
  assert.ok(year)
  for (let index = 0; index < geos.length; index++) {
    assert.equal(year.comparisons[index].value, rows.find((row) => row.y === 2024 && row.g === geos[index] && row.n1 === "ALL").fr)
  }
})

test("enterprise counts do not discard regional years missing in provincial data", () => {
  const rows = [...json("vat_enterprises_worker_class"), ...json("vat_enterprises_worker_class_provinces")]
  const data = compareSelections([geoDimension(["2000", "20001"])], ([geos]) => {
    const sums = new Map()
    for (const row of filterEnterpriseRows(rows, geos, [], [])) sums.set(row.y, (sums.get(row.y) ?? 0) + row.vat)
    return [...sums].map(([year, value]) => point(year, value))
  })
  const missing = data.find((point) => point.sortValue === 2022)
  if (missing) {
    assert.equal(missing.comparisons[1].value, null)
    assert.ok(missing.comparisons[0].value > 0)
  }
  assert.ok(data.some((point) => point.comparisons.every((item) => item.value > 0)))
})

test("migration comparisons include transfers between selected regions", () => {
  const data = json("vat_migration")
  const options = { regions: ["2000", "3000"], counterparts: [], dim: "tot", categories: [] }
  const comparison = buildMigrationComparisonSeries(data, options)
  const individual = ["2000", "3000"].map((region) => buildMigrationSeries(data, { ...options, regions: [region] }))
  comparison.forEach((point, index) => {
    assert.deepEqual(point.comparisons.map((item) => item.value), individual.flatMap((series) => [series[index].inflow, series[index].outflow]))
    assert.deepEqual(point.balanceComparisons.map((item) => item.value), individual.map((series) => series[index].net))
    assert.equal(point.tableComparisons.length, 6)
  })
})

test("migration counterparts and categories form separate combinations, excluding self-pairs", () => {
  const data = json("vat_migration")
  const categories = data.sectors.slice(0, 2).map((item) => item.code)
  const series = buildMigrationComparisonSeries(data, { regions: ["2000", "3000"], counterparts: ["2000", "4000"], dim: "nace", categories })
  assert.equal(series[0].balanceComparisons.length, 6)
  const matrix = buildMigrationMatrix(data, { dim: "nace", categories, year: data.latestYear })
  assert.equal(matrix.comparisons.length, 2)
  for (let index = 0; index < 2; index++) {
    assert.deepEqual(matrix.comparisons[index].matrix, buildMigrationMatrix(data, { dim: "nace", categories: [categories[index]], year: data.latestYear }))
  }
})

test("bankruptcy counts and ratios are calculated per selection, not from summed ratios", () => {
  const rows = json("bankruptcies_monthly")
  const lookups = json("bankruptcies_lookups")
  const geos = ["2000", "3000", "20001"]
  const result = compareSelections([geoDimension(geos)], ([selection]) => aggregateBankruptcies(rows, "n", "yearly", selection, [], lookups))
  const year = result.find((point) => point.sortValue === 2024)
  for (let index = 0; index < geos.length; index++) {
    assert.equal(year.comparisons[index].value, rows.filter((row) => row.y === 2024 && row.g === geos[index] && row.n1 === "ALL").reduce((sum, row) => sum + row.n, 0))
  }
  assert.equal(bankruptcyRatePerThousand([point(2024, 12)], [point(2024, 200)])[0].value, 60)
})
