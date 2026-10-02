import { getBasePath } from "@embuild/shared/lib/path-utils"
import { getEmbedConfig } from "@embuild/shared/lib/embed-config"
import { SLUG, toQuery } from "./url-state"
import type { State, Tab } from "./types"

export function embedUrl(st: State, section: Tab): string {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const q = toQuery(st, { section })
  return `${origin}${getBasePath()}/embed/${SLUG}/${section}/${q ? `?${q}` : ""}`
}

/** Zelfde iframe en resize-script als ExportButtons, zodat embeds op elke host gelijk werken. */
export function embedCode(st: State, section: Tab, title: string): string {
  const cfg = getEmbedConfig(SLUG, section)
  const height = cfg?.height ?? 650
  return `<iframe
  src="${embedUrl(st, section)}"
  data-data-blog-embed="true"
  width="100%"
  height="${height}"
  style="border: 0;"
  title="${title.replace(/"/g, "&quot;")}"
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
}
