import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { pushCompileLog } from "@/lib/compile-logs";
import { setLastOpenedDocId } from "@/lib/documents";
import { getVersions, saveNewVersion, type TikzVersion } from "@/lib/versions";

interface Props {
  currentDocId: string | null;
  codeRef: React.RefObject<string>;
  setCode: (code: string) => void;
  setCurrentDocId: (id: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function useWorkbenchVersions({
  currentDocId,
  codeRef,
  setCode,
  setCurrentDocId,
  t,
}: Props) {
  const [nextVersionNo, setNextVersionNo] = useState<number | null>(null);

  const ensureDocId = useCallback((): string => {
    if (currentDocId !== null) {
      return currentDocId;
    }
    const id = crypto.randomUUID();
    setCurrentDocId(id);
    setLastOpenedDocId(id);
    return id;
  }, [currentDocId, setCurrentDocId]);

  const handleSaveVersion = useCallback(async (): Promise<number> => {
    const id = ensureDocId();
    const version = await saveNewVersion(id, codeRef.current, "manual");
    setNextVersionNo(version.number + 1);
    pushCompileLog(
      "info",
      t("workbench.versionSaved", { number: version.number }),
    );
    return version.number;
  }, [codeRef, ensureDocId, t]);

  const handleRestoreVersion = useCallback(
    async (version: TikzVersion) => {
      const id = ensureDocId();
      if (codeRef.current !== version.code) {
        const checkpoint = await saveNewVersion(id, codeRef.current, "manual");
        setNextVersionNo(checkpoint.number + 1);
        pushCompileLog(
          "info",
          t("workbench.versionSaved", { number: checkpoint.number }),
        );
      }
      setCode(version.code);
      pushCompileLog(
        "info",
        t("workbench.versionRestored", { number: version.number }),
      );
    },
    [codeRef, ensureDocId, setCode, t],
  );

  useEffect(() => {
    if (currentDocId === null) {
      setNextVersionNo(null);
      return;
    }
    let cancelled = false;
    void getVersions(currentDocId)
      .then((list) => {
        if (!cancelled) {
          setNextVersionNo((list.at(-1)?.number ?? 0) + 1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNextVersionNo(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentDocId]);

  return {
    nextVersionNo,
    ensureDocId,
    handleSaveVersion,
    handleRestoreVersion,
    setNextVersionNo,
  };
}
