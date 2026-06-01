"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Point, Rect, Selection, ToolType } from "@/types";

// 手柄定义
type HandleIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;

// 8个手柄相对于选区的位置
function getHandlePositions(sel: Selection, imgX: number, imgY: number, zoom: number) {
  const sx = imgX + sel.rect.x * zoom;
  const sy = imgY + sel.rect.y * zoom;
  const sw = sel.rect.width * zoom;
  const sh = sel.rect.height * zoom;
  return [
    { x: sx, y: sy },                         // 0: 左上
    { x: sx + sw / 2, y: sy },                // 1: 上中
    { x: sx + sw, y: sy },                    // 2: 右上
    { x: sx + sw, y: sy + sh / 2 },           // 3: 右中
    { x: sx + sw, y: sy + sh },               // 4: 右下
    { x: sx + sw / 2, y: sy + sh },           // 5: 下中
    { x: sx, y: sy + sh },                    // 6: 左下
    { x: sx, y: sy + sh / 2 },                // 7: 左中
  ];
}

// 手柄对应的光标样式
const handleCursors: Record<HandleIndex, string> = {
  0: "nwse-resize",
  1: "ns-resize",
  2: "nesw-resize",
  3: "ew-resize",
  4: "nwse-resize",
  5: "ns-resize",
  6: "nesw-resize",
  7: "ew-resize",
};

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastBrushPoint = useRef<Point | null>(null);
  const eraseRectButton = useRef<"left" | "right">("left");

  // Store state
  const currentImage = useAppStore((s) => s.images.find((img) => img.id === s.currentImageId));
  const viewMode = useAppStore((s) => s.viewMode);
  const zoom = useAppStore((s) => s.zoom);
  const panOffset = useAppStore((s) => s.panOffset);
  const setZoom = useAppStore((s) => s.setZoom);
  const setPanOffset = useAppStore((s) => s.setPanOffset);
  const addSelection = useAppStore((s) => s.addSelection);
  const setActiveSelection = useAppStore((s) => s.setActiveSelection);
  const updateSelection = useAppStore((s) => s.updateSelection);
  const moveSelection = useAppStore((s) => s.moveSelection);
  const _pushHistory = useAppStore((s) => s._pushHistory);
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const brushSize = useAppStore((s) => s.brushSize);
  const updateImageMask = useAppStore((s) => s.updateImageMask);
  const eraseRectAutoMode = useAppStore((s) => s.eraseRectAutoMode);
  const setPendingEraseRect = useAppStore((s) => s.setPendingEraseRect);
  const pendingEraseRect = useAppStore((s) => s.pendingEraseRect);

  // Local state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "pan" | "move" | "resize" | "brush" | "eraser" | "rotate" | "none">("none");
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState<Point>({ x: 0, y: 0 });
  const [hoveredSelection, setHoveredSelection] = useState<string | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<HandleIndex | null>(null);
  const [hoveredRotationHandle, setHoveredRotationHandle] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const cachedImage = useRef<HTMLImageElement | null>(null);
  const dragTargetSelId = useRef<string | null>(null);
  const dragHandleIndex = useRef<HandleIndex | null>(null);
  const dragSelStartRect = useRef<Rect | null>(null);
  const dragInitialAngle = useRef<number>(0);
  const dragInitialSelRotation = useRef<number>(0);
  const opacityRef = useRef<number>(1);
  const dragRotateCenter = useRef<Point>({ x: 0, y: 0 });

  // Pan with middle mouse or space+click
  const isPanKey = useRef(false);

  const displayUrl =
    viewMode === "result" && currentImage?.resultDataUrl
      ? currentImage.resultDataUrl
      : currentImage?.originalDataUrl;

  // 屏幕坐标 → 图片坐标（相对于图片左上角）
  const screenToImage = useCallback(
    (screenX: number, screenY: number): Point => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const img = cachedImage.current;
      if (!img) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      const imgW = img.naturalWidth * zoom;
      const imgH = img.naturalHeight * zoom;
      const imgX = rect.width / 2 + panOffset.x - imgW / 2;
      const imgY = rect.height / 2 + panOffset.y - imgH / 2;
      return {
        x: (screenX - rect.left - imgX) / zoom,
        y: (screenY - rect.top - imgY) / zoom,
      };
    },
    [zoom, panOffset]
  );

  // 检测鼠标在哪个手柄上
  const hitTestHandle = useCallback(
    (screenX: number, screenY: number): { selId: string; handle: HandleIndex } | null => {
      if (!currentImage || !containerRef.current) return null;
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const cx = containerRect.width / 2 + panOffset.x;
      const cy = containerRect.height / 2 + panOffset.y;

      for (const sel of currentImage.selections) {
        if (!sel.active) continue; // 只检测激活选区的手柄
        const positions = getHandlePositions(sel, cx - (cachedImage.current?.naturalWidth ?? 0) * zoom / 2, cy - (cachedImage.current?.naturalHeight ?? 0) * zoom / 2, zoom);
        for (let i = 0; i < 8; i++) {
          const h = positions[i];
          if (
            screenX >= containerRect.left + h.x - HANDLE_HALF - 2 &&
            screenX <= containerRect.left + h.x + HANDLE_HALF + 2 &&
            screenY >= containerRect.top + h.y - HANDLE_HALF - 2 &&
            screenY <= containerRect.top + h.y + HANDLE_HALF + 2
          ) {
            return { selId: sel.id, handle: i as HandleIndex };
          }
        }
      }
      return null;
    },
    [currentImage, zoom, panOffset]
  );

  // 检测鼠标在旋转手柄上（橙色圆点，位于选区顶部中央上方16px处）
  const hitTestRotationHandle = useCallback(
    (screenX: number, screenY: number): string | null => {
      if (!currentImage || !containerRef.current) return null;
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const cx = containerRect.width / 2 + panOffset.x;
      const cy = containerRect.height / 2 + panOffset.y;
      const imgX = cx - (cachedImage.current?.naturalWidth ?? 0) * zoom / 2;
      const imgY = cy - (cachedImage.current?.naturalHeight ?? 0) * zoom / 2;

      for (const sel of currentImage.selections) {
        if (!sel.active) continue;
        const sx = imgX + sel.rect.x * zoom;
        const sy = imgY + sel.rect.y * zoom;
        const sw = sel.rect.width * zoom;
        const centerX = sx + sw / 2;
        const centerY = sy;
        const handleX = containerRect.left + centerX;
        const handleY = containerRect.top + centerY - 16;

        const dist = Math.sqrt((screenX - handleX) ** 2 + (screenY - handleY) ** 2);
        if (dist <= 7) {
          return sel.id;
        }
      }
      return null;
    },
    [currentImage, zoom, panOffset]
  );

  // 检测鼠标在哪个选区内
  const hitTestSelection = useCallback(
    (screenX: number, screenY: number): string | null => {
      const imgPt = screenToImage(screenX, screenY);
      if (!currentImage) return null;
      for (const sel of currentImage.selections) {
        if (
          imgPt.x >= sel.rect.x &&
          imgPt.x <= sel.rect.x + sel.rect.width &&
          imgPt.y >= sel.rect.y &&
          imgPt.y <= sel.rect.y + sel.rect.height
        ) {
          return sel.id;
        }
      }
      return null;
    },
    [currentImage, screenToImage]
  );

  // Canvas 渲染
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);

    if (!currentImage) return;

    const cx = w / 2 + panOffset.x;
    const cy = h / 2 + panOffset.y;

    const img = cachedImage.current;
    if (img && img.complete && img.naturalWidth > 0) {
      const imgW = img.naturalWidth * zoom;
      const imgH = img.naturalHeight * zoom;
      const imgX = cx - imgW / 2;
      const imgY = cy - imgH / 2;

      ctx.drawImage(img, imgX, imgY, imgW, imgH);

      // 叠加 mask（半透明红色显示已涂区域）
      const mc = maskCanvasRef.current;
      if (mc) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(mc, imgX, imgY, imgW, imgH);
        ctx.restore();
      }

      // 应用全局透明度（键盘0-9调整）
      ctx.globalAlpha = opacityRef.current;

      // 绘制选区
      for (const sel of currentImage.selections) {
        ctx.save();
        const sx = imgX + sel.rect.x * zoom;
        const sy = imgY + sel.rect.y * zoom;
        const sw = sel.rect.width * zoom;
        const sh = sel.rect.height * zoom;

        // 旋转变换
        if (sel.rotation) {
          const centerX = sx + sw / 2;
          const centerY = sy + sh / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate(sel.rotation * Math.PI / 180);
          ctx.translate(-centerX, -centerY);
        }

        const isActive = sel.active;
        const isHovered = sel.id === hoveredSelection;

        ctx.fillStyle = isActive
          ? "rgba(59, 130, 246, 0.15)"
          : "rgba(59, 130, 246, 0.08)";

        if (sel.polygonPoints && sel.polygonPoints.length >= 3) {
          // 自由变形多边形
          ctx.beginPath();
          for (let i = 0; i < sel.polygonPoints.length; i++) {
            const p = sel.polygonPoints[i];
            const px = imgX + p.x * zoom;
            const py = imgY + p.y * zoom;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = isActive ? "#3b82f6" : isHovered ? "#93c5fd" : "rgba(59, 130, 246, 0.5)";
          ctx.lineWidth = isActive ? 2 : 1.5;
          ctx.setLineDash(isActive ? [] : [6, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          if (isActive) {
            // 顶点手柄
            for (const p of sel.polygonPoints) {
              const px = imgX + p.x * zoom;
              const py = imgY + p.y * zoom;
              ctx.fillStyle = "#3b82f6";
              ctx.fillRect(px - HANDLE_HALF, py - HANDLE_HALF, HANDLE_SIZE, HANDLE_SIZE);
              ctx.strokeStyle = "white";
              ctx.lineWidth = 1;
              ctx.strokeRect(px - HANDLE_HALF, py - HANDLE_HALF, HANDLE_SIZE, HANDLE_SIZE);
            }
          }
        } else {
          ctx.fillRect(sx, sy, sw, sh);

          ctx.strokeStyle = isActive
            ? "#3b82f6"
            : isHovered
            ? "#93c5fd"
            : "rgba(59, 130, 246, 0.5)";
          ctx.lineWidth = isActive ? 2 : 1.5;
          ctx.setLineDash(isActive ? [] : [6, 3]);
          ctx.strokeRect(sx, sy, sw, sh);
          ctx.setLineDash([]);
        }

        ctx.restore();

        // 手柄（在恢复变换后的坐标系中绘制，保持轴对齐）
        ctx.save();
        if (isActive && !sel.polygonPoints) {
          const handles = getHandlePositions(sel, imgX, imgY, zoom);
          for (let i = 0; i < 8; i++) {
            const hPos = handles[i];
            const isHandleHovered = hoveredHandle === i && isActive;
            ctx.fillStyle = isHandleHovered ? "#1d4ed8" : "#3b82f6";
            ctx.fillRect(
              hPos.x - HANDLE_HALF,
              hPos.y - HANDLE_HALF,
              HANDLE_SIZE,
              HANDLE_SIZE
            );
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1;
            ctx.strokeRect(
              hPos.x - HANDLE_HALF,
              hPos.y - HANDLE_HALF,
              HANDLE_SIZE,
              HANDLE_SIZE
            );
          }

          // 旋转手柄（橙色圆点，位于选区顶部中央上方16px处）
          const rotHandleX = sx + sw / 2;
          const rotHandleY = sy - 16;
          ctx.beginPath();
          ctx.arc(rotHandleX, rotHandleY, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#f59e0b";
          ctx.fill();
          ctx.strokeStyle = "white";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        if (currentImage.selections.length > 1) {
          ctx.fillStyle = "#3b82f6";
          ctx.font = "bold 11px monospace";
          ctx.fillText(`#${currentImage.selections.indexOf(sel) + 1}`, sx + 4, sy - 4);
        }
        ctx.restore();
      }

      // 绘制拖拽框（创建新选区 / 矩形抹字）
      if (dragMode === "select" && isDragging && (activeTool === "select" || activeTool === "erase-rect")) {
        const ds = screenToImage(dragStart.x, dragStart.y);
        const dc = screenToImage(dragCurrent.x, dragCurrent.y);

        const selX = imgX + Math.min(ds.x, dc.x) * zoom;
        const selY = imgY + Math.min(ds.y, dc.y) * zoom;
        const selW = Math.abs(dc.x - ds.x) * zoom;
        const selH = Math.abs(dc.y - ds.y) * zoom;

        ctx.fillStyle = "rgba(59, 130, 246, 0.2)";
        ctx.fillRect(selX, selY, selW, selH);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(selX, selY, selW, selH);
        ctx.setLineDash([]);
      }

      // 渲染未提交的矩形抹字框（手动模式下）
      if (activeTool === "erase-rect" && pendingEraseRect && !isDragging) {
        const px = imgX + pendingEraseRect.x * zoom;
        const py = imgY + pendingEraseRect.y * zoom;
        const pw = pendingEraseRect.width * zoom;
        const ph = pendingEraseRect.height * zoom;
        ctx.save();
        ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(px, py, pw, ph);
        ctx.setLineDash([]);
        ctx.fillStyle = "#f59e0b";
        ctx.font = "bold 11px monospace";
        ctx.fillText("Space=修复 Ctrl+D=删除", px + 4, py - 4);
        ctx.restore();
      }

      // 画笔/橡皮擦光标指示
      if ((activeTool === "brush" || activeTool === "eraser") && !isDragging) {
        // 绘制一个小圆指示画笔位置 (会在 mousemove 中通过 hover 更新，这里用 ref 存储位置)
        // 实际画笔绘制在 mousemove 中处理
      }
    }
  }, [currentImage, zoom, panOffset, viewMode, dragMode, isDragging, dragStart, dragCurrent, hoveredSelection, hoveredHandle, activeTool, screenToImage, pendingEraseRect]);

  // 图片加载 + 同步初始化 mask canvas
  useEffect(() => {
    if (!displayUrl) {
      cachedImage.current = null;
      maskCanvasRef.current = null;
      setImageLoaded(false);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cachedImage.current = img;
      // 创建/重置 mask canvas
      const mc = document.createElement("canvas");
      mc.width = img.naturalWidth;
      mc.height = img.naturalHeight;
      // 如果已有保存的 mask，画进去
      if (currentImage?.maskDataUrl) {
        const maskImg = new Image();
        maskImg.onload = () => {
          mc.getContext("2d")?.drawImage(maskImg, 0, 0);
        };
        maskImg.src = currentImage.maskDataUrl;
      }
      maskCanvasRef.current = mc;
      setImageLoaded(true);
    };
    img.onerror = () => {
      cachedImage.current = null;
      maskCanvasRef.current = null;
      setImageLoaded(false);
    };
    img.src = displayUrl;
  }, [displayUrl, currentImage?.id]);

  // 渲染循环
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      render();
      animationRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      running = false;
      cancelAnimationFrame(animationRef.current);
    };
  }, [render]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // 空格 — 平移
      if (e.code === "Space" && !isInput && !isPanKey.current) {
        e.preventDefault();
        isPanKey.current = true;
      }

      // Ctrl+A / Cmd+A — 全选当前图片的所有选区
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && !isInput) {
        e.preventDefault();
        const current = useAppStore.getState().getCurrentImage();
        if (current) {
          current.selections.forEach(s => useAppStore.getState().updateSelection(s.id, { active: true }));
        }
        return;
      }

      // 数字键 0-9 — 调整全局透明度
      if (!isInput && /^[0-9]$/.test(e.key)) {
        opacityRef.current = parseInt(e.key) / 10;
        return;
      }

      // A/D 翻页
      if (!isInput) {
        if (e.key === "a" || e.key === "A") {
          useAppStore.getState().navigateImage("prev");
        }
        if (e.key === "d" || e.key === "D") {
          useAppStore.getState().navigateImage("next");
        }
        // Delete 删除选区
        if (e.key === "Delete" || e.key === "Backspace") {
          const current = useAppStore.getState().getCurrentImage();
          const activeSel = current?.selections.find((s) => s.active);
          if (activeSel) {
            useAppStore.getState().removeSelection(activeSel.id);
          }
        }
        // Ctrl+Z 撤销
        if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
          e.preventDefault();
          useAppStore.getState().undo();
        }
        // Ctrl+Y / Ctrl+Shift+Z 重做
        if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
          e.preventDefault();
          useAppStore.getState().redo();
        }
        // Ctrl+D — 删除当前未提交的矩形抹字框
        if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
          e.preventDefault();
          useAppStore.getState().setPendingEraseRect(null);
          return;
        }
        // 空格 — 对未提交的矩形执行修复（仅 erase-rect 工具非自动模式）
        if (e.code === "Space" && !isInput) {
          const st = useAppStore.getState();
          if (st.activeTool === "erase-rect" && st.pendingEraseRect && !st.eraseRectAutoMode) {
            e.preventDefault();
            const rect = st.pendingEraseRect;
            const cur = st.getCurrentImage();
            if (cur) {
              const conn = st.connection;
              const imgId = cur.id;
              st.updateImageStatus(imgId, "processing");
              (async () => {
                try {
                  const { inpaintRect } = await import("@/lib/inpaint");
                  const src = cur.resultDataUrl ?? cur.originalDataUrl;
                  const out = await inpaintRect(conn, src, rect);
                  useAppStore.getState().updateImageResult(imgId, out);
                  useAppStore.getState().updateImageStatus(imgId, "done");
                  useAppStore.getState().setViewMode("result");
                  useAppStore.getState().setPendingEraseRect(null);
                } catch (err: any) {
                  useAppStore.getState().updateImageStatus(imgId, "error", err?.message ?? "inpaint failed");
                }
              })();
              return;
            }
          }
        }
        // Q/W/E 工具切换
        if (e.key === "q" || e.key === "Q") { e.preventDefault(); useAppStore.getState().setActiveTool("select"); }
        if (e.key === "w" || e.key === "W") { e.preventDefault(); useAppStore.getState().setActiveTool("brush"); }
        if (e.key === "e" || e.key === "E") { e.preventDefault(); useAppStore.getState().setActiveTool("eraser"); }
        if (e.key === "r" || e.key === "R") { e.preventDefault(); useAppStore.getState().setActiveTool("text"); }
        if (e.key === "h" || e.key === "H") { e.preventDefault(); useAppStore.getState().setActiveTool("hand"); }
        // T 切换文本编辑模式 / P 切换画板模式
        if (e.key === "t" || e.key === "T") {
          const mode = useAppStore.getState().editorMode;
          useAppStore.getState().setEditorMode(mode === "text" ? "default" : "text");
        }
        if (e.key === "p" || e.key === "P") {
          const mode = useAppStore.getState().editorMode;
          useAppStore.getState().setEditorMode(mode === "sketch" ? "default" : "sketch");
        }
        // Ctrl+Q/W/E 文件操作（用 CustomEvent 通知 Sidebar）
        if ((e.ctrlKey || e.metaKey) && (e.key === "q" || e.key === "Q")) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("file-action", { detail: { action: "open" } }));
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "w" || e.key === "W") && !e.shiftKey) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("file-action", { detail: { action: "save" } }));
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "e" || e.key === "E")) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("file-action", { detail: { action: "export" } }));
        }
        // Ctrl+滚轮缩放
        if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
          e.preventDefault();
          const z = useAppStore.getState().zoom;
          useAppStore.getState().setZoom(Math.min(10, z + 0.25));
        }
        if (e.ctrlKey && e.key === "-") {
          e.preventDefault();
          const z = useAppStore.getState().zoom;
          useAppStore.getState().setZoom(Math.max(0.1, z - 0.25));
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isPanKey.current = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // ── Mouse Handlers ──

  const getCursor = useCallback((): string => {
    if (isPanKey.current) return "grab";
    if (dragMode === "pan") return "grabbing";
    if (dragMode === "move") return "move";
    if (dragMode === "resize" && dragHandleIndex.current !== null) {
      return handleCursors[dragHandleIndex.current] || "crosshair";
    }
    if (dragMode === "rotate") return "grabbing";
    if (activeTool === "select") {
      if (hoveredHandle !== null) return handleCursors[hoveredHandle];
      if (hoveredRotationHandle) return "grab";
      if (hoveredSelection) return "move";
      return "crosshair";
    }
    if (activeTool === "brush") return "crosshair";
    if (activeTool === "eraser") return "crosshair";
    if (activeTool === "hand") return "grab";
    return "crosshair";
  }, [activeTool, dragMode, hoveredHandle, hoveredSelection, hoveredRotationHandle]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!currentImage) return;
      e.preventDefault();

      const point: Point = { x: e.clientX, y: e.clientY };
      setDragStart(point);
      setDragCurrent(point);

      // 中键或空格+点击 = 平移
      if (e.button === 1 || isPanKey.current) {
        setDragMode("pan");
        setIsDragging(true);
        return;
      }

      // erase-rect 工具的右键 = 拖框清除该区域结果（恢复原图）
      if (e.button === 2 && activeTool === "erase-rect") {
        setDragMode("select");
        setIsDragging(true);
        // 标记当前是右键模式：临时把 dragCurrent 的 button 信息存起来不行，用 ref
        eraseRectButton.current = "right";
        return;
      }

      // text 工具的右键 = 拉文本框（在 editorMode=text 或 activeTool=text 时）
      const editorMode = useAppStore.getState().editorMode;
      if (e.button === 2 && (activeTool === "text" || editorMode === "text")) {
        setDragMode("select");
        setIsDragging(true);
        eraseRectButton.current = "right";
        return;
      }

      if (e.button !== 0) return;
      eraseRectButton.current = "left";

      // Hand 工具始终平移
      if (activeTool === "hand") {
        setDragMode("pan");
        setIsDragging(true);
        return;
      }

      // 检查是否在手柄上
      const handleHit = hitTestHandle(e.clientX, e.clientY);
      if (handleHit && activeTool === "select") {
        setDragMode("resize");
        setIsDragging(true);
        dragTargetSelId.current = handleHit.selId;
        dragHandleIndex.current = handleHit.handle;
        const sel = currentImage.selections.find((s) => s.id === handleHit.selId);
        if (sel) dragSelStartRect.current = { ...sel.rect };
        return;
      }

      // 检查是否在旋转手柄上
      const rotHandleHit = hitTestRotationHandle(e.clientX, e.clientY);
      if (rotHandleHit && activeTool === "select") {
        setDragMode("rotate");
        setIsDragging(true);
        setHoveredRotationHandle(false);
        dragTargetSelId.current = rotHandleHit;
        const sel = currentImage.selections.find((s) => s.id === rotHandleHit);
        if (sel) {
          const container = containerRef.current;
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const cx = containerRect.width / 2 + panOffset.x;
            const cy = containerRect.height / 2 + panOffset.y;
            const imgX = cx - (cachedImage.current?.naturalWidth ?? 0) * zoom / 2;
            const imgY = cy - (cachedImage.current?.naturalHeight ?? 0) * zoom / 2;
            const sx = imgX + sel.rect.x * zoom;
            const sy = imgY + sel.rect.y * zoom;
            const sw = sel.rect.width * zoom;
            const sh = sel.rect.height * zoom;
            const centerX = sx + sw / 2;
            const centerY = sy + sh / 2;
            dragRotateCenter.current = { x: centerX, y: centerY };
            const initAngle = Math.atan2(
              e.clientY - containerRect.top - centerY,
              e.clientX - containerRect.left - centerX
            ) * 180 / Math.PI;
            dragInitialAngle.current = sel.rotation ? sel.rotation - initAngle : -initAngle;
            dragInitialSelRotation.current = sel.rotation || 0;
            _pushHistory();
          }
        }
        return;
      }

      // 检查是否在选区内
      const selHit = hitTestSelection(e.clientX, e.clientY);
      if (selHit && activeTool === "select") {
        setActiveSelection(selHit);
        setDragMode("move");
        setIsDragging(true);
        dragTargetSelId.current = selHit;
        const sel = currentImage.selections.find((s) => s.id === selHit);
        if (sel) {
          dragSelStartRect.current = { ...sel.rect };
          _pushHistory(); // 移动开始前记录历史
        }
        return;
      }

      // 画笔/橡皮擦
      if (activeTool === "brush" || activeTool === "eraser") {
        setDragMode(activeTool);
        setIsDragging(true);
        lastBrushPoint.current = screenToImage(e.clientX, e.clientY);
        return;
      }

      // 未命中任何条目 = 创建新选区 (select 模式) 或抹字框 (erase-rect)
      if (activeTool === "select" || activeTool === "erase-rect") {
        setDragMode("select");
        setIsDragging(true);
        return;
      }
    },
    [currentImage, activeTool, hitTestHandle, hitTestRotationHandle, hitTestSelection, setActiveSelection, _pushHistory, zoom, panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) {
        // 更新 hover 状态
        const handleHit = hitTestHandle(e.clientX, e.clientY);
        if (handleHit) {
          setHoveredHandle(handleHit.handle);
          setHoveredSelection(handleHit.selId);
          setHoveredRotationHandle(false);
          return;
        }
        setHoveredHandle(null);
        // 检测旋转手柄
        const rotHit = hitTestRotationHandle(e.clientX, e.clientY);
        if (rotHit) {
          setHoveredRotationHandle(true);
          setHoveredSelection(rotHit);
          return;
        }
        setHoveredRotationHandle(false);
        const selHit = hitTestSelection(e.clientX, e.clientY);
        setHoveredSelection(selHit);
        return;
      }

      const dx = e.clientX - dragCurrent.x;
      const dy = e.clientY - dragCurrent.y;
      setDragCurrent({ x: e.clientX, y: e.clientY });

      if (dragMode === "pan") {
        setPanOffset({
          x: panOffset.x + (e.clientX - dragStart.x),
          y: panOffset.y + (e.clientY - dragStart.y),
        });
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
      }

      if (dragMode === "move" && dragTargetSelId.current) {
        const imgDx = (e.clientX - dragCurrent.x) / zoom;
        const imgDy = (e.clientY - dragCurrent.y) / zoom;
        moveSelection(dragTargetSelId.current, imgDx, imgDy);
        return;
      }

      if (dragMode === "resize" && dragTargetSelId.current && dragHandleIndex.current !== null && dragSelStartRect.current) {
        const imgStart = screenToImage(dragCurrent.x - (e.clientX - dragCurrent.x), dragCurrent.y - (e.clientY - dragCurrent.y));
        const imgNow = screenToImage(e.clientX, e.clientY);
        const orig = dragSelStartRect.current;
        let newRect = { ...orig };
        const hi = dragHandleIndex.current;

        // 根据手柄调整 rect
        if (hi === 0) { // 左上
          newRect.x = Math.min(imgNow.x, orig.x + orig.width);
          newRect.y = Math.min(imgNow.y, orig.y + orig.height);
          newRect.width = orig.x + orig.width - newRect.x;
          newRect.height = orig.y + orig.height - newRect.y;
        } else if (hi === 1) { // 上中
          newRect.y = Math.min(imgNow.y, orig.y + orig.height);
          newRect.height = orig.y + orig.height - newRect.y;
        } else if (hi === 2) { // 右上
          newRect.y = Math.min(imgNow.y, orig.y + orig.height);
          newRect.width = Math.max(5, imgNow.x - orig.x);
          newRect.height = orig.y + orig.height - newRect.y;
        } else if (hi === 3) { // 右中
          newRect.width = Math.max(5, imgNow.x - orig.x);
        } else if (hi === 4) { // 右下
          newRect.width = Math.max(5, imgNow.x - orig.x);
          newRect.height = Math.max(5, imgNow.y - orig.y);
        } else if (hi === 5) { // 下中
          newRect.height = Math.max(5, imgNow.y - orig.y);
        } else if (hi === 6) { // 左下
          newRect.x = Math.min(imgNow.x, orig.x + orig.width);
          newRect.width = orig.x + orig.width - newRect.x;
          newRect.height = Math.max(5, imgNow.y - orig.y);
        } else if (hi === 7) { // 左中
          newRect.x = Math.min(imgNow.x, orig.x + orig.width);
          newRect.width = orig.x + orig.width - newRect.x;
        }

        updateSelection(dragTargetSelId.current, { rect: newRect });
        return;
      }

      if (dragMode === "rotate" && dragTargetSelId.current) {
        const sel = currentImage?.selections.find((s) => s.id === dragTargetSelId.current);
        if (sel) {
          const container = containerRef.current;
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const centerScreenX = containerRect.left + dragRotateCenter.current.x;
            const centerScreenY = containerRect.top + dragRotateCenter.current.y;
            const angle = Math.atan2(
              e.clientY - centerScreenY,
              e.clientX - centerScreenX
            ) * 180 / Math.PI;
            const newRotation = dragInitialAngle.current + angle;
            updateSelection(dragTargetSelId.current, { rotation: newRotation });
          }
        }
        return;
      }

      // brush/eraser 模式 — 在 mask canvas 上绘制
      if ((dragMode === "brush" || dragMode === "eraser") && currentImage) {
        const mc = maskCanvasRef.current;
        const mctx = mc?.getContext("2d");
        if (mc && mctx) {
          const cur = screenToImage(e.clientX, e.clientY);
          const prev = lastBrushPoint.current ?? cur;
          mctx.save();
          if (dragMode === "eraser") {
            mctx.globalCompositeOperation = "destination-out";
            mctx.strokeStyle = "rgba(0,0,0,1)";
          } else {
            mctx.globalCompositeOperation = "source-over";
            mctx.strokeStyle = "rgba(255,80,80,1)";
          }
          mctx.lineCap = "round";
          mctx.lineJoin = "round";
          mctx.lineWidth = brushSize;
          mctx.beginPath();
          mctx.moveTo(prev.x, prev.y);
          mctx.lineTo(cur.x, cur.y);
          mctx.stroke();
          mctx.restore();
          lastBrushPoint.current = cur;
        }
      }
    },
    [isDragging, dragMode, dragCurrent, dragStart, panOffset, zoom, screenToImage, moveSelection, updateSelection, hitTestHandle, hitTestRotationHandle, hitTestSelection, setPanOffset, currentImage, setHoveredRotationHandle, brushSize]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode === "select" && isDragging && activeTool === "select") {
        const startPt = screenToImage(dragStart.x, dragStart.y);
        const endPt = screenToImage(dragCurrent.x, dragCurrent.y);

        const rect: Rect = {
          x: Math.min(startPt.x, endPt.x),
          y: Math.min(startPt.y, endPt.y),
          width: Math.abs(endPt.x - startPt.x),
          height: Math.abs(endPt.y - startPt.y),
        };

        if (rect.width > 5 && rect.height > 5) {
          addSelection(rect);
        }
      }

      // text 工具/text 模式 + 右键拖框结束 → 创建文本框
      const editorModeNow = useAppStore.getState().editorMode;
      if (
        dragMode === "select" &&
        isDragging &&
        eraseRectButton.current === "right" &&
        (activeTool === "text" || editorModeNow === "text")
      ) {
        const startPt = screenToImage(dragStart.x, dragStart.y);
        const endPt = screenToImage(dragCurrent.x, dragCurrent.y);
        const rect: Rect = {
          x: Math.min(startPt.x, endPt.x),
          y: Math.min(startPt.y, endPt.y),
          width: Math.abs(endPt.x - startPt.x),
          height: Math.abs(endPt.y - startPt.y),
        };
        if (rect.width > 8 && rect.height > 8) {
          addSelection(rect);
          // 找新建的 selection（最后一个）并附加 textBlock
          setTimeout(() => {
            const cur = useAppStore.getState().getCurrentImage();
            const sel = cur?.selections[cur.selections.length - 1];
            if (sel) {
              useAppStore.getState().addTextBlock({
                selectionId: sel.id,
                text: "",
                fontFamily: "sans-serif",
                fontSize: 16,
                color: "#000000",
                bold: false,
                italic: false,
                underline: false,
                alignment: "left",
                direction: "horizontal",
              });
            }
          }, 0);
        }
      }

      // erase-rect 工具：拖框结束
      if (dragMode === "select" && isDragging && activeTool === "erase-rect" && currentImage) {
        const startPt = screenToImage(dragStart.x, dragStart.y);
        const endPt = screenToImage(dragCurrent.x, dragCurrent.y);
        const rect: Rect = {
          x: Math.min(startPt.x, endPt.x),
          y: Math.min(startPt.y, endPt.y),
          width: Math.abs(endPt.x - startPt.x),
          height: Math.abs(endPt.y - startPt.y),
        };
        if (rect.width > 8 && rect.height > 8) {
          if (eraseRectButton.current === "right") {
            // 右键：清除该区域已有的修复结果（用原图覆盖）
            const imgId = currentImage.id;
            const originalDataUrl = currentImage.originalDataUrl;
            const resultUrl = currentImage.resultDataUrl;
            if (resultUrl) {
              (async () => {
                const { compositeImage } = await import("@/lib/image");
                // generatedImg = 原图整张，从 rect 处取像素贴回 result 的 rect 处
                const restored = await compositeImage(resultUrl, originalDataUrl, rect, rect);
                useAppStore.getState().updateImageResult(imgId, restored);
              })();
            }
          } else if (eraseRectAutoMode) {
            // 自动模式：立即修复
            const conn = useAppStore.getState().connection;
            const imgId = currentImage.id;
            useAppStore.getState().updateImageStatus(imgId, "processing");
            (async () => {
              try {
                const { inpaintRect } = await import("@/lib/inpaint");
                const src = currentImage.resultDataUrl ?? currentImage.originalDataUrl;
                const out = await inpaintRect(conn, src, rect);
                useAppStore.getState().updateImageResult(imgId, out);
                useAppStore.getState().updateImageStatus(imgId, "done");
                useAppStore.getState().setViewMode("result");
              } catch (err: any) {
                useAppStore.getState().updateImageStatus(imgId, "error", err?.message ?? "inpaint failed");
              }
            })();
          } else {
            // 手动模式：暂存为待提交矩形，等空格或"修复"按钮触发
            setPendingEraseRect(rect);
          }
        }
      }

      // 选区 resize/move 结束 — 更新起始 rect 为最终状态
      if ((dragMode === "resize" || dragMode === "move") && dragTargetSelId.current) {
        // history 已在 mousedown 时 push，这里不需要额外操作
      }

      // 旋转结束 — 选区已实时更新，仅需清理
      if (dragMode === "rotate" && dragTargetSelId.current) {
        // rotation 已在 mousemove 中实时更新
      }

      // brush/eraser 结束 — 持久化 mask 到 store
      if ((dragMode === "brush" || dragMode === "eraser") && currentImage) {
        const mc = maskCanvasRef.current;
        if (mc) {
          updateImageMask(currentImage.id, mc.toDataURL("image/png"));
        }
        lastBrushPoint.current = null;
      }

      setIsDragging(false);
      setDragMode("none");
      dragTargetSelId.current = null;
      dragHandleIndex.current = null;
      dragSelStartRect.current = null;
      dragInitialAngle.current = 0;
      dragInitialSelRotation.current = 0;
    },
    [dragMode, isDragging, activeTool, dragStart, dragCurrent, screenToImage, addSelection, currentImage, updateImageMask]
  );

  // 滚轮：默认缩放，Ctrl+滚轮 缩放（细粒度），Shift+滚轮 调画笔大小
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey && (activeTool === "brush" || activeTool === "eraser")) {
        const cur = useAppStore.getState().brushSize;
        const next = e.deltaY > 0 ? cur - 2 : cur + 2;
        useAppStore.getState().setBrushSize(next);
        return;
      }
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(0.1, Math.min(10, zoom + delta));
      setZoom(newZoom);
    },
    [zoom, setZoom, activeTool]
  );

  // 粘贴
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const dataUrl = ev.target?.result as string;
            const img = new Image();
            img.onload = () => {
              const entry = {
                id: Math.random().toString(36).substring(2, 11),
                fileName: `pasted-${Date.now()}.png`,
                originalDataUrl: dataUrl,
                width: img.naturalWidth,
                height: img.naturalHeight,
                selections: [],
                status: "idle" as const,
                globalPrompt: "",
              };
              useAppStore.getState().addImages([entry]);
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  return (
    <div
      ref={containerRef}
      className="canvas-container flex-1 relative"
      style={{ cursor: getCursor() }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDragging(false);
        setDragMode("none");
        setHoveredSelection(null);
        setHoveredHandle(null);
        setHoveredRotationHandle(false);
        dragTargetSelId.current = null;
        dragHandleIndex.current = null;
        dragSelStartRect.current = null;
        dragInitialAngle.current = 0;
        dragInitialSelRotation.current = 0;
      }}
      onWheel={handleWheel}
      onContextMenu={(e) => {
        // erase-rect 工具的右键被自定义为"清除区域"
        if (activeTool === "erase-rect" || activeTool === "text") e.preventDefault();
      }}
      tabIndex={0}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {!currentImage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-muted-foreground text-center">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg font-medium">上传图片开始编辑</p>
            <p className="text-sm mt-1 opacity-60">点击左侧上传，或按 Ctrl+V 粘贴</p>
            <p className="text-xs mt-2 opacity-40">Q/W/E/R/H 切换工具 · Space 平移 · 滚轮缩放</p>
          </div>
        </div>
      )}
    </div>
  );
}
