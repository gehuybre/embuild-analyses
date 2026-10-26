"use client"

import type { ReactNode } from "react"
import { useIsEmbedRoute } from "../../lib/use-is-embed-route"

export function AnalysisOnly({ children }: { children: ReactNode }) {
  const isEmbedRoute = useIsEmbedRoute()
  return isEmbedRoute ? null : <>{children}</>
}
