"use client"

import { getDataPathCandidates, withDeployVersion } from "./path-utils"

const jsonCache = new Map<string, Promise<unknown>>()
const resolvedUrlCache = new Map<string, string>()

function getCandidateUrls(path: string): string[] {
  const cachedUrl = resolvedUrlCache.get(path)
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const candidateUrls = getDataPathCandidates(path).map(withDeployVersion)
  const versionedNormalizedPath = withDeployVersion(normalizedPath)
  const orderedCandidateUrls = [
    versionedNormalizedPath,
    ...candidateUrls.filter((url) => url !== versionedNormalizedPath),
  ]

  if (!cachedUrl) {
    return orderedCandidateUrls
  }

  return [cachedUrl, ...orderedCandidateUrls.filter((url) => url !== cachedUrl)]
}

async function loadBouwprojectenJson<T>(path: string): Promise<T> {
  const failures: string[] = []

  for (const url of getCandidateUrls(path)) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        failures.push(`${url} (${response.status})`)
        continue
      }

      resolvedUrlCache.set(path, url)
      return response.json() as Promise<T>
    } catch (error) {
      const message = error instanceof Error ? error.message : "network error"
      failures.push(`${url} (${message})`)
    }
  }

  throw new Error(`Failed to load ${path}: ${failures.join(" | ")}`)
}

export async function fetchBouwprojectenJson<T>(path: string): Promise<T> {
  let promise = jsonCache.get(path)
  if (!promise) {
    promise = loadBouwprojectenJson<T>(path)
      .catch((error) => {
        jsonCache.delete(path)
        throw error
      })

    jsonCache.set(path, promise)
  }

  return promise as Promise<T>
}
