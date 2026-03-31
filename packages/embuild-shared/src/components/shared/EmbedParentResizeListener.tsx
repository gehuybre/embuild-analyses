"use client"

import { useEffect } from "react"

const RESIZE_MESSAGE_TYPE = "data-blog-embed:resize"

function isResizeMessage(data: unknown): data is { type: string; height: unknown } {
  return !!data && typeof data === "object" && "type" in data && "height" in data
}

export function EmbedParentResizeListener() {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isResizeMessage(event.data)) return
      if (event.data.type !== RESIZE_MESSAGE_TYPE) return

      const height = Number(event.data.height)
      if (!Number.isFinite(height) || height <= 0) return

      const iframes = Array.from(document.getElementsByTagName("iframe"))
      const iframe = iframes.find((el) => el.contentWindow === event.source)
      if (!iframe) return

      iframe.style.height = `${Math.ceil(height)}px`
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  return null
}

