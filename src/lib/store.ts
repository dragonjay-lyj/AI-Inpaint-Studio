import { create } from "zustand";
import type {
  ImageEntry,
  Selection,
  ConnectionConfig,
  ConcurrencyConfig,
  ThemeType,
  LanguageType,
  BatchProgress,
  Rect,
  ToolType,
  TextBlock,
  EditorMode,
} from "@/types";
import { generateId } from "@/lib/utils";

// ── localStorage 持久化 ──
const STORAGE_KEY = "ai-inpaint-settings";

function loadPersisted<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return data[key] !== undefined ? data[key] : fallback;
  } catch {
    return fallback;
  }
}

function persistSettings(partial: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    const data = existing ? JSON.parse(existing) : {};
    Object.assign(data, partial);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded or parsing error */ }
}

// 选区历史快照类型
interface SelectionSnapshot {
  selections: Selection[];
}

// ── 模块 AI 配置类型 ──
export interface ModuleAIConfig {
  provider: 'gemini' | 'openai';
  apiKey: string;
  baseUrl: string;
}

// ── 模块设置类型 ──
export interface ModuleSettings {
  detector: { enabled: boolean; confidenceThreshold: number; minRegionSize: number };
  ocr: { enabled: boolean; language: string; ai: ModuleAIConfig };
  inpaint: { enabled: boolean; edgeFeathering: number; ai: ModuleAIConfig };
  translator: { enabled: boolean; qualityMode: boolean; sourceLang: string; targetLang: string; ai: ModuleAIConfig };
}

export interface FontSettings {
  family: string;
  size: number;
  color: string;
  alignment: "horizontal" | "vertical";
}

interface AppState {
  // 图片管理
  images: ImageEntry[];
  currentImageId: string | null;
  batchProgress: BatchProgress;

  // 视图
  viewMode: "original" | "result";
  zoom: number;
  panOffset: { x: number; y: number };

  // 设置
  connection: ConnectionConfig;
  concurrency: ConcurrencyConfig;
  theme: ThemeType;
  language: LanguageType;
  applyToAll: boolean;

  // 自动化模块设置
  moduleSettings: ModuleSettings;
  fontSettings: FontSettings;

  // 全局提示词
  globalPrompt: string;

  // 是否正在处理
  isProcessing: boolean;
  abortController: AbortController | null;

  // 工具状态
  activeTool: ToolType;
  brushSize: number;

  // 矩形抹字工具：自动模式 + 当前未提交的临时矩形
  eraseRectAutoMode: boolean;
  pendingEraseRect: Rect | null;

  // 编辑器模式
  editorMode: EditorMode;
  sketchOpacity: number;

  // 文本块（用于 TextEditor 覆盖层）
  textBlocks: TextBlock[];

  // 撤销/重做历史（仅当前图片的选区）
  _history: { past: Selection[][]; future: Selection[][] };

  // --- Actions ---

  // 图片操作
  addImages: (entries: ImageEntry[]) => void;
  removeImage: (id: string) => void;
  setCurrentImage: (id: string) => void;
  updateImageResult: (id: string, resultDataUrl: string) => void;
  updateImageStatus: (id: string, status: ImageEntry["status"], error?: string) => void;
  updateImageMask: (id: string, maskDataUrl: string | undefined) => void;
  navigateImage: (direction: "next" | "prev") => void;

  // 选区操作
  addSelection: (rect: Rect) => void;
  updateSelection: (id: string, updates: Partial<Selection>) => void;
  removeSelection: (id: string) => void;
  clearAllSelections: () => void;
  setActiveSelection: (id: string) => void;

  // 选区拖动编辑（手柄交互）
  moveSelection: (id: string, dx: number, dy: number) => void;
  resizeSelection: (id: string, handle: string, newRect: Rect) => void;

  // 自由变形：把 rect 转成 polygonPoints (4 角)，或新增/移动多边形顶点
  convertSelectionToPolygon: (id: string) => void;
  updatePolygonPoint: (id: string, index: number, x: number, y: number) => void;
  insertPolygonPoint: (id: string, afterIndex: number, x: number, y: number) => void;

  // 撤销/重做
  undo: () => void;
  redo: () => void;
  _pushHistory: () => void;
  _clearHistory: () => void;

  // 全局面板提示词
  setGlobalPrompt: (prompt: string) => void;

  // 设置操作
  setConnection: (config: Partial<ConnectionConfig>) => void;
  setConcurrency: (config: Partial<ConcurrencyConfig>) => void;
  setTheme: (theme: ThemeType) => void;
  setLanguage: (language: LanguageType) => void;
  setApplyToAll: (value: boolean) => void;
  setModuleSettings: (settings: Partial<ModuleSettings>) => void;
  setFontSettings: (settings: Partial<FontSettings>) => void;

  // 文本块操作
  addTextBlock: (block: TextBlock) => void;
  updateTextBlock: (selectionId: string, updates: Partial<TextBlock>) => void;
  removeTextBlock: (selectionId: string) => void;
  setTextBlocks: (blocks: TextBlock[]) => void;
  clearTextBlocks: () => void;
  setTextStyleForAll: (style: Partial<TextBlock>) => void;

  // 编辑器模式
  setEditorMode: (mode: EditorMode) => void;
  setSketchOpacity: (value: number) => void;

  // 工具切换
  setActiveTool: (tool: ToolType) => void;
  setBrushSize: (size: number) => void;
  setEraseRectAutoMode: (v: boolean) => void;
  setPendingEraseRect: (r: Rect | null) => void;

  // 视图控制
  setViewMode: (mode: "original" | "result") => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;

  // 处理控制
  setIsProcessing: (value: boolean) => void;
  setAbortController: (controller: AbortController | null) => void;
  resetBatchProgress: () => void;
  updateBatchProgress: (progress: Partial<BatchProgress>) => void;

  // 获取当前图片
  getCurrentImage: () => ImageEntry | undefined;
}

const defaultConnection: ConnectionConfig = {
  provider: "gemini",
  apiKey: "",
  baseUrl: "",
  model: "gemini-2.5-flash-image",
};

const defaultModuleSettings: ModuleSettings = {
  detector: { enabled: false, confidenceThreshold: 0.5, minRegionSize: 30 },
  ocr: { enabled: false, language: "japanese", ai: { provider: "gemini", apiKey: "", baseUrl: "" } },
  inpaint: { enabled: false, edgeFeathering: 3, ai: { provider: "gemini", apiKey: "", baseUrl: "" } },
  translator: { enabled: false, qualityMode: true, sourceLang: "auto", targetLang: "en", ai: { provider: "gemini", apiKey: "", baseUrl: "" } },
};

const defaultFontSettings: FontSettings = {
  family: "sans-serif",
  size: 16,
  color: "#000000",
  alignment: "horizontal",
};

const defaultConcurrency: ConcurrencyConfig = {
  mode: "concurrent",
  maxConcurrent: 3,
};

export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态（优先从 localStorage 恢复）
  images: [],
  currentImageId: null,
  batchProgress: { total: 0, completed: 0, failed: 0, currentImage: null },
  viewMode: "original",
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  connection: loadPersisted("connection", defaultConnection),
  concurrency: loadPersisted("concurrency", defaultConcurrency),
  theme: loadPersisted("theme", "light" as ThemeType),
  language: loadPersisted("language", "zh" as LanguageType),
  applyToAll: false,
  moduleSettings: defaultModuleSettings,
  fontSettings: defaultFontSettings,
  globalPrompt: "",
  isProcessing: false,
  abortController: null,
  activeTool: "select",
  brushSize: 20,
  eraseRectAutoMode: true,
  pendingEraseRect: null,
  editorMode: "default",
  sketchOpacity: 0.5,
  textBlocks: [],
  _history: { past: [], future: [] },

  // 图片操作
  addImages: (entries) =>
    set((state) => {
      const newImages = [...state.images, ...entries];
      return {
        images: newImages,
        currentImageId: state.currentImageId ?? newImages[0]?.id ?? null,
        _history: { past: [], future: [] },
      };
    }),

  removeImage: (id) =>
    set((state) => {
      const newImages = state.images.filter((img) => img.id !== id);
      const newCurrentId =
        state.currentImageId === id
          ? newImages[Math.min(state.images.indexOf(state.images.find((i) => i.id === id)!), newImages.length - 1)]?.id ?? null
          : state.currentImageId;
      return { images: newImages, currentImageId: newCurrentId, _history: { past: [], future: [] } };
    }),

  setCurrentImage: (id) =>
    set({ currentImageId: id, _history: { past: [], future: [] }, activeTool: "select" }),

  updateImageResult: (id, resultDataUrl) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, resultDataUrl } : img
      ),
    })),

  updateImageStatus: (id, status, error) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, status, error } : img
      ),
    })),

  updateImageMask: (id, maskDataUrl) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === id ? { ...img, maskDataUrl } : img
      ),
    })),

  navigateImage: (direction) =>
    set((state) => {
      const currentIdx = state.images.findIndex((i) => i.id === state.currentImageId);
      if (currentIdx < 0 || state.images.length < 2) return state;
      const newIdx =
        direction === "next"
          ? Math.min(currentIdx + 1, state.images.length - 1)
          : Math.max(currentIdx - 1, 0);
      // 翻页清空历史
      return { 
        currentImageId: state.images[newIdx]?.id ?? state.currentImageId,
        _history: { past: [], future: [] },
        activeTool: "select",
      };
    }),

  // ── 撤销/重做内部 helper ──
  _pushHistory: () => {
    const current = get().getCurrentImage();
    if (!current) return;
    const snapshot = current.selections.map((s) => ({ ...s, rect: { ...s.rect } }));
    set((state) => ({
      _history: {
        past: [...state._history.past, snapshot],
        future: [],
      },
    }));
  },

  _clearHistory: () =>
    set({ _history: { past: [], future: [] } }),

  undo: () =>
    set((state) => {
      if (state._history.past.length === 0) return state;
      const current = get().getCurrentImage();
      if (!current) return state;

      const currentSnapshot = current.selections.map((s) => ({ ...s, rect: { ...s.rect } }));
      const past = [...state._history.past];
      const prevSelections = past.pop()!;

      return {
        images: state.images.map((img) =>
          img.id === current.id ? { ...img, selections: prevSelections } : img
        ),
        _history: {
          past,
          future: [currentSnapshot, ...state._history.future],
        },
      };
    }),

  redo: () =>
    set((state) => {
      if (state._history.future.length === 0) return state;
      const current = get().getCurrentImage();
      if (!current) return state;

      const currentSnapshot = current.selections.map((s) => ({ ...s, rect: { ...s.rect } }));
      const future = [...state._history.future];
      const nextSelections = future.shift()!;

      return {
        images: state.images.map((img) =>
          img.id === current.id ? { ...img, selections: nextSelections } : img
        ),
        _history: {
          past: [...state._history.past, currentSnapshot],
          future,
        },
      };
    }),

  // 选区操作（修改前先 push history）
  addSelection: (rect) =>
    set((state) => {
      const current = get().getCurrentImage();
      if (!current) return state;

      // Push current state to history
      const snapshot = current.selections.map((s) => ({ ...s, rect: { ...s.rect } }));

      const newSelection: Selection = {
        id: generateId(),
        rect: { ...rect },
        prompt: "",
        active: true,
      };
      return {
        images: state.images.map((img) =>
          img.id === current.id
            ? {
                ...img,
                selections: img.selections.map((s) => ({ ...s, active: false })).concat(newSelection),
              }
            : img
        ),
        _history: { past: [...state._history.past, snapshot], future: [] },
      };
    }),

  updateSelection: (id, updates) =>
    set((state) => {
      const current = get().getCurrentImage();
      if (!current) return state;

      // Push current state to history
      const snapshot = current.selections.map((s) => ({ ...s, rect: { ...s.rect } }));

      return {
        images: state.images.map((img) =>
          img.id === current.id
            ? {
                ...img,
                selections: img.selections.map((s) =>
                  s.id === id ? { ...s, ...updates } : s
                ),
              }
            : img
        ),
        _history: { past: [...state._history.past, snapshot], future: [] },
      };
    }),

  removeSelection: (id) =>
    set((state) => {
      const current = get().getCurrentImage();
      if (!current) return state;

      const snapshot = current.selections.map((s) => ({ ...s, rect: { ...s.rect } }));

      return {
        images: state.images.map((img) =>
          img.id === current.id
            ? { ...img, selections: img.selections.filter((s) => s.id !== id) }
            : img
        ),
        _history: { past: [...state._history.past, snapshot], future: [] },
      };
    }),

  clearAllSelections: () =>
    set((state) => {
      const current = get().getCurrentImage();
      if (!current) return state;

      const snapshot = current.selections.map((s) => ({ ...s, rect: { ...s.rect } }));

      return {
        images: state.images.map((img) =>
          img.id === current.id
            ? { ...img, selections: [] }
            : img
        ),
        _history: { past: [...state._history.past, snapshot], future: [] },
      };
    }),

  setActiveSelection: (id) =>
    set((state) => {
      const current = get().getCurrentImage();
      if (!current) return state;
      return {
        images: state.images.map((img) =>
          img.id === current.id
            ? {
                ...img,
                selections: img.selections.map((s) => ({
                  ...s,
                  active: s.id === id,
                })),
              }
            : img
        ),
      };
    }),

  // 选区拖动编辑
  moveSelection: (id, dx, dy) => {
    const current = get().getCurrentImage();
    if (!current) return;
    const sel = current.selections.find((s) => s.id === id);
    if (!sel) return;

    // 不经过 history（由 Canvas 的 mouseup 时调用 _pushHistory）
    set((state) => ({
      images: state.images.map((img) =>
        img.id === current.id
          ? {
              ...img,
              selections: img.selections.map((s) =>
                s.id === id
                  ? { ...s, rect: { ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy } }
                  : s
              ),
            }
          : img
      ),
    }));
  },

  resizeSelection: (id, handle, newRect) => {
    // 不经过 history（由 Canvas 的 mouseup 时调用 _pushHistory）
    get().updateSelection(id, { rect: { ...newRect } });
  },

  convertSelectionToPolygon: (id) => {
    const cur = get().getCurrentImage();
    if (!cur) return;
    const sel = cur.selections.find((s) => s.id === id);
    if (!sel || sel.polygonPoints) return;
    const r = sel.rect;
    const points = [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ];
    get().updateSelection(id, { polygonPoints: points });
  },

  updatePolygonPoint: (id, index, x, y) => {
    const cur = get().getCurrentImage();
    if (!cur) return;
    const sel = cur.selections.find((s) => s.id === id);
    if (!sel?.polygonPoints) return;
    const next = sel.polygonPoints.map((p, i) => (i === index ? { x, y } : p));
    // 同步重算 bounding rect
    const xs = next.map((p) => p.x), ys = next.map((p) => p.y);
    const rect = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    get().updateSelection(id, { polygonPoints: next, rect });
  },

  insertPolygonPoint: (id, afterIndex, x, y) => {
    const cur = get().getCurrentImage();
    if (!cur) return;
    const sel = cur.selections.find((s) => s.id === id);
    if (!sel?.polygonPoints) return;
    const next = [...sel.polygonPoints];
    next.splice(afterIndex + 1, 0, { x, y });
    get().updateSelection(id, { polygonPoints: next });
  },

  // ── 全局提示词 ──
  setGlobalPrompt: (prompt) => set({ globalPrompt: prompt }),

  // ── 设置 ──
  setConnection: (config) =>
    set((state) => {
      const next = { ...state.connection, ...config };
      persistSettings({ connection: next });
      return { connection: next };
    }),

  setConcurrency: (config) =>
    set((state) => {
      const next = { ...state.concurrency, ...config };
      persistSettings({ concurrency: next });
      return { concurrency: next };
    }),

  setTheme: (theme) => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove(
        "theme-dark", "theme-ocean", "theme-rose", "theme-forest"
      );
      if (theme !== "light") {
        document.documentElement.classList.add(`theme-${theme}`);
      }
    }
    persistSettings({ theme });
    set({ theme });
  },

  setLanguage: (language) => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "zh" ? "zh-Hans" : "en";
    }
    persistSettings({ language });
    set({ language });
  },

  setApplyToAll: (value) => set({ applyToAll: value }),

  setModuleSettings: (settings) =>
    set((state) => {
      const merged: ModuleSettings = { ...state.moduleSettings };
      for (const key of Object.keys(settings) as (keyof ModuleSettings)[]) {
        const partial = settings[key];
        if (partial) {
          (merged as any)[key] = { ...(state.moduleSettings as any)[key], ...partial };
        }
      }
      return { moduleSettings: merged };
    }),

  setFontSettings: (settings) =>
    set((state) => ({ fontSettings: { ...state.fontSettings, ...settings } })),

  // ── 文本块操作 ──
  addTextBlock: (block) =>
    set((state) => ({ textBlocks: [...state.textBlocks, block] })),

  updateTextBlock: (selectionId, updates) =>
    set((state) => ({
      textBlocks: state.textBlocks.map((tb) =>
        tb.selectionId === selectionId ? { ...tb, ...updates } : tb
      ),
    })),

  removeTextBlock: (selectionId) =>
    set((state) => ({
      textBlocks: state.textBlocks.filter((tb) => tb.selectionId !== selectionId),
    })),

  setTextBlocks: (blocks) => set({ textBlocks: blocks }),

  clearTextBlocks: () => set({ textBlocks: [] }),

  setTextStyleForAll: (style) =>
    set((state) => ({
      textBlocks: state.textBlocks.map((tb) => ({ ...tb, ...style })),
    })),

  // ── 编辑器模式 ──
  setEditorMode: (mode) => set({ editorMode: mode }),
  setSketchOpacity: (value) => set({ sketchOpacity: Math.max(0, Math.min(1, value)) }),

  // ── 工具切换 ──
  setActiveTool: (tool) => set({ activeTool: tool }),
  setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(100, size)) }),
  setEraseRectAutoMode: (v) => set({ eraseRectAutoMode: v }),
  setPendingEraseRect: (r) => set({ pendingEraseRect: r }),

  // ── 视图 ──
  setViewMode: (mode) => set({ viewMode: mode }),
  setZoom: (zoom) => set({ zoom }),
  setPanOffset: (offset) => set({ panOffset: offset }),

  // ── 处理控制 ──
  setIsProcessing: (value) => set({ isProcessing: value }),
  setAbortController: (controller) => set({ abortController: controller }),

  resetBatchProgress: () =>
    set({ batchProgress: { total: 0, completed: 0, failed: 0, currentImage: null } }),

  updateBatchProgress: (progress) =>
    set((state) => ({ batchProgress: { ...state.batchProgress, ...progress } })),

  getCurrentImage: () => {
    const state = get();
    return state.images.find((img) => img.id === state.currentImageId);
  },
}));
