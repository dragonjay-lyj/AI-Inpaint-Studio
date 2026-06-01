// ============================================================
// 核心类型定义 — AI Inpaint Studio
// ============================================================

/** 画布坐标 */
export interface Point {
  x: number;
  y: number;
}

/** 矩形选区 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 选区状态 */
export interface Selection {
  id: string;
  rect: Rect;         // 画布上的相对坐标（基于图片坐标）
  prompt: string;     // 该选区的提示词
  active: boolean;
  rotation?: number;  // 旋转角度（度）
  maskDataUrl?: string; // 画笔/橡皮擦遮罩 data URL
  /** 自由变形多边形顶点（图像坐标系）。存在时优先于 rect 渲染选区轮廓 */
  polygonPoints?: Point[];
}

/** 支持的 AI 提供商 */
export type ProviderType = 'gemini' | 'openai' | 'custom' | 'gpt-image';

/** API 连接配置 */
export interface ConnectionConfig {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;         // OpenAI 兼容接口的 base URL
  model: string;           // 模型名称
}

/** 支持的执行模式 */
export type ExecutionMode = 'concurrent' | 'serial';

/** 并发配置 */
export interface ConcurrencyConfig {
  mode: ExecutionMode;
  maxConcurrent: number;   // 最大并发数（concurrent 模式）
}

/** 图片条目 */
export interface ImageEntry {
  id: string;
  fileName: string;
  originalDataUrl: string;  // 原始图片 data URL
  resultDataUrl?: string;   // 处理后的图片 data URL
  maskDataUrl?: string;     // 全图蒙版（画笔/橡皮擦累积），白色 = 标记编辑区域
  width: number;
  height: number;
  selections: Selection[];  // 该图片的选区列表
  status: 'idle' | 'processing' | 'done' | 'error';
  error?: string;
  globalPrompt: string;     // 全局提示词（应用到所有选区）
}

/** 应用全局配置 */
export interface AppSettings {
  connection: ConnectionConfig;
  concurrency: ConcurrencyConfig;
  theme: ThemeType;
  language: LanguageType;
  applyToAll: boolean;     // "应用到所有图片" 开关
}

/** 主题类型 */
export type ThemeType = 'light' | 'dark' | 'ocean' | 'rose' | 'forest';

/** 语言类型 */
export type LanguageType = 'zh' | 'en';

/** 批量处理进度 */
export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  currentImage: string | null;
}

/** AI 生成请求参数 */
export interface InpaintRequest {
  originalImage: string;   // base64 原图
  maskRegion: Rect;        // 遮罩区域
  prompt: string;          // 提示词
}

/** AI 生成响应 */
export interface InpaintResponse {
  success: boolean;
  resultImage?: string;    // base64 结果图片（仅遮罩区域）
  error?: string;
}

/** 导航方向 */
export type NavDirection = 'next' | 'prev';

/** 工具栏工具类型 */
export type ToolType = 'select' | 'brush' | 'eraser' | 'text' | 'hand' | 'erase-rect';

/** 编辑器模式 */
export type EditorMode = 'default' | 'text' | 'sketch';

/** 文本块 — 用于 TextEditor 覆盖层 */
export interface TextBlock {
  selectionId: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: string;    // 'left' | 'center' | 'right'
  direction: string;    // 'horizontal' | 'vertical'
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;     // 0-1
}

/** 字体样式预设 */
export interface FontPreset {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  strokeColor?: string;
  strokeWidth?: number;
}

export const FONT_PRESETS: FontPreset[] = [
  { id: "default", name: "Default", fontFamily: "sans-serif", fontSize: 16, color: "#000000" },
  { id: "manga-bubble", name: "Manga Bubble", fontFamily: '"CC Wild Words", "Comic Sans MS", sans-serif', fontSize: 18, color: "#000000", bold: true },
  { id: "title", name: "Title", fontFamily: "serif", fontSize: 28, color: "#1a1a1a", bold: true, shadow: { color: "rgba(0,0,0,0.4)", blur: 4, offsetX: 1, offsetY: 1 } },
  { id: "subtitle", name: "Subtitle", fontFamily: "sans-serif", fontSize: 14, color: "#ffffff", strokeColor: "#000000", strokeWidth: 2 },
  { id: "sfx", name: "SFX (sound effect)", fontFamily: "Impact, sans-serif", fontSize: 32, color: "#ffd400", bold: true, italic: true, strokeColor: "#000000", strokeWidth: 3 },
];
