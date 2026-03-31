import { useEffect, useMemo, useState } from "react"
import { getDataPathCandidates } from "./path-utils"

type JsonBundleState<T> = {
  data: T | null
  loading: boolean
  error: string | null
}

export function useJsonBundle<T extends Record<string, unknown>>(paths: Record<string, string>): JsonBundleState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cacheKey = useMemo(() => JSON.stringify(paths), [paths])

  useEffect(() => {
    let isMounted = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const parsedPaths = JSON.parse(cacheKey) as Record<string, string>
        const entries = await Promise.all(
          Object.entries(parsedPaths).map(async ([key, path]) => {
            const candidateUrls = getDataPathCandidates(path)
            const failures: string[] = []

            for (const url of candidateUrls) {
              try {
                const response = await fetch(url, { signal: controller.signal })
                if (!response.ok) {
                  failures.push(`${url} (${response.status})`)
                  continue
                }
                const json = await response.json()
                return [key, json] as const
              } catch (error) {
                if (error instanceof Error && error.name === "AbortError") {
                  throw error
                }
                const message = error instanceof Error ? error.message : "network error"
                failures.push(`${url} (${message})`)
              }
            }

            throw new Error(`Failed to load ${path}: ${failures.join(" | ")}`)
          })
        )

        if (!isMounted) return
        setData(Object.fromEntries(entries) as T)
        setLoading(false)
      } catch (err) {
        if (!isMounted) return
        if (err instanceof Error && err.name === "AbortError") {
          return
        }
        setError(err instanceof Error ? err.message : "Failed to load data")
        setLoading(false)
      }
    }

    load()

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [cacheKey])

  return { data, loading, error }
}
