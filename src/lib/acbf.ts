// ============================================================
// ACBF Format Support — Advanced Comic Book Format
// Parser and generator for .acbf metadata files
// 支持多语言 text-layer：每个语言一份文本层
// ============================================================

import type { ImageEntry } from "@/types";

export interface ACBFTextRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  /** 语言代码（如 ja / zh / en）。空表示主语言 */
  lang?: string;
}

export interface ACBFMetadata {
  title: string;
  authors: string[];
  /** 主语言（fallback） */
  language: string;
  /** 该作品支持的所有语言代码 */
  availableLanguages?: string[];
  pages: Array<{ image: string; textRegions: ACBFTextRegion[] }>;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function parseACBF(xmlString: string): ACBFMetadata {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  const metadata = doc.querySelector("book-info, metadata");
  const title = metadata?.querySelector("book-title, title")?.textContent || "Untitled";
  const authors = Array.from(metadata?.querySelectorAll("author") || []).map(
    (a) => a.textContent || ""
  );
  const lang = metadata?.querySelector("language")?.textContent || "en";

  // 收集 languages 标签下声明的语言列表
  const langNodes = Array.from(metadata?.querySelectorAll("languages text-layer") || []);
  const availableLanguages = Array.from(new Set(langNodes.map((n) => n.getAttribute("lang") || "").filter(Boolean)));

  const pages: ACBFMetadata["pages"] = [];
  const body = doc.querySelector("body");
  body?.querySelectorAll("page").forEach((page) => {
    const image = page.querySelector("image")?.getAttribute("href") || page.getAttribute("image") || "";
    const regions: ACBFTextRegion[] = [];

    // 标准 ACBF: 每个 page 下可有多个 text-layer (按 lang 分组)，内含 text-area
    page.querySelectorAll("text-layer").forEach((layer) => {
      const layerLang = layer.getAttribute("lang") || lang;
      layer.querySelectorAll("text-area").forEach((area) => {
        // text-area 用 points 或 x/y/w/h
        const pts = area.getAttribute("points");
        let x = 0, y = 0, width = 100, height = 30;
        if (pts) {
          const parsed = pts.trim().split(/\s+/).map((p) => p.split(",").map(Number));
          if (parsed.length > 0) {
            const xs = parsed.map((p) => p[0]);
            const ys = parsed.map((p) => p[1]);
            x = Math.min(...xs);
            y = Math.min(...ys);
            width = Math.max(...xs) - x;
            height = Math.max(...ys) - y;
          }
        } else {
          x = parseInt(area.getAttribute("x") || "0");
          y = parseInt(area.getAttribute("y") || "0");
          width = parseInt(area.getAttribute("width") || "100");
          height = parseInt(area.getAttribute("height") || "30");
        }
        const text = Array.from(area.querySelectorAll("p"))
          .map((p) => p.textContent || "")
          .join("\n") || area.textContent || "";
        regions.push({ x, y, width, height, text, lang: layerLang });
      });
    });

    // 兼容旧自定义 text-region 标签
    page.querySelectorAll(":scope > text-region").forEach((region) => {
      regions.push({
        x: parseInt(region.getAttribute("x") || "0"),
        y: parseInt(region.getAttribute("y") || "0"),
        width: parseInt(region.getAttribute("width") || "100"),
        height: parseInt(region.getAttribute("height") || "30"),
        text: region.textContent || "",
        lang: region.getAttribute("lang") || lang,
      });
    });

    pages.push({ image, textRegions: regions });
  });

  return { title, authors, language: lang, availableLanguages, pages };
}

export function generateACBF(metadata: ACBFMetadata): string {
  const langs = (metadata.availableLanguages && metadata.availableLanguages.length > 0)
    ? metadata.availableLanguages
    : Array.from(new Set(metadata.pages.flatMap((p) => p.textRegions.map((r) => r.lang || metadata.language))));

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<ACBF xmlns="http://www.acbf.info/xml/acbf/1.1">\n';
  xml += '  <meta-data>\n';
  xml += '    <book-info>\n';
  xml += `      <book-title>${escapeXml(metadata.title)}</book-title>\n`;
  metadata.authors.forEach((a) => (xml += `      <author>${escapeXml(a)}</author>\n`));
  xml += '      <languages>\n';
  langs.forEach((l) => {
    const isMain = l === metadata.language;
    xml += `        <text-layer lang="${escapeXml(l)}" show="${isMain ? "true" : "false"}"/>\n`;
  });
  xml += '      </languages>\n';
  xml += `    </book-info>\n`;
  xml += '  </meta-data>\n';
  xml += '  <body>\n';
  metadata.pages.forEach((page) => {
    xml += '    <page>\n';
    xml += `      <image href="${escapeXml(page.image)}"/>\n`;
    // 按 lang 分组
    const byLang = new Map<string, ACBFTextRegion[]>();
    for (const r of page.textRegions) {
      const lang = r.lang || metadata.language;
      if (!byLang.has(lang)) byLang.set(lang, []);
      byLang.get(lang)!.push(r);
    }
    for (const [lang, regs] of byLang) {
      xml += `      <text-layer lang="${escapeXml(lang)}">\n`;
      for (const r of regs) {
        const x1 = r.x, y1 = r.y, x2 = r.x + r.width, y2 = r.y + r.height;
        const points = `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`;
        xml += `        <text-area points="${points}">\n`;
        for (const line of r.text.split("\n")) {
          xml += `          <p>${escapeXml(line)}</p>\n`;
        }
        xml += `        </text-area>\n`;
      }
      xml += `      </text-layer>\n`;
    }
    xml += '    </page>\n';
  });
  xml += '  </body>\n';
  xml += '</ACBF>';
  return xml;
}
