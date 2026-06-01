// ============================================================
// Inpaint 模块 — 利用 Gemini 图像编辑做"去字保背景"
// ============================================================

import type { ConnectionConfig, Rect } from "@/types";
import { callAI } from "./api";
import { extractRegion, compositeImage } from "./image";

const INPAINT_PROMPT =
  "Remove ALL text, characters, speech bubbles content, and overlay marks from this image. " +
  "Reconstruct the underlying background pixel-perfectly so it looks as if no text was ever there. " +
  "Do NOT add anything new. Preserve all non-text artwork unchanged.";

/**
 * 对原图的指定矩形区域执行去字 inpaint，并把结果合成回原图。
 * @returns 合成后的整张图 data URL
 */
export async function inpaintRect(
  config: ConnectionConfig,
  originalDataUrl: string,
  rect: Rect,
  customPrompt?: string,
  padding: number = 30
): Promise<string> {
  const { regionDataUrl, expandedRect } = await extractRegion(originalDataUrl, rect, padding);
  const cropRect: Rect = {
    x: rect.x - expandedRect.x,
    y: rect.y - expandedRect.y,
    width: rect.width,
    height: rect.height,
  };
  const result = await callAI(config, regionDataUrl, cropRect, customPrompt || INPAINT_PROMPT);
  return compositeImage(
    originalDataUrl,
    result.imageDataUrl,
    rect,
    cropRect,
    { width: expandedRect.width, height: expandedRect.height }
  );
}

/**
 * 基于 mask（白色像素 = 要修复的区域）对整张图执行 inpaint。
 * 实现：找到 mask 的 bounding box，对该区域调 inpaintRect。
 */
export async function inpaintWithMask(
  config: ConnectionConfig,
  originalDataUrl: string,
  maskDataUrl: string,
  customPrompt?: string
): Promise<string> {
  const bbox = await maskBoundingBox(maskDataUrl);
  if (!bbox) return originalDataUrl;
  return inpaintRect(config, originalDataUrl, bbox, customPrompt);
}

async function maskBoundingBox(maskDataUrl: string): Promise<Rect | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const a = data[(y * c.width + x) * 4 + 3];
          if (a > 16) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return resolve(null);
      resolve({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 });
    };
    img.onerror = () => resolve(null);
    img.src = maskDataUrl;
  });
}
