// ============================================================
// Basic Typesetting Engine
// Canvas-based text layout with CJK/Latin line-breaking
// ============================================================

import type { Rect, TextBlock } from "@/types";

export interface TypesettingOptions {
  fontFamily: string;
  fontSize: number;
  maxWidth: number;
  maxHeight: number;
  lineHeight: number;
  alignment: 'left' | 'center' | 'right';
  direction: 'horizontal' | 'vertical';
  color: string;
  bold: boolean;
  italic: boolean;
}

export function computeTextLayout(text: string, options: TypesettingOptions): Array<{ text: string; x: number; y: number; width: number }> {
  // Simple line-breaking: split by characters (for CJK) or words (for Latin)
  const isCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text);
  const chars = isCJK ? text.split('') : text.split(/\s+/);

  const lines: string[] = [];
  let currentLine = '';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${options.bold ? 'bold ' : ''}${options.italic ? 'italic ' : ''}${options.fontSize}px ${options.fontFamily}`;

  for (const char of chars) {
    const testLine = currentLine + (isCJK ? char : ' ' + char);
    const metrics = ctx.measureText(testLine);
    if (metrics.width > options.maxWidth && currentLine) {
      lines.push(currentLine.trim());
      currentLine = isCJK ? char : char;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  const results: Array<{ text: string; x: number; y: number; width: number }> = [];
  const totalHeight = lines.length * options.lineHeight * options.fontSize;
  const startY = options.alignment === 'center' ? (options.maxHeight - totalHeight) / 2 : 0;

  for (let i = 0; i < lines.length; i++) {
    const metrics = ctx.measureText(lines[i]);
    const x = options.alignment === 'center' ? (options.maxWidth - metrics.width) / 2 : options.alignment === 'right' ? options.maxWidth - metrics.width : 0;
    results.push({ text: lines[i], x, y: startY + i * options.lineHeight * options.fontSize, width: metrics.width });
  }

  return results;
}

/**
 * \u628a\u4e00\u4e2a TextBlock \u6e32\u67d3\u5230\u76ee\u6807 canvas \u7684\u6307\u5b9a\u77e9\u5f62\u5185\u3002
 * \u652f\u6301\u52a0\u7c97/\u659c\u4f53/\u9634\u5f71/\u63cf\u8fb9/\u5bf9\u9f50/\u6c34\u5e73\u6216\u5782\u76f4\u65b9\u5411\u3002\u81ea\u52a8\u6839\u636e rect \u5927\u5c0f\u7f29\u5b57\u53f7\u9632\u6ea2\u51fa\u3002
 */
export function renderTextBlockToCanvas(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  rect: Rect,
  paddingPx: number = 4
): void {
  const innerW = Math.max(8, rect.width - paddingPx * 2);
  const innerH = Math.max(8, rect.height - paddingPx * 2);

  // \u81ea\u9002\u5e94\u5b57\u53f7\uff1a\u4ece block.fontSize \u8d77\uff0c\u9010\u6b65\u7f29\u5c0f\u76f4\u5230\u80fd\u88c5\u4e0b
  let fontSize = Math.max(8, block.fontSize || 16);
  let layout: ReturnType<typeof computeTextLayout> = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    layout = computeTextLayout(block.text, {
      fontFamily: block.fontFamily || "sans-serif",
      fontSize,
      maxWidth: innerW,
      maxHeight: innerH,
      lineHeight: 1.2,
      alignment: (block.alignment as "left" | "center" | "right") || "left",
      direction: (block.direction as "horizontal" | "vertical") || "horizontal",
      color: block.color || "#000000",
      bold: !!block.bold,
      italic: !!block.italic,
    });
    const totalH = layout.length * 1.2 * fontSize;
    if (totalH <= innerH || fontSize <= 8) break;
    fontSize = Math.max(8, Math.floor(fontSize * 0.92));
  }

  ctx.save();
  ctx.translate(rect.x + paddingPx, rect.y + paddingPx);

  // \u9634\u5f71
  if (block.shadow) {
    ctx.shadowColor = block.shadow.color;
    ctx.shadowBlur = block.shadow.blur;
    ctx.shadowOffsetX = block.shadow.offsetX;
    ctx.shadowOffsetY = block.shadow.offsetY;
  }

  ctx.globalAlpha = block.opacity ?? 1;
  ctx.font = `${block.italic ? "italic " : ""}${block.bold ? "bold " : ""}${fontSize}px ${block.fontFamily || "sans-serif"}`;
  ctx.textBaseline = "top";

  for (const line of layout) {
    if (block.strokeColor && block.strokeWidth && block.strokeWidth > 0) {
      ctx.strokeStyle = block.strokeColor;
      ctx.lineWidth = block.strokeWidth;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeText(line.text, line.x, line.y);
    }
    ctx.fillStyle = block.color || "#000000";
    ctx.fillText(line.text, line.x, line.y);

    if (block.underline) {
      const w = ctx.measureText(line.text).width;
      ctx.beginPath();
      ctx.moveTo(line.x, line.y + fontSize);
      ctx.lineTo(line.x + w, line.y + fontSize);
      ctx.lineWidth = Math.max(1, fontSize / 16);
      ctx.strokeStyle = block.color || "#000000";
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * \u628a\u591a\u4e2a TextBlock \u6e32\u67d3\u5230\u539f\u56fe\u526f\u672c\u4e0a\uff0c\u8f93\u51fa data URL\u3002
 */
export async function renderTextBlocksOnImage(
  baseImageDataUrl: string,
  blocks: Array<{ block: TextBlock; rect: Rect }>
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no ctx"));
      ctx.drawImage(img, 0, 0);
      for (const { block, rect } of blocks) {
        renderTextBlockToCanvas(ctx, block, rect);
      }
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("failed to load base image"));
    img.src = baseImageDataUrl;
  });
}
