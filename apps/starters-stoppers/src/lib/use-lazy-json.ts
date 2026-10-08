import { useEffect, useState } from "react"
import { getDataPathCandidates } from "@embuild/shared/lib/path-utils"

type LazyJsonState<T> = { data: T | null; loading: boolean; error: string | null }

/** Laadt een (groot) JSON-bestand pas wanneer `enabled` waar wordt, en bewaart het daarna. */
export function useLazyJson<T>(path: string, enabled: boolean): LazyJsonState<T> {
  const [state, setState] = useState<LazyJsonState<T>>({ data: null, loading: false, error: null })

  useEffect(() => {
    if (!enabled || state.data) return
    const controller = new AbortController()
    setState((current) => ({ ...current, loading: true, error: null }))

    async function load() {
      const failures: string[] = []
      for (const url of getDataPathCandidates(path)) {
        try {
          const response = await fetch(url, { signal: controller.signal })
          if (!response.ok) {
            failures.push(`${url} (${response.status})`)
            continue
          }
          setState({ data: (await response.json()) as T, loading: false, error: null })
          return
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return
          failures.push(`${url} (${error instanceof Error ? error.message : "netwerkfout"})`)
        }
      }
      setState({ data: null, loading: false, error: `Kon ${path} niet laden: ${failures.join(" | ")}` })
    }

    void load()
    return () => controller.abort()
  }, [enabled, path, state.data])

  return state
}
