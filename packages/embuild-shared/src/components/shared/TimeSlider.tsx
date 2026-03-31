"use client"

import { useEffect, useCallback } from "react"
import { Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "../ui/button"
import { cn } from "../../lib/utils"

interface TimeSliderProps {
  /** Available periods to animate through */
  periods: { value: number | string; label: string }[]
  /** Currently selected period */
  currentPeriod: number | string
  /** Callback when period changes */
  onPeriodChange: (period: number | string) => void
  /** Whether animation is playing */
  isPlaying: boolean
  /** Callback to toggle play/pause */
  onPlayPause: () => void
  /** Animation speed in milliseconds per frame (default: 1000) */
  speed?: number
  /** Optional callback to reset to first period */
  onReset?: () => void
  /** Optional class name */
  className?: string
}

export function TimeSlider({
  periods,
  currentPeriod,
  onPeriodChange,
  isPlaying,
  onPlayPause,
  speed = 1000,
  onReset,
  className,
}: TimeSliderProps) {
  const currentIndex = periods.findIndex((p) => p.value === currentPeriod)

  // Animation effect
  useEffect(() => {
    if (!isPlaying || periods.length === 0) return

    const timer = setTimeout(() => {
      const nextIndex = (currentIndex + 1) % periods.length
      onPeriodChange(periods[nextIndex].value)
    }, speed)

    return () => clearTimeout(timer)
  }, [isPlaying, currentIndex, periods, onPeriodChange, speed])

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const index = parseInt(e.target.value, 10)
      if (periods[index]) {
        onPeriodChange(periods[index].value)
      }
    },
    [periods, onPeriodChange]
  )

  const handleReset = useCallback(() => {
    if (onReset) {
      onReset()
    } else if (periods.length > 0) {
      onPeriodChange(periods[0].value)
    }
  }, [onReset, periods, onPeriodChange])

  if (periods.length === 0) return null

  const currentLabel = periods[currentIndex]?.label ?? String(currentPeriod)
  const firstLabel = periods[0]?.label ?? ""
  const lastLabel = periods[periods.length - 1]?.label ?? ""

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 bg-background/80 backdrop-blur-sm rounded-lg border",
        className
      )}
    >
      {/* Play/Pause button */}
      <Button
        variant="outline"
        size="icon"
        onClick={onPlayPause}
        className="h-8 w-8 shrink-0"
        aria-label={isPlaying ? "Pauzeer animatie" : "Start animatie"}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      {/* Reset button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleReset}
        className="h-8 w-8 shrink-0"
        aria-label="Reset naar begin"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>

      {/* Current period label */}
      <span className="font-medium min-w-[60px] text-center tabular-nums">
        {currentLabel}
      </span>

      {/* Slider */}
      <div className="flex-1 flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {firstLabel}
        </span>
        <input
          type="range"
          min={0}
          max={periods.length - 1}
          value={currentIndex >= 0 ? currentIndex : 0}
          onChange={handleSliderChange}
          className="flex-1 h-2 bg-muted rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-primary
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:h-4
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-primary
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:cursor-pointer"
          aria-label="Selecteer periode"
        />
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {lastLabel}
        </span>
      </div>

      {/* Progress indicator */}
      <span className="text-xs text-muted-foreground tabular-nums">
        {currentIndex + 1}/{periods.length}
      </span>
    </div>
  )
}
