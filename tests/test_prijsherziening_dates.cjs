const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { createRequire } = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

const app = path.resolve(__dirname, "../apps/prijsherziening-index-i-2021")
const appRequire = createRequire(path.join(app, "package.json"))
const ts = appRequire("typescript")
const source = readFileSync(path.join(app, "src/lib/price-revision.ts"), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const helpers = { exports: {} }
new Function("exports", compiled)(helpers.exports)
const {
  findLaborIndex, findMaterialIndex, laborEnd, calculateRevision, previousMaterialMonth,
  excelRound, liveMaterialSeries, findMaterialObservation,
  buildLaborChart, calendarDate, daysInMonth, LABOR_SIZES, LABOR_CATEGORIES,
} = helpers.exports
const labor = JSON.parse(readFileSync(path.join(app, "public/data/labor_indices.json"), "utf8"))
const material = JSON.parse(readFileSync(path.join(app, "public/data/monthly_indices.json"), "utf8"))
const rows = labor.filter(row => row.employer_size === "<10 werklieden" && row.category === "D")

test("S uses the tender effective date, while s uses the wage effective date", () => {
  assert.equal(findLaborIndex(rows, "2026-07-10", true).effective_date, "2026-04-01")
  assert.equal(findLaborIndex(rows, "2026-07-11", true).effective_date, "2026-07-01")
  assert.equal(findLaborIndex(rows, "2026-07-01", false).effective_date, "2026-07-01")
  assert.equal(findLaborIndex(rows, "2026-06-30", false).effective_date, "2026-04-01")
  assert.equal(laborEnd(findLaborIndex(rows, "2026-07-10", true), true), "2026-07-10")
})

test("arbitrary days select the exact I-2021 month without falling back", () => {
  assert.equal(findMaterialIndex(material, "2026-07-19").value, 152.95)
  assert.equal(findMaterialIndex(material, "2099-10-21"), undefined)
  assert.equal(findMaterialIndex(material, "2019-01-01"), undefined)
  assert.equal(findMaterialIndex(material, ""), undefined)
})

test("no wage value is extended beyond its documented validity", () => {
  assert.equal(findLaborIndex(rows, "", false), undefined)
  assert.equal(findLaborIndex(rows, "2000-01-01", true), undefined)
  assert.equal(findLaborIndex(rows, "2027-01-01", false), undefined)
  assert.equal(findLaborIndex(rows, "2027-01-10", true).effective_date, "2026-10-01")
  assert.equal(findLaborIndex(rows, "2027-01-11", true), undefined)
  assert.equal(findLaborIndex([{ ...rows[0], valid_until: null }], "2099-01-01", false), undefined)
})

test("all employer sizes and categories select the right series", () => {
  for (const size of ["<10 werklieden", "10-20 werklieden", ">20 werklieden"]) {
    for (const category of ["A", "B", "C", "D"]) {
      const series = labor.filter(row => row.category === category &&
        (row.employer_size === size || (size !== "<10 werklieden" && row.employer_size === ">=10 werklieden")))
      const selected = findLaborIndex(series, "2026-07-19", false)
      assert.equal(selected.employer_size, size)
      assert.equal(selected.category, category)
      assert.ok(selected.source_page > 0)
      if (size !== "<10 werklieden") {
        assert.equal(findLaborIndex(series, "2009-07-19", true).employer_size, ">=10 werklieden")
      }
    }
  }
})

test("date-based selection reproduces the expected price", () => {
  const S = findLaborIndex(rows, "2021-01-19", true)
  const s = findLaborIndex(rows, "2026-07-19", false)
  const I = findMaterialIndex(material, "2021-01-19")
  const i = findMaterialIndex(material, "2026-07-19")
  const price = 100000 * (0.4 * s.value / S.value + 0.4 * i.value / I.value + 0.2)
  assert.equal(Math.round(price * 100) / 100, 130315.21)
})

test("calculator material references use the previous month including leap and year boundaries", () => {
  for (const [date, expected] of [
    ["2026-01-01", "2025-12-01"],
    ["2026-06-30", "2026-05-01"],
    ["2024-03-31", "2024-02-01"],
    ["2024-02-29", "2024-01-01"],
    ["2025-02-29", ""],
    ["2026-13-01", ""],
    ["", ""],
  ]) assert.equal(previousMaterialMonth(date), expected)
})

test("documented tender periods from 11 January 2018 match the Excel ten-day offset without applying it twice", () => {
  const date = new Date("2018-01-11T00:00:00Z")
  for (; date <= new Date("2026-06-01T00:00:00Z"); date.setUTCDate(date.getUTCDate() + 1)) {
    const value = date.toISOString().slice(0, 10)
    const offset = new Date(date)
    offset.setUTCDate(offset.getUTCDate() - 10)
    const selected = findLaborIndex(rows, value, true)
    const excel = findLaborIndex(rows, offset.toISOString().slice(0, 10), false)
    assert.equal(selected?.value, excel?.value, value)
  }
})

const baseline = {
  price: 100000, laborShare: 0.4, materialShare: 0.4,
  initialLabor: 37.652, revisionLabor: 38.427,
  materials: [{ id: "Index I-2021", label: "I-2021", weight: 1, initial: 142.6, revision: 153.73 }],
}

test("standard formula reproduces the original Excel saved example including rounding", () => {
  const result = calculateRevision(baseline)
  assert.equal(result.ok, true)
  assert.equal(result.factor, 1.03945) // Revtool StandaardPrijsherzieningformule!F35
  assert.equal(result.revisedPrice, 103945) // F37
  assert.equal(result.difference, 3945)
  assert.ok(Math.abs(result.fixedShare - 0.2) < 1e-12)
})

test("private custom basket reproduces the Excel example using the public snapshot", () => {
  const snapshot = JSON.parse(readFileSync(path.join(app, "public/data/revtool_materials.json"), "utf8"))
  const initial = previousMaterialMonth("2025-06-01")
  const revision = previousMaterialMonth("2026-06-01")
  const basket = [["ow:117", 0.5], ["ow:130", 0.1], ["ow:462", 0.2], ["ow:102", 0.2]]
  const result = calculateRevision({
    ...baseline,
    materials: basket.map(([id, weight]) => {
      const series = snapshot.series.find(row => row.id === id)
      return {
        id, label: series.label, weight,
        initial: findMaterialObservation(series, initial)?.value,
        revision: findMaterialObservation(series, revision)?.value,
      }
    }),
  })
  assert.equal(result.ok, true)
  assert.equal(result.factor, 1.03348) // PrijsherzieningsformuleOpMaat 2!F93
  assert.equal(result.revisedPrice, 103348) // H95
  assert.equal(result.difference, 3348)
  const points = result.contributions.reduce((sum, row) => sum + row.percentagePoints, 0) + result.roundingPercentagePoints
  assert.ok(Math.abs(points - 100 * (result.factor - 1)) < 1e-12)
})

test("live series expose PPI and I-2021, not research cement or discontinued indices", () => {
  const series = liveMaterialSeries(material)
  assert.equal(series[0].id, "Index I-2021")
  assert.ok(series.some(row => row.id === "161"))
  assert.ok(!series.some(row => ["Cement", "Index I+"].includes(row.id)))
  assert.equal(findMaterialObservation(series[0], "2099-01-01"), undefined)
  assert.equal(findMaterialObservation(series[0], "2026-07-01").value, 152.95)
})

test("Excel rounding uses half-away-from-zero and supports small exponential values", () => {
  for (const [value, digits, expected] of [
    [1.005, 2, 1.01], [-1.005, 2, -1.01], [0.000005, 5, 0.00001],
    [-0.000005, 5, -0.00001], [1e-8, 5, 0], [1.234565, 5, 1.23457],
  ]) assert.equal(excelRound(value, digits), expected)
})

test("invalid shares, empty weights, duplicate series and missing indices never yield a price", () => {
  const cases = [
    { price: 0 }, { price: NaN }, { price: Infinity },
    { laborShare: -0.1 }, { materialShare: 1.1 },
    { laborShare: 0.7, materialShare: 0.4 },
    { initialLabor: 0 }, { revisionLabor: undefined }, { initialLabor: NaN },
    { materials: [] },
    { materials: [{ ...baseline.materials[0], weight: NaN }] },
    { materials: [{ ...baseline.materials[0], weight: -1 }] },
    { materials: [{ ...baseline.materials[0], weight: 0.99 }] },
    { materials: [{ ...baseline.materials[0], revision: undefined }] },
    { materials: [{ ...baseline.materials[0], initial: 0 }] },
    { materials: [{ ...baseline.materials[0], revision: NaN }] },
    { materials: [{ ...baseline.materials[0], weight: 0.5 }, { ...baseline.materials[0], weight: 0.5 }] },
  ]
  for (const changes of cases) {
    const result = calculateRevision({ ...baseline, ...changes })
    assert.equal(result.ok, false, JSON.stringify(changes))
    assert.ok(result.error.length > 0)
    assert.equal(result.revisedPrice, undefined)
  }
})

test("zero-weight components do not need published indices", () => {
  const result = calculateRevision({
    price: 100000, laborShare: 0, materialShare: 0,
    initialLabor: undefined, revisionLabor: undefined, materials: [],
  })
  assert.equal(result.ok, true)
  assert.equal(result.revisedPrice, 100000)
  assert.equal(result.fixedShare, 1)
  assert.equal(calculateRevision({ ...baseline, materials: [
    ...baseline.materials,
    { id: "unused", label: "Unused", weight: 0, initial: undefined, revision: undefined },
  ] }).ok, true)
})

test("price decreases, equal dates and fully variable contracts are supported", () => {
  const reduced = calculateRevision({
    ...baseline, laborShare: 0, materialShare: 1,
    materials: [{ id: "x", label: "X", weight: 1, initial: 100, revision: 90 }],
  })
  assert.equal(reduced.ok, true)
  assert.equal(reduced.revisedPrice, 90000)
  const unchanged = calculateRevision({
    ...baseline, revisionLabor: baseline.initialLabor,
    materials: [{ ...baseline.materials[0], revision: baseline.materials[0].initial }],
  })
  assert.equal(unchanged.ok, true)
  assert.equal(unchanged.factor, 1)
})

test("the public Excel example's zero manual fallback is rejected, not read as stable prices", () => {
  const result = calculateRevision({
    ...baseline, materialShare: 0.35,
    materials: [
      { id: "ow:103", label: "Porfierslag", weight: 1 / 7, initial: 104.41, revision: 107.99 },
      { id: "ow:222", label: "Manuele staalwaarde", weight: 5 / 7, initial: 0, revision: 0 },
      { id: "ow:464", label: "Cement", weight: 1 / 7, initial: 102.13, revision: 104.95 },
    ],
  })
  assert.equal(result.ok, false)
  assert.match(result.error, /Manuele staalwaarde/)
})

test("S chart default contains exactly the smaller-employer category A series at tender dates", () => {
  const chart = buildLaborChart(labor, ["<10 werklieden"], ["A"])
  assert.equal(chart.series.length, 1)
  assert.equal(chart.series[0].id, "size0catA")
  assert.ok(chart.series[0].rows.every(row => row.category === "A" && row.employer_size === "<10 werklieden"))
  const atJuly = chart.points.find(point => point.date === "2026-07-11")
  assert.equal(atJuly.size0catA, 38.897)
  const expected = findLaborIndex(chart.series[0].rows, "2026-07-10", true)
  assert.equal(chart.points.find(point => point.date === "2026-07-10").size0catA, expected.value)
  assert.equal(chart.points.at(-1).size0catA, null)
})

test("S chart combines all selected sizes and categories, with stable series identity and colors", () => {
  const chart = buildLaborChart(labor, LABOR_SIZES.map(size => size.value), LABOR_CATEGORIES.map(category => category.code))
  assert.equal(chart.series.length, 12)
  assert.equal(new Set(chart.series.map(item => item.id)).size, 12)
  for (const series of chart.series) {
    const [size, category] = series.id.match(/^size(\d)cat([A-D])$/).slice(1)
    const one = buildLaborChart(labor, [LABOR_SIZES[Number(size)].value], [category])
    assert.equal(one.series[0].id, series.id)
    assert.equal(one.series[0].colorIndex, series.colorIndex)
    assert.ok(one.series[0].rows.some(row => row.employer_size === LABOR_SIZES[Number(size)].value))
    if (size !== "0") assert.ok(one.series[0].rows.some(row => row.employer_size === ">=10 werklieden"))
  }
  assert.deepEqual(buildLaborChart(labor, [], ["A"]), { series: [], points: [] })
  assert.deepEqual(buildLaborChart(labor, ["<10 werklieden"], []), { series: [], points: [] })
})

test("S chart respects gaps and tender validity rather than interpolating or extrapolating", () => {
  const base = rows.find(row => row.effective_date === "2026-04-01")
  const fixture = [
    { ...base, effective_date: "2026-01-01", initial_effective_date: "2026-01-11", valid_until: "2026-01-31", value: 30 },
    { ...base, effective_date: "2026-03-01", initial_effective_date: "2026-03-11", valid_until: "2026-03-31", value: 32 },
    { ...base, regime: "older regime", value: 999 },
  ]
  const chart = buildLaborChart(fixture, ["<10 werklieden"], ["D"])
  assert.equal(chart.points.find(row => row.date === "2026-02-10").size0catD, 30)
  assert.equal(chart.points.find(row => row.date === "2026-02-11").size0catD, null)
  assert.equal(chart.points.find(row => row.date === "2026-03-11").size0catD, 32)
  assert.equal(chart.points.find(row => row.date === "2026-04-11").size0catD, null)
  assert.ok(!chart.points.some(row => row.size0catD === 999))
})

test("segmented date selection clamps month lengths and leap years without timezone shifts", () => {
  assert.equal(calendarDate("2024", "02", "29"), "2024-02-29")
  assert.equal(calendarDate("2025", "02", "29"), "2025-02-28")
  assert.equal(calendarDate("2026", "04", "31"), "2026-04-30")
  assert.equal(calendarDate("2010", "01", "01"), "2010-01-01")
  assert.equal(calendarDate("", "02", "29"), "")
  assert.equal(calendarDate("2024", "", "29"), "")
  assert.equal(calendarDate("2024", "02", ""), "")
  assert.equal(daysInMonth(2024, 2), 29)
  assert.equal(daysInMonth(2025, 2), 28)
})
