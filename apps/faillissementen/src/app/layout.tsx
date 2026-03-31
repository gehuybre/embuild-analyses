import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import Script from "next/script";
import "@embuild/shared/styles/globals.css";
import { EmbedParentResizeListener } from "@embuild/shared/components/shared/EmbedParentResizeListener";
import { DeployVersionGuard } from "@embuild/shared/components/shared/DeployVersionGuard";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Faillissementen in de bouwsector",
  description: "Maandelijkse evolutie van faillissementen in de Belgische bouwsector, met vergelijking met andere sectoren en regionale spreiding.",
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const deployVersion = process.env.NEXT_PUBLIC_DEPLOY_VERSION ?? "";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const processEnvScript = `
    (function () {
      if (typeof window === "undefined") return;
      window.process = window.process || { env: {} };
      window.process.env = window.process.env || {};
      if (!window.process.env.NODE_ENV) window.process.env.NODE_ENV = "production";
      if (!window.process.env.NEXT_PUBLIC_BASE_PATH) window.process.env.NEXT_PUBLIC_BASE_PATH = ${JSON.stringify(basePath)};
      if (!window.process.env.NEXT_PUBLIC_DEPLOY_VERSION) window.process.env.NEXT_PUBLIC_DEPLOY_VERSION = ${JSON.stringify(deployVersion)};
    })();
  `;

  return (
    <html lang="nl">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Script id="process-env-polyfill" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: processEnvScript }} />
        <DeployVersionGuard />
        <EmbedParentResizeListener />
        {children}
      </body>
    </html>
  );
}
