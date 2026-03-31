"use client"

import { useEffect } from "react"
import { getLocalPublicPath } from "../../lib/path-utils"

const CURRENT_DEPLOY_VERSION = process.env.NEXT_PUBLIC_DEPLOY_VERSION || ""
const RELOAD_MARKER_KEY = "deploy-version-guard:last-reloaded"

type BuildVersionPayload = {
  version?: string
}

function getVersionUrlCandidates(): string[] {
  const rawUrl = new URL("/version.json", window.location.origin).toString()
  const basePathUrl = new URL(getLocalPublicPath("/version.json"), window.location.origin).toString()
  const prefersBasePath =
    window.location.hostname === "gehuybre.github.io" &&
    window.location.pathname.startsWith("/analyses")

  return prefersBasePath
    ? Array.from(new Set([basePathUrl, rawUrl]))
    : Array.from(new Set([rawUrl, basePathUrl]))
}

function buildReloadUrl(version: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set("v", version)
  return url.toString()
}

export function DeployVersionGuard() {
  useEffect(() => {
    if (!CURRENT_DEPLOY_VERSION || typeof window === "undefined") {
      return
    }

    let cancelled = false

    async function checkDeployVersion() {
      try {
        let latestVersion: string | null = null

        for (const candidate of getVersionUrlCandidates()) {
          const versionUrl = new URL(candidate)
          versionUrl.searchParams.set("_", Date.now().toString())

          const response = await fetch(versionUrl.toString(), {
            cache: "no-store",
          })

          if (!response.ok) {
            continue
          }

          const payload = (await response.json()) as BuildVersionPayload
          latestVersion = payload.version?.trim() || null
          if (latestVersion) {
            break
          }
        }

        if (!latestVersion || latestVersion === CURRENT_DEPLOY_VERSION || cancelled) {
          return
        }

        const lastReloadedVersion = window.sessionStorage.getItem(RELOAD_MARKER_KEY)
        if (lastReloadedVersion === latestVersion) {
          return
        }

        window.sessionStorage.setItem(RELOAD_MARKER_KEY, latestVersion)
        window.location.replace(buildReloadUrl(latestVersion))
      } catch {
        // Ignore version-check failures and keep the current page usable.
      }
    }

    checkDeployVersion()

    return () => {
      cancelled = true
    }
  }, [])

  return null
}
