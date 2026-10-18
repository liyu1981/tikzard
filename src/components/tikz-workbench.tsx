"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TagSuggestion } from "@/components/tex-tag-input";
import { WorkbenchLeftPanel } from "@/components/workbench-left-panel";
import { WorkbenchPreviewPanel } from "@/components/workbench-preview-panel";
import type { RightTab } from "@/components/workbench-types";
import { useAgentWorkbenchBridge } from "@/hooks/use-agent-workbench-bridge";
import { useDocumentPersistence } from "@/hooks/use-document-persistence";
import { useHelperGrid } from "@/hooks/use-helper-grid";
import { useTikzRenderer } from "@/hooks/use-tikz-renderer";
import { useWorkbenchPreview } from "@/hooks/use-workbench-preview";
import { useWorkbenchVersions } from "@/hooks/use-workbench-versions";
import {
  LIBRARY_HINTS,
  SUPPORTED_LIBRARIES,
  SUPPORTED_PACKAGES,
} from "@/lib/tikz-packages";
import {
  codeAtom,
  currentDocIdAtom,
  docTitleAtom,
  helperGridAtom,
  leftTabAtom,
  librariesAtom,
  packagesAtom,
  pendingAnnotationAtom,
} from "@/lib/workbench-state";

/** How long the "Saved" confirmation stays on the save-version button. */
const VERSION_SAVED_FEEDBACK_MS = 1600;

const PACKAGE_SUGGESTIONS: TagSuggestion[] = SUPPORTED_PACKAGES.map((pkg) => ({
  id: pkg.id,
  description: pkg.description,
}));

export function TikzWorkbench() {
  const { t } = useTranslation();
  const [code, setCode] = useAtom(codeAtom);
  const docTitle = useAtomValue(docTitleAtom);
  const currentDocId = useAtomValue(currentDocIdAtom);
  const setCurrentDocId = useSetAtom(currentDocIdAtom);
  const leftTab = useAtomValue(leftTabAtom);
  const setLeftTab = useSetAtom(leftTabAtom);
  const setPendingAnnotation = useSetAtom(pendingAnnotationAtom);
  const [packages, setPackages] = useAtom(packagesAtom);
  const [libraries, setLibraries] = useAtom(librariesAtom);
  const [helperGrid, setHelperGrid] = useAtom(helperGridAtom);
  const [rightTab, setRightTab] = useState<RightTab>("preview");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [saveVersionState, setSaveVersionState] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  /** Whether the annotation overlay is active on the preview picture. */
  const [annotating, setAnnotating] = useState(false);
  /** Preview panel host element the annotation overlay portals into. */
  const [previewHostEl, setPreviewHostEl] = useState<HTMLDivElement | null>(
    null,
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(code);
  const packagesRef = useRef(packages);
  const librariesRef = useRef(libraries);
  const saveVersionTimerRef = useRef<number | null>(null);

  const {
    status,
    doneInfo,
    nowTick,
    renderNow,
    renderSeqRef,
    statusRef,
    doneInfoMsRef,
  } = useTikzRenderer({ code, stageRef, t, packages, libraries, helperGrid });
  const {
    zoom,
    displayScale,
    setZoom,
    zoomRef,
    exporting,
    fitView,
    ensurePlaceholderSvg,
    handleAnnotateFinish,
    handleCopyImage,
    handleExportPng,
    handleExportPdf,
  } = useWorkbenchPreview({
    docTitle,
    status,
    annotating,
    stageRef,
    canvasRef,
    setLeftTab,
    setPendingAnnotation,
    t,
  });

  // Align the HTML helper grid with the rendered drawing's coordinate system.
  const grid = useHelperGrid(
    canvasRef,
    helperGrid,
    `${doneInfo?.at ?? 0}:${displayScale}`,
    annotating,
  );
  useDocumentPersistence({
    code,
    docTitle,
    currentDocId,
    status,
    packages,
    libraries,
    canvasRef,
    zoomRef,
    setCurrentDocId,
  });
  const {
    nextVersionNo,
    ensureDocId,
    handleSaveVersion,
    handleRestoreVersion,
    setNextVersionNo,
  } = useWorkbenchVersions({
    currentDocId,
    codeRef,
    setCode,
    setCurrentDocId,
    t,
  });

  // Clear the pending "saved" feedback revert on unmount.
  useEffect(
    () => () => {
      if (saveVersionTimerRef.current !== null) {
        window.clearTimeout(saveVersionTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    packagesRef.current = packages;
  }, [packages]);

  useEffect(() => {
    librariesRef.current = libraries;
  }, [libraries]);

  const agentBridge = useAgentWorkbenchBridge({
    codeRef,
    statusRef,
    doneInfoMsRef,
    renderSeqRef,
    ensureDocId,
    setCode,
    getPackages: () => packagesRef.current,
    setPackages,
    getLibraries: () => librariesRef.current,
    setLibraries,
    setNextVersionNo,
    t,
  });

  const busy = status === "booting" || status === "loadError";
  const librarySuggestions = useMemo<TagSuggestion[]>(
    () =>
      SUPPORTED_LIBRARIES.map((id) => ({ id, description: LIBRARY_HINTS[id] })),
    [],
  );
  const handleSaveButton = useCallback(() => {
    if (saveVersionState !== "idle") {
      return;
    }
    setSaveVersionState("saving");
    void handleSaveVersion()
      .then(() => {
        setSaveVersionState("saved");
        if (saveVersionTimerRef.current !== null) {
          window.clearTimeout(saveVersionTimerRef.current);
        }
        saveVersionTimerRef.current = window.setTimeout(
          () => setSaveVersionState("idle"),
          VERSION_SAVED_FEEDBACK_MS,
        );
      })
      .catch(() => setSaveVersionState("idle"));
  }, [handleSaveVersion, saveVersionState]);

  const handleAnnotateToggle = useCallback(() => {
    if (!annotating) {
      ensurePlaceholderSvg();
    }
    setAnnotating((prev) => !prev);
  }, [annotating, ensurePlaceholderSvg]);

  return (
    <div className="materialize grid h-full min-h-0 w-full grid-cols-1 grid-rows-[repeat(2,minmax(0,1fr))] gap-4 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)]">
      <WorkbenchLeftPanel
        code={code}
        leftTab={leftTab}
        busy={busy}
        agentBridge={agentBridge}
        nextVersionNo={nextVersionNo}
        saveVersionState={saveVersionState}
        versionsOpen={versionsOpen}
        packages={packages}
        libraries={libraries}
        packageSuggestions={PACKAGE_SUGGESTIONS}
        librarySuggestions={librarySuggestions}
        onCodeChange={setCode}
        onLeftTabChange={setLeftTab}
        onRender={() => renderNow(code)}
        onSaveVersion={handleSaveButton}
        onVersionsOpenChange={setVersionsOpen}
        onPackagesChange={setPackages}
        onLibrariesChange={setLibraries}
        onRestoreVersion={handleRestoreVersion}
      />
      <WorkbenchPreviewPanel
        rightTab={rightTab}
        status={status}
        doneInfo={doneInfo}
        nowTick={nowTick}
        zoom={zoom}
        displayScale={displayScale}
        exporting={exporting}
        annotating={annotating}
        helperGrid={helperGrid}
        grid={grid}
        previewHostEl={previewHostEl}
        stageRef={stageRef}
        canvasRef={canvasRef}
        onRightTabChange={setRightTab}
        onAnnotateToggle={handleAnnotateToggle}
        onHelperGridToggle={() => setHelperGrid((value) => !value)}
        onFit={fitView}
        onZoomChange={setZoom}
        onExportCopy={() => void handleCopyImage()}
        onExportPng={() => void handleExportPng()}
        onExportPdf={() => void handleExportPdf()}
        onAnnotateFinish={(hasContent, overlay) => {
          setAnnotating(false);
          handleAnnotateFinish(hasContent, overlay);
        }}
        onAnnotateCancel={() => setAnnotating(false)}
        onPreviewHostChange={setPreviewHostEl}
      />
    </div>
  );
}
