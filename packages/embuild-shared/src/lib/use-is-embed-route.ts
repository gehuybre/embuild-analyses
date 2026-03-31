"use client"

import { usePathname } from "next/navigation"

export function useIsEmbedRoute() {
  const pathname = usePathname()

  if (!pathname) {
    return false
  }

  return pathname === "/embed" || pathname.startsWith("/embed/") || pathname.includes("/embed/")
}
