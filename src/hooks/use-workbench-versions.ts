"use client";

import type * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { setLastOpenedDocId } from "@/lib/documents";
import { getVersions, saveNewVersion, type TikzVersion } from "@/lib/versions";

interface Props {
  currentDocId: string | null;
  codeRef: React.RefObject<string>;
  setCode: (code: string) => void;
  setCurrentDocId: (id: string) => void;
}

export function useWorkbenchVersions({
  currentDocId,
  codeRef,
  setCode,
  setCurrentDocId,
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
    return version.number;
  }, [codeRef, ensureDocId]);

  const handleRestoreVersion = useCallback(
    async (version: TikzVersion) => {
      const id = ensureDocId();
      if (codeRef.current !== version.code) {
        const checkpoint = await saveNewVersion(id, codeRef.current, "manual");
        setNextVersionNo(checkpoint.number + 1);
      }
      setCode(version.code);
    },
    [codeRef, ensureDocId, setCode],
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
