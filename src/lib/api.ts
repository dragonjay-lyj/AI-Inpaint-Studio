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
  // 显式 mode 标记优先（UI 强制指定时使用）
  const explicit = userPrompt.match(/^\s*\[MODE:(translate|edit|remove-watermark)\]/i);
  if (explicit) {
    const m = explicit[1].toLowerCase();
    if (m === "translate") return "translate";
    return "edit"; // edit / remove-watermark 都走编辑模式
  }
  const txt = (userPrompt || "").toLowerCase();
  // 中文/英文翻译关键词
  const translateKw = /(翻译|译|嵌字|中译|日译|英译|translate|translation|chinese|english|japanese|korean|中文|日文|英文|韩文|韩语|日语|英语)/i;
  if (translateKw.test(userPrompt)) return "translate";
  if (translateKw.test(txt)) return "translate";
  return "edit";
}

/** 去掉 [MODE:xxx] 前缀，给模型实际看到的 prompt */
function stripModeMarker(userPrompt: string): string {
  return userPrompt.replace(/^\s*\[MODE:(translate|edit|remove-watermark)\]\s*/i, "");
}

/**
 * 从文本里抓第一个图片 URL，下载并转成 data URL。
 * 中转站有时把生成结果以 URL 形式返回而非 inlineData base64。
 */
async function fetchImageUrlAsDataUrl(text: string): Promise<string | null> {
  const urlMatch = text.match(/https?:\/\/[^\s"')]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s"')]*)?/i);
  if (!urlMatch) return null;
  try {
    const resp = await fetch(urlMatch[0], { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * 用 OCR 结果反推源语言。返回的标签直接拼到 prompt 里给模型当 hint。
 */
function detectLanguageFromOCR(ocrText: string): string | null {
  if (!ocrText) return null;
  if (/[぀-ゟ゠-ヿ]/.test(ocrText)) return "Japanese";
  if (/[가-힯]/.test(ocrText)) return "Korean";
  if (/[一-鿿]/.test(ocrText)) return "Chinese";
  if (/[Ѐ-ӿ]/.test(ocrText)) return "Russian";
  if (/[؀-ۿ]/.test(ocrText)) return "Arabic";
  if (/[a-zA-Z]/.test(ocrText)) return "English";
  return null;
}

function buildGeminiPromptText(userPrompt: string, sourceLang?: string | null): string {
  const mode = inferPromptMode(userPrompt);
  const cleaned = stripModeMarker(userPrompt);
  const langHint = sourceLang ? `\nSOURCE LANGUAGE DETECTED: ${sourceLang}. You must replace ALL ${sourceLang} text in the image with the target language.\n` : "";
  if (mode === "translate") {
    return `You are a manga/comic localization artist. The whole image you receive IS the region to edit (already cropped, with some surrounding context for visual reference).

USER REQUEST: ${cleaned}${langHint}

TRANSLATION RULES (must follow):
1. Translate faithfully. Character count WILL differ between languages — that is expected, do NOT pad or shorten.
2. Replace ALL source-language text with the target language. Do NOT keep original Japanese/Korean/source characters unless they are proper nouns the user explicitly asked to keep.
3. You MAY re-layout text: vertical Japanese / Korean can become horizontal Chinese / English when natural. Adjust line breaks for the target language's reading flow.
4. Match the source's visual feel (similar weight, color, ballpark size) but do not pixel-lock the original metrics — readability of the translation matters more.
5. Do NOT touch background, art, or any non-text pixels outside the original text region.
6. Output dimensions MUST equal input dimensions. Blend edges with the surrounding context.

After generating the image, output ONE plain-text line in this exact format (no extra commentary):
META source="<the original text you saw, verbatim>" target="<the translated text you wrote>"`;
  }

  return `You are editing a cropped image region. The whole image you receive IS the region to edit (it already contains some surrounding context for visual reference).

INSTRUCTION: ${cleaned}

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

  // 部分中转站把生成图以 URL 形式放在文本里返回，尝试下载
  if (textBlob) {
    const fromUrl = await fetchImageUrlAsDataUrl(textBlob);
    if (fromUrl) {
      return { imageDataUrl: fromUrl, meta: parseMeta(textBlob) };
    }
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
            text: `Instruction: ${stripModeMarker(prompt)}. Return the edited image (same dimensions as the input).`,
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
  try {
    switch (config.provider) {
      case "gemini":
        return await callGeminiAPI(config, originalImageBase64, maskRegion, prompt);
      case "openai":
      case "custom":
        return await callOpenAIAPI(config, originalImageBase64, maskRegion, prompt);
      case "gpt-image":
        return await callGPTImageAPI(config, originalImageBase64, maskRegion, prompt);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  } catch (err: any) {
    // 检测 CORS 错误
    if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
      throw new Error(
        "网络请求被阻止（CORS 错误）。\n" +
        "这通常是因为中转站未配置跨域访问头 (Access-Control-Allow-Origin)。\n" +
        "解决方法：\n" +
        "1. 检查中转站是否配置了 CORS 白名单\n" +
        "2. 或在浏览器中安装 CORS 插件（仅开发环境）\n" +
        "3. 或使用支持 CORS 的中转站服务"
      );
    }
    throw err;
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
      // openai / custom / gpt-image 都用同一个测试端点
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

/**
 * 自我审查循环：
 * 1) 第一轮 callAI 拿到结果
 * 2) 用 Gemini OCR 实测生成图里有什么文字
 * 3) 检查是否仍含源语言字符（日/韩）+ 与 meta.target 字符数偏差是否过大
 * 4) 若有问题，把问题描述追加为额外约束（不替换原 prompt），再调一次
 * 5) 最多 maxRounds 轮（默认 2）
 * 任何一步失败都直接返回当前结果（优雅降级）。
 */
export async function callAIWithSelfReview(
  config: ConnectionConfig,
  originalImageBase64: string,
  maskRegion: Rect,
  prompt: string,
  maxRounds: number = 2,
  onRound?: (round: number, issue: string | null) => void
): Promise<AIResult & { reviewRounds?: number; reviewIssues?: string[]; sourceLang?: string }> {
  const issues: string[] = [];
  let augmentedPrompt = prompt;
  let lastResult: AIResult | null = null;
  let detectedSourceLang: string | null = null;

  // 翻译模式下，先用 OCR 探一下源语言（仅 Gemini provider 才能做）
  if (inferPromptMode(prompt) === "translate" && config.provider === "gemini") {
    try {
      const { recognizeTextWithAI } = await import("./ocr");
      const sourceText = await recognizeTextWithAI(config, originalImageBase64, {
        x: 0, y: 0, width: maskRegion.width, height: maskRegion.height,
      }, "auto");
      detectedSourceLang = detectLanguageFromOCR(sourceText);
      if (detectedSourceLang) {
        augmentedPrompt = `${prompt}\n\n[CONTEXT] Source language detected as ${detectedSourceLang}. Replace all ${detectedSourceLang} text with the target language.`;
      }
    } catch (err) {
      console.warn("[SelfReview] Source language detection failed, proceeding without:", err);
    }
  }

  for (let round = 0; round < maxRounds; round++) {
    onRound?.(round, issues[issues.length - 1] || null);
    const result = await callAIWithDegradation(config, originalImageBase64, maskRegion, augmentedPrompt);
    lastResult = result;

    // 仅翻译模式做审查（编辑模式没有"目标文字应该是什么"的概念）
    const mode = inferPromptMode(prompt);
    if (mode !== "translate") break;

    // OCR 实测生成图里残留的文字
    let ocrText = "";
    try {
      const { recognizeTextWithAI } = await import("./ocr");
      ocrText = await recognizeTextWithAI(config, result.imageDataUrl, {
        x: 0, y: 0, width: maskRegion.width, height: maskRegion.height,
      }, "auto");
    } catch (err) {
      console.warn("[SelfReview] OCR check failed, accepting result:", err);
      break;
    }

    const issue = detectTranslationIssues(ocrText, result.meta);
    if (!issue) break;

    issues.push(issue);
    if (round === maxRounds - 1) break;

    // 追加约束（累积）
    augmentedPrompt = `${augmentedPrompt}\n\n[REVIEW FEEDBACK round ${round + 1}] Your previous output had this issue: ${issue}. Fix it in the next attempt. Do NOT regress on previous fixes.`;
  }

  return {
    imageDataUrl: lastResult!.imageDataUrl,
    meta: lastResult!.meta,
    reviewRounds: issues.length,
    reviewIssues: issues,
    sourceLang: detectedSourceLang || undefined,
  };
}

/**
 * 检查 OCR 结果是否还有源语言字符 + 与期望译文长度是否偏差过大。
 * 返回问题描述（可作为追加约束），无问题返回 null。
 */
function detectTranslationIssues(ocrText: string, meta?: { source?: string; target?: string }): string | null {
  if (!ocrText) return null;
  const text = ocrText.trim();

  // 1) 检查是否还含日韩源字符
  const hiragana = /[぀-ゟ]/;
  const katakana = /[゠-ヿ]/;
  const hangul = /[가-힯]/;

  // target 是否说期望中文/英文
  const target = meta?.target || "";
  const wantsChinese = /[一-鿿]/.test(target);
  const wantsLatin = /^[\x00-\x7f\s]+$/.test(target);

  if (hiragana.test(text) || katakana.test(text)) {
    if (wantsChinese || wantsLatin) {
      const sample = text.match(/[぀-ヿ]+/g)?.[0]?.slice(0, 12) || "japanese kana";
      return `the output image still contains Japanese kana characters (e.g. "${sample}"). All source-language text must be replaced with the target language.`;
    }
  }
  if (hangul.test(text) && (wantsChinese || wantsLatin)) {
    return "the output image still contains Korean Hangul characters. All source-language text must be replaced with the target language.";
  }

  // 2) 长度漂移：OCR 出来的字符数与 meta.target 偏差超 3 倍
  if (target) {
    const ocrLen = [...text].length;
    const tgtLen = [...target].length;
    if (tgtLen > 0 && ocrLen > tgtLen * 3) {
      return `the output image text is much longer (${ocrLen} chars) than the intended translation (${tgtLen} chars). You may have left untranslated source text in the image.`;
    }
    if (tgtLen > 4 && ocrLen < tgtLen * 0.3) {
      return `the output image text is much shorter (${ocrLen} chars) than the intended translation (${tgtLen} chars). The translation appears to be missing characters.`;
    }
  }

  return null;
}

/**
 * 调用 GPT-Image API（/v1/images/generations 端点）
 * 支持 gpt-image-2 等模型，使用参考图片 + prompt 生成新图片
 */
async function callGPTImageAPI(
  config: ConnectionConfig,
  originalImageBase64: string,
  maskRegion: Rect,
  prompt: string
): Promise<AIResult> {
  // 中转站模式：中转站不支持 data: URI 作为 image 参数，改用 chat/completions 端点
  if (config.baseUrl) {
    return callOpenAIAPI(config, originalImageBase64, maskRegion, prompt);
  }

  const rawBase = config.baseUrl || "https://api.openai.com/v1";
  const normalizedBase = rawBase.replace(/\/+$/, "");
  const url = normalizedBase.includes("/v1") || normalizedBase.includes("/v1beta")
    ? `${normalizedBase}/images/generations`
    : `${normalizedBase}/v1/images/generations`;

  // 从 base64 data URL 中提取图片尺寸
  const sizeMatch = originalImageBase64.match(/^data:image\/\w+;base64,(.+)/);
  let width = 1024, height = 1024;
  if (sizeMatch) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = originalImageBase64;
      });
      width = img.naturalWidth;
      height = img.naturalHeight;
    } catch { /* fallback to default */ }
  }

  const body = {
    prompt,
    model: config.model,
    size: `${width}x${height}`,
    image: [originalImageBase64],
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
    throw new Error(`GPT-Image API error ${response.status}: ${errText}`);
  }

  const data = await parseJSONResponse(response);

  // gpt-image 返回格式: { data: [{ url: "..." }] }
  const imageUrl = data.data?.[0]?.url;
  if (imageUrl) {
    // 下载图片并转为 base64
    const imgResponse = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30000),
    });
    if (!imgResponse.ok) {
      throw new Error(`Failed to download generated image from ${imageUrl}`);
    }
    const blob = await imgResponse.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { imageDataUrl: dataUrl };
  }

  // 也检查 b64_json 格式（某些实现返回 base64）
  const b64 = data.data?.[0]?.b64_json;
  if (b64) {
    return { imageDataUrl: `data:image/png;base64,${b64}` };
  }

  throw new Error("GPT-Image response did not contain image data");
}
