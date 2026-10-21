const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { createRequire } = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

const app = path.resolve(__dirname, "../apps/prijsherziening-index-i-2021")
const appRequire = createRequire(path.join(app, "package.json"))
const ts = appRequire("typescript")
const source = readFileSync(path.join(app, "src/lib/price-revision.ts"), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const helpers = { exports: {} }
new Function("exports", compiled)(helpers.exports)
const { findLaborIndex, findMaterialIndex, laborEnd } = helpers.exports
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
