"use client";

import type * as React from "react";
import { useMemo } from "react";
import type { Status } from "@/components/workbench-types";
import type { EditorMutationBridge } from "@/lib/agent/editor-mutations";
import { saveNewVersion } from "@/lib/versions";

interface Props {
  codeRef: React.RefObject<string>;
  statusRef: React.RefObject<Status>;
  doneInfoMsRef: React.RefObject<number | null>;
  renderSeqRef: React.RefObject<number>;
  boardRef: React.RefObject<unknown | null>;
  ensureDocId: () => string;
  setCode: (code: string) => void;
  setNextVersionNo: (value: number) => void;
}

export function useAgentWorkbenchBridge({
  codeRef,
  statusRef,
  doneInfoMsRef,
  renderSeqRef,
  boardRef,
  ensureDocId,
  setCode,
  setNextVersionNo,
}: Props): EditorMutationBridge {
  // The bridge is stable and reads mutable refs at operation time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable bridge reads mutable refs
  return useMemo<EditorMutationBridge>(() => {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    return {
      getCode: () => codeRef.current,
      setCode,
      getRenderStatus: () => ({
        status: statusRef.current,
        durationMs: doneInfoMsRef.current,
      }),
      getBoard: () => boardRef.current,
      saveVersion: async (note) => {
        const version = await saveNewVersion(
          ensureDocId(),
          codeRef.current,
          "agent",
          { note },
        );
        setNextVersionNo(version.number + 1);
        return version.number;
      },
      waitForRender: async (timeoutMs = 5000) => {
        const deadline = performance.now() + timeoutMs;
        const startSeq = renderSeqRef.current;
        while (
          renderSeqRef.current === startSeq &&
          performance.now() < deadline
        ) {
          await sleep(100);
        }
        return {
          status: statusRef.current,
          durationMs: doneInfoMsRef.current,
        };
      },
    };
  }, []);
}
