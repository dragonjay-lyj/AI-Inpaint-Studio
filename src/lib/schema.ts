// ============================================================
// App Configuration Schema — single source of truth
// Drives page generation, API routes, and component rendering
// ============================================================

export const APP_SCHEMA = {
  version: "1.0.0",
  modules: {
    detector: { id: "detector", name: "Text Detector", defaultEnabled: true, params: { confidenceThreshold: 0.7, minRegionSize: 50 } },
    ocr: { id: "ocr", name: "OCR Engine", defaultEnabled: true, params: { language: "jpn", engine: "tesseract" } },
    inpaint: { id: "inpaint", name: "Inpainting", defaultEnabled: true, params: { method: "ai", edgeFeathering: 8 } },
    translator: { id: "translator", name: "Translator", defaultEnabled: true, params: { engine: "gemini", qualityMode: true } }
  },
  supportedFormats: { import: ["png","jpg","jpeg","webp","cbz","acbf"], export: ["png","zip","psd","cbz"] },
  themeColors: ["light","dark","ocean","rose","forest"],
  maxConcurrentRequests: 10,
  minSelectionSize: 5,
}

export type AppSchema = typeof APP_SCHEMA;
