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

/**
 * 蒙版优化：
 * - 先做形态学膨胀（让笔触相邻区域连成块，避免漏字）
 * - 再做轻微高斯模糊 + 二值化（平滑边缘）
 * 输出新的 mask data URL。
 */
export async function optimizeMask(
  maskDataUrl: string,
  options: { dilatePx?: number; blurPx?: number; threshold?: number } = {}
): Promise<string> {
  const { dilatePx = 3, blurPx = 1, threshold = 32 } = options;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const src = document.createElement("canvas");
      src.width = w; src.height = h;
      const sctx = src.getContext("2d");
      if (!sctx) return reject(new Error("no ctx"));
      sctx.drawImage(img, 0, 0);
      const srcData = sctx.getImageData(0, 0, w, h);
      const alpha = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) alpha[i] = srcData.data[i * 4 + 3];

      // 膨胀：每个像素的 alpha 取邻域 dilatePx 半径内最大值
      const dil = new Uint8ClampedArray(w * h);
      const r = Math.max(0, Math.floor(dilatePx));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let m = 0;
          const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
          const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
          for (let yy = y0; yy <= y1; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
              const a = alpha[yy * w + xx];
              if (a > m) m = a;
            }
          }
          dil[y * w + x] = m;
        }
      }

      // 模糊：盒式模糊近似高斯
      const br = Math.max(0, Math.floor(blurPx));
      const blurred = new Uint8ClampedArray(w * h);
      if (br > 0) {
        const tmp = new Uint8ClampedArray(w * h);
        // 横向
        for (let y = 0; y < h; y++) {
          let sum = 0;
          for (let x = -br; x <= br; x++) sum += dil[y * w + Math.max(0, Math.min(w - 1, x))];
          for (let x = 0; x < w; x++) {
            tmp[y * w + x] = sum / (2 * br + 1);
            const xAdd = Math.min(w - 1, x + br + 1);
            const xRem = Math.max(0, x - br);
            sum += dil[y * w + xAdd] - dil[y * w + xRem];
          }
        }
        // 纵向
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let y = -br; y <= br; y++) sum += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
          for (let y = 0; y < h; y++) {
            blurred[y * w + x] = sum / (2 * br + 1);
            const yAdd = Math.min(h - 1, y + br + 1);
            const yRem = Math.max(0, y - br);
            sum += tmp[yAdd * w + x] - tmp[yRem * w + x];
          }
        }
      } else {
        blurred.set(dil);
      }

      // 二值化：alpha 通道
      const out = sctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const v = blurred[i] >= threshold ? 255 : 0;
        out.data[i * 4 + 0] = 255;
        out.data[i * 4 + 1] = 80;
        out.data[i * 4 + 2] = 80;
        out.data[i * 4 + 3] = v;
      }
      sctx.putImageData(out, 0, 0);
      resolve(src.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("failed to load mask"));
    img.src = maskDataUrl;
  });
}

/**
 * Healing brush：在已有 mask 上调用 inpaintWithMask，把"画过的区域"修复掉，
 * 完成后清空 mask（由调用方决定）。
 */
export async function healingBrush(
  config: ConnectionConfig,
  originalDataUrl: string,
  maskDataUrl: string,
  customPrompt?: string
): Promise<string> {
  const optimized = await optimizeMask(maskDataUrl, { dilatePx: 4, blurPx: 1, threshold: 32 });
  return inpaintWithMask(config, originalDataUrl, optimized, customPrompt);
}
