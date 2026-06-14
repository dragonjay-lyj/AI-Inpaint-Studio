// ============================================================
// Translator Backends — pluggable provider registry
// Each backend implements TranslatorBackend.translate()
// ============================================================

import type { ConnectionConfig } from "@/types";

export interface TranslatorBackend {
  id: string;
  label: string;
  /** 是否需要 API Key */
  requiresApiKey: boolean;
  /** 是否需要 baseUrl（自托管/兼容接口） */
  requiresBaseUrl?: boolean;
  /** 是否需要 model 字段 */
  requiresModel?: boolean;
  /** 翻译实现 */
  translate: (text: string, systemPrompt: string, config: ConnectionConfig) => Promise<string>;
}

// ── Gemini ─────────────────────────────────────────────────────
async function geminiTranslate(text: string, systemPrompt: string, config: ConnectionConfig): Promise<string> {
  const rawBase = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const normalizedBase = rawBase.replace(/\/+$/, "");
  const baseUrl = normalizedBase.includes("/v1beta") ? normalizedBase : `${normalizedBase}/v1beta`;
  const model = config.model && !/image/i.test(config.model) ? config.model : "gemini-2.5-flash";
  const url = `${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`;
  const body = {
    contents: [{ parts: [{ text: `${systemPrompt}\n\nText to translate:\n${text}` }] }],
    generationConfig: { temperature: 0.2 },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return ((data.candidates?.[0]?.content?.parts?.[0]?.text) ?? "").trim();
}

// ── OpenAI / 兼容 ──────────────────────────────────────────────
async function openaiTranslate(text: string, systemPrompt: string, config: ConnectionConfig): Promise<string> {
  const rawBase = config.baseUrl || "https://api.openai.com/v1";
  const normalizedBase = rawBase.replace(/\/+$/, "");
  const url = normalizedBase.includes("/v1") ? `${normalizedBase}/chat/completions` : `${normalizedBase}/v1/chat/completions`;
  const body = {
    model: config.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    max_tokens: 4096,
    temperature: 0.2,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return ((data.choices?.[0]?.message?.content) ?? "").trim();
}

// ── Vertex AI（与 Gemini 同协议但走 google cloud endpoint） ────
async function vertexTranslate(text: string, systemPrompt: string, config: ConnectionConfig): Promise<string> {
  // baseUrl 应类似 https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/{loc}/publishers/google
  // apiKey 此处当成 OAuth bearer token（前端用 service-account 难，建议代理或临时 token）
  const base = (config.baseUrl || "").replace(/\/+$/, "");
  if (!base) throw new Error("Vertex requires baseUrl (project/location endpoint)");
  const model = config.model || "gemini-2.5-flash";
  const url = `${base}/models/${model}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nText to translate:\n${text}` }] }],
    generationConfig: { temperature: 0.2 },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Vertex ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return ((data.candidates?.[0]?.content?.parts?.[0]?.text) ?? "").trim();
}

// ── Sakura（自托管 LLaMA-style /v1/chat/completions） ─────────
async function sakuraTranslate(text: string, systemPrompt: string, config: ConnectionConfig): Promise<string> {
  const base = (config.baseUrl || "http://127.0.0.1:8080").replace(/\/+$/, "");
  const url = base.includes("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const body = {
    model: config.model || "sakura-7b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  };
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Sakura ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return ((data.choices?.[0]?.message?.content) ?? "").trim();
}

// ── DeepL ──────────────────────────────────────────────────────
async function deeplTranslate(text: string, _systemPrompt: string, config: ConnectionConfig): Promise<string> {
  const base = (config.baseUrl || "https://api-free.deepl.com").replace(/\/+$/, "");
  const url = `${base}/v2/translate`;
  // DeepL 不需要 systemPrompt，但需要 target_lang。从 systemPrompt 里抓不到，让调用方在 config.model 写 target lang，如 "ZH" / "EN" / "JA"
  const target = (config.model || "ZH").toUpperCase();
  const body = new URLSearchParams({ text, target_lang: target });
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `DeepL-Auth-Key ${config.apiKey}`,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`DeepL ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return (data.translations?.[0]?.text ?? "").trim();
}

// ── 注册表 ─────────────────────────────────────────────────────
export const TRANSLATOR_BACKENDS: Record<string, TranslatorBackend> = {
  gemini:    { id: "gemini",   label: "Google Gemini",       requiresApiKey: true,  requiresModel: true,  translate: geminiTranslate },
  openai:    { id: "openai",   label: "OpenAI / 兼容",       requiresApiKey: true,  requiresBaseUrl: false, requiresModel: true, translate: openaiTranslate },
  custom:    { id: "custom",   label: "自定义 (OpenAI 协议)", requiresApiKey: true,  requiresBaseUrl: true,  requiresModel: true, translate: openaiTranslate },
  vertex:    { id: "vertex",   label: "Google Vertex AI",    requiresApiKey: true,  requiresBaseUrl: true,  requiresModel: true, translate: vertexTranslate },
  sakura:    { id: "sakura",   label: "Sakura (本地 LLM)",    requiresApiKey: false, requiresBaseUrl: true,  requiresModel: true, translate: sakuraTranslate },
  deepl:     { id: "deepl",    label: "DeepL",               requiresApiKey: true,  requiresBaseUrl: false, requiresModel: true, translate: deeplTranslate },
};

export function getTranslatorBackend(provider: string): TranslatorBackend | null {
  return TRANSLATOR_BACKENDS[provider] || null;
}
