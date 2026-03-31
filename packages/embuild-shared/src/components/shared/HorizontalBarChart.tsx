import { cn } from "../../lib/utils"

interface HorizontalBarItem {
  label: string
  value: number
  highlight?: boolean
  ranking?: number
}

interface HorizontalBarChartProps {
  items: HorizontalBarItem[]
  maxValue: number
  showPercentages?: boolean
  showRanking?: boolean
  highlightClassName?: string
  highlightBarClassName?: string
}

/**
 * Reusable horizontal bar chart component with optional percentages and rankings
 *
 * @param items - Array of items to display, each with label, value, and optional highlight flag
 * @param maxValue - Maximum value for scaling bar widths (should be > 0)
 * @param showPercentages - If true, displays percentages next to values
 * @param showRanking - If true, displays ranking numbers before labels
 * @param highlightClassName - Custom class for highlighted items (default: "text-primary bg-primary/5")
 * @param highlightBarClassName - Custom class for highlighted bar color (default: "bg-primary")
 */
export function HorizontalBarChart({
  items,
  maxValue,
  showPercentages = false,
  showRanking = false,
  highlightClassName,
  highlightBarClassName,
}: HorizontalBarChartProps) {
  const total = showPercentages ? items.reduce((sum, item) => sum + item.value, 0) : 0

  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const widthPercent = showPercentages && total > 0
          ? (item.value / total) * 100
          : (item.value / maxValue) * 100

        const percentageText = showPercentages && total > 0
          ? `${widthPercent.toFixed(1)}%`
          : null

        // Extract background and text color classes
        const getBackgroundClass = () => {
          if (!item.highlight) return ""
          if (highlightClassName) {
            const bgMatch = highlightClassName.match(/bg-[\w-/]+/)
            return bgMatch ? bgMatch[0] : "bg-primary/5"
          }
          return "bg-primary/5"
        }

        const getTextClass = () => {
          if (!item.highlight) return ""
          if (highlightClassName) {
            const textMatch = highlightClassName.match(/text-[\w-/]+/)
            return textMatch ? textMatch[0] : "text-primary"
          }
          return "text-primary"
        }

        const barColorClass = item.highlight
          ? (highlightBarClassName || "bg-primary")
          : "bg-muted-foreground/30"

        return (
          <div
            key={item.label}
            className={cn(
              "py-2",
              item.highlight && getBackgroundClass(),
              item.highlight && "-mx-4 px-4 rounded"
            )}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {showRanking && (
                  <span className="w-6 text-muted-foreground text-sm">
                    {item.ranking ?? index + 1}.
                  </span>
                )}
                <span className={cn("font-medium text-sm", item.highlight && getTextClass())}>
                  {item.label}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-bold min-w-[60px] text-right">
                  {item.value.toLocaleString("nl-BE")}
                </span>
                {percentageText && (
                  <span className="text-muted-foreground min-w-[50px] text-right">
                    ({percentageText})
                  </span>
                )}
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full", barColorClass)}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
