"use client"

import { useCallback, useState } from "react"
import type { ReactNode } from "react"
import { Check, Code, Copy } from "lucide-react"
import { Button } from "@embuild/shared/components/ui/button"
import { FullscreenEmbedButton } from "@embuild/shared/components/shared/FullscreenEmbedButton"
import { Popover, PopoverContent, PopoverTrigger } from "@embuild/shared/components/ui/popover"
import { getBasePath } from "@embuild/shared/lib/path-utils"
import { GIP_SLUG, type BudgetKey, type GipTab, type GipVersion } from "./model"

export function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function tabLabel(tab: GipTab) {
  if (tab === "overview") return "Wat veranderde"
  if (tab === "map") return "Projectkaart"
  if (tab === "projects") return "Projectlijst"
  if (tab === "reconciliation") return "Wat veranderde (details)"
  return "Grote projecten"
}

export function gipEmbedUrl(
  section: GipTab,
  selectedVersion: GipVersion,
  selectedProgram: string,
  selectedBudgetKey: BudgetKey
) {
  const baseUrl = typeof window !== "undefined"
    ? window.location.origin + getBasePath()
    : ""
  const params = new URLSearchParams()
  params.set("version", selectedVersion)
  params.set("program", selectedProgram)
  params.set("budget", selectedBudgetKey)
  return `${baseUrl}/embed/${GIP_SLUG}/${section}/?${params.toString()}`
}

export function GipEmbedButton({
  section,
  selectedVersion,
  selectedProgram,
  selectedBudgetKey,
}: {
  section: GipTab
  selectedVersion: GipVersion
  selectedProgram: string
  selectedBudgetKey: BudgetKey
}) {
  const [copied, setCopied] = useState(false)

  const getEmbedUrl = useCallback(
    () => gipEmbedUrl(section, selectedVersion, selectedProgram, selectedBudgetKey),
    [section, selectedBudgetKey, selectedProgram, selectedVersion]
  )

  const getEmbedCode = useCallback(() => {
    const title = `GIP-projecten - ${tabLabel(section)}`
    const embedUrl = getEmbedUrl()
    const height = section === "map" ? 920 : section === "reconciliation" ? 920 : section === "projects" ? 760 : 680

    return `<iframe
  src="${embedUrl}"
  data-data-blog-embed="true"
  width="100%"
  height="${height}"
  style="border: 0;"
  title="${escapeHtmlAttribute(title)}"
  loading="lazy"
></iframe>
<script>
(function () {
  if (window.__DATA_BLOG_EMBED_RESIZER__) return;
  window.__DATA_BLOG_EMBED_RESIZER__ = true;

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "data-blog-embed:resize") return;
    var height = Number(data.height);
    if (!isFinite(height) || height <= 0) return;

    var iframes = document.querySelectorAll('iframe[data-data-blog-embed="true"]');
    for (var i = 0; i < iframes.length; i++) {
      var iframe = iframes[i];
      if (iframe.contentWindow === event.source) {
        var previousScrollY = window.scrollY || window.pageYOffset || 0;
        var previousTop = iframe.getBoundingClientRect().top;
        iframe.style.height = Math.ceil(height) + "px";
        var nextTop = iframe.getBoundingClientRect().top;
        var scrollDelta = nextTop - previousTop;
        if (Math.abs(scrollDelta) > 1) {
          window.scrollTo(0, previousScrollY + scrollDelta);
        }
        return;
      }
    }
  });
})();
</script>`
  }, [section, getEmbedUrl])

  const copyEmbedCode = useCallback(async () => {
    const code = getEmbedCode()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textArea = document.createElement("textarea")
      textArea.value = code
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [getEmbedCode])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title="Embed code" className="shrink-0 gap-2">
          <Code className="h-4 w-4" />
          <span className="hidden sm:inline">Embed</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-3">
          <div className="font-medium text-sm">Embed deze visualisatie</div>
          <p className="text-xs text-muted-foreground">
            Kopieer de onderstaande code om deze sectie in je website te integreren.
          </p>
          <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre-wrap break-all">
            {getEmbedCode()}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={copyEmbedCode}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Gekopieerd!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Kopieer code
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
