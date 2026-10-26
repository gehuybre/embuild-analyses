const assert = require("node:assert/strict")
const { readFileSync, existsSync } = require("node:fs")
const { createRequire } = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

const root = path.resolve(__dirname, "..")
const shared = path.join(root, "packages/embuild-shared/src")
const app = path.join(root, "apps/gemeentelijke-investeringen/versions/2026-10")
const appRequire = createRequire(path.join(app, "package.json"))
const ts = appRequire("typescript")
const React = appRequire("react")
const { renderToStaticMarkup } = appRequire("react-dom/server")
let pathname = "/"
const cache = new Map()
const passthrough = ({ children }) => React.createElement("div", null, children)
const TabContext = React.createContext("chart")
const tabs = {
  Tabs: ({ value, children }) => React.createElement(TabContext.Provider, { value }, children),
  TabsContent: ({ value, children }) => React.useContext(TabContext) === value
    ? React.createElement("div", null, children) : null,
  TabsList: passthrough,
  TabsTrigger: passthrough,
}

function load(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const exports = {}
  function localRequire(name) {
    if (name === "next/navigation") return { usePathname: () => pathname }
    if (name.endsWith("/components/ui/tabs")) return tabs
    if (name === "recharts" || name.includes("/components/ui/")) {
      return new Proxy({}, { get: () => passthrough })
    }
    if (name.endsWith("/ExportButtons")) return { ExportButtons: () => null }
    if (name.startsWith(".") || name.startsWith("@embuild/shared/") || name.startsWith("@/")) {
      const base = name.startsWith(".")
        ? path.resolve(path.dirname(filename), name)
        : name.startsWith("@/")
          ? path.join(app, "src", name.slice(2))
          : path.join(shared, name.slice("@embuild/shared/".length))
      if (base.endsWith(".json")) return appRequire(base)
      const resolved = [base + ".tsx", base + ".ts"].find(existsSync)
      assert.ok(resolved, `Cannot resolve ${name} from ${filename}`)
      return load(resolved)
    }
    return appRequire(name)
  }
  new Function("require", "exports", compiled)(localRequire, exports)
  cache.set(filename, exports)
  return exports
}

const { AnalysisOnly } = load(path.join(shared, "components/shared/AnalysisOnly.tsx"))
const { OctoberComparison, SECTIONS } = load(path.join(app, "src/components/OctoberDashboard.tsx"))
const { COMPARISON_SECTIONS } = load(path.join(app, "src/lib/sections.ts"))
const { BreakdownSection } = load(path.join(app, "src/components/BreakdownSection.tsx"))
const { PlannedYearlySection } = load(path.join(app, "src/components/PlannedYearlySection.tsx"))
const embedConfig = readFileSync(path.join(shared, "lib/embed-config.ts"), "utf8")

test("explanations are excluded on embed routes, including base paths", () => {
  for (const route of ["/embed", "/embed/example/", "/analyses/example/embed/example/chart/"]) {
    pathname = route
    assert.equal(renderToStaticMarkup(React.createElement(AnalysisOnly, null, "Uitleg")), "")
  }
})

test("explanations remain unchanged on analysis routes", () => {
  for (const route of [null, "/", "/analyses/gemeentelijke-investeringen-2026-10/"]) {
    pathname = route
    assert.equal(renderToStaticMarkup(React.createElement(AnalysisOnly, null, "Uitleg")), "Uitleg")
  }
})

for (const section of COMPARISON_SECTIONS) {
  for (const viewType of ["chart", "table"]) {
    test(`${section} ${viewType}: compact embed retains the visualization and source`, () => {
      pathname = `/analyses/gemeentelijke-investeringen-2026-10/embed/gemeentelijke-investeringen-2026-10/${section}/`
      const html = renderToStaticMarkup(React.createElement(OctoberComparison, { section, viewType }))
      assert.match(html, /<h2/)
      if (viewType === "chart") {
        assert.match(html, /Bouwinvesteringen \(in miljarden euro\)/)
        assert.match(html, /Kleuren per planperiode/)
        assert.doesNotMatch(html, /<table/)
      } else {
        assert.match(html, /<table/)
        assert.match(html, /Boekjaar/)
      }
      assert.match(html, /ABB BBC-DR/)
      assert.match(html, /Jaartotalen en definities/)
      assert.doesNotMatch(html, /Per boekjaar het meest recente|Geplande bouwinvesteringen volgens/)
      assert.doesNotMatch(html, /Let op:|Heel Vlaanderen;|Overlappende planjaren/)
      assert.doesNotMatch(html, /dezelfde verticale schaal|Broncontrole en SHA-256|Ontbrekende waarden zijn geen/)
      assert.equal((html.match(/<tr/g) || []).length, viewType === "table" ? 19 : 0)

      pathname = "/analyses/gemeentelijke-investeringen-2026-10/"
      const analysis = renderToStaticMarkup(React.createElement(OctoberComparison, { section, viewType }))
      assert.match(analysis, /Heel Vlaanderen;/)
      assert.match(analysis, /Broncontrole en SHA-256/)
      assert.match(analysis, /Ontbrekende waarden zijn geen nulbedragen/)
      assert.match(analysis, section === "investments-yearly-actual"
        ? /Per boekjaar het meest recente/
        : /Geplande bouwinvesteringen volgens/)
    })
  }
}

test("every October section is registered as an embed", () => {
  for (const section of SECTIONS) assert.match(embedConfig, new RegExp(`"${section}": \\{`))
})

const geoSections = [
  ["investments-bv-breakdown", BreakdownSection, { kind: "bv" }, /Bouwinvesteringen per beleidsdomein, opgeteld/],
  ["investments-rek-breakdown", BreakdownSection, { kind: "rek" }, /De negen algemene rekeningen/],
  ["investments-planned-2026-2031", PlannedYearlySection, { viewType: "chart" }, /Geplande bouwinvesteringen volgens het meest recente|volledige rekeninggroep/],
]
for (const [section, Component, props, narrative] of geoSections) {
  test(`${section}: compact embed keeps title and source without explanation`, () => {
    pathname = `/analyses/gemeentelijke-investeringen-2026-10/embed/gemeentelijke-investeringen-2026-10/${section}/`
    const html = renderToStaticMarkup(React.createElement(Component, props))
    assert.match(html, /<h2/)
    assert.match(html, /ABB BBC-DR/)
    assert.doesNotMatch(html, narrative)

    pathname = "/analyses/gemeentelijke-investeringen-2026-10/"
    assert.match(renderToStaticMarkup(React.createElement(Component, props)), narrative)
  })
}

test("all historical embed components explicitly separate narrative from the visualization", () => {
  const components = [
    "InvesteringenEmbed", "InvesteringenBVIndexedSection", "InvesteringenBVDifferenceSection",
    "InvesteringenBVCategorySection", "InvesteringenREKCategorySection",
    "InvesteringenBVScatterSection", "InvesteringenREKScatterSection",
  ]
  for (const version of ["2026-02", "2026-05", "2026-09"]) {
    for (const component of components) {
      const filename = path.join(root, "apps/gemeentelijke-investeringen/versions",
        version, "src/components", component + ".tsx")
      const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"),
        ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      let explanations = 0
      function visit(node, inExplanation = false, inHeader = false) {
        if (ts.isJsxElement(node)) {
          const tag = node.openingElement.tagName.getText(source)
          inExplanation ||= tag === "AnalysisOnly"
          inHeader ||= tag === "CardHeader"
          if (tag === "AnalysisOnly") explanations++
          if (tag === "p" && inHeader) {
            assert.ok(inExplanation, `${version}/${component}: header explanation is present in embeds`)
          }
        }
        ts.forEachChild(node, child => visit(child, inExplanation, inHeader))
      }
      visit(source)
      assert.ok(explanations > 0, `${version}/${component}: missing narrative boundary`)
    }
  }
})
