import type { Metadata } from "next";
import Script from "next/script";
import { AmbientBackground } from "@/components/ambient-background";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prompt TikZ",
  description: "Local-first TikZ prompt workbench",
};

const themeInit = `(function(){try{var t=localStorage.getItem("prompt-tikz-theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var el=document.documentElement;el.classList.toggle("dark",d);el.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/tikzjax/fonts.min.css" />
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
    </html>
  );
}
