// ============================================================
// 图像合成引擎 — 将 AI 生成结果合成回原图
// ============================================================

import type { Rect } from "@/types";

/**
 * 把 AI 生成的图片中的指定子区域贴回原图。
 *
 * 调用约定：
 * - generatedImg 是 AI 返回的整张图，逻辑上对应 extractRegion 输出（expandedSize 大小），
 *   但实际像素尺寸 (naturalWidth/Height) 可能与 expandedSize 不一致（模型重采样）。
 * - sourceRect 是相对于 expandedSize 的坐标（即 cropRect，等于 sel.rect 在 expanded 内的偏移）。
 * - destRect 是原图上要被覆盖的矩形（等于 sel.rect）。
 * - 函数内部按 generated 的真实尺寸与 expandedSize 的比例做换算。
 */
export async function compositeImage(
  originalDataUrl: string,
  generatedDataUrl: string,
  destRect: Rect,
  sourceRect?: Rect,
  expandedSize?: { width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    const originalImg = new Image();
    originalImg.crossOrigin = "anonymous";

    originalImg.onload = () => {
      const generatedImg = new Image();
      generatedImg.crossOrigin = "anonymous";

      generatedImg.onload = () => {
        canvas.width = originalImg.naturalWidth;
        canvas.height = originalImg.naturalHeight;

        ctx.drawImage(originalImg, 0, 0);

        ctx.save();
        ctx.beginPath();
        ctx.rect(destRect.x, destRect.y, destRect.width, destRect.height);
        ctx.clip();

        let src: Rect;
        if (sourceRect) {
          const expW = expandedSize?.width ?? generatedImg.naturalWidth;
          const expH = expandedSize?.height ?? generatedImg.naturalHeight;
          const sx = generatedImg.naturalWidth / expW;
          const sy = generatedImg.naturalHeight / expH;
          src = {
            x: Math.round(sourceRect.x * sx),
            y: Math.round(sourceRect.y * sy),
            width: Math.round(sourceRect.width * sx),
            height: Math.round(sourceRect.height * sy),
          };
        } else {
          src = { x: 0, y: 0, width: generatedImg.naturalWidth, height: generatedImg.naturalHeight };
        }

        ctx.drawImage(
          generatedImg,
          src.x, src.y, src.width, src.height,
          destRect.x, destRect.y, destRect.width, destRect.height
        );

        ctx.restore();

        resolve(canvas.toDataURL("image/png"));
      };

      generatedImg.onerror = () => reject(new Error("Failed to load generated image"));
      generatedImg.src = generatedDataUrl;
    };

    originalImg.onerror = () => reject(new Error("Failed to load original image"));
    originalImg.src = originalDataUrl;
  });
}

/**
 * 从完整图片中提取指定区域（用于向 AI 发送局部区域）
 */
export async function extractRegion(
  dataUrl: string,
  region: Rect,
  padding: number = 20
): Promise<{ regionDataUrl: string; expandedRect: Rect }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // 扩展选区以包含更多上下文
      const expanded: Rect = {
        x: Math.max(0, region.x - padding),
        y: Math.max(0, region.y - padding),
        width: Math.min(img.naturalWidth - region.x + padding, region.width + padding * 2),
        height: Math.min(img.naturalHeight - region.y + padding, region.height + padding * 2),
      };

      canvas.width = expanded.width;
      canvas.height = expanded.height;

      ctx.drawImage(
        img,
        expanded.x, expanded.y, expanded.width, expanded.height,
        0, 0, expanded.width, expanded.height
      );

      resolve({ regionDataUrl: canvas.toDataURL("image/png"), expandedRect: expanded });
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = dataUrl;
  });
}

/**
 * 创建遮罩图片（白色 = 保留，黑色 = 需要修改）
 */
export function createMaskImage(
  imageWidth: number,
  imageHeight: number,
  regions: Rect[]
): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 白色背景（全部保留）
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, imageWidth, imageHeight);

  // 黑色矩形（标记需要修改的区域）
  ctx.fillStyle = "black";
  for (const rect of regions) {
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  return canvas.toDataURL("image/png");
}
