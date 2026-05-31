"use client";

import { useCallback, useRef, useState } from "react";
import {
  Settings,
  Save,
  Upload,
  Download,
  X,
} from "lucide-react";
import { useAppStore, type ModuleSettings, type FontSettings } from "@/lib/store";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

// ============================================================
// Module Config Section — toggle + parameters for one module
// ============================================================
function ModuleSection({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 border-b border-border pb-3 last:border-b-0">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-3.5 h-3.5 rounded border-border"
        />
        <span className="text-xs font-semibold">{title}</span>
      </label>
      {enabled && (
        <p className="text-[10px] text-muted-foreground ml-5.5">{description}</p>
      )}
      {enabled && children && (
        <div className="ml-5.5 space-y-2 pt-1">{children}</div>
      )}
    </div>
  );
}

// ============================================================
// Settings Panel
// ============================================================
export default function SettingsPanel() {
  const [open, setOpen] = useState(false);

  const moduleSettings = useAppStore((s) => s.moduleSettings);
  const fontSettings = useAppStore((s) => s.fontSettings);
  const setModuleSettings = useAppStore((s) => s.setModuleSettings);
  const setFontSettings = useAppStore((s) => s.setFontSettings);
  const language = useAppStore((s) => s.language);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Exports settings as JSON ──
  const handleExport = useCallback(() => {
    const payload = JSON.stringify({ moduleSettings, fontSettings }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inpaint-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [moduleSettings, fontSettings]);

  // ── Imports settings from JSON ──
  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.moduleSettings) setModuleSettings(data.moduleSettings);
          if (data.fontSettings) setFontSettings(data.fontSettings);
        } catch {
          // ignore invalid JSON
        }
      };
      reader.readAsText(file);
      // Reset input so the same file can be re-imported
      e.target.value = "";
    },
    [setModuleSettings, setFontSettings],
  );

  // ── Update helpers ──
  const updateModule = useCallback(
    (module: keyof ModuleSettings, partial: Record<string, unknown>) => {
      setModuleSettings({ [module]: partial } as Partial<ModuleSettings>);
    },
    [setModuleSettings],
  );

  if (!open) {
    return (
      <button
        type="button"
        title={t("settings.title", language)}
        className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        onClick={() => setOpen(true)}
      >
        <Settings size={16} />
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-sm",
          "bg-sidebar border-l border-border shadow-xl",
          "flex flex-col",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-foreground" />
            <span className="text-sm font-semibold">{t("settings.title", language)}</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-xs">
          {/* ── Detector ── */}
          <ModuleSection
            title={t("settings.detector", language)}
            description={t("settings.detectorDesc", language)}
            enabled={moduleSettings.detector.enabled}
            onToggle={(v) => updateModule("detector", { enabled: v })}
          >
            <div>
              <label className="text-[10px] text-muted-foreground">
                Confidence Threshold: {moduleSettings.detector.confidenceThreshold.toFixed(2)}
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={moduleSettings.detector.confidenceThreshold}
                onChange={(e) =>
                  updateModule("detector", {
                    confidenceThreshold: Number(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Min Region Size</label>
              <input
                type="number"
                min={10}
                max={500}
                value={moduleSettings.detector.minRegionSize}
                onChange={(e) =>
                  updateModule("detector", {
                    minRegionSize: Number(e.target.value),
                  })
                }
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
            </div>
          </ModuleSection>

          {/* ── OCR ── */}
          <ModuleSection
            title={t("settings.ocr", language)}
            description={t("settings.ocrDesc", language)}
            enabled={moduleSettings.ocr.enabled}
            onToggle={(v) => updateModule("ocr", { enabled: v })}
          >
            <div>
              <label className="text-[10px] text-muted-foreground">Language</label>
              <select
                value={moduleSettings.ocr.language}
                onChange={(e) => updateModule("ocr", { language: e.target.value })}
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              >
                <option value="japanese">Japanese</option>
                <option value="chinese">Chinese</option>
                <option value="english">English</option>
              </select>
            </div>
            <div className="bg-sidebar-accent/30 rounded p-2 mt-1 space-y-1.5">
              <label className="text-[10px] text-muted-foreground">Provider</label>
              <select
                value={moduleSettings.ocr.ai.provider}
                onChange={(e) =>
                  updateModule("ocr", {
                    ai: { ...moduleSettings.ocr.ai, provider: e.target.value as "gemini" | "openai" },
                  })
                }
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
              <label className="text-[10px] text-muted-foreground">API Key</label>
              <input
                type="password"
                value={moduleSettings.ocr.ai.apiKey}
                onChange={(e) =>
                  updateModule("ocr", {
                    ai: { ...moduleSettings.ocr.ai, apiKey: e.target.value },
                  })
                }
                placeholder="sk-..."
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
              <label className="text-[10px] text-muted-foreground">Base URL</label>
              <input
                type="text"
                value={moduleSettings.ocr.ai.baseUrl}
                onChange={(e) =>
                  updateModule("ocr", {
                    ai: { ...moduleSettings.ocr.ai, baseUrl: e.target.value },
                  })
                }
                placeholder="https://api.openai.com/v1 (optional)"
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
            </div>
          </ModuleSection>

          {/* ── Inpaint ── */}
          <ModuleSection
            title={t("settings.inpaint", language)}
            description={t("settings.inpaintDesc", language)}
            enabled={moduleSettings.inpaint.enabled}
            onToggle={(v) => updateModule("inpaint", { enabled: v })}
          >
            <div>
              <label className="text-[10px] text-muted-foreground">
                Edge Feathering: {moduleSettings.inpaint.edgeFeathering}px
              </label>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                value={moduleSettings.inpaint.edgeFeathering}
                onChange={(e) =>
                  updateModule("inpaint", {
                    edgeFeathering: Number(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
            <div className="bg-sidebar-accent/30 rounded p-2 mt-1 space-y-1.5">
              <label className="text-[10px] text-muted-foreground">Provider</label>
              <select
                value={moduleSettings.inpaint.ai.provider}
                onChange={(e) =>
                  updateModule("inpaint", {
                    ai: { ...moduleSettings.inpaint.ai, provider: e.target.value as "gemini" | "openai" },
                  })
                }
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
              <label className="text-[10px] text-muted-foreground">API Key</label>
              <input
                type="password"
                value={moduleSettings.inpaint.ai.apiKey}
                onChange={(e) =>
                  updateModule("inpaint", {
                    ai: { ...moduleSettings.inpaint.ai, apiKey: e.target.value },
                  })
                }
                placeholder="sk-..."
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
              <label className="text-[10px] text-muted-foreground">Base URL</label>
              <input
                type="text"
                value={moduleSettings.inpaint.ai.baseUrl}
                onChange={(e) =>
                  updateModule("inpaint", {
                    ai: { ...moduleSettings.inpaint.ai, baseUrl: e.target.value },
                  })
                }
                placeholder="https://api.openai.com/v1 (optional)"
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
            </div>
          </ModuleSection>

          {/* ── Translator ── */}
          <ModuleSection
            title={t("settings.translator", language)}
            description={t("settings.translatorDesc", language)}
            enabled={moduleSettings.translator.enabled}
            onToggle={(v) => updateModule("translator", { enabled: v })}
          >
            <div className="bg-sidebar-accent/30 rounded p-2 mt-1 space-y-1.5">
              <label className="text-[10px] text-muted-foreground">Provider</label>
              <select
                value={moduleSettings.translator.ai.provider}
                onChange={(e) =>
                  updateModule("translator", {
                    ai: { ...moduleSettings.translator.ai, provider: e.target.value as "gemini" | "openai" },
                  })
                }
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
              <label className="text-[10px] text-muted-foreground">API Key</label>
              <input
                type="password"
                value={moduleSettings.translator.ai.apiKey}
                onChange={(e) =>
                  updateModule("translator", {
                    ai: { ...moduleSettings.translator.ai, apiKey: e.target.value },
                  })
                }
                placeholder="sk-..."
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
              <label className="text-[10px] text-muted-foreground">Base URL</label>
              <input
                type="text"
                value={moduleSettings.translator.ai.baseUrl}
                onChange={(e) =>
                  updateModule("translator", {
                    ai: { ...moduleSettings.translator.ai, baseUrl: e.target.value },
                  })
                }
                placeholder="https://api.openai.com/v1 (optional)"
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Source Language</label>
              <input
                type="text"
                value={moduleSettings.translator.sourceLang}
                onChange={(e) => updateModule("translator", { sourceLang: e.target.value })}
                placeholder="auto"
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Target Language</label>
              <input
                type="text"
                value={moduleSettings.translator.targetLang}
                onChange={(e) => updateModule("translator", { targetLang: e.target.value })}
                placeholder="en"
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={moduleSettings.translator.qualityMode}
                onChange={(e) =>
                  updateModule("translator", { qualityMode: e.target.checked })
                }
                className="w-3.5 h-3.5 rounded border-border"
              />
              <span className="text-[10px]">Quality Mode</span>
            </label>
          </ModuleSection>

          {/* ── Font Settings ── */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-semibold">{t("settings.fontSettings", language)}</span>

            <div>
              <label className="text-[10px] text-muted-foreground">{t("settings.fontFamily", language)}</label>
              <select
                value={fontSettings.family}
                onChange={(e) => setFontSettings({ family: e.target.value })}
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              >
                <option value="sans-serif">Sans-serif</option>
                <option value="serif">Serif</option>
                <option value="monospace">Monospace</option>
                <option value="cursive">Cursive</option>
                <option value="fantasy">Fantasy</option>
                <option value="system-ui">System UI</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground">Default Size</label>
              <input
                type="number"
                min={8}
                max={72}
                value={fontSettings.size}
                onChange={(e) => setFontSettings({ size: Number(e.target.value) })}
                className="w-full text-xs bg-sidebar-accent border border-border rounded px-2 py-1"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground">{t("settings.color", language)}</label>
              <input
                type="color"
                value={fontSettings.color}
                onChange={(e) => setFontSettings({ color: e.target.value })}
                className="w-full h-7 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="text-[10px] text-muted-foreground">{t("settings.alignment", language)}</label>
              <div className="flex rounded-md overflow-hidden border border-border">
                <button
                  onClick={() => setFontSettings({ alignment: "horizontal" })}
                  className={cn(
                    "flex-1 text-xs py-1 transition-colors",
                    fontSettings.alignment === "horizontal"
                      ? "bg-primary text-primary-foreground"
                      : "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80",
                  )}
                >
                  {t("settings.horizontal", language)}
                </button>
                <button
                  onClick={() => setFontSettings({ alignment: "vertical" })}
                  className={cn(
                    "flex-1 text-xs py-1 transition-colors",
                    fontSettings.alignment === "vertical"
                      ? "bg-primary text-primary-foreground"
                      : "bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80",
                  )}
                >
                  {t("settings.vertical", language)}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer — Save/Load */}
        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Download size={14} />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 flex-1 px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Upload size={14} />
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
      </div>
    </>
  );
}
