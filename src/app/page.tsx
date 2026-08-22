"use client";

import { useTranslation } from "react-i18next";
import { TikzWorkbench } from "@/components/tikz-workbench";

export default function Home() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col items-center gap-6 px-6 py-8">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("app.title")}
        </h1>
        <p className="text-base text-muted-foreground">{t("app.tagline")}</p>
      </header>
      <TikzWorkbench />
    </main>
  );
}
