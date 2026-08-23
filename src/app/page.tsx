"use client";

import { EditableTitle } from "@/components/editable-title";
import { OpenDocumentMenu } from "@/components/open-document-menu";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { TikzWorkbench } from "@/components/tikz-workbench";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col px-6 pt-16">
      <header className="fixed inset-x-0 top-0 z-20">
        <div className="apple-panel">
          <div className="mx-auto flex h-12 max-w-[1920px] items-center gap-2 px-6">
            <OpenDocumentMenu />
            <EditableTitle />
            <div className="flex items-center gap-2">
              <SettingsDialog />
              <ThemeSwitcher />
            </div>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col py-6 min-h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-7rem)]">
        <TikzWorkbench />
      </div>
    </main>
  );
}
