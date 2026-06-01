"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  MousePointer2,
  ChevronLeft,
  Settings,
  Image as ImageIcon,
  Zap,
  X,
  Check,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface StepData {
  icon: React.ElementType;
  title: string;
  description: string;
  detail?: string;
  highlightClass?: string;
}

export default function Onboarding() {
  const [step, setStep] = useState<Step>(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const language = useAppStore((s) => s.language);

  const isZh = language === "zh";

  const steps: StepData[] = isZh
    ? [
        {
          icon: Zap,
          title: "欢迎使用 AI Inpaint Studio",
          description: "专业的 AI 图像局部重绘工具",
          detail:
            "在图片上框选区域，AI 根据你的提示词精准修改。\n\n✨ 三大核心场景：\n• 漫画翻译 — 框选文字区域，自动翻译嵌字\n• 去除水印 — 圈选水印，AI 自然填补\n• 批量处理 — 一次设置，处理数百张图片",
        },
        {
          icon: Upload,
          title: "左侧边栏 — 上传 & 配置",
          description: "这里是操作的起点",
          detail:
            "📁 上传图片 / 文件夹，支持 Ctrl+V 粘贴\n✏️ 输入提示词，描述你想怎么修改\n🔗 展开连接设置，配置 AI 模型和 API Key\n🔄 勾选「应用到所有」可批量处理",
        },
        {
          icon: MousePointer2,
          title: "画布区域 — 框选 & 编辑",
          description: "这就是你的工作区",
          detail:
            "🖱️ 按住鼠标拖动 = 框选修改区域\n🖐️ 拖拽选区手柄 = 调整大小\n🔄 拖拽橙色圆点 = 旋转选区\n⌨️ Q/W/E 切换工具：选择/画笔/橡皮擦\nSpace 键 = 平移画布 · 滚轮 = 缩放",
        },
        {
          icon: ChevronLeft,
          title: "顶部工具栏 — 导航 & 视图",
          description: "控制你的工作视角",
          detail:
            "◀ ▶ A/D 键 = 切换图片\n🔍 缩放滑块 · 滚轮缩放 · Ctrl++/-\n🔄 Original/Result = 原图/结果切换\n↩ Ctrl+Z/Y = 撤销/重做\n🎨 右侧 = 5 种主题色 · 中英文切换",
        },
        {
          icon: Settings,
          title: "自动化设置 — 一键翻译管线",
          description: "点击工具栏齿轮图标打开",
          detail:
            "启用模块后，自动化流程将：\n🔍 检测文本区域\n👁️ OCR 识别文字\n🖌️ 修复/抹除原文字\n🌐 翻译为目标语言\n\n每个模块支持自定义 AI 渠道",
        },
        {
          icon: ImageIcon,
          title: "使用场景详解",
          description: "三个典型工作流",
          detail:
            "🎌 漫画翻译：上传文件夹 → 框选文字 → 输入翻译提示词 → 批量生成\n\n🚫 去除水印：框选水印 → 提示词「去除水印」→ 开始生成\n\n📦 批量编辑：在一张图上设置选区 → 勾选「应用到所有」→ 批量生成",
        },
        {
          icon: Check,
          title: "准备就绪！",
          description: "你已经了解了所有核心功能",
          detail: "现在上传一张图片试试吧 ✨\n\n小提示：\n• 用 Gemini 2.5 Flash Image 模型效果最好\n• 擦边图片只框选文字区域即可绕过安全过滤\n• 批量翻译漫画记得勾选「应用到所有」",
        },
      ]
    : [
        {
          icon: Zap,
          title: "Welcome to AI Inpaint Studio",
          description: "Professional AI-powered image inpainting",
          detail:
            "Select regions on images and let AI modify them precisely.\n\n✨ Three Core Scenarios:\n• Manga Translation — Select text areas, auto translate & typeset\n• Watermark Removal — Select watermark, AI fills naturally\n• Batch Processing — Set once, process hundreds",
        },
        {
          icon: Upload,
          title: "Left Sidebar — Upload & Configure",
          description: "Your starting point",
          detail:
            "📁 Upload images/folders, or Ctrl+V paste\n✏️ Enter prompts describing your desired edit\n🔗 Expand Connection Settings for API config\n🔄 Check 'Apply to All' for batch processing",
        },
        {
          icon: MousePointer2,
          title: "Canvas — Select & Edit",
          description: "Your workspace",
          detail:
            "🖱️ Drag to create selection regions\n🖐️ Drag handles to resize\n🔄 Drag orange dot to rotate\n⌨️ Q/W/E switch tools: Select/Brush/Eraser\nSpace to pan · Scroll to zoom",
        },
        {
          icon: ChevronLeft,
          title: "Toolbar — Navigate & View",
          description: "Control your perspective",
          detail:
            "◀ ▶ A/D keys to switch images\n🔍 Zoom slider · Scroll wheel · Ctrl++/-\n🔄 Original/Result toggle\n↩ Ctrl+Z/Y to undo/redo\n🎨 Right side: 5 themes · EN/ZH toggle",
        },
        {
          icon: Settings,
          title: "Automation Settings — Pipeline",
          description: "Click the gear icon in toolbar",
          detail:
            "Enable modules for automated workflow:\n🔍 Detect text regions\n👁️ OCR recognize text\n🖌️ Inpaint/erase original text\n🌐 Translate to target language\n\nEach module supports custom AI channels",
        },
        {
          icon: ImageIcon,
          title: "Usage Scenarios",
          description: "Three typical workflows",
          detail:
            "🎌 Manga Translation: Upload → Select text → Prompt → Batch generate\n\n🚫 Watermark Removal: Select area → 'Remove watermark' → Generate\n\n📦 Batch Edit: Set selections on one image → Apply to All → Batch generate",
        },
        {
          icon: Check,
          title: "You're Ready!",
          description: "You now know all the core features",
          detail:
            "Upload an image and give it a try ✨\n\nTips:\n• Gemini 2.5 Flash Image model works best\n• For sensitive images, select only text areas\n• For batch manga translation, use 'Apply to All'",
        },
      ];

  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === 6;

  const handleNext = useCallback(() => {
    if (!isLast) setStep((s) => (s + 1) as Step);
  }, [isLast]);

  const handlePrev = useCallback(() => {
    if (!isFirst) setStep((s) => (s - 1) as Step);
  }, [isFirst]);

  const handleClose = useCallback(() => {
    useAppStore.getState().setShowOnboarding(false);
    if (dontShowAgain) {
      try {
        localStorage.setItem("ai-inpaint-onboarding-done", "1");
      } catch {}
    }
  }, [dontShowAgain]);

  const handleSkip = useCallback(() => {
    handleClose();
  }, [handleClose]);

  const Icon = current.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card */}
      <motion.div
        key={step}
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -20 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="relative z-10 w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Progress bar */}
        <div className="flex h-1 bg-muted">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 transition-colors duration-300",
                i <= step ? "bg-primary" : "bg-muted-foreground/20"
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 shrink-0">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground">{current.title}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">{current.description}</p>
            </div>
          </div>

          {current.detail && (
            <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line bg-muted/50 rounded-xl p-4">
              {current.detail}
            </div>
          )}

          {/* Step counter */}
          <p className="text-xs text-muted-foreground text-center mt-4">
            {step + 1} / {steps.length}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5 pt-1">
          {/* Left: don't show again */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              {isZh ? "以后不再提示" : "Don't show again"}
            </span>
          </label>

          {/* Right: navigation */}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {isZh ? "上一步" : "Back"}
              </button>
            )}
            {!isLast ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                {isZh ? "下一步" : "Next"}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Check className="w-3.5 h-3.5" />
                {isZh ? "开始使用" : "Get Started"}
              </button>
            )}
          </div>

          {/* Skip button (top-right) */}
          {!isLast && (
            <button
              onClick={handleSkip}
              className="absolute top-3 right-4 flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {isZh ? "跳过" : "Skip"}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
