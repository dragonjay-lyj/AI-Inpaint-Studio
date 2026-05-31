// ============================================================
// 图像合成引擎 — 将 AI 生成结果合成回原图
// ============================================================

import type { Rect } from "@/types";

/**
 * 将 AI 生成的完整图片中指定区域的内容合成到原图上
 * 使用 Canvas 2D API 实现精确像素级合成
 *
 * @param originalDataUrl - 原图 data URL
 * @param generatedDataUrl - AI 生成的完整图片 data URL
 * @param region - 需要替换的区域
 * @returns 合成后的图片 data URL
 */
export async function compositeImage(
  originalDataUrl: string,
  generatedDataUrl: string,
  region: Rect
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
        // 使用原图尺寸
        canvas.width = originalImg.naturalWidth;
        canvas.height = originalImg.naturalHeight;

        // 先绘制原图
        ctx.drawImage(originalImg, 0, 0);

        // 计算生成的图片与原图的缩放比例
        const scaleX = generatedImg.naturalWidth / originalImg.naturalWidth;
        const scaleY = generatedImg.naturalHeight / originalImg.naturalHeight;

        // 从生成的图片中裁剪对应区域，绘制到原图上
        const srcX = Math.round(region.x * scaleX);
        const srcY = Math.round(region.y * scaleY);
        const srcW = Math.round(region.width * scaleX);
        const srcH = Math.round(region.height * scaleY);

        // 使用软边缘渐变来平滑合成（减少接缝）
        ctx.save();
        ctx.beginPath();
        ctx.rect(region.x - 1, region.y - 1, region.width + 2, region.height + 2);
        ctx.clip();

        // 绘制生成图片的对应区域
        ctx.drawImage(
          generatedImg,
          srcX, srcY, srcW, srcH,
          region.x, region.y, region.width, region.height
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
