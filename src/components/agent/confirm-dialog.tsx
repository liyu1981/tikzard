"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ConfirmRequest } from "@/lib/agent/confirm";
import { CheckIcon, PencilIcon, XIcon } from "./icons";

export function ConfirmDialog({
  request,
  onResolve,
}: {
  request: ConfirmRequest;
  onResolve: (ok: boolean) => void;
}) {
  const { t } = useTranslation();

  // Escape rejects the write — the fail-safe outcome.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onResolve(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <div className="glass-control materialize w-full max-w-lg rounded-xl p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PencilIcon className="size-4 text-muted-foreground" />
          {t("agent.confirmSetTitle")}
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("agent.confirmHint")}
        </p>
        <p className="mt-2 rounded-lg bg-foreground/[0.05] px-3 py-2 text-xs font-medium tabular-nums">
          {request.summary}
        </p>
        {request.detail !== "" && (
          <pre className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-border/40 bg-background/40 px-3 py-2 font-mono text-xs whitespace-pre-wrap">
            {request.detail}
          </pre>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-sm font-medium transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98]"
          >
            <XIcon className="size-3.5" />
            {t("agent.confirmReject")}
          </button>
          <button
            type="button"
            onClick={() => onResolve(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition duration-150 hover:-translate-y-px hover:brightness-[1.06] active:scale-[0.98]"
          >
            <CheckIcon className="size-3.5" />
            {t("agent.confirmApprove")}
          </button>
        </div>
      </div>
    </div>
  );
}
