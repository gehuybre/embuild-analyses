import type { Metadata } from "next"
import { Inter, Roboto_Mono } from "next/font/google"
import Script from "next/script"
import "@embuild/shared/styles/globals.css"
import { EmbedParentResizeListener } from "@embuild/shared/components/shared/EmbedParentResizeListener"
import { DeployVersionGuard } from "@embuild/shared/components/shared/DeployVersionGuard"

const sans = Inter({ variable: "--font-geist-sans", subsets: ["latin"] })
const mono = Roboto_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
const deployVersion = process.env.NEXT_PUBLIC_DEPLOY_VERSION ?? ""

export const metadata: Metadata = {
  title: "Gemeentelijke bouwinvesteringen - oktober 2026",
  description: "Bouwinvesteringen volgens jaarrekeningen, meest recente meerjarenplannen en oorspronkelijk beginkrediet.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const processEnvScript = `
    (function () {
      window.process = window.process || { env: {} };
      window.process.env = window.process.env || {};
      if (!window.process.env.NODE_ENV) window.process.env.NODE_ENV = "production";
      if (!window.process.env.NEXT_PUBLIC_BASE_PATH) window.process.env.NEXT_PUBLIC_BASE_PATH = ${JSON.stringify(basePath)};
      if (!window.process.env.NEXT_PUBLIC_DEPLOY_VERSION) window.process.env.NEXT_PUBLIC_DEPLOY_VERSION = ${JSON.stringify(deployVersion)};
    })();
  `
  return (
    <html lang="nl">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <Script id="process-env-polyfill" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: processEnvScript }} />
        <DeployVersionGuard />
        <EmbedParentResizeListener />
        {children}
      </body>
    </html>
  )
}
