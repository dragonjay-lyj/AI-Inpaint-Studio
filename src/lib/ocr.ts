// ============================================================
// OCR Pipeline Module
// Canvas-based text region detection and recognition (simplified)
// ============================================================

import type { Rect } from "@/types";

/**
 * Analyze image data to find regions with high contrast / edge density
 * that are likely text regions.
 *
 * Uses a simple sliding-window edge-density approach on canvas pixel data.
 * Returns bounding rectangles for detected text regions.
 */
export async function detectTextRegions(imageDataUrl: string): Promise<Rect[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      // 1. Convert to grayscale and compute horizontal gradients (Sobel-like)
      const gray = new Uint8Array(width * height);
      const gradient = new Float32Array(width * height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          // Luminosity weights
          gray[y * width + x] = Math.round(
            0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
          );
        }
      }

      // Simple horizontal edge detection
      for (let y = 0; y < height; y++) {
        for (let x = 1; x < width - 1; x++) {
          const gx =
            -1 * gray[y * width + (x - 1)] +
            0 * gray[y * width + x] +
            1 * gray[y * width + (x + 1)];
          gradient[y * width + x] = Math.abs(gx);
        }
      }

      // 2. Threshold gradient map to find "text-like" regions
      // Compute adaptive threshold (mean of top 20% gradient values)
      const sorted = new Float32Array(gradient).sort();
      const top20Idx = Math.floor(sorted.length * 0.8);
      const threshold = sorted[top20Idx] * 0.4;

      const textMask = new Uint8Array(width * height);
      for (let i = 0; i < gradient.length; i++) {
        textMask[i] = gradient[i] > threshold ? 1 : 0;
      }

      // 3. Connected-component labeling (simple flood-fill scan)
      const visited = new Uint8Array(width * height);
      const regions: { minX: number; minY: number; maxX: number; maxY: number; count: number }[] = [];

      const minRegionSize = 30; // minimum pixel count for a text region

      for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
          const idx = y * width + x;
          if (textMask[idx] === 1 && visited[idx] === 0) {
            // BFS flood fill
            const stack: [number, number][] = [[x, y]];
            visited[idx] = 1;
            let minX = x, maxX = x, minY = y, maxY = y;
            let count = 0;

            while (stack.length > 0) {
              const [cx, cy] = stack.pop()!;
              count++;
              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;

              // Check 8-connected neighbors
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = cx + dx;
                  const ny = cy + dy;
                  if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                  const nIdx = ny * width + nx;
                  if (textMask[nIdx] === 1 && visited[nIdx] === 0) {
                    visited[nIdx] = 1;
                    stack.push([nx, ny]);
                  }
                }
              }
            }

            if (count >= minRegionSize) {
              regions.push({ minX, minY, maxX, maxY, count });
            }
          }
        }
      }

      // 4. Merge overlapping/adjacent regions vertically (text lines)
      const merged = mergeOverlappingRegions(regions, width, height);

      // 5. Convert to Rect array with some padding
      const rects: Rect[] = merged.map((r) => ({
        x: Math.max(0, r.minX - 4),
        y: Math.max(0, r.minY - 4),
        width: Math.min(width - r.minX + 8, r.maxX - r.minX + 8),
        height: Math.min(height - r.minY + 8, r.maxY - r.minY + 8),
      }));

      resolve(rects);
    };

    img.onerror = () => reject(new Error("Failed to load image for text detection"));
    img.src = imageDataUrl;
  });
}

/**
 * Merge regions that are vertically close (part of same text line)
 * or horizontally overlapping.
 */
function mergeOverlappingRegions(
  regions: { minX: number; minY: number; maxX: number; maxY: number; count: number }[],
  _imageWidth: number,
  _imageHeight: number,
): { minX: number; minY: number; maxX: number; maxY: number; count: number }[] {
  if (regions.length === 0) return [];

  // Sort by y then x
  const sorted = [...regions].sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  const merged: typeof sorted = [];
  const verticalGap = 10; // max vertical gap to consider same line

  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    // Same line if vertical overlap or close enough
    const vertOverlap =
      r.minY <= current.maxY + verticalGap && r.maxY >= current.minY - verticalGap;
    const horizClose = r.minX <= current.maxX + 20; // horizontal proximity

    if (vertOverlap && horizClose) {
      // Merge
      current.minX = Math.min(current.minX, r.minX);
      current.minY = Math.min(current.minY, r.minY);
      current.maxX = Math.max(current.maxX, r.maxX);
      current.maxY = Math.max(current.maxY, r.maxY);
      current.count += r.count;
    } else {
      merged.push(current);
      current = { ...r };
    }
  }
  merged.push(current);

  // Filter out very small regions after merge
  return merged.filter((r) => (r.maxX - r.minX) * (r.maxY - r.minY) >= 100);
}

/**
 * Recognize text from an image region.
 *
 * This is a simplified placeholder that extracts representative pixel
 * rows and maps them to mock output. A real implementation would call
 * Tesseract.js, PaddleOCR, or an external OCR API.
 */
export async function recognizeText(
  imageDataUrl: string,
  region: Rect,
  _language: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = region.width;
      canvas.height = region.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Extract the region from the source image
      ctx.drawImage(
        img,
        region.x, region.y, region.width, region.height,
        0, 0, region.width, region.height,
      );

      // Analyze pixel density in horizontal strips to guess text presence
      const imageData = ctx.getImageData(0, 0, region.width, region.height);
      const { data, width, height } = imageData;

      // Compute horizontal projection (sum of grayscale per row)
      const rowBrightness = new Float32Array(height);
      for (let y = 0; y < height; y++) {
        let sum = 0;
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
        rowBrightness[y] = sum / width; // average brightness per row
      }

      // Detect rows with significant variation (text lines)
      const globalAvg =
        rowBrightness.reduce((a, b) => a + b, 0) / rowBrightness.length;
      const lineRows: number[] = [];
      for (let y = 0; y < height; y++) {
        if (Math.abs(rowBrightness[y] - globalAvg) > 15) {
          lineRows.push(y);
        }
      }

      // Generate mock recognization result based on detected lines
      if (lineRows.length > 3) {
        // Region looks like it has text — return a mock meaningful string
        resolve("[OCR] Sample text detected");
      } else if (lineRows.length > 0) {
        resolve("[OCR] Short text");
      } else {
        resolve("");
      }
    };

    img.onerror = () => reject(new Error("Failed to load image for text recognition"));
    img.src = imageDataUrl;
  });
}
