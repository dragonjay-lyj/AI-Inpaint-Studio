"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Upload,
  FolderOpen,
  ClipboardPaste,
  Play,
  Square,
  Download,
  FileArchive,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Wifi,
  X,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { cn, generateId, blobToDataUrl } from "@/lib/utils";
import { testConnection } from "@/lib/api";
import { checkBeforeGenerate } from "@/lib/guard";
import type { ThemeType, LanguageType, ProviderType, ImageEntry } from "@/types";

// 简易长度漂移检查：AI 返回的 target 字符数若与 source 差异过大，提示用户
function checkLengthDrift(meta?: { source?: string; target?: string }): string | null {
  if (!meta?.source || !meta?.target) return null;
  const s = [...meta.source].length;
  const t = [...meta.target].length;
  if (s === 0) return null;
  const ratio = t / s;
  if (ratio > 2.5) return `译文偏长（${s} → ${t}），可能有幻觉字符，建议重试`;
  if (ratio < 0.4) return `译文偏短（${s} → ${t}），可能漏字，建议重试`;
  return null;
}

// ============================================================
// Collapsible Section
// ============================================================
function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-sidebar-border last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
      >
        <span>{title}</span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>
      {open && <div className="px-3 pb-3 space-y-2.5">{children}</div>}
    </div>
  );
}

// ============================================================
// Theme Selector
// ============================================================
const themes: { key: ThemeType; color: string; label: string }[] = [
  { key: "light", color: "#e5e7eb", label: "浅色" },
  { key: "dark", color: "#1a1a2e", label: "深色" },
  { key: "ocean", color: "#0ea5e9", label: "海洋" },
  { key: "rose", color: "#f43f5e", label: "玫瑰" },
  { key: "forest", color: "#22c55e", label: "森林" },
];

// ============================================================
// Main Sidebar Component
// ============================================================
export default function Sidebar() {
  const store = useAppStore();
  const {
    images,
    currentImageId,
    setCurrentImage,
    addImages,
    removeImage,
    globalPrompt,
    setGlobalPrompt,
    applyToAll,
    setApplyToAll,
    isProcessing,
    connection,
    setConnection,
    concurrency,
    setConcurrency,
    theme,
    setTheme,
    language,
    setLanguage,
    batchProgress,
    viewMode,
    setViewMode,
    setIsProcessing,
    setAbortController,
    resetBatchProgress,
    updateBatchProgress,
    updateImageResult,
    updateImageStatus,
    updateSelection,
    getCurrentImage,
  } = store;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [folderImportCount, setFolderImportCount] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // 全局文件快捷键 (Ctrl+Q/W/E)
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail;
      if (detail?.action === "open") fileInputRef.current?.click();
      else if (detail?.action === "save") handleDownloadRef.current?.();
      else if (detail?.action === "export") handleDownloadAllRef.current?.();
    };
    window.addEventListener("file-action", handler as EventListener);
    return () => window.removeEventListener("file-action", handler as EventListener);
  }, []);
  const handleDownloadRef = useRef<(() => void) | null>(null);
  const handleDownloadAllRef = useRef<(() => void) | null>(null);

  // Handle single file upload
  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      const entries: ImageEntry[] = [];
      const fileArray = Array.from(files).filter((f) => f.type.startsWith("image/"));

      for (const file of fileArray) {
        const dataUrl = await blobToDataUrl(file);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = dataUrl;
        });

        entries.push({
          id: generateId(),
          fileName: file.name,
          originalDataUrl: dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight,
          selections: [],
          status: "idle",
          globalPrompt: "",
        });
      }

      if (entries.length > 0) {
        addImages(entries);
      }
    },
    [addImages]
  );

  // Drag and drop on sidebar
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const items = e.dataTransfer.items;
      if (items) {
        const files: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
        handleFileUpload(files);
      }
    },
    [handleFileUpload]
  );

  // Test connection
  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    try {
      const ok = await testConnection(connection);
      setConnectionStatus(ok ? "success" : "error");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    } catch {
      setConnectionStatus("error");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    }
  };

  // Generate single image
  const handleGenerate = async () => {
    const current = getCurrentImage();
    if (!current || current.selections.length === 0) return;

    // 可行性门控
    const gateResult = checkBeforeGenerate(connection, current);
    if (!gateResult.feasible) {
      updateImageStatus(current.id, "error", gateResult.reason || "未知错误");
      if (gateResult.suggestion) {
        console.warn("[Guard]", gateResult.suggestion);
      }
      return;
    }

    setIsProcessing(true);
    updateImageStatus(current.id, "processing");

    const { callAI } = await import("@/lib/api");
    const { compositeImage, extractRegion } = await import("@/lib/image");

    try {
      // Process each selection — 只上传选区内容
      let resultUrl = current.originalDataUrl;
      const warnings: string[] = [];

      for (const sel of current.selections) {
        const prompt = sel.prompt || globalPrompt || "Edit this region naturally";

        // 裁剪出选区图片，只发送选区内容给模型
        const { regionDataUrl, expandedRect } = await extractRegion(
          current.originalDataUrl, sel.rect, 30
        );

        // 原选区在裁剪图中的偏移位置（不含 padding）
        const cropRect = {
          x: sel.rect.x - expandedRect.x,
          y: sel.rect.y - expandedRect.y,
          width: sel.rect.width,
          height: sel.rect.height,
        };
        const aiResult = await callAI(connection, regionDataUrl, cropRect, prompt);

        const lenWarn = checkLengthDrift(aiResult.meta);
        if (lenWarn) warnings.push(lenWarn);

        // 只把用户原始选区 (sel.rect) 那一小块从生成图里贴回原图，padding 区域不参与合成
        resultUrl = await compositeImage(
          resultUrl,
          aiResult.imageDataUrl,
          sel.rect,
          cropRect,
          { width: expandedRect.width, height: expandedRect.height }
        );
      }

      updateImageResult(current.id, resultUrl);
      if (warnings.length > 0) {
        updateImageStatus(current.id, "done", `⚠ ${warnings.join("；")}`);
      } else {
        updateImageStatus(current.id, "done");
      }
      setViewMode("result");
    } catch (err: any) {
      updateImageStatus(current.id, "error", err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Batch generate
  const handleBatchGenerate = async () => {
    const current = getCurrentImage();
    if (!current) return;

    // 可行性门控
    const gateResult = checkBeforeGenerate(connection, current);
    if (!gateResult.feasible) {
      updateImageStatus(current.id, "error", gateResult.reason || "未知错误");
      return;
    }

    const targetImages = applyToAll ? images : [current];
    if (targetImages.length === 0) return;

    setIsProcessing(true);
    resetBatchProgress();
    updateBatchProgress({ total: targetImages.length, completed: 0, failed: 0 });

    const abortCtrl = new AbortController();
    setAbortController(abortCtrl);

    const { callAI } = await import("@/lib/api");
    const { compositeImage, extractRegion } = await import("@/lib/image");

    const sourceSelections = current.selections.filter((s) => s.rect.width > 0 && s.rect.height > 0);
    const sourcePrompt = globalPrompt;

    if (sourceSelections.length === 0) {
      setIsProcessing(false);
      return;
    }

    const processImage = async (img: ImageEntry) => {
      if (abortCtrl.signal.aborted) return;

      updateImageStatus(img.id, "processing");
      updateBatchProgress({ currentImage: img.fileName });

      try {
        let resultUrl = img.originalDataUrl;
        const warnings: string[] = [];

        for (const sel of sourceSelections) {
          const prompt = sourcePrompt || sel.prompt || "Edit this region naturally";
          const { regionDataUrl, expandedRect } = await extractRegion(img.originalDataUrl, sel.rect, 30);
          const cropRect = {
            x: sel.rect.x - expandedRect.x,
            y: sel.rect.y - expandedRect.y,
            width: sel.rect.width,
            height: sel.rect.height,
          };
          const aiResult = await callAI(connection, regionDataUrl, cropRect, prompt);
          const lenWarn = checkLengthDrift(aiResult.meta);
          if (lenWarn) warnings.push(lenWarn);
          resultUrl = await compositeImage(
            resultUrl,
            aiResult.imageDataUrl,
            sel.rect,
            cropRect,
            { width: expandedRect.width, height: expandedRect.height }
          );
        }

        updateImageResult(img.id, resultUrl);
        updateImageStatus(img.id, "done", warnings.length > 0 ? `⚠ ${warnings.join("；")}` : undefined);
        updateBatchProgress({ completed: batchProgress.completed + 1 });
      } catch (err: any) {
        updateImageStatus(img.id, "error", err.message);
        updateBatchProgress({ failed: batchProgress.failed + 1 });
      }
    };

    if (concurrency.mode === "serial") {
      for (const img of targetImages) {
        if (abortCtrl.signal.aborted) break;
        await processImage(img);
      }
    } else {
      // Concurrent with limit
      const chunks: ImageEntry[][] = [];
      for (let i = 0; i < targetImages.length; i += concurrency.maxConcurrent) {
        chunks.push(targetImages.slice(i, i + concurrency.maxConcurrent));
      }
      for (const chunk of chunks) {
        if (abortCtrl.signal.aborted) break;
        await Promise.allSettled(chunk.map(processImage));
      }
    }

    if (!abortCtrl.signal.aborted) {
      setViewMode("result");
    }
    setIsProcessing(false);
    setAbortController(null);
  };

  // Stop
  const handleStop = () => {
    const ctrl = useAppStore.getState().abortController;
    ctrl?.abort();
    setIsProcessing(false);
    setAbortController(null);
  };

  // Download
  const handleDownload = async () => {
    const current = getCurrentImage();
    if (!current?.resultDataUrl) return;

    const a = document.createElement("a");
    a.href = current.resultDataUrl;
    a.download = current.fileName.replace(/\.[^.]+$/, "_edited.png");
    a.click();
  };
  handleDownloadRef.current = handleDownload;

  // Download all as ZIP
  const handleDownloadAll = async () => {
    const doneImages = images.filter((img) => img.resultDataUrl);
    if (doneImages.length === 0) return;
    const { exportAllAsZip } = await import("@/lib/export");
    const blob = await exportAllAsZip(doneImages);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inpaint_results_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  handleDownloadAllRef.current = handleDownloadAll;

  // Theme class management
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-dark", "theme-ocean", "theme-rose", "theme-forest");
    if (theme !== "light") {
      root.classList.add(`theme-${theme}`);
    }
  }, [theme]);

  const currentImage = getCurrentImage();

  return (
    <aside
      className="w-80 h-full flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden shrink-0"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <h1 className="text-sm font-bold text-sidebar-foreground">{t("app.title", language)}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{t("app.subtitle", language)}</p>
      </div>

      {/* File Operations */}
      <div className="p-3 border-b border-sidebar-border space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            {t("sidebar.upload", language)}
          </button>
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors relative"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {t("sidebar.uploadFolder", language)}
            {folderImportCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-primary rounded-full">
                {folderImportCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (showClearConfirm) {
                // Clear all images
                images.forEach((img) => removeImage(img.id));
                setShowClearConfirm(false);
                setFolderImportCount(0);
              } else {
                setShowClearConfirm(true);
                setTimeout(() => setShowClearConfirm(false), 3000);
              }
            }}
            disabled={images.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {showClearConfirm ? t("sidebar.confirmClear", language) || "确认清除" : t("sidebar.clearAll", language) || "清除所有"}
          </button>
        </div>
        <button
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          {t("sidebar.paste", language)} (Ctrl+V)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
        />
        <input
          ref={folderInputRef}
          type="file"
          /* @ts-ignore — webkitdirectory is valid */
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileUpload(e.target.files);
              setFolderImportCount((c) => c + 1);
              // Reset value so re-selecting the same folder triggers onChange again
              e.target.value = "";
              // Re-open folder picker immediately so user can add another folder
              setTimeout(() => folderInputRef.current?.click(), 100);
            }
          }}
        />
      </div>

      {/* Image List */}
      <div className="border-b border-sidebar-border">
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider">
            {t("sidebar.imageList", language)} ({images.length})
          </span>
        </div>
        <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-1">
          {images.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">
              <ImageIcon className="w-5 h-5 mx-auto mb-1 opacity-40" />
              {t("batch.none", language)}
            </div>
          ) : (
            images.map((img) => {
              const isCurrent = img.id === currentImageId;
              const statusIcon =
                img.status === "done" ? (
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                ) : img.status === "processing" ? (
                  <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                ) : img.status === "error" ? (
                  <AlertCircle className="w-3 h-3 text-red-500" />
                ) : null;

              return (
                <div
                  key={img.id}
                  onClick={() => setCurrentImage(img.id)}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors group",
                    isCurrent
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-sidebar-accent border border-transparent"
                  )}
                >
                  <img
                    src={img.originalDataUrl}
                    alt={img.fileName}
                    className="w-8 h-8 rounded object-cover shrink-0 bg-canvas-bg"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-medium text-sidebar-foreground">{img.fileName}</div>
                    <div className="text-[10px] text-muted-foreground">{img.width}×{img.height}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {statusIcon}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (showDeleteConfirm === img.id) {
                          removeImage(img.id);
                          setShowDeleteConfirm(null);
                        } else {
                          setShowDeleteConfirm(img.id);
                          setTimeout(() => setShowDeleteConfirm(null), 3000);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                    >
                      {showDeleteConfirm === img.id ? (
                        <span className="text-[10px] text-destructive font-bold px-1">确认</span>
                      ) : (
                        <X className="w-3 h-3 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Prompt */}
      <div className="p-3 border-b border-sidebar-border space-y-2">
        <label className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider">
          {t("sidebar.prompt", language)}
        </label>
        <textarea
          value={globalPrompt}
          onChange={(e) => setGlobalPrompt(e.target.value)}
          placeholder={t("sidebar.promptPlaceholder", language)}
          className="w-full h-16 text-xs bg-sidebar-accent border border-sidebar-border rounded-lg p-2 resize-none text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
        />
        {/* 激活选区的独立 Prompt */}
        {(() => {
          const activeSel = currentImage?.selections.find((s) => s.active);
          if (!activeSel) return null;
          const selIndex = currentImage!.selections.indexOf(activeSel) + 1;
          return (
            <div className="space-y-1 pt-1 border-t border-sidebar-border">
              <label className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider">
                选区 #{selIndex} 提示词
              </label>
              <textarea
                value={activeSel.prompt}
                onChange={(e) => updateSelection(activeSel.id, { prompt: e.target.value })}
                placeholder="仅针对该选区的提示词..."
                className="w-full h-12 text-xs bg-primary/5 border border-primary/30 rounded-lg p-2 resize-none text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
              />
            </div>
          );
        })()}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-sidebar-border"
          />
          <span className="text-xs text-sidebar-foreground">{t("sidebar.applyToAll", language)}</span>
        </label>
        {applyToAll && (
          <p className="text-[10px] text-muted-foreground ml-5.5">{t("sidebar.applyToAllDesc", language)}</p>
        )}
      </div>

      {/* Error display */}
      {currentImage?.status === "error" && currentImage.error && (
        <div className="mx-3 mb-1 p-2 border border-destructive/30 bg-destructive/5 rounded-lg">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-destructive">生成失败</p>
              <p className="text-[10px] text-destructive/80 leading-relaxed break-words">{currentImage.error}</p>
            </div>
            <button
              onClick={() => updateImageStatus(currentImage.id, "idle")}
              className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
            >
              忽略
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-3 border-b border-sidebar-border space-y-2">
        {!isProcessing ? (
          <>
            <button
              onClick={handleGenerate}
              disabled={!currentImage?.selections.length}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Play className="w-4 h-4" />
              {t("sidebar.startGenerate", language)}
            </button>
            <button
              onClick={handleBatchGenerate}
              disabled={images.length === 0}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Play className="w-3.5 h-3.5" />
              {t("sidebar.batchGenerate", language)}
            </button>
          </>
        ) : (
          <button
            onClick={handleStop}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-destructive text-white hover:opacity-90 transition-all"
          >
            <Square className="w-4 h-4" />
            {t("sidebar.stopGenerate", language)}
          </button>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={!currentImage?.resultDataUrl}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3 h-3" />
            {t("sidebar.downloadResult", language)}
          </button>
          <button
            onClick={handleDownloadAll}
            disabled={!images.some((img) => img.resultDataUrl)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <FileArchive className="w-3 h-3" />
            {t("sidebar.downloadAll", language)}
          </button>
        </div>
      </div>

      {/* Batch Progress */}
      {isProcessing && batchProgress.total > 0 && (
        <div className="px-3 py-2 border-b border-sidebar-border">
          <div className="text-xs font-semibold text-sidebar-foreground mb-1.5">
            {t("batch.progress", language)}: {batchProgress.completed}/{batchProgress.total}
          </div>
          <div className="w-full h-1.5 bg-sidebar-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{
                width: `${((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100}%`,
              }}
            />
          </div>
          {batchProgress.currentImage && (
            <div className="text-[10px] text-muted-foreground mt-1 truncate">
              {batchProgress.currentImage}
            </div>
          )}
        </div>
      )}

      {/* Scrollable Settings Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Connection Settings */}
        <CollapsibleSection title={t("connection.title", language)} defaultOpen={false}>
          {/* Provider */}
          <label className="text-[11px] font-medium text-sidebar-foreground">{t("connection.provider", language)}</label>
          <select
            value={connection.provider}
            onChange={(e) => setConnection({ provider: e.target.value as ProviderType })}
            className="w-full text-xs bg-sidebar-accent border border-sidebar-border rounded-md px-2 py-1.5 text-sidebar-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="custom">Custom (OpenAI Compatible)</option>
          </select>

          {/* API Key */}
          <label className="text-[11px] font-medium text-sidebar-foreground">{t("connection.apiKey", language)}</label>
          <input
            type="password"
            value={connection.apiKey}
            onChange={(e) => setConnection({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full text-xs bg-sidebar-accent border border-sidebar-border rounded-md px-2 py-1.5 text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />

          {/* Base URL */}
          {true && (
            <>
              <label className="text-[11px] font-medium text-sidebar-foreground">{t("connection.baseUrl", language)}</label>
              <input
                type="text"
                value={connection.baseUrl}
                onChange={(e) => setConnection({ baseUrl: e.target.value })}
                placeholder="https://your-custom-api.endpoint"
                className="w-full text-xs bg-sidebar-accent border border-sidebar-border rounded-md px-2 py-1.5 text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </>
          )}

          {/* Model */}
          <label className="text-[11px] font-medium text-sidebar-foreground">{t("connection.model", language)}</label>
          <input
            type="text"
            value={connection.model}
            onChange={(e) => setConnection({ model: e.target.value })}
            placeholder={t("connection.modelPlaceholder", language)}
            className="w-full text-xs bg-sidebar-accent border border-sidebar-border rounded-md px-2 py-1.5 text-sidebar-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />

          {/* Test Connection */}
          <button
            onClick={handleTestConnection}
            disabled={!connection.apiKey || connectionStatus === "testing"}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Wifi
              className={cn(
                "w-3 h-3",
                connectionStatus === "success" && "text-green-500",
                connectionStatus === "error" && "text-red-500"
              )}
            />
            {connectionStatus === "testing"
              ? "Testing..."
              : connectionStatus === "success"
              ? "Connected ✓"
              : connectionStatus === "error"
              ? "Failed ✗"
              : t("connection.test", language)}
          </button>
        </CollapsibleSection>

        {/* Concurrency Settings */}
        <CollapsibleSection title={t("concurrency.title", language)}>
          <label className="text-[11px] font-medium text-sidebar-foreground">{t("concurrency.mode", language)}</label>
          <div className="flex rounded-md overflow-hidden border border-sidebar-border">
            <button
              onClick={() => setConcurrency({ mode: "serial" })}
              className={cn(
                "flex-1 text-xs py-1.5 transition-colors",
                concurrency.mode === "serial"
                  ? "bg-primary text-primary-foreground"
                  : "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80"
              )}
            >
              {t("concurrency.serial", language)}
            </button>
            <button
              onClick={() => setConcurrency({ mode: "concurrent" })}
              className={cn(
                "flex-1 text-xs py-1.5 transition-colors",
                concurrency.mode === "concurrent"
                  ? "bg-primary text-primary-foreground"
                  : "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80"
              )}
            >
              {t("concurrency.concurrent", language)}
            </button>
          </div>

          {concurrency.mode === "concurrent" && (
            <>
              <label className="text-[11px] font-medium text-sidebar-foreground">{t("concurrency.maxConcurrent", language)}</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={concurrency.maxConcurrent}
                  onChange={(e) => setConcurrency({ maxConcurrent: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-6 text-center text-sidebar-foreground">
                  {concurrency.maxConcurrent}
                </span>
              </div>
            </>
          )}
        </CollapsibleSection>

        {/* Theme */}
        <div className="px-3 py-2.5 border-b border-sidebar-border">
          <div className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider mb-2">
            {t("theme.title", language)}
          </div>
          <div className="flex gap-2">
            {themes.map((th) => (
              <button
                key={th.key}
                onClick={() => setTheme(th.key)}
                title={th.label}
                className={cn(
                  "w-7 h-7 rounded-full transition-all",
                  theme === th.key && "ring-2 ring-ring ring-offset-2 ring-offset-sidebar"
                )}
                style={{ backgroundColor: th.color }}
              />
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="px-3 py-2.5">
          <div className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider mb-2">
            {t("language.title", language)}
          </div>
          <div className="flex rounded-md overflow-hidden border border-sidebar-border">
            <button
              onClick={() => setLanguage("zh")}
              className={cn(
                "flex-1 text-xs py-1.5 transition-colors",
                language === "zh"
                  ? "bg-primary text-primary-foreground"
                  : "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80"
              )}
            >
              中文
            </button>
            <button
              onClick={() => setLanguage("en")}
              className={cn(
                "flex-1 text-xs py-1.5 transition-colors",
                language === "en"
                  ? "bg-primary text-primary-foreground"
                  : "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80"
              )}
            >
              English
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
