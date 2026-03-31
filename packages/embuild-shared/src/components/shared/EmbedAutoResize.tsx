"use client"

import { useEffect } from "react"

const RESIZE_MESSAGE_TYPE = "data-blog-embed:resize"

function getDocumentHeight(): number {
  const doc = document.documentElement
  const body = document.body
  return Math.max(
    doc?.scrollHeight ?? 0,
    doc?.offsetHeight ?? 0,
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0
  )
}

export function EmbedAutoResize() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.parent === window) return

    let rafId: number | null = null

    const sendHeight = () => {
      rafId = null
      const height = getDocumentHeight()
      if (!Number.isFinite(height) || height <= 0) return
      window.parent.postMessage(
        { type: RESIZE_MESSAGE_TYPE, height: Math.ceil(height) },
        "*"
      )
    }

    const schedule = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(sendHeight)
    }

    schedule()
    window.addEventListener("resize", schedule)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(schedule)
      resizeObserver.observe(document.documentElement)
    }

    const mutationObserver = new MutationObserver(schedule)
    mutationObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    })

    return () => {
      window.removeEventListener("resize", schedule)
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
      if (rafId !== null) window.cancelAnimationFrame(rafId)
    }
  }, [])

  return null
}

