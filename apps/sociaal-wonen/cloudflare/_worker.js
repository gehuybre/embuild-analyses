// Wachtwoordbeveiliging voor de standalone versie op Cloudflare Pages (HTTP Basic Auth).
//
// Dit bestand wordt door de deploy-workflow naast de statische bestanden gezet (Pages "advanced mode").
// Gebruikersnaam en wachtwoord staan NIET in de code. Stel ze in als secrets van het Pages-project:
//   Cloudflare dashboard > Workers & Pages > <project> > Settings > Variables and Secrets (Production)
//   BASIC_AUTH_USER     = gewenste gebruikersnaam
//   BASIC_AUTH_PASSWORD = gewenst wachtwoord
// Zijn ze niet ingesteld, dan blijft de site dicht (503) in plaats van open te staan.

const encoder = new TextEncoder()

// Vergelijking in constante tijd, zodat het wachtwoord niet via responstijd af te leiden is.
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all(
    [a, b].map(async (v) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(v)))),
  )
  let diff = 0
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i]
  return diff === 0
}

function parseBasic(header) {
  if (!header) return null
  const [scheme, encoded] = header.split(" ")
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    const sep = decoded.indexOf(":") // wachtwoord mag zelf dubbele punten bevatten
    if (sep < 0) return null
    return { user: decoded.slice(0, sep), password: decoded.slice(sep + 1) }
  } catch {
    return null
  }
}

export default {
  async fetch(request, env) {
    if (!env.BASIC_AUTH_USER || !env.BASIC_AUTH_PASSWORD) {
      return new Response("Beveiliging niet geconfigureerd.", { status: 503 })
    }

    const creds = parseBasic(request.headers.get("Authorization"))
    if (creds) {
      const [okUser, okPassword] = await Promise.all([
        safeEqual(creds.user, env.BASIC_AUTH_USER),
        safeEqual(creds.password, env.BASIC_AUTH_PASSWORD),
      ])
      if (okUser && okPassword) {
        // Toegestaan: geef de gevraagde statische pagina of het bestand terug.
        const response = await env.ASSETS.fetch(request)
        const headers = new Headers(response.headers)
        headers.set("Cache-Control", "private, no-store")
        headers.set("X-Robots-Tag", "noindex, nofollow")
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
      }
    }

    return new Response("Toegang vereist.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Sociale huurplanning", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    })
  },
}
