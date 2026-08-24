"use client";

import { useSetAtom } from "jotai";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  BotIcon,
  KeyIcon,
  PencilIcon,
  PlusIcon,
} from "@/components/agent/icons";
import { setLastOpenedDocId } from "@/lib/documents";
import {
  codeAtom,
  currentDocIdAtom,
  docTitleAtom,
  entryGateAtom,
  NEW_DOCUMENT_CODE,
} from "@/lib/workbench-state";

/**
 * First-run landing view shown instead of the two-pane workbench while the
 * document store is still empty. The call to action seeds the starter
 * source and flips the entry gate so the workbench mounts (its autosave
 * then persists the fresh document).
 */
export function WelcomePage() {
  const { t } = useTranslation();
  const setCode = useSetAtom(codeAtom);
  const setDocTitle = useSetAtom(docTitleAtom);
  const setCurrentDocId = useSetAtom(currentDocIdAtom);
  const setEntryGate = useSetAtom(entryGateAtom);

  function handleStart() {
    setCode(NEW_DOCUMENT_CODE);
    setDocTitle(t("documents.untitled"));
    setCurrentDocId(null);
    setLastOpenedDocId(null);
    setEntryGate("workbench");
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="materialize flex flex-col items-center gap-4">
        <h1 className="text-carved text-6xl font-semibold tracking-tight">
          TikZard
        </h1>
        <p className="max-w-md text-balance text-sm leading-relaxed text-muted-foreground">
          {t("welcome.tagline")}
        </p>
      </div>

      <button
        type="button"
        onClick={handleStart}
        className="glass-control materialize inline-flex items-center gap-2 rounded-full bg-clip-padding px-6 py-3 text-sm font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98]"
        style={{ animationDelay: "90ms" }}
      >
        <PlusIcon className="size-4" />
        {t("welcome.cta")}
      </button>

      <div
        className="materialize grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3"
        style={{ animationDelay: "180ms" }}
      >
        <WelcomeCard
          Icon={PencilIcon}
          title={t("welcome.f1Title")}
          desc={t("welcome.f1Desc")}
        />
        <WelcomeCard
          Icon={BotIcon}
          title={t("welcome.f2Title")}
          desc={t("welcome.f2Desc")}
        />
        <WelcomeCard
          Icon={KeyIcon}
          title={t("welcome.f3Title")}
          desc={t("welcome.f3Desc")}
        />
      </div>
    </div>
  );
}

function WelcomeCard({
  Icon,
  title,
  desc,
}: {
  Icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="glass-control rounded-xl bg-clip-padding p-4 text-left">
      <div className="flex items-center gap-2 pb-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <h2 className="text-xs font-semibold">{title}</h2>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}
