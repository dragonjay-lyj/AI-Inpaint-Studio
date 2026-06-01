// ============================================================
// Export / Import Module — PSD (layer pack), CBZ, Word/DOCX
// ============================================================

import type { ImageEntry, TextBlock } from "@/types";
import { dataUrlToBlob } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────

/** Data URL → Uint8Array */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Image data URL → canvas */
async function dataUrlToCanvas(
  dataUrl: string
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get 2D context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve({ canvas, ctx });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ─── 全量结果 ZIP 下载 ─────────────────────────────────────────

/**
 * 把所有图片的处理结果（resultDataUrl，没有则用原图）打包成 zip。
 * 文件名沿用 fileName，重名追加 -1/-2。
 */
export async function exportAllAsZip(images: ImageEntry[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used = new Map<string, number>();

  for (const img of images) {
    const src = img.resultDataUrl || img.originalDataUrl;
    let name = img.fileName || `image-${img.id}.png`;
    if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) name += ".png";
    const count = used.get(name) || 0;
    used.set(name, count + 1);
    if (count > 0) {
      const dot = name.lastIndexOf(".");
      name = `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
    }
    zip.file(name, dataUrlToBytes(src));
  }
  return zip.generateAsync({ type: "blob" });
}

// ─── PSD Export (layered PNG ZIP) ────────────────────────────

/**
 * Export images as a "layered PNG ZIP" with .psd extension.
 * Each image becomes a folder containing original.png, repaired.png,
 * and text.json (if text blocks exist).
 */
export async function exportPSD(
  images: ImageEntry[],
  textBlocks?: TextBlock[]
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const img of images) {
    const folder = zip.folder(img.id) || zip;

    // Original layer
    const origBytes = dataUrlToBytes(img.originalDataUrl);
    folder.file("original.png", origBytes);

    // Repaired layer
    if (img.resultDataUrl) {
      const repBytes = dataUrlToBytes(img.resultDataUrl);
      folder.file("repaired.png", repBytes);
    }

    // Text block data (one JSON per image with all text blocks for its selections)
    const imageTextBlocks = textBlocks?.filter(
      (tb) =>
        img.selections.some((sel) => sel.id === tb.selectionId)
    );
    if (imageTextBlocks && imageTextBlocks.length > 0) {
      folder.file("text.json", JSON.stringify(imageTextBlocks, null, 2));
    }
  }

  // Add a README explaining this is a layer package
  zip.file(
    "_README.txt",
    "This .psd file is a layered PNG ZIP package created by AI Inpaint Studio.\n" +
      "Structure:\n" +
      "  <image-id>/original.png   – Original image layer\n" +
      "  <image-id>/repaired.png   – AI-repaired result\n" +
      "  <image-id>/text.json      – Text block metadata (if any)\n\n" +
      "Open the .zip with any archive tool, or rename to .zip to extract.\n"
  );

  return zip.generateAsync({ type: "blob" });
}

// ─── CBZ Export ──────────────────────────────────────────────

/**
 * Export images as CBZ (Comic Book Zip) — a ZIP of images
 * with a ComicInfo.xml metadata file.
 */
export async function exportCBZ(images: ImageEntry[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Add images as pages
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    // Prefer result if available, else original
    const src = img.resultDataUrl || img.originalDataUrl;
    const ext = img.fileName?.split(".").pop() || "png";
    const pageName = `page-${String(i + 1).padStart(3, "0")}.${ext}`;
    zip.file(pageName, dataUrlToBytes(src));
  }

  // ComicInfo.xml metadata
  const comicInfo = `<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Title>AI Inpaint Studio Export</Title>
  <PageCount>${images.length}</PageCount>
  <Pages>
${images
  .map(
    (_, i) =>
      `    <Page Image="${i}" Type="Story" ImageSize="${0}" Key="${""}" Bookmark="${""}" ImageWidth="${0}" ImageHeight="${0}" />`
  )
  .join("\n")}
  </Pages>
</ComicInfo>`;

  zip.file("ComicInfo.xml", comicInfo);

  return zip.generateAsync({ type: "blob" });
}

// ─── Word / DOCX Export ──────────────────────────────────────

/**
 * Export translations as a simple DOCX-compatible file.
 * Uses a minimal WordprocessingML (OOXML) document.
 */
export async function exportWord(
  images: ImageEntry[],
  translations: Record<string, string>
): Promise<Blob> {
  // Build a minimal DOCX (Office Open XML)
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const paragraphs = Object.entries(translations)
    .map(
      ([key, value]) =>
        `      <w:p><w:r><w:t xml:space="preserve">${escapeXml(key)}: ${escapeXml(value)}</w:t></w:r></w:p>`
    )
    .join("\n");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
${paragraphs}
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  zip.file("[Content_Types].xml", contentTypesXml);
  zip.file("_rels/.rels", relsXml);
  zip.file("word/_rels/document.xml.rels", relsXml);
  zip.file("word/document.xml", documentXml);

  return zip.generateAsync({ type: "blob" });
}

/** Minimal XML escaping. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Word / DOCX Import ──────────────────────────────────────

/**
 * Import translations from a simple .docx file.
 * Extracts text from the document.xml inside the OOXML ZIP.
 */
export async function importWord(file: File): Promise<Record<string, string>> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("Invalid .docx file: missing word/document.xml");
  }

  const xmlStr = await docFile.async("text");

  // Naive XML text extraction — extract text between <w:t> tags
  const textMatches = xmlStr.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
  const parts: string[] = [];
  for (const match of textMatches) {
    parts.push(match[1]);
  }

  const result: Record<string, string> = {};
  for (const line of parts) {
    // Try to parse "key: value" pattern
    const colonIdx = line.indexOf(": ");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 2).trim();
      if (key && value) {
        result[key] = value;
      }
    }
  }

  return result;
}

// ─── CBZ Import ──────────────────────────────────────────────

/**
 * Import a CBZ (Comic Book Zip) archive.
 * Extracts images and returns them as ImageEntry objects.
 */
export async function importCBZ(file: File): Promise<ImageEntry[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);

  const entries: ImageEntry[] = [];
  const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

  // Sort file names for predictable page order
  const fileNames = Object.keys(zip.files).filter((name) => {
    const ext = name.split(".").pop()?.toLowerCase();
    return ext && imageExtensions.has("." + ext) && !name.startsWith("__") && !name.startsWith(".");
  }).sort();

  for (const fileName of fileNames) {
    const zipEntry = zip.files[fileName];
    if (!zipEntry || zipEntry.dir) continue;

    const blob = await zipEntry.async("blob");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });

    entries.push({
      id: Math.random().toString(36).substring(2, 11),
      fileName: fileName.split("/").pop() || fileName,
      originalDataUrl: dataUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
      selections: [],
      status: "idle",
      globalPrompt: "",
    });
  }

  if (entries.length === 0) {
    throw new Error("No supported image files found in CBZ archive");
  }

  return entries;
}
