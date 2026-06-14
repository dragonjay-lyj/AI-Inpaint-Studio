"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useAppStore } from "@/lib/store";
import { Search, Replace, X, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Scope = "current" | "global";
type Field = "all" | "source" | "target";

interface Hit {
  imageId: string;
  imageName: string;
  selectionId: string;
  field: "prompt" | "text";
  before: string;
  match: string;
  after: string;
  start: number;
  end: number;
}

/**
 * 查找替换面板：
 * - Ctrl+F → 当前页查找 (scope=current)
 * - Ctrl+G / Ctrl+Shift+F → 全局查找 (scope=global)
 * - Ctrl+H → 替换面板（显示替换输入框）
 *
 * 搜索源：
 *   "all"    每个图片：selections[].prompt + textBlocks[].text
 *   "source" textBlocks[].text 中的原文 — 这里简化为搜 selection.prompt
 *   "target" textBlocks[].text — 译文
 */
export default function FindReplace() {
  const images = useAppStore((s) => s.images);
  const currentImageId = useAppStore((s) => s.currentImageId);
  const textBlocks = useAppStore((s) => s.textBlocks);
  const updateSelection = useAppStore((s) => s.updateSelection);
  const updateTextBlock = useAppStore((s) => s.updateTextBlock);
  const setCurrentImage = useAppStore((s) => s.setCurrentImage);

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("current");
  const [field, setField] = useState<Field>("all");
  const [query, setQuery] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [activeHitIndex, setActiveHitIndex] = useState(0);

  // 全局快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && !e.shiftKey && !isInput) {
        e.preventDefault();
        setScope("current");
        setShowReplace(false);
        setOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "g" || (e.key.toLowerCase() === "f" && e.shiftKey)) && !isInput) {
        e.preventDefault();
        setScope("global");
        setShowReplace(false);
        setOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h" && !isInput) {
        e.preventDefault();
        setShowReplace(true);
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const buildRegex = useCallback((): RegExp | null => {
    if (!query) return null;
    try {
      if (useRegex) return new RegExp(query, caseSensitive ? "g" : "gi");
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(escaped, caseSensitive ? "g" : "gi");
    } catch {
      return null;
    }
  }, [query, useRegex, caseSensitive]);

  const hits: Hit[] = useMemo(() => {
    const re = buildRegex();
    if (!re) return [];
    const out: Hit[] = [];
    const targetImages = scope === "current" ? images.filter((img) => img.id === currentImageId) : images;
    for (const img of targetImages) {
      // 搜 prompt（视为"原文/指令"侧）
      if (field === "all" || field === "source") {
        for (const sel of img.selections) {
          const text = sel.prompt || "";
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(text)) !== null) {
            out.push({
              imageId: img.id,
              imageName: img.fileName,
              selectionId: sel.id,
              field: "prompt",
              before: text.slice(0, m.index),
              match: m[0],
              after: text.slice(m.index + m[0].length),
              start: m.index,
              end: m.index + m[0].length,
            });
            if (m[0].length === 0) re.lastIndex++;
          }
        }
      }
      // 搜 textBlocks 文本（视为"译文"侧）
      if (field === "all" || field === "target") {
        const blocks = textBlocks.filter((tb) => img.selections.some((s) => s.id === tb.selectionId));
        for (const tb of blocks) {
          const text = tb.text || "";
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(text)) !== null) {
            out.push({
              imageId: img.id,
              imageName: img.fileName,
              selectionId: tb.selectionId,
              field: "text",
              before: text.slice(0, m.index),
              match: m[0],
              after: text.slice(m.index + m[0].length),
              start: m.index,
              end: m.index + m[0].length,
            });
            if (m[0].length === 0) re.lastIndex++;
          }
        }
      }
    }
    return out;
  }, [buildRegex, images, currentImageId, scope, field, textBlocks]);

  // hits 变化时重置 active index
  useEffect(() => {
    if (activeHitIndex >= hits.length) setActiveHitIndex(0);
  }, [hits.length, activeHitIndex]);

  const goToHit = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= hits.length) return;
      const h = hits[idx];
      if (h.imageId !== currentImageId) setCurrentImage(h.imageId);
      setActiveHitIndex(idx);
    },
    [hits, currentImageId, setCurrentImage]
  );

  const replaceOne = useCallback(
    (idx: number) => {
      const re = buildRegex();
      if (!re) return;
      const h = hits[idx];
      if (!h) return;
      const newMatch = useRegex ? h.match.replace(re, replaceWith) : replaceWith;
      const newText = h.before + newMatch + h.after;
      if (h.field === "prompt") {
        updateSelection(h.selectionId, { prompt: newText });
      } else {
        updateTextBlock(h.selectionId, { text: newText });
      }
    },
    [hits, buildRegex, replaceWith, useRegex, updateSelection, updateTextBlock]
  );

  const replaceAll = useCallback(() => {
    const re = buildRegex();
    if (!re) return;
    // 按 image+sel+field 分组，一次性 replace 整段
    const groups = new Map<string, { full: string; field: "prompt" | "text"; selectionId: string }>();
    for (const h of hits) {
      const key = `${h.imageId}|${h.selectionId}|${h.field}`;
      if (!groups.has(key)) {
        groups.set(key, { full: h.before + h.match + h.after, field: h.field, selectionId: h.selectionId });
      }
    }
    for (const { full, field: f, selectionId } of groups.values()) {
      const next = full.replace(re, replaceWith);
      if (f === "prompt") updateSelection(selectionId, { prompt: next });
      else updateTextBlock(selectionId, { text: next });
    }
  }, [buildRegex, hits, replaceWith, updateSelection, updateTextBlock]);

  if (!open) return null;

  const active = hits[activeHitIndex];

  return (
    <div className="fixed top-4 right-4 z-[110] w-96 bg-popover border border-border rounded-lg shadow-2xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Search className="size-4" />
          {scope === "current" ? "查找当前页" : "全局查找"}
        </div>
        <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="查找..."
            className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
          />
          <button
            disabled={hits.length === 0}
            onClick={() => goToHit((activeHitIndex - 1 + hits.length) % hits.length)}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
            title="上一个"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            disabled={hits.length === 0}
            onClick={() => goToHit((activeHitIndex + 1) % hits.length)}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
            title="下一个"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>

        {showReplace && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
              placeholder="替换为..."
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
            />
            <button
              disabled={hits.length === 0}
              onClick={() => replaceOne(activeHitIndex)}
              className="rounded px-2 py-1 text-xs bg-primary text-primary-foreground disabled:opacity-40"
            >
              替换
            </button>
            <button
              disabled={hits.length === 0}
              onClick={replaceAll}
              className="rounded px-2 py-1 text-xs bg-primary text-primary-foreground disabled:opacity-40"
            >
              全部
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="rounded border border-input bg-background px-1 py-0.5">
            <option value="current">当前页</option>
            <option value="global">全局</option>
          </select>
          <select value={field} onChange={(e) => setField(e.target.value as Field)} className="rounded border border-input bg-background px-1 py-0.5">
            <option value="all">全部</option>
            <option value="source">原文(prompt)</option>
            <option value="target">译文(text)</option>
          </select>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
            Aa
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
            .*
          </label>
          {!showReplace && (
            <button onClick={() => setShowReplace(true)} className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted">
              <Replace className="size-3" /> 替换 (Ctrl+H)
            </button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {hits.length === 0 ? (query ? "无匹配" : "请输入查找内容") : `${activeHitIndex + 1} / ${hits.length} 个匹配`}
        </div>

        {active && (
          <div className="rounded border border-border bg-muted/30 p-2 text-xs">
            <div className="text-muted-foreground mb-1">{active.imageName} · {active.field === "prompt" ? "原文" : "译文"}</div>
            <div className="font-mono">
              <span>{active.before.slice(-20)}</span>
              <span className={cn("rounded px-0.5", "bg-yellow-300/40")}>{active.match}</span>
              <span>{active.after.slice(0, 20)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
