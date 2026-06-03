"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Trash2,
  X,
  MousePointer2,
  Paintbrush,
  Eraser,
  Type,
  Hand,
  Settings,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import SettingsPanel from "@/components/SettingsPanel";
import type { EditorMode } from "@/types";

export default function Toolbar() {
  const images = useAppStore((s) => s.images);
  const currentImageId = useAppStore((s) => s.currentImageId);
  const navigateImage = useAppStore((s) => s.navigateImage);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);
  const removeSelection = useAppStore((s) => s.removeSelection);
  const clearAllSelections = useAppStore((s) => s.clearAllSelections);
  const getCurrentImage = useAppStore((s) => s.getCurrentImage);
  const language = useAppStore((s) => s.language);
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const editorMode = useAppStore((s) => s.editorMode);
  const setEditorMode = useAppStore((s) => s.setEditorMode);
  const sketchOpacity = useAppStore((s) => s.sketchOpacity);
  const setSketchOpacity = useAppStore((s) => s.setSketchOpacity);

  const currentImage = useMemo(() => getCurrentImage(), [getCurrentImage, images, currentImageId]);
  const totalCount = images.length;
  const currentIndex = useMemo(
    () => images.findIndex((img) => img.id === currentImageId),
    [images, currentImageId],
  );

  const activeSelectionId = useMemo(
    () => currentImage?.selections.find((sel) => sel.active)?.id ?? null,
    [currentImage],
  );

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;

  // Keyboard shortcuts: A / D for prev / next, T/P for editor mode
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger when user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      // Ignore Alt combos (handled by TextEditor)
      if (e.altKey) return;
      if (totalCount >= 2 && (e.key === "a" || e.key === "A" || e.key === "d" || e.key === "D")) {
        e.preventDefault();
        navigateImage(e.key === "a" || e.key === "A" ? "prev" : "next");
        return;
      }
      // Tool shortcuts: Q=select, W=brush, E=eraser, R=text, H=hand
      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        setActiveTool("select");
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setActiveTool("brush");
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setActiveTool("eraser");
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setActiveTool("text");
      } else if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        setActiveTool("hand");
      }
      // T key: toggle text mode
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setEditorMode(editorMode === "text" ? "default" : "text");
        return;
      }
      // P key: toggle sketch (opacity) mode
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setEditorMode(editorMode === "sketch" ? "default" : "sketch");
        return;
      }
      // 0-9 keys adjust sketch opacity when in sketch mode
      if (editorMode === "sketch" && e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const opacity = parseInt(e.key, 10) / 9;
        setSketchOpacity(opacity);
        return;
      }
    },
    [navigateImage, totalCount, setActiveTool, editorMode, setEditorMode, setSketchOpacity],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleZoomIn = useCallback(() => {
    setZoom(Math.round((zoom + 0.25) * 100) / 100);
  }, [zoom, setZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(Math.max(0.1, Math.round((zoom - 0.25) * 100) / 100));
  }, [zoom, setZoom]);

  const handleZoomReset = useCallback(() => {
    setZoom(1);
  }, [setZoom]);

  const zoomPercent = `${Math.round(zoom * 100)}%`;

  return (
    <div
      className={cn(
        "flex h-12 w-full items-center justify-between gap-2",
        "border-b border-border bg-sidebar/50 px-3 select-none",
        "max-md:h-10 max-md:px-2 max-md:gap-1",
      )}
    >
      {/* ── Left section: Navigation & File ── */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Image counter */}
        {totalCount > 0 && currentIndex >= 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0 mr-1">
            {currentIndex + 1} / {totalCount}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 mr-1">
            0 / 0
          </span>
        )}

        {/* Previous button */}
        <button
          type="button"
          title={t("toolbar.zoomOut", language) /* reusing close-enough key */}
          className={cn(
            "flex items-center justify-center rounded p-1 transition-colors",
            hasPrev
              ? "text-foreground hover:bg-sidebar-accent"
              : "text-muted-foreground/40 cursor-not-allowed",
          )}
          disabled={!hasPrev}
          onClick={() => navigateImage("prev")}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Next button */}
        <button
          type="button"
          title={t("toolbar.zoomIn", language)}
          className={cn(
            "flex items-center justify-center rounded p-1 transition-colors",
            hasNext
              ? "text-foreground hover:bg-sidebar-accent"
              : "text-muted-foreground/40 cursor-not-allowed",
          )}
          disabled={!hasNext}
          onClick={() => navigateImage("next")}
        >
          <ChevronRight size={16} />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* File name — hidden on mobile */}
        <span
          className={cn(
            "text-xs text-muted-foreground truncate max-w-[160px] max-md:hidden",
            !currentImage && "opacity-40",
          )}
        >
          {currentImage?.fileName ?? t("common.no", language)}
        </span>
      </div>

      {/* ── Center section: View Controls ── */}
      <div className="flex items-center gap-1">
        {/* Zoom Out */}
        <button
          type="button"
          title={t("toolbar.zoomOut", language)}
          className="flex items-center justify-center rounded p-1 text-foreground hover:bg-sidebar-accent transition-colors"
          onClick={handleZoomOut}
        >
          <ZoomOut size={16} />
        </button>

        {/* Zoom percentage – click to reset */}
        <button
          type="button"
          title={t("toolbar.originalSize", language)}
          className="flex items-center justify-center rounded px-2 py-1 text-xs font-mono tabular-nums text-foreground hover:bg-sidebar-accent transition-colors min-w-[48px]"
          onClick={handleZoomReset}
        >
          {zoomPercent}
        </button>

        {/* Zoom In */}
        <button
          type="button"
          title={t("toolbar.zoomIn", language)}
          className="flex items-center justify-center rounded p-1 text-foreground hover:bg-sidebar-accent transition-colors"
          onClick={handleZoomIn}
        >
          <ZoomIn size={16} />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-1" />

        {/* Fit to window */}
        <button
          type="button"
          title={t("toolbar.fit", language)}
          className="flex items-center justify-center rounded p-1 text-foreground hover:bg-sidebar-accent transition-colors"
          onClick={() => setZoom(1)}
        >
          <Maximize2 size={16} />
        </button>

        {/* Original size */}
        <button
          type="button"
          title={t("toolbar.originalSize", language)}
          className="flex items-center justify-center rounded px-2 py-1 text-xs text-foreground hover:bg-sidebar-accent transition-colors whitespace-nowrap"
          onClick={() => setZoom(1)}
        >
          100%
        </button>
      </div>

      {/* ── Tool selection (hidden on mobile) ── */}
      <div className="flex items-center gap-0.5 max-md:hidden">
        {(
          [
            { tool: "select" as const, icon: MousePointer2, label: "toolbar.select" },
            { tool: "brush" as const, icon: Paintbrush, label: "toolbar.brush" },
            { tool: "eraser" as const, icon: Eraser, label: "toolbar.eraser" },
            { tool: "text" as const, icon: Type, label: "toolbar.text" },
            { tool: "hand" as const, icon: Hand, label: "toolbar.hand" },
          ] as const
        ).map(({ tool, icon: Icon, label }) => (
          <button
            key={tool}
            type="button"
            title={t(label, language)}
            className={cn(
              "flex items-center justify-center rounded p-1.5 transition-colors",
              activeTool === tool
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
            )}
            onClick={() => setActiveTool(tool)}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-border mx-0.5" />

      {/* ── Right section: View Mode & Actions ── */}
      <div className="flex items-center gap-1.5">
        {/* View mode segmented toggle */}
        <div className="relative flex items-center bg-sidebar-accent rounded-full p-0.5">
          {/* Sliding indicator */}
          <div
            className={cn(
              "absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-full bg-sidebar shadow-sm transition-transform duration-200",
              viewMode === "result" ? "translate-x-[calc(100%+2px)]" : "translate-x-0",
            )}
          />
          <button
            type="button"
            className={cn(
              "relative z-10 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              viewMode === "original"
                ? "text-sidebar-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setViewMode("original")}
          >
            {t("toolbar.preview", language)}
          </button>
          <button
            type="button"
            className={cn(
              "relative z-10 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              viewMode === "result"
                ? "text-sidebar-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setViewMode("result")}
          >
            {t("toolbar.result", language)}
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Undo */}
        <button
          type="button"
          title={t("toolbar.undo", language)}
          className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          onClick={() => undo()}
        >
          <Undo2 size={16} />
        </button>

        {/* Redo */}
        <button
          type="button"
          title={t("toolbar.redo", language)}
          className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          onClick={() => redo()}
        >
          <Redo2 size={16} />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Delete selection */}
        <button
          type="button"
          title={t("toolbar.deleteSelection", language)}
          className={cn(
            "flex items-center justify-center rounded p-1 transition-colors",
            activeSelectionId
              ? "text-foreground hover:bg-sidebar-accent"
              : "text-muted-foreground/40 cursor-not-allowed",
          )}
          disabled={!activeSelectionId}
          onClick={() => {
            if (activeSelectionId) removeSelection(activeSelectionId);
          }}
        >
          <Trash2 size={16} />
        </button>

        {/* Clear all selections */}
        <button
          type="button"
          title={t("toolbar.clearAll", language)}
          className={cn(
            "flex items-center justify-center rounded p-1 transition-colors",
            currentImage && currentImage.selections.length > 0
              ? "text-foreground hover:bg-sidebar-accent"
              : "text-muted-foreground/40 cursor-not-allowed",
          )}
          disabled={!currentImage || currentImage.selections.length === 0}
          onClick={() => clearAllSelections()}
        >
          <X size={16} />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Settings gear */}
        <SettingsPanel />
      </div>

      {/* ── Editor mode indicator ── */}
      {editorMode !== "default" && (
        <div className="flex items-center gap-1.5 ml-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
              editorMode === "text"
                ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                : "bg-purple-500/20 text-purple-600 dark:text-purple-400",
            )}
          >
            {editorMode === "text" ? (
              <><Type size={12} /> Text</>
            ) : (
              <><Eye size={12} /> Sketch</>
            )}
            <button
              onClick={() => setEditorMode("default")}
              className="ml-0.5 hover:opacity-70"
            >
              <X size={10} />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
