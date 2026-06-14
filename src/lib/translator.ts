// ============================================================
// Translation Module
// AI-powered text translation with term extraction and line breaking
// ============================================================

import type { ConnectionConfig } from "@/types";
import { getTranslatorBackend } from "./translator-backends";

/**
 * Translate text using the configured AI API.
 *
 * Dispatches to a TranslatorBackend (Gemini/OpenAI/Vertex/Sakura/DeepL/...) by provider id.
 * Falls back to a mock translation when no API key is configured or backend is unknown.
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  config: ConnectionConfig,
): Promise<string> {
  if (!text.trim()) return "";

  const backend = getTranslatorBackend(config.provider);
  if (!backend || (backend.requiresApiKey && !config.apiKey)) {
    return mockTranslate(text, sourceLang, targetLang);
  }

  try {
    const systemPrompt = `You are a professional translator. Translate the following text from ${sourceLang === "auto" ? "the detected source language" : sourceLang} to ${targetLang}. Return ONLY the translated text, no explanations, no markdown, no quotes.`;
    return await backend.translate(text, systemPrompt, config);
  } catch (err) {
    console.warn("[translateText] backend failed, falling back to mock:", err);
    return mockTranslate(text, sourceLang, targetLang);
  }
}

/**
 * Simple mock translation (used when no API key or on error).
 */
function mockTranslate(text: string, sourceLang: string, targetLang: string): string {
  const mockMap: Record<string, string> = {
    hello: "你好",
    world: "世界",
    "Hello World": "你好世界",
  };

  // For known phrases return the mock mapping
  if (mockMap[text]) return mockMap[text];

  // Append a translation marker as placeholder
  const langTag = targetLang.toUpperCase();
  return `[${langTag}] ${text}`;
}

/**
 * Extract key terms from a list of texts.
 *
 * 频率统计找候选 → 调 AI 一次性翻译所有候选词。
 * 没配 AI 时回退到 placeholder 行为。
 */
export async function extractTerms(
  texts: string[],
  config?: ConnectionConfig,
  sourceLang: string = "auto",
  targetLang: string = "en",
  topN: number = 20
): Promise<Record<string, string>> {
  const termCounts: Record<string, number> = {};

  for (const t of texts) {
    const words = t
      .split(/[\s,;.!?()\[\]{}<>《》「」『』【】""'':：]+/)
      .filter((w) => w.length > 1);

    for (const word of words) {
      // 保留大小写（专有名词常以大写起首）
      termCounts[word] = (termCounts[word] || 0) + 1;
    }
  }

  const candidates = Object.entries(termCounts)
    .filter(([, c]) => c >= 2) // 至少出现 2 次
    .sort(([, a], [, b]) => b - a)
    .slice(0, topN)
    .map(([t]) => t);

  if (candidates.length === 0) return {};

  // 没配置 AI: 占位 fallback
  if (!config?.apiKey) {
    const r: Record<string, string> = {};
    for (const t of candidates) r[t] = `[${t}]`;
    return r;
  }

  try {
    const list = candidates.map((t, i) => `${i + 1}. ${t}`).join("\n");
    const prompt =
      `You are a terminology assistant. Translate the following ${candidates.length} terms ` +
      `from ${sourceLang === "auto" ? "the detected source language" : sourceLang} to ${targetLang}. ` +
      `These are likely proper nouns or recurring vocabulary in a story; translate them consistently.\n\n` +
      `Output ONLY a JSON object mapping each source term to its translation, like {"term1":"译1","term2":"译2"}. ` +
      `No prose, no markdown fences.\n\nTerms:\n${list}`;

    const raw = await translateText(prompt, sourceLang, targetLang, config);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in response");
    const parsed = JSON.parse(m[0]);
    if (typeof parsed !== "object" || !parsed) throw new Error("not an object");
    const result: Record<string, string> = {};
    for (const term of candidates) {
      const v = parsed[term];
      if (typeof v === "string" && v.trim()) result[term] = v.trim();
    }
    return result;
  } catch (err) {
    console.warn("[extractTerms] AI failed, falling back:", err);
    const r: Record<string, string> = {};
    for (const t of candidates) r[t] = `[${t}]`;
    return r;
  }
}

/**
 * Smart line break — split text into lines that fit within maxWidth.
 *
 * Uses word-wrap approach (break at spaces when possible, fall back
 * to character break for CJK text without spaces).
 */
export async function smartLineBreak(
  text: string,
  maxWidth: number,
): Promise<string[]> {
  if (!text) return [];

  // Estimate average character width (rough: ~0.6em for Latin, 1em for CJK)
  const charWidth = (ch: string): number =>
    /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(ch) ? 1 : 0.6;

  const lines: string[] = [];
  let currentLine = "";
  let currentWidth = 0;

  // Split into words (space-delimited tokens + CJK characters as individual tokens)
  const tokens: string[] = [];
  for (const ch of text) {
    if (ch === " " || ch === "\n") {
      if (currentLine) {
        tokens.push(currentLine);
        currentLine = "";
      }
      tokens.push(ch);
    } else if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(ch)) {
      if (currentLine) {
        tokens.push(currentLine);
        currentLine = "";
      }
      tokens.push(ch);
    } else {
      currentLine += ch;
    }
  }
  if (currentLine) tokens.push(currentLine);

  for (const token of tokens) {
    if (token === "\n") {
      // Explicit newline
      lines.push(currentLine);
      currentLine = "";
      currentWidth = 0;
      continue;
    }

    const tokenWidth = Array.from(token).reduce(
      (sum, ch) => sum + charWidth(ch),
      0,
    );

    if (currentWidth + tokenWidth > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = token;
      currentWidth = tokenWidth;
    } else {
      if (currentLine.length > 0 && token !== " ") {
        currentLine += token;
        currentWidth += tokenWidth;
      } else if (token !== " ") {
        currentLine += token;
        currentWidth += tokenWidth;
      }
      // Skip standalone spaces at start of line
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * AI 驱动的智能断句：让模型基于语义+断行宽度返回多行文本。
 * 失败时回退到字符宽度估算的 smartLineBreak。
 */
export async function smartLineBreakAI(
  text: string,
  maxCharsPerLine: number,
  config?: ConnectionConfig,
  language: string = "auto"
): Promise<string[]> {
  if (!text.trim()) return [];
  if (!config?.apiKey) {
    return smartLineBreak(text, maxCharsPerLine);
  }
  try {
    const prompt =
      `Insert line breaks into this ${language === "auto" ? "" : language + " "}text so each line fits within about ${maxCharsPerLine} characters. ` +
      `Break at natural semantic boundaries (clause, phrase, breath). For CJK text avoid breaking inside a word; for Latin avoid breaking inside a word. ` +
      `Output ONLY the rewrapped text with \\n as line breaks. Do not change wording, do not add commentary.\n\nText:\n${text}`;
    const out = await translateText(prompt, language, language, config);
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error("empty");
    return lines;
  } catch (err) {
    console.warn("[smartLineBreakAI] failed, fallback to heuristic:", err);
    return smartLineBreak(text, maxCharsPerLine);
  }
}

// ============================================================
// Cross-page translation context
// Accumulates previous translations and a term glossary
// for consistent translation across pages
// ============================================================

interface ChapterContext {
  chapterId: string;
  previousTexts: string[];      // "原文 → 译文" 列表，按页面顺序
  termGlossary: Record<string, string>;
  pagesProcessed: number;
}

const chapters: Map<string, ChapterContext> = new Map();
let activeChapterId = "default";

function ensureChapter(id: string): ChapterContext {
  let c = chapters.get(id);
  if (!c) {
    c = { chapterId: id, previousTexts: [], termGlossary: {}, pagesProcessed: 0 };
    chapters.set(id, c);
  }
  return c;
}

export function setActiveChapter(id: string) {
  activeChapterId = id;
  ensureChapter(id);
}

export function getTranslationContext() {
  return ensureChapter(activeChapterId);
}

export function addToContext(text: string, translation: string) {
  const c = ensureChapter(activeChapterId);
  c.previousTexts.push(`${text} → ${translation}`);
  if (c.previousTexts.length > 80) c.previousTexts.shift();
}

export function markPageDone() {
  ensureChapter(activeChapterId).pagesProcessed += 1;
}

export function updateGlossary(terms: Record<string, string>) {
  const c = ensureChapter(activeChapterId);
  c.termGlossary = { ...c.termGlossary, ...terms };
}

export function clearContext(chapterId?: string) {
  if (chapterId) chapters.delete(chapterId);
  else chapters.clear();
}

export async function translateWithContext(
  text: string,
  sourceLang: string,
  targetLang: string,
  config: ConnectionConfig,
  contextWindow: number = 10,
  glossaryTopN: number = 15
): Promise<string> {
  const c = ensureChapter(activeChapterId);
  const contextStr = c.previousTexts.slice(-contextWindow).join("\n");

  // 加权评分：只挑出当前 text 最相关的 top-N 个术语进入 prompt
  const ranked = rankGlossaryEntries(text, c.termGlossary, glossaryTopN);
  const glossaryStr = ranked.map(([k, v]) => `${k}=${v}`).join(", ");

  const contextualPrompt =
    (contextStr ? `Previous translations (for tone & terminology consistency):\n${contextStr}\n\n` : "") +
    (glossaryStr ? `Glossary (must use these translations for these terms): ${glossaryStr}\n\n` : "") +
    `Translate the following to ${targetLang}, returning ONLY the translation:\n${text}`;

  const result = await translateText(contextualPrompt, sourceLang, targetLang, config);
  addToContext(text, result);
  return result;
}

/**
 * 给术语库做加权评分检索：
 *   分数 = 在 text 中的出现次数(TF) + 长度奖励 + 在术语库整体频率惩罚(IDF lite)
 * 返回按分数降序的 top-N 术语对。
 *
 * 这是显式可调的"加权评分替代 embedding"——架构原则 #6 的落地。
 */
export function rankGlossaryEntries(
  text: string,
  glossary: Record<string, string>,
  topN: number = 15
): Array<[string, string]> {
  const entries = Object.entries(glossary);
  if (entries.length === 0) return [];
  if (entries.length <= topN) {
    // 不需要排，但仍按出现优先排序便于一致性
    return rank(entries, text).slice(0, topN);
  }
  return rank(entries, text).slice(0, topN);
}

function rank(entries: Array<[string, string]>, text: string): Array<[string, string]> {
  const scores: Array<{ kv: [string, string]; score: number }> = [];
  const lowerText = text.toLowerCase();
  for (const [k, v] of entries) {
    const term = k.toLowerCase();
    if (!term) continue;
    // TF: 出现次数（用 indexOf 走全部）
    let count = 0;
    let idx = 0;
    while ((idx = lowerText.indexOf(term, idx)) !== -1) {
      count++;
      idx += term.length;
    }
    // 长度奖励：长术语命中权重更高（避免 "a"/"the" 抢分）
    const lenBonus = Math.log2(1 + term.length);
    // 第一次出现位置越靠前越相关
    const firstIdx = lowerText.indexOf(term);
    const posBonus = firstIdx >= 0 ? Math.max(0, 1 - firstIdx / Math.max(1, lowerText.length)) : 0;
    const score = count * 2 + (count > 0 ? lenBonus + posBonus : 0);
    scores.push({ kv: [k, v], score });
  }
  scores.sort((a, b) => b.score - a.score);
  // 没命中的术语保留少量，作为兜底（避免空 glossary）
  const hit = scores.filter((s) => s.score > 0);
  const miss = scores.filter((s) => s.score === 0);
  return [...hit, ...miss].map((s) => s.kv);
}
