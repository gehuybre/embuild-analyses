"use client"

import { ReactNode, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@embuild/shared/lib/utils"

interface DeferredSectionProps {
  children: ReactNode
  label: string
  minHeightClassName?: string
  rootMargin?: string
}

export function DeferredSection({
  children,
  label,
  minHeightClassName = "min-h-[240px]",
  rootMargin = "600px",
}: DeferredSectionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    if (shouldRender || !containerRef.current) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [rootMargin, shouldRender])

  return (
    <div ref={containerRef}>
      {shouldRender ? (
        children
      ) : (
        <div
          className={cn(
            "rounded-xl border bg-card px-6 text-sm text-muted-foreground",
            "flex items-center justify-center",
            minHeightClassName
          )}
        >
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{label}</span>
          </div>
        </div>
      )}
    </div>
  )
}
