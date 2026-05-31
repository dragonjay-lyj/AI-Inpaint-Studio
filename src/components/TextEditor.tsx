"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";

/**
 * TextEditor — 覆盖在 Canvas 上的文本编辑层
 *
 * 为每个文本块渲染一个 contentEditable <div>，并支持 Alt+WASD 键盘导航：
 *   Alt+W / Alt+ArrowUp   → 上一个文本块
 *   Alt+S / Alt+ArrowDown → 下一个文本块
 *   Alt+A                 → 第一个文本块
 *   Alt+D                 → 最后一个文本块
 *
 * 每个 <div> 带有 data-block-id={selectionId} 属性供外部聚焦定位。
 * 切换块时在右上角显示 toast 提示当前块编号。
 */
export default function TextEditor() {
  const textBlocks = useAppStore((s) => s.textBlocks);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(-1);
  const [toast, setToast] = useState<string>("");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 显示 toast 通知
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1500);
  }, []);

  // 聚焦到指定索引的块
  const focusBlock = useCallback(
    (index: number) => {
      if (index < 0 || index >= textBlocks.length) return;
      const block = textBlocks[index];
      const el = blockRefs.current.get(block.selectionId);
      if (el) {
        el.focus();
        setActiveBlockIndex(index);
        showToast(`Block #${index + 1}`);
      }
    },
    [textBlocks, showToast],
  );

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!e.altKey) return;
      // Skip when user is typing in inputs/textareas (but allow in contentEditable blocks)
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const count = textBlocks.length;
      if (count === 0) return;

      let nextIndex = -1;

      switch (e.key) {
        case "w":
        case "W":
        case "ArrowUp":
          e.preventDefault();
          nextIndex =
            activeBlockIndex <= 0 ? count - 1 : activeBlockIndex - 1;
          break;
        case "s":
        case "S":
        case "ArrowDown":
          e.preventDefault();
          nextIndex =
            activeBlockIndex < 0
              ? 0
              : (activeBlockIndex + 1) % count;
          break;
        case "a":
        case "A":
          e.preventDefault();
          nextIndex = 0;
          break;
        case "d":
        case "D":
          e.preventDefault();
          nextIndex = count - 1;
          break;
      }

      if (nextIndex >= 0) {
        focusBlock(nextIndex);
      }
    },
    [textBlocks, activeBlockIndex, focusBlock],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // 点击块时更新 activeBlockIndex
  const handleBlockFocus = useCallback(
    (selectionId: string) => {
      const idx = textBlocks.findIndex((tb) => tb.selectionId === selectionId);
      if (idx >= 0) setActiveBlockIndex(idx);
    },
    [textBlocks],
  );

  if (textBlocks.length === 0) return null;

  return (
    <>
      {/* Toast 通知 */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-[100] pointer-events-none select-none
                     bg-primary text-primary-foreground text-xs font-semibold
                     px-3 py-1.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-1
                     transition-opacity duration-200"
        >
          {toast}
        </div>
      )}

      {/* 文本块层 */}
      {textBlocks.map((block) => (
        <div
          key={block.selectionId}
          data-block-id={block.selectionId}
          ref={(el) => {
            if (el) blockRefs.current.set(block.selectionId, el);
            else blockRefs.current.delete(block.selectionId);
          }}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => handleBlockFocus(block.selectionId)}
          className="absolute outline-none whitespace-pre-wrap break-words
                     cursor-text hover:ring-1 hover:ring-primary/30
                     focus:ring-2 focus:ring-primary focus:bg-background/60
                     rounded px-1 py-0.5 transition-shadow min-w-[20px] min-h-[1em]"
          style={{
            fontFamily: block.fontFamily || "sans-serif",
            fontSize: `${block.fontSize || 16}px`,
            color: block.color || "#000000",
            fontWeight: block.bold ? 700 : 400,
            fontStyle: block.italic ? "italic" : "normal",
            textDecoration: block.underline ? "underline" : "none",
            textAlign: (block.alignment as "left" | "center" | "right") || "left",
            writingMode:
              block.direction === "vertical" ? "vertical-rl" : "horizontal-tb",
            // 位置由 Canvas 根据选区 rect 设置，这里仅作兜底
            left: 0,
            top: 0,
            pointerEvents: "auto",
          }}
          // 让父容器知道这个块的位置（实际定位由 Canvas 覆盖层控制）
        >
          {block.text}
        </div>
      ))}
    </>
  );
}
