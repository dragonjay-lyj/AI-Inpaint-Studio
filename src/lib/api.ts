// ============================================================
// AI API 集成层 — 支持 Gemini 和 OpenAI 兼容接口
// ============================================================

import type { ConnectionConfig, Rect } from "@/types";

interface GeminiRequest {
  contents: Array<{
    parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    >;
  }>;
  generationConfig?: {
    temperature?: number;
    responseModalities?: string[];
  };
}

interface OpenAIRequest {
  model: string;
  messages: Array<{
    role: string;
    content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: string } }
    >;
  }>;
  max_tokens?: number;
}

export interface AIResult {
  imageDataUrl: string;
  meta?: { source?: string; target?: string };
}

function parseMeta(text: string): { source?: string; target?: string } | undefined {
  if (!text) return undefined;
  const m = text.match(/META\s+source="([^"]*)"\s+target="([^"]*)"/);
  if (!m) return undefined;
  return { source: m[1], target: m[2] };
}

/**
 * 通过 userPrompt 关键词推断意图：翻译 vs 编辑。
 * 翻译模式允许字符数变化、允许重新排版；编辑模式保持原样式。
 */
function inferPromptMode(userPrompt: string): "translate" | "edit" {
  const txt = (userPrompt || "").toLowerCase();
  // 中文/英文翻译关键词
  const translateKw = /(翻译|译|嵌字|中译|日译|英译|translate|translation|chinese|english|japanese|korean|中文|日文|英文|韩文|韩语|日语|英语)/i;
  if (translateKw.test(userPrompt)) return "translate";
  if (translateKw.test(txt)) return "translate";
  return "edit";
}

function buildGeminiPromptText(userPrompt: string): string {
  const mode = inferPromptMode(userPrompt);
  if (mode === "translate") {
    return `You are a manga/comic localization artist. The whole image you receive IS the region to edit (already cropped, with some surrounding context for visual reference).

USER REQUEST: ${userPrompt}

TRANSLATION RULES (must follow):
1. Translate faithfully. Character count WILL differ between languages — that is expected, do NOT pad or shorten.
2. Replace ALL source-language text with the target language. Do NOT keep original Japanese/source characters unless they are proper nouns the user explicitly asked to keep.
3. You MAY re-layout text: vertical Japanese / Korean can become horizontal Chinese / English when natural. Adjust line breaks for the target language's reading flow.
4. Match the source's visual feel (similar weight, color, ballpark size) but do not pixel-lock the original metrics — readability of the translation matters more.
5. Do NOT touch background, art, or any non-text pixels outside the original text region.
6. Output dimensions MUST equal input dimensions. Blend edges with the surrounding context.

After generating the image, output ONE plain-text line in this exact format (no extra commentary):
META source="<the original text you saw, verbatim>" target="<the translated text you wrote>"`;
  }

  // 编辑模式：保持原样式（去水印 / 改细节 / 替换对象）
  return `You are editing a cropped image region. The whole image you receive IS the region to edit (it already contains some surrounding context for visual reference).

INSTRUCTION: ${userPrompt}

EDIT RULES (must follow):
1. Preserve the original visual style of unchanged areas (font, color, lighting, texture).
2. If the instruction is to remove something (watermark / text / object), reconstruct the underlying background pixel-perfectly.
3. Do NOT introduce content unrelated to the instruction.
4. Output dimensions MUST equal input dimensions. Blend edges with the surrounding context.

After generating the image, output ONE plain-text line:
META source="<text or content you saw in the edit area>" target="<what you wrote / how you changed it>"`;
}

function buildOpenAISystemPrompt(userPrompt: string): string {
  const mode = inferPromptMode(userPrompt);
  if (mode === "translate") {
    return `You are a manga/comic localization artist. The image you receive IS the region to edit (already cropped, with some surrounding context).
RULES: (1) Translate ALL source-language text fully — character count will differ, that's fine. (2) Do NOT keep original-language characters unless proper nouns. (3) You may re-layout vertical→horizontal as appropriate. (4) Keep similar visual style. (5) Do not touch non-text pixels. (6) Output same dimensions; blend edges naturally.`;
  }
  return `You are a professional image editing AI. The image you receive IS the region to edit (already cropped, with some surrounding context). Apply the user's instruction. Preserve unchanged areas pixel-faithfully. Output the edited image of the SAME dimensions; blend edges naturally.`;
}

/**
 * 安全解析 JSON 响应，遇到 HTML/非 JSON 时给出清晰错误
 */
async function parseJSONResponse(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 300);
    if (preview.includes("<!doctype") || preview.includes("<html")) {
      throw new Error(
        `API 返回了 HTML 页面而非 JSON（通常是 URL 配置错误或中转站不兼容）。\n` +
        `请求 URL: ${response.url}\n` +
        `响应预览: ${preview}`
      );
    }
    throw new Error(`Invalid JSON response (${response.status}): ${preview}`);
  }
}

/**
 * 调用 Gemini API 进行图像编辑
 */
async function callGeminiAPI(
  config: ConnectionConfig,
  originalImageBase64: string,
  maskRegion: Rect,
  prompt: string
 ): Promise<AIResult> {
  const mimeType = originalImageBase64.startsWith("data:image/png")
    ? "image/png"
    : "image/jpeg";

  const base64Data = originalImageBase64.split(",")[1] || originalImageBase64;

  const body: GeminiRequest = {
    contents: [
      {
        parts: [
          { text: buildGeminiPromptText(prompt) },
          { inlineData: { mimeType, data: base64Data } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const rawBase = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const normalizedBase = rawBase.replace(/\/+$/, "");
  const baseUrl = normalizedBase.includes("/v1beta")
    ? normalizedBase
    : `${normalizedBase}/v1beta`;
  const url = `${baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "AI-Inpaint-Studio/1.0",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await parseJSONResponse(response);

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let imageDataUrl: string | null = null;
  let textBlob = "";
  for (const part of parts) {
    if (part.inlineData && !imageDataUrl) {
      imageDataUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
    } else if (part.text) {
      textBlob += part.text + "\n";
    }
  }
  if (imageDataUrl) {
    return { imageDataUrl, meta: parseMeta(textBlob) };
  }

  // 无图片时收集文本用于诊断
  const finishReason = data.candidates?.[0]?.finishReason || "UNKNOWN";
  const safetyRatings = JSON.stringify(data.candidates?.[0]?.safetyRatings || []);
  throw new Error(
    `Gemini 未返回图片。finishReason=${finishReason}\n` +
    (textBlob ? `文本回复: ${textBlob.slice(0, 200)}\n` : "") +
    `安全评级: ${safetyRatings}\n` +
    `提示: 请确认模型名称为图片生成模型（如 gemini-2.5-flash-image），或尝试调整提示词。`
  );
}

/**
 * 调用 OpenAI 兼容 API 进行图像编辑
 */
async function callOpenAIAPI(
  config: ConnectionConfig,
  originalImageBase64: string,
  maskRegion: Rect,
  prompt: string
): Promise<AIResult> {
  const rawBase = config.baseUrl || "https://api.openai.com/v1";
  // 自动补齐 /v1（中转站通常需要）
  const normalizedBase = rawBase.replace(/\/+$/, "");
  const url = normalizedBase.includes("/v1") || normalizedBase.includes("/v1beta")
    ? `${normalizedBase}/chat/completions`
    : `${normalizedBase}/v1/chat/completions`;

  const systemMessage = buildOpenAISystemPrompt(prompt);

  const body: OpenAIRequest = {
    model: config.model,
    messages: [
      {
        role: "system",
        content: [{ type: "text", text: systemMessage }],
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Instruction: ${prompt}. Return the edited image (same dimensions as the input).`,
          },
          {
            type: "image_url",
            image_url: { url: originalImageBase64, detail: "high" },
          },
        ],
      },
    ],
    max_tokens: 4096,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "User-Agent": "AI-Inpaint-Studio/1.0",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = await parseJSONResponse(response);

  const content = data.choices?.[0]?.message?.content ?? "";

  // 尝试从响应中提取 base64 图片
  // 支持格式: data:image/...;base64,... 或纯 base64 字符串标记为图片
  const base64ImageRegex = /(?:data:image\/\w+;base64,)?[A-Za-z0-9+/=]{100,}/g;
  const matches = content.match(base64ImageRegex);

  if (matches && matches.length > 0) {
    let imageData = matches[0];
    if (!imageData.startsWith("data:")) {
      imageData = "data:image/png;base64," + imageData;
    }
    return { imageDataUrl: imageData, meta: parseMeta(content) };
  }

  // 检查是否返回了图片 URL
  const urlRegex = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?/i;
  const urlMatch = content.match(urlRegex);
  if (urlMatch) {
    // 尝试下载图片并转为 base64
    const imgResponse = await fetch(urlMatch[0], {
      signal: AbortSignal.timeout(30000),
    });
    if (imgResponse.ok) {
      const blob = await imgResponse.blob();
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { imageDataUrl: dataUrl, meta: parseMeta(content) };
    }
  }

  // 无法提取图片，抛出有意义的错误
  throw new Error(
    `OpenAI response did not contain image data. Content preview: ${content.slice(0, 300)}...\n` +
    "Tip: Ensure the model supports image output, or use Gemini models for direct image generation."
  );
}

/**
 * 统一的 AI API 调用入口
 */
export async function callAI(
  config: ConnectionConfig,
  originalImageBase64: string,
  maskRegion: Rect,
  prompt: string
): Promise<AIResult> {
  switch (config.provider) {
    case "gemini":
      return callGeminiAPI(config, originalImageBase64, maskRegion, prompt);
    case "openai":
    case "custom":
      return callOpenAIAPI(config, originalImageBase64, maskRegion, prompt);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * 测试 API 连接
 */
export async function testConnection(config: ConnectionConfig): Promise<boolean> {
  try {
    if (config.provider === "gemini") {
      const rawBase = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
      const normalizedBase = rawBase.replace(/\/+$/, "");
      const baseUrl = normalizedBase.includes("/v1beta")
        ? normalizedBase
        : `${normalizedBase}/v1beta`;
      const url = `${baseUrl}/models?key=${config.apiKey}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "AI-Inpaint-Studio/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      return resp.ok;
    } else {
      const rawBase = config.baseUrl || "https://api.openai.com/v1";
      const normalizedBase = rawBase.replace(/\/+$/, "");
      const url = normalizedBase.includes("/v1") || normalizedBase.includes("/v1beta")
        ? `${normalizedBase}/models`
        : `${normalizedBase}/v1/models`;
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "User-Agent": "AI-Inpaint-Studio/1.0",
        },
        signal: AbortSignal.timeout(10000),
      });
      return resp.ok;
    }
  } catch {
    return false;
  }
}

/**
 * Call AI with graceful degradation and user-friendly error handling.
 *
 * Wraps `callAI` to detect safety filters and provide actionable error messages.
 */
export async function callAIWithDegradation(
  config: ConnectionConfig,
  originalImageBase64: string,
  maskRegion: Rect,
  prompt: string
): Promise<AIResult> {
  try {
    return await callAI(config, originalImageBase64, maskRegion, prompt);
  } catch (err: any) {
    console.warn("[Degradation] Primary AI call failed:", err.message);
    if (config.provider === "gemini" && (err.message?.includes("safety") || err.message?.includes("filter"))) {
      throw new Error("Content filtered by safety system. Try selecting a smaller region or rephrasing your prompt.");
    }
    throw err;
  }
}
