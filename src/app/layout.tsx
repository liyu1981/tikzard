import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import Script from "next/script";
import { AmbientBackground } from "@/components/ambient-background";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TikZard | Local-first JSXGraph editor",
    template: "%s | TikZard",
  },
  description:
    "Create, preview, annotate, and export interactive JSXGraph diagrams in a private, local-first web workbench.",
  applicationName: "TikZard",
  authors: [{ name: "TikZard" }],
  creator: "TikZard",
  publisher: "TikZard",
  category: "technology",
  keywords: [
    "JSXGraph editor",
    "interactive geometry",
    "mathematical visualization",
    "diagram editor",
    "local-first",
    "offline-first",
  ],
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "TikZard | Local-first JSXGraph editor",
    description:
      "Create, preview, annotate, and export interactive JSXGraph diagrams in a private, local-first web workbench.",
    siteName: "TikZard",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "TikZard | Local-first JSXGraph editor",
    description:
      "Create, preview, annotate, and export interactive JSXGraph diagrams in a private, local-first web workbench.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "TikZard",
  description:
    "A private, local-first web workbench for creating, previewing, annotating, and exporting interactive JSXGraph diagrams.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web Browser",
  browserRequirements: "Requires JavaScript",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "JSXGraph source editing",
    "Interactive live preview",
    "Diagram annotations",
    "PNG and PDF export",
    "Local document storage",
  ],
};

const themeInit = `(function(){try{var t=localStorage.getItem("tikzard-theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var el=document.documentElement;el.classList.toggle("dark",d);el.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

// Server-side env var, read while the root layout is rendered: set it in
// .env for local dev, or as an environment variable of the machine/CI
// that runs `pnpm build` in production.
const gaMeasurementId = process.env.GA_MEASUREMENT_ID;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: structured data is a static local object
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: theme bootstrap must run before first paint
          dangerouslySetInnerHTML={{ __html: themeInit }}
        />
      </head>
      <body className="ambient-bg antialiased">
        <ThemeProvider>
          <I18nProvider>
            <AmbientBackground />
            {children}
          </I18nProvider>
        </ThemeProvider>
      </body>
      {gaMeasurementId ? <GoogleAnalytics gaId={gaMeasurementId} /> : null}
    </html>
  );
}
