import { useEffect, useRef, useState } from "react";
import type { Status } from "@/components/workbench-types";
import { saveDocument, setLastOpenedDocId } from "@/lib/documents";
import {
  canvasToPngBlob,
  measureSvgNaturalSize,
  renderSvgToCanvas,
} from "@/lib/image-export";

const THUMBNAIL_MAX_PX = 640;
const THUMBNAIL_DELAY_MS = 1500;

interface Props {
  code: string;
  docTitle: string;
  currentDocId: string | null;
  status: Status;
  packages: string[];
  libraries: string[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoomRef: React.RefObject<number>;
  setCurrentDocId: (id: string) => void;
}

export function useDocumentPersistence({
  code,
  docTitle,
  currentDocId,
  status,
  packages,
  libraries,
  canvasRef,
  zoomRef,
  setCurrentDocId,
}: Props) {
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || currentDocId !== null) {
      return;
    }
    const id = crypto.randomUUID();
    setCurrentDocId(id);
    setLastOpenedDocId(id);
  }, [currentDocId, setCurrentDocId]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      let id = currentDocId;
      if (id === null) {
        id = crypto.randomUUID();
        setCurrentDocId(id);
        setLastOpenedDocId(id);
      }
      void saveDocument({
        id,
        title: docTitle,
        code,
        packages,
        libraries,
        thumbnail: thumbnail ?? undefined,
        updatedAt: Date.now(),
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    code,
    currentDocId,
    docTitle,
    packages,
    libraries,
    setCurrentDocId,
    thumbnail,
  ]);

  useEffect(() => {
    if (currentDocId === null) {
      setThumbnail(null);
    }
  }, [currentDocId]);

  useEffect(() => {
    if (status !== "done") {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const svg = canvasRef.current?.querySelector("svg");
      if (!svg || cancelled) {
        return;
      }
      const natural = measureSvgNaturalSize(svg, zoomRef.current);
      const scale = Math.min(
        1,
        THUMBNAIL_MAX_PX / Math.max(natural.width, natural.height),
      );
      renderSvgToCanvas(svg, natural.width * scale, natural.height * scale)
        .then((canvas) => canvasToPngBlob(canvas))
        .then((blob) => {
          if (!cancelled) {
            setThumbnail(blob);
          }
        })
        .catch(() => {
          // Keep the previous thumbnail when rasterization fails.
        });
    }, THUMBNAIL_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [status, canvasRef, zoomRef]);

  return { thumbnail };
}
