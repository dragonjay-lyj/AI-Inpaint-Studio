"use client";

import { useCallback } from "react";
import { X, ImageIcon } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";

/**
 * ImageList — horizontal thumb strip at the bottom of the canvas area.
 */
export default function ImageList() {
  const images = useAppStore((s) => s.images);
  const currentImageId = useAppStore((s) => s.currentImageId);
  const setCurrentImage = useAppStore((s) => s.setCurrentImage);
  const removeImage = useAppStore((s) => s.removeImage);
  const language = useAppStore((s) => s.language);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      if (window.confirm(t("common.delete", language))) {
        removeImage(id);
      }
    },
    [removeImage, language],
  );

  // ── Empty state ────────────────────────────────────────────
  if (images.length === 0) {
    return (
      <div className="flex h-[100px] max-md:h-[60px] items-center justify-center bg-sidebar/50 border-t">
        <div className="flex flex-col items-center gap-1 text-muted-foreground select-none">
          <ImageIcon className="size-6" />
          <p className="text-sm">{t("batch.none", language)}</p>
          <p className="text-xs">{t("canvas.noImage", language)}</p>
        </div>
      </div>
    );
  }

  // ── Thumbnail strip ────────────────────────────────────────
  return (
    <LayoutGroup>
      <div className="flex h-[100px] max-md:h-[60px] items-center gap-1 overflow-x-auto bg-sidebar/50 border-t px-2 scroll-smooth">
        {images.map((image) => {
          const isActive = image.id === currentImageId;

          return (
            <motion.div
              key={image.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={cn(
                "relative shrink-0 size-16 max-md:size-10 rounded-md overflow-hidden cursor-pointer transition-shadow",
                "hover:ring-2 hover:ring-primary/50",
                isActive && "ring-2 ring-primary ring-offset-1",
              )}
              onClick={() => setCurrentImage(image.id)}
              onContextMenu={(e) => handleContextMenu(e, image.id)}
              title={image.status === "error" && image.error ? `${image.fileName}\n错误: ${image.error}` : image.fileName}
            >
              <img
                src={image.originalDataUrl}
                alt={image.fileName}
                className="size-full object-cover"
                draggable={false}
              />

              {/* Remove button — visible on hover */}
              <button
                type="button"
                className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-black/50 text-white opacity-0 hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(image.id);
                }}
                aria-label={t("common.delete", language)}
              >
                <X className="size-3" />
              </button>

              {/* Status badge */}
              {image.status !== "idle" && (
                <span className="absolute bottom-0.5 left-0.5">
                  {image.status === "done" && (
                    <span className="block size-2 rounded-full bg-green-500" />
                  )}
                  {image.status === "processing" && (
                    <motion.span
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="block size-2 rounded-full bg-blue-500"
                    />
                  )}
                  {image.status === "error" && (
                    <span className="block size-2 rounded-full bg-red-500" />
                  )}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
