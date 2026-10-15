// Wachtwoordbeveiliging voor de standalone versie op Cloudflare Pages (HTTP Basic Auth).
//
// Dit bestand wordt door de deploy-workflow naast de statische bestanden gezet (Pages "advanced mode").
// Gebruikersnaam en wachtwoord staan NIET in de code. Stel ze in als secrets van het Pages-project:
//   Cloudflare dashboard > Workers & Pages > <project> > Settings > Variables and Secrets (Production)
//   BASIC_AUTH_USER     = gewenste gebruikersnaam
//   BASIC_AUTH_PASSWORD = gewenst wachtwoord
//   BASIC_AUTH_SESSION_SECRET = willekeurige geheime sleutel van minstens 32 bytes
// Zonder gebruikersnaam of wachtwoord blijft de site dicht (503). Zonder sessiesleutel werkt alleen Basic Auth.

const encoder = new TextEncoder()
const SESSION_COOKIE = "sociaal_wonen_auth"
const SESSION_TTL_SECONDS = 8 * 60 * 60

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

function base64Url(bytes) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

async function signSession(expiresAt, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(expiresAt)))
  return `${expiresAt}.${base64Url(new Uint8Array(signature))}`
}

async function validSession(request, secret) {
  if (!secret || encoder.encode(secret).length < 32) return false
  const cookieHeader = request.headers.get("Cookie") ?? ""
  const cookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))
  const value = cookie?.slice(SESSION_COOKIE.length + 1)
  if (!value) return false

  const [expiryText, signature, ...extra] = value.split(".")
  const expiresAt = Number(expiryText)
  const now = Math.floor(Date.now() / 1000)
  if (extra.length || !signature || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + SESSION_TTL_SECONDS) {
    return false
  }
  return safeEqual(signature, (await signSession(expiresAt, secret)).split(".")[1])
}

function loginPage(message = "") {
  const messageHtml = message
    ? `<p class="message" role="alert">${message}</p>`
    : "<p>Voer de gebruikersnaam en het wachtwoord in die je hebt ontvangen.</p>"

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aanmelden - Sociale huurplanning</title>
  <style>
    body { font: 16px system-ui, sans-serif; margin: 0; padding: 2rem 1rem; color: #222; }
    main { max-width: 24rem; margin: 4rem auto; }
    label { display: block; margin-top: 1rem; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; margin-top: .35rem; padding: .65rem; font: inherit; }
    button { margin-top: 1.25rem; padding: .65rem 1rem; font: inherit; cursor: pointer; }
    .message { color: #a11919; }
  </style>
</head>
<body>
  <main>
    <h1>Aanmelden</h1>
    ${messageHtml}
    <form method="post">
      <label for="username">Gebruikersnaam</label>
      <input id="username" name="username" autocomplete="username" required>
      <label for="password">Wachtwoord</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Aanmelden</button>
    </form>
  </main>
</body>
</html>`
}

function loginResponse(message = "", challenge = false, status = 401) {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  })
  if (challenge) headers.set("WWW-Authenticate", 'Basic realm="Sociale huurplanning", charset="UTF-8"')
  return new Response(loginPage(message), { status, headers })
}

async function serveAsset(request, env) {
  const response = await env.ASSETS.fetch(request)
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "private, no-store")
  headers.set("X-Robots-Tag", "noindex, nofollow")
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default {
  async fetch(request, env) {
    if (!env.BASIC_AUTH_USER || !env.BASIC_AUTH_PASSWORD) {
      return new Response("Beveiliging niet geconfigureerd.", { status: 503 })
    }

    if (await validSession(request, env.BASIC_AUTH_SESSION_SECRET)) {
      return serveAsset(request, env)
    }

    const creds = parseBasic(request.headers.get("Authorization"))
    if (creds) {
      const [okUser, okPassword] = await Promise.all([
        safeEqual(creds.user, env.BASIC_AUTH_USER),
        safeEqual(creds.password, env.BASIC_AUTH_PASSWORD),
      ])
      if (okUser && okPassword) {
        return serveAsset(request, env)
      }
    }

    if (request.method === "POST" && request.headers.get("Content-Type")?.includes("application/x-www-form-urlencoded")) {
      if (!env.BASIC_AUTH_SESSION_SECRET || encoder.encode(env.BASIC_AUTH_SESSION_SECRET).length < 32) {
        return loginResponse("Aanmelden via dit formulier is nog niet beschikbaar. Neem contact op met de beheerder.", false, 503)
      }

      let form
      try {
        form = await request.formData()
      } catch {
        return loginResponse("Het aanmeldformulier kon niet worden gelezen. Probeer opnieuw.")
      }
      const username = form.get("username")
      const password = form.get("password")
      const [okUser, okPassword] = await Promise.all([
        safeEqual(typeof username === "string" ? username : "", env.BASIC_AUTH_USER),
        safeEqual(typeof password === "string" ? password : "", env.BASIC_AUTH_PASSWORD),
      ])
      if (!okUser || !okPassword) {
        return loginResponse("Gebruikersnaam of wachtwoord onjuist. Probeer opnieuw.")
      }

      const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
      const token = await signSession(expiresAt, env.BASIC_AUTH_SESSION_SECRET)
      return new Response(null, {
        status: 303,
        headers: {
          "Location": request.url,
          "Cache-Control": "no-store",
          "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; Secure; HttpOnly; SameSite=Lax`,
        },
      })
    }

    return loginResponse("", true)
  },
}
