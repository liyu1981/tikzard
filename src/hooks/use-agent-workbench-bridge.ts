"use client";

import type * as React from "react";
import { useMemo } from "react";
import type { Status } from "@/components/workbench-types";
import type { EditorMutationBridge } from "@/lib/agent/editor-mutations";
import {
  COMPILE_FAILURE_PATTERN,
  getCompileLogsSince,
  getLastCompileLogId,
  pushCompileLog,
} from "@/lib/compile-logs";
import { saveNewVersion } from "@/lib/versions";

interface Props {
  codeRef: React.RefObject<string>;
  statusRef: React.RefObject<Status>;
  doneInfoMsRef: React.RefObject<number | null>;
  renderSeqRef: React.RefObject<number>;
  ensureDocId: () => string;
  setCode: (code: string) => void;
  getPackages: () => string[];
  setPackages: (ids: string[]) => void;
  getLibraries: () => string[];
  setLibraries: (ids: string[]) => void;
  setNextVersionNo: (value: number) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function useAgentWorkbenchBridge({
  codeRef,
  statusRef,
  doneInfoMsRef,
  renderSeqRef,
  ensureDocId,
  setCode,
  getPackages,
  setPackages,
  getLibraries,
  setLibraries,
  setNextVersionNo,
  t,
}: Props): EditorMutationBridge {
  // The bridge is stable and reads mutable refs at operation time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable bridge reads mutable refs
  return useMemo<EditorMutationBridge>(() => {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    return {
      getCode: () => codeRef.current,
      setCode,
      getPackages,
      setPackages,
      getLibraries,
      setLibraries,
      getRenderStatus: () => ({
        status: statusRef.current,
        durationMs: doneInfoMsRef.current,
      }),
      saveVersion: async (note) => {
        const version = await saveNewVersion(
          ensureDocId(),
          codeRef.current,
          "agent",
          { note },
        );
        setNextVersionNo(version.number + 1);
        pushCompileLog(
          "info",
          t("workbench.versionSaved", { number: version.number }),
        );
        return version.number;
      },
      waitForRender: async (timeoutMs = 50000) => {
        const deadline = performance.now() + timeoutMs;
        const startSeq = renderSeqRef.current;
        const sinceLogId = getLastCompileLogId();
        const failedSince = () =>
          getCompileLogsSince(sinceLogId).some((entry) =>
            COMPILE_FAILURE_PATTERN.test(entry.text),
          );
        while (
          renderSeqRef.current === startSeq &&
          performance.now() < deadline
        ) {
          await sleep(100);
        }
        let failed = false;
        while (performance.now() < deadline) {
          failed = failedSince();
          if (
            failed ||
            statusRef.current === "done" ||
            statusRef.current === "loadError"
          ) {
            break;
          }
          await sleep(100);
        }
        return {
          status: failed || failedSince() ? "timeout" : statusRef.current,
          durationMs: failed ? null : doneInfoMsRef.current,
        };
      },
    };
  }, []);
}
