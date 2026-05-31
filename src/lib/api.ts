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

/**
 * 调用 Gemini API 进行图像编辑
 */
async function callGeminiAPI(
  config: ConnectionConfig,
  originalImageBase64: string,
  maskRegion: Rect,
  prompt: string
): Promise<string> {
  const mimeType = originalImageBase64.startsWith("data:image/png")
    ? "image/png"
    : "image/jpeg";

  const base64Data = originalImageBase64.split(",")[1] || originalImageBase64;

  const systemInstruction = `You are a professional image editing AI. You will receive an original image with a marked region and a text instruction describing what to do within that region.

CRITICAL RULES:
1. Keep EVERYTHING outside the marked region EXACTLY as the original — no changes to color, lighting, or texture outside the region. The rest of the image must remain pixel-perfect identical.
2. Only modify the content WITHIN the marked rectangular region according to the user's prompt.
3. Return the COMPLETE image with the changes applied — do NOT return only the masked region.
4. The output must be a single image. Do NOT return text, descriptions, or code.
5. Ensure seamless blending at the region boundaries — the edited area should look natural and consistent with surrounding pixels.`;

  const body: GeminiRequest = {
    contents: [
      {
        parts: [
          {
            text: `EDIT REGION: x=${maskRegion.x}, y=${maskRegion.y}, width=${maskRegion.width}, height=${maskRegion.height}\n\nINSTRUCTION: ${prompt}\n\nPlease edit ONLY the specified rectangular region according to the instruction. Keep everything outside this region completely unchanged. Return the full modified image.`,
          },
          {
            inlineData: { mimeType, data: base64Data },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  const url = `${baseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // 解析 Gemini 响应中的图片
  for (const part of data.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Gemini response did not contain an image");
}

/**
 * 调用 OpenAI 兼容 API 进行图像编辑
 */
async function callOpenAIAPI(
  config: ConnectionConfig,
  originalImageBase64: string,
  maskRegion: Rect,
  prompt: string
): Promise<string> {
  const url = config.baseUrl
    ? `${config.baseUrl.replace(/\/$/, "")}/chat/completions`
    : "https://api.openai.com/v1/chat/completions";

  const systemMessage = `You are a professional image editing AI. When given an image with a specified region and editing instruction:
1. Only modify the content within the specified rectangular region (x=${maskRegion.x}, y=${maskRegion.y}, w=${maskRegion.width}, h=${maskRegion.height}).
2. Keep everything outside this region completely unchanged — pixel-perfect.
3. Return the full image with edits applied.
4. Ensure seamless blending at region boundaries.`;

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
            text: `Region to edit: (${maskRegion.x}, ${maskRegion.y}) size ${maskRegion.width}x${maskRegion.height}. Instruction: ${prompt}. Generate the full image with only this region modified.`,
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
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

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
    return imageData;
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
      return dataUrl;
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
): Promise<string> {
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
      const baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
      const url = `${baseUrl}/models?key=${config.apiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      return resp.ok;
    } else {
      const url = config.baseUrl
        ? `${config.baseUrl.replace(/\/$/, "")}/models`
        : "https://api.openai.com/v1/models";
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
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
): Promise<string> {
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
