"use client";

import { useAtom } from "jotai";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { docTitleAtom } from "@/lib/workbench-state";

/** In-place editable document title for the app header. */
export function EditableTitle({
  disabled = false,
  className,
}: {
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useAtom(docTitleAtom);
  const draftRef = useRef(title);

  return (
    <input
      value={disabled ? "" : title}
      disabled={disabled}
      readOnly={disabled}
      onChange={(event) => {
        draftRef.current = event.target.value;
        setTitle(event.target.value);
      }}
      onBlur={() => {
        const next = draftRef.current.trim();
        setTitle(next === "" ? t("documents.untitled") : next);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          (event.target as HTMLInputElement).blur();
        } else if (event.key === "Escape") {
          setTitle(draftRef.current);
          (event.target as HTMLInputElement).blur();
        }
      }}
      aria-label={t("documents.titleField")}
      className={`min-w-0 flex-1 truncate rounded-md bg-transparent px-2 py-1 text-center text-base font-medium text-foreground outline-none transition-colors hover:bg-foreground/[0.05] focus:bg-foreground/[0.05] disabled:cursor-default disabled:hover:bg-transparent ${className ?? ""}`}
    />
  );
}
