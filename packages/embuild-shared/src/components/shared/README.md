# Shared Analysis Components

Herbruikbare componenten voor data visualisatie in analyses.

## Charts

### FilterableChart

Modulaire Recharts wrapper met ondersteuning voor meerdere chart types.

**Props:**
- `chartType?: 'composed' | 'line' | 'bar' | 'area'` - Chart type (default: 'composed')
- `data: TData[]` - Data array
- `getLabel?: (d: TData) => string` - Label extractor
- `getValue?: (d: TData, metric?: string) => number` - Value extractor
- `showMovingAverage?: boolean` - Show 4-period moving average (default: true, only for single metric)
- `series?: Array<{key, label?, color?}>` - Multi-series configuration
- `highlightSeriesKey?: string | null` - Highlight specific series
- `yAxisLabel?: string` - Y-axis label
- `yAxisFormatter?: (value: number) => string` - Custom Y-axis formatter
- `isCurrency?: boolean` - Use € symbol in auto-formatter (default: false)

**Voorbeelden:**

```typescript
// Single metric with moving average (default)
<FilterableChart
  data={quarterlyData}
  getLabel={(d) => `${d.y} Q${d.q}`}
  getValue={(d) => d.permits}
/>

// Line chart zonder moving average
<FilterableChart
  data={yearlyData}
  chartType="line"
  showMovingAverage={false}
  getLabel={(d) => String(d.year)}
  getValue={(d) => d.total}
/>

// Area chart met currency formatting
<FilterableChart
  data={salesData}
  chartType="area"
  isCurrency={true}
  getLabel={(d) => d.month}
  getValue={(d) => d.revenue}
/>

// Multi-series comparison
<FilterableChart
  data={comparisonData}
  series={[
    { key: 'vlaanderen', label: 'Vlaanderen' },
    { key: 'brussel', label: 'Brussel' },
    { key: 'wallonie', label: 'Wallonië' }
  ]}
  highlightSeriesKey={selectedRegion}
  chartType="line"
/>
```

### FilterableTable

Sorteerbare data tabel met filtering.

## Geographic Components

### MunicipalityMap

Choropleth kaart die alleen gemeentegrenzen toont (581 Belgische gemeenten).

**Props:**
- `data: TData[]` - Data array
- `getGeoCode: (d: TData) => string` - Extract municipality NIS code
- `getValue: (d: TData) => number` - Extract value for coloring
- `showProvinceBoundaries?: boolean` - Show province overlay (default: false)

### GeoContext & GeoFilter

React Context voor geografische filtering (regio/provincie/gemeente).

**Gebruik:**
```typescript
import { GeoProvider, useGeo } from "./GeoContext"
import { GeoFilter } from "./GeoFilter"

function Dashboard() {
  return (
    <GeoProvider>
      <GeoFilter />
      {/* Components die useGeo() gebruiken */}
    </GeoProvider>
  )
}
```

## Section Wrappers

### AnalysisSection

Wrapper met tabs (Grafiek/Tabel/Kaart), geo-filters en export buttons.

**Props:**
- `title: string` - Section title
- `slug: string` - Analysis slug (voor embed URL)
- `sectionId: string` - Section ID (voor embed URL)
- `data: TData[]` - Data array
- `children: (filteredData, geoLevel) => ReactNode` - Render prop

### TimeSeriesSection

Wrapper voor time series zonder geografische filtering.

**Props:**
- `title: string`
- `slug: string`
- `sectionId: string`
- `tabs?: Array<{value, label}>` - Optional tabs
- `children: ReactNode`

## Utilities

### ExportButtons

CSV download en embed code generatie.

**Props:**
- `slug: string`
- `sectionId: string`
- `data: any[]`
- `filename: string`

## Styling

Alle componenten gebruiken:
- **Theme:** `@/lib/chart-theme` voor kleuren en styling
- **Colors:** `var(--color-chart-1)` t/m `var(--color-chart-5)`
- **UI:** shadcn/ui components uit `@/components/ui`
