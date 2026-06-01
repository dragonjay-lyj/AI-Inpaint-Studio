// ============================================================
// Feasibility Gate — pre-flight checks before API calls
// ============================================================

import type { ConnectionConfig, ImageEntry } from "@/types";
import { APP_SCHEMA } from "./schema";

export interface FeasibilityResult {
  feasible: boolean;
  reason?: string;
  suggestion?: string;
}

export function checkApiConnection(config: ConnectionConfig): FeasibilityResult {
  if (!config.apiKey?.trim()) return { feasible: false, reason: "API Key is empty", suggestion: "Enter your API key in Connection Settings" };
  if (!config.model?.trim()) return { feasible: false, reason: "Model is not specified", suggestion: "Select a model in Connection Settings" };
  if (config.provider === "gemini" && !/image/i.test(config.model)) {
    return {
      feasible: false,
      reason: `Gemini model "${config.model}" is not an image-output model`,
      suggestion: "Use an image-capable Gemini model, e.g. gemini-2.5-flash-image, gemini-2.5-flash-image-preview, or gemini-3-pro-image-preview",
    };
  }
  return { feasible: true };
}

export function checkSelections(image: ImageEntry): FeasibilityResult {
  if (!image) return { feasible: false, reason: "No image selected" };
  const validSelections = image.selections.filter(s => s.rect.width >= APP_SCHEMA.minSelectionSize && s.rect.height >= APP_SCHEMA.minSelectionSize);
  if (validSelections.length === 0) return { feasible: false, reason: "No valid selections", suggestion: `Draw a selection of at least ${APP_SCHEMA.minSelectionSize}x${APP_SCHEMA.minSelectionSize}px` };
  return { feasible: true };
}

export function checkBeforeGenerate(config: ConnectionConfig, image?: ImageEntry): FeasibilityResult {
  const connCheck = checkApiConnection(config);
  if (!connCheck.feasible) return connCheck;
  if (image) {
    const selCheck = checkSelections(image);
    if (!selCheck.feasible) return selCheck;
  }
  return { feasible: true };
}
