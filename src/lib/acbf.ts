// ============================================================
// ACBF Format Support — Advanced Comic Book Format
// Parser and generator for .acbf metadata files
// ============================================================

import type { ImageEntry } from "@/types";

export interface ACBFMetadata {
  title: string;
  authors: string[];
  language: string;
  pages: Array<{ image: string; textRegions: Array<{ x: number; y: number; width: number; height: number; text: string }> }>;
}

export function parseACBF(xmlString: string): ACBFMetadata {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  const metadata = doc.querySelector("metadata");
  const title = metadata?.querySelector("title")?.textContent || "Untitled";
  const authors = Array.from(metadata?.querySelectorAll("author") || []).map(a => a.textContent || "");
  const lang = metadata?.querySelector("language")?.textContent || "en";

  const pages: ACBFMetadata["pages"] = [];
  const body = doc.querySelector("body");
  body?.querySelectorAll("page").forEach(page => {
    const image = page.getAttribute("image") || "";
    const regions: ACBFMetadata["pages"][0]["textRegions"] = [];
    page.querySelectorAll("text-region").forEach(region => {
      regions.push({
        x: parseInt(region.getAttribute("x") || "0"),
        y: parseInt(region.getAttribute("y") || "0"),
        width: parseInt(region.getAttribute("width") || "100"),
        height: parseInt(region.getAttribute("height") || "30"),
        text: region.textContent || "",
      });
    });
    pages.push({ image, textRegions: regions });
  });

  return { title, authors, language: lang, pages };
}

export function generateACBF(metadata: ACBFMetadata): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<ACBF xmlns="http://www.fictionbook.org/ACBF-1.0">\n';
  xml += '<metadata>\n';
  xml += `<title>${metadata.title}</title>\n`;
  metadata.authors.forEach(a => xml += `<author>${a}</author>\n`);
  xml += `<language>${metadata.language}</language>\n`;
  xml += '</metadata>\n<body>\n';
  metadata.pages.forEach(page => {
    xml += `<page image="${page.image}">\n`;
    page.textRegions.forEach(r => {
      xml += `<text-region x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}">${r.text}</text-region>\n`;
    });
    xml += '</page>\n';
  });
  xml += '</body>\n</ACBF>';
  return xml;
}
