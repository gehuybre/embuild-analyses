"use client"

import { useMemo } from "react"
import type { ScaleQuantile } from "d3-scale"
import { cn } from "../../lib/utils"

interface MapLegendProps {
  /** D3 quantile color scale */
  scale: ScaleQuantile<string, never> | null
  /** Function to format values */
  formatValue?: (value: number) => string
  /** Label for the metric */
  label?: string
  /** Optional class name */
  className?: string
  /** Orientation */
  orientation?: "horizontal" | "vertical"
}

export function MapLegend({
  scale,
  formatValue = (v) => String(Math.round(v)),
  label,
  className,
  orientation = "horizontal",
}: MapLegendProps) {
  const legendData = useMemo(() => {
    if (!scale) return null

    const range = scale.range()
    const quantiles = scale.quantiles()

    // Build legend items with value ranges
    const items = range.map((color, i) => {
      const min = i === 0 ? scale.domain()[0] : quantiles[i - 1]
      const max = i === range.length - 1 ? scale.domain()[scale.domain().length - 1] : quantiles[i]
      return { color, min, max }
    })

    return items
  }, [scale])

  if (!legendData || legendData.length === 0) return null

  const minValue = legendData[0]?.min
  const maxValue = legendData[legendData.length - 1]?.max

  if (orientation === "vertical") {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        {label && (
          <span className="text-xs text-muted-foreground font-medium mb-1">
            {label}
          </span>
        )}
        <div className="flex flex-col gap-0.5">
          {legendData.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded-sm shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-muted-foreground">
                {formatValue(item.min)} - {formatValue(item.max)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Horizontal gradient style
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-xs text-muted-foreground font-medium">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums min-w-[40px] text-right">
          {minValue !== undefined ? formatValue(minValue) : ""}
        </span>
        <div className="flex h-3 rounded-sm overflow-hidden">
          {legendData.map((item, i) => (
            <div
              key={i}
              className="w-6 h-full"
              style={{ backgroundColor: item.color }}
              title={`${formatValue(item.min)} - ${formatValue(item.max)}`}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums min-w-[40px]">
          {maxValue !== undefined ? formatValue(maxValue) : ""}
        </span>
      </div>
    </div>
  )
}

// No data indicator component
export function NoDataIndicator({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="w-4 h-4 rounded-sm shrink-0"
        style={{ backgroundColor: "#f3f4f6" }}
      />
      <span className="text-xs text-muted-foreground">Geen data</span>
    </div>
  )
}
