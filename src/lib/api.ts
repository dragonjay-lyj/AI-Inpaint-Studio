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
          {
            text:
`You are editing a cropped image region. The whole image you receive IS the region to edit (it already contains some surrounding context for visual reference).

INSTRUCTION: ${prompt}

STRICT RULES (must follow):
1. Preserve the ORIGINAL font size, font family, position, color, stroke and alignment of any text. Only replace the characters themselves.
2. Do NOT add, duplicate, or insert any extra characters that were not in the source.
3. Do NOT change the layout, spacing, or background outside of where the original characters were.
4. The output image MUST have the same dimensions as the input.

After generating the image, also output ONE line of plain text in this exact format (no extra commentary), so the caller can verify:
META source="<the original characters you saw, verbatim>" target="<the characters you wrote into the output>"`,
          },
          {
            inlineData: { mimeType, data: base64Data },
          },
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

  const systemMessage = `You are a professional image editing AI. The image you receive IS the region to edit (already cropped, with some surrounding context). Edit the whole image according to the instruction and return an edited image of the SAME dimensions. Blend the edges with the surrounding context naturally.`;

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
