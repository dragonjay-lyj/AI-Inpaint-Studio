// ============================================================
// Translation Module
// AI-powered text translation with term extraction and line breaking
// ============================================================

import type { ConnectionConfig } from "@/types";

/**
 * Translate text using the configured AI API.
 *
 * Supports Gemini, OpenAI, and Sakura backends.
 * Falls back to a mock translation when no API key is configured.
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  config: ConnectionConfig,
): Promise<string> {
  if (!text.trim()) return "";

  // When no valid API key, return a mock translation
  if (!config.apiKey) {
    return mockTranslate(text, sourceLang, targetLang);
  }

  try {
    const systemPrompt = `You are a professional translator. Translate the following text from ${sourceLang === "auto" ? "the detected source language" : sourceLang} to ${targetLang}. Return ONLY the translated text, no explanations, no markdown, no quotes.`;

    if (config.provider === "gemini") {
      return await translateViaGemini(text, systemPrompt, config);
    } else if (config.provider === "openai" || config.provider === "custom") {
      return await translateViaOpenAI(text, systemPrompt, config);
    } else {
      // Sakura or unknown — use Gemini as default
      return await translateViaGemini(text, systemPrompt, config);
    }
  } catch {
    // Fallback to mock on error
    return mockTranslate(text, sourceLang, targetLang);
  }
}

/**
 * Translate via Gemini API.
 */
async function translateViaGemini(
  text: string,
  systemPrompt: string,
  config: ConnectionConfig,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model || "gemini-2.0-flash"}:generateContent?key=${config.apiKey}`;

  const body = {
    contents: [
      {
        parts: [{ text: `${systemPrompt}\n\nText to translate:\n${text}` }],
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Gemini translation API error ${response.status}`);
  }

  const data = await response.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return result.trim();
}

/**
 * Translate via OpenAI-compatible API.
 */
async function translateViaOpenAI(
  text: string,
  systemPrompt: string,
  config: ConnectionConfig,
): Promise<string> {
  const url = config.baseUrl
    ? `${config.baseUrl.replace(/\/$/, "")}/chat/completions`
    : "https://api.openai.com/v1/chat/completions";

  const body = {
    model: config.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    max_tokens: 4096,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI translation API error ${response.status}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
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
 * Placeholder implementation: splits by whitespace and counts
 * frequency. A real implementation would use NLP-based term extraction.
 */
export async function extractTerms(
  texts: string[],
): Promise<Record<string, string>> {
  const termCounts: Record<string, number> = {};

  for (const t of texts) {
    const words = t
      .split(/[\s,;.!?()\[\]{}<>《》「」『』【】""'':：]+/)
      .filter((w) => w.length > 1);

    for (const word of words) {
      const lower = word.toLowerCase();
      termCounts[lower] = (termCounts[lower] || 0) + 1;
    }
  }

  // Return top 20 most frequent terms as a translation map
  // (placeholder — real implementation would call translation API)
  const sorted = Object.entries(termCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20);

  const result: Record<string, string> = {};
  for (const [term] of sorted) {
    result[term] = `[${term}]`; // placeholder translation
  }

  return result;
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

// ============================================================
// Cross-page translation context
// Accumulates previous translations and a term glossary
// for consistent translation across pages
// ============================================================

let translationContext: { previousTexts: string[]; termGlossary: Record<string, string> } = {
  previousTexts: [],
  termGlossary: {},
};

export function getTranslationContext() { return translationContext; }

export function addToContext(text: string, translation: string) {
  translationContext.previousTexts.push(`${text} → ${translation}`);
  if (translationContext.previousTexts.length > 50) translationContext.previousTexts.shift();
}

export function updateGlossary(terms: Record<string, string>) {
  translationContext.termGlossary = { ...translationContext.termGlossary, ...terms };
}

export async function translateWithContext(text: string, sourceLang: string, targetLang: string, config: ConnectionConfig): Promise<string> {
  const contextStr = translationContext.previousTexts.slice(-10).join("\n");
  const glossaryStr = Object.entries(translationContext.termGlossary).map(([k,v]) => `${k}=${v}`).join(", ");

  const contextualPrompt = `Previous translations for context:\n${contextStr}\n\nGlossary: ${glossaryStr}\n\nTranslate: ${text}`;

  const result = await translateText(contextualPrompt, sourceLang, targetLang, config);
  addToContext(text, result);
  return result;
}
