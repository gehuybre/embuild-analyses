/**
 * Centralized theme configuration for charts and maps.
 * These values are synced with globals.css variables where possible,
 * but provided here as constants for libraries that don't easily support CSS variables (like Recharts/React Simple Maps in some cases).
 */

export { formatAxisNumber } from "./number-formatters"

export const CHART_COLORS = {
  // Core colors
  primary: "oklch(0.205 0 0)", // Corresponding to --primary
  secondary: "oklch(0.97 0 0)", // Corresponding to --secondary
  accent: "oklch(0.97 0 0)", // Corresponding to --accent
  
  // Chart specific ramps (Tailwind 4 / Shadcn style)
  chart1: "oklch(0.646 0.222 41.116)",
  chart2: "oklch(0.6 0.118 184.704)",
  chart3: "oklch(0.398 0.07 227.392)",
  chart4: "oklch(0.828 0.189 84.429)",
  chart5: "oklch(0.769 0.188 70.08)",
  
  // Traditional values for libraries that prefer them or for quick reuse
  // (Mapped from the chart palette to keep colors consistent)
  bars: "var(--color-chart-1)", // Default fallback, but we'll try to use variables
  lines: "var(--color-chart-2)", 
}

export const CHART_SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

export function getChartSeriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length]
}

export const MAP_COLOR_SCHEMES = {
  blue: ["#e6f2ff", "#b3d9ff", "#66b3ff", "#0077cc", "#004c99"],
  orange: ["#fff5eb", "#fed7aa", "#fdba74", "#f97316", "#c2410c"],
  orangeDecile: [
    "#fff5eb",
    "#fee6ce",
    "#fdd0a2",
    "#fdae6b",
    "#fd8d3c",
    "#f16913",
    "#d94801",
    "#a63603",
    "#7f2704",
    "#5c1a00",
  ],
  green: ["#ecfdf5", "#a7f3d0", "#6ee7b7", "#10b981", "#065f46"],
  purple: ["#f3e8ff", "#d8b4fe", "#c084fc", "#a855f7", "#7e22ce"],
  red: ["#fef2f2", "#fecaca", "#f87171", "#ef4444", "#b91c1c"],
}

export const CHART_THEME = {
  fontSize: 12,
  fontFamily: "var(--font-sans)",
  gridStroke: "#e5e7eb",
  tooltip: {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    borderRadius: "0.5rem",
    border: "1px solid var(--border)",
  },
  margin: { top: 10, right: 30, left: 0, bottom: 0 },
}

export const TABLE_THEME = {
  spacing: "p-4",
  headerBg: "bg-muted/50",
  fontSize: "text-sm",
}
