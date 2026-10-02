"use client"

import { useEffect, useState } from "react"
import { getDataPath, withDeployVersion } from "@embuild/shared/lib/path-utils"

const cache = new Map<string, Promise<unknown>>()

export function loadJson<T>(file: string): Promise<T> {
  const url = withDeployVersion(getDataPath(`/data/${file}`))
  let p = cache.get(url)
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`)
      return r.json()
    })
    // bij een fout niet cachen, zodat een nieuwe poging mogelijk blijft
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p as Promise<T>
}

export interface JsonState<T> {
  data: T | null
  error: string | null
}

/** Laadt een JSON-bestand uit public/data. `file = null` laadt niets (bv. KT-projecten bij LT). */
export function useJson<T>(file: string | null): JsonState<T> {
  const [state, setState] = useState<JsonState<T>>({ data: null, error: null })
  useEffect(() => {
    if (!file) {
      setState({ data: null, error: null })
      return
    }
    let alive = true
    loadJson<T>(file)
      .then((data) => alive && setState({ data, error: null }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message }))
    return () => {
      alive = false
    }
  }, [file])
  return state
}
