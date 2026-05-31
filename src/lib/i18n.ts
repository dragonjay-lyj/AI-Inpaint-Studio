import type { LanguageType } from "@/types";

type TranslationKey = string;
type TranslationMap = Record<TranslationKey, string>;

const zh: TranslationMap = {
  // 应用标题
  "app.title": "AI 图像局部重绘工具",
  "app.subtitle": "框选区域，AI 精准修改",

  // 侧边栏
  "sidebar.upload": "上传图片",
  "sidebar.uploadFolder": "上传文件夹",
  "sidebar.paste": "粘贴图片",
  "sidebar.imageList": "图片列表",
  "sidebar.prompt": "提示词",
  "sidebar.promptPlaceholder": "描述你想要修改的内容...",
  "sidebar.applyToAll": "应用到所有图片",
  "sidebar.applyToAllDesc": "将当前选区和提示词应用到列表中的所有图片",
  "sidebar.startGenerate": "开始生成",
  "sidebar.batchGenerate": "批量生成所有",
  "sidebar.stopGenerate": "停止生成",
  "sidebar.downloadResult": "下载最终结果",
  "sidebar.downloadAll": "打包下载全部",
  "sidebar.clearAll": "清除所有图片",
  "sidebar.confirmClear": "确认清除",

  // 连接设置
  "connection.title": "连接设置",
  "connection.provider": "提供商",
  "connection.apiKey": "API Key",
  "connection.baseUrl": "Base URL (可选)",
  "connection.model": "模型",
  "connection.modelPlaceholder": "模型名称",
  "connection.test": "测试连接",

  // 并发设置
  "concurrency.title": "并发设置",
  "concurrency.mode": "执行模式",
  "concurrency.concurrent": "并发",
  "concurrency.serial": "串行",
  "concurrency.maxConcurrent": "最大并发数",

  // 主题
  "theme.title": "主题",
  "theme.light": "浅色",
  "theme.dark": "深色",
  "theme.ocean": "海洋",
  "theme.rose": "玫瑰",
  "theme.forest": "森林",

  // 语言
  "language.title": "语言",

  // 工具栏
  "toolbar.zoomIn": "放大",
  "toolbar.zoomOut": "缩小",
  "toolbar.fit": "适应窗口",
  "toolbar.originalSize": "原始大小",
  "toolbar.undo": "撤销",
  "toolbar.redo": "重做",
  "toolbar.deleteSelection": "删除选区",
  "toolbar.clearAll": "清除所有选区",
  "toolbar.preview": "预览",
  "toolbar.result": "结果",
  "toolbar.select": "选择",
  "toolbar.brush": "画笔",
  "toolbar.eraser": "橡皮擦",
  "toolbar.text": "文本",
  "toolbar.hand": "抓手",

  // 画布
  "canvas.noImage": "请上传图片或按 Ctrl+V 粘贴",
  "canvas.loading": "加载中...",
  "canvas.instruction": "在图片上拖动鼠标框选区域",

  // 批量处理
  "batch.progress": "处理进度",
  "batch.completed": "已完成",
  "batch.failed": "失败",
  "batch.total": "总计",
  "batch.none": "暂无图片",

  // 状态
  "status.idle": "就绪",
  "status.processing": "处理中...",
  "status.done": "完成",
  "status.error": "出错",

  // 设置
  "settings.title": "自动化设置",
  "settings.detector": "文本检测器",
  "settings.ocr": "OCR 识别",
  "settings.inpaint": "图像修复",
  "settings.translator": "翻译引擎",
  "settings.fontSettings": "字体设置",
  "settings.fontFamily": "字体",
  "settings.fontSize": "字号",
  "settings.color": "颜色",
  "settings.alignment": "对齐方式",
  "settings.horizontal": "水平",
  "settings.vertical": "垂直",
  "settings.exportConfig": "导出配置",
  "settings.importConfig": "导入配置",
  "settings.detectorDesc": "自动识别图片中的文字区域",
  "settings.ocrDesc": "识别文字内容",
  "settings.inpaintDesc": "修复/抹除原图文字",
  "settings.translatorDesc": "翻译文本到目标语言",

  // 通用
  "common.cancel": "取消",
  "common.confirm": "确定",
  "common.close": "关闭",
  "common.save": "保存",
  "common.delete": "删除",
  "common.export": "导出",
  "common.import": "导入",
  "common.settings": "设置",
  "common.yes": "是",
  "common.no": "否",

  // 导出
  "export.psd": "导出 PSD (图层包)",
  "export.cbz": "导出 CBZ",
  "export.word": "导出 Word 翻译",
  "import.word": "导入 Word 翻译",
  "import.cbz": "导入 CBZ",

  // 文本编辑
  "text.fontFamily": "字体",
  "text.fontSize": "字号",
  "text.color": "颜色",
  "text.bold": "粗体",
  "text.italic": "斜体",
  "text.underline": "下划线",
  "text.alignLeft": "左对齐",
  "text.alignCenter": "居中",
  "text.alignRight": "右对齐",
  "text.direction": "方向",
  "text.horizontal": "横向",
  "text.vertical": "纵向",
  "text.applyToAll": "应用到所有文本",
  "text.search": "搜索",
  "text.searchPage": "当前页查找",
  "text.searchGlobal": "全局查找",
  "text.fontDefault": "默认",
  "text.fontComic": "漫画",
  "text.fontSerif": "衬线",
  "text.fontHandwritten": "手写",
};

const en: TranslationMap = {
  "app.title": "AI Inpaint Studio",
  "app.subtitle": "Select regions, let AI edit precisely",

  "sidebar.upload": "Upload Image",
  "sidebar.uploadFolder": "Upload Folder",
  "sidebar.paste": "Paste Image",
  "sidebar.imageList": "Image List",
  "sidebar.prompt": "Prompt",
  "sidebar.promptPlaceholder": "Describe what you want to change...",
  "sidebar.applyToAll": "Apply to All",
  "sidebar.applyToAllDesc": "Apply current selections and prompt to all images in list",
  "sidebar.startGenerate": "Generate",
  "sidebar.batchGenerate": "Batch Generate All",
  "sidebar.stopGenerate": "Stop",
  "sidebar.downloadResult": "Download Result",
  "sidebar.downloadAll": "Download All (ZIP)",
  "sidebar.clearAll": "Clear All Images",
  "sidebar.confirmClear": "Confirm Clear",

  "connection.title": "Connection Settings",
  "connection.provider": "Provider",
  "connection.apiKey": "API Key",
  "connection.baseUrl": "Base URL (optional)",
  "connection.model": "Model",
  "connection.modelPlaceholder": "Model name",
  "connection.test": "Test Connection",

  "concurrency.title": "Concurrency",
  "concurrency.mode": "Execution Mode",
  "concurrency.concurrent": "Concurrent",
  "concurrency.serial": "Serial",
  "concurrency.maxConcurrent": "Max Concurrent",

  "theme.title": "Theme",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.ocean": "Ocean",
  "theme.rose": "Rose",
  "theme.forest": "Forest",

  "language.title": "Language",

  "toolbar.zoomIn": "Zoom In",
  "toolbar.zoomOut": "Zoom Out",
  "toolbar.fit": "Fit to Window",
  "toolbar.originalSize": "Original Size",
  "toolbar.undo": "Undo",
  "toolbar.redo": "Redo",
  "toolbar.deleteSelection": "Delete Selection",
  "toolbar.clearAll": "Clear All",
  "toolbar.preview": "Preview",
  "toolbar.result": "Result",
  "toolbar.select": "Select",
  "toolbar.brush": "Brush",
  "toolbar.eraser": "Eraser",
  "toolbar.text": "Text",
  "toolbar.hand": "Hand",

  "canvas.noImage": "Upload an image or press Ctrl+V to paste",
  "canvas.loading": "Loading...",
  "canvas.instruction": "Click and drag on the image to create a selection",

  "batch.progress": "Progress",
  "batch.completed": "Completed",
  "batch.failed": "Failed",
  "batch.total": "Total",
  "batch.none": "No images",

  "status.idle": "Idle",
  "status.processing": "Processing...",
  "status.done": "Done",
  "status.error": "Error",
  // Settings
  "settings.title": "Automation Settings",
  "settings.detector": "Detector",
  "settings.ocr": "OCR",
  "settings.inpaint": "Inpaint",
  "settings.translator": "Translator",
  "settings.fontSettings": "Font Settings",
  "settings.fontFamily": "Font Family",
  "settings.fontSize": "Font Size",
  "settings.color": "Color",
  "settings.alignment": "Alignment",
  "settings.horizontal": "Horizontal",
  "settings.vertical": "Vertical",
  "settings.exportConfig": "Export Config",
  "settings.importConfig": "Import Config",
  "settings.detectorDesc": "Auto-detect text regions in images",
  "settings.ocrDesc": "Recognize text content",
  "settings.inpaintDesc": "Erase original text from images",
  "settings.translatorDesc": "Translate text to target language",

  // General
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.close": "Close",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.export": "Export",
  "common.import": "Import",
  "common.settings": "Settings",
  "common.yes": "Yes",
  "common.no": "No",

  // Export
  "export.psd": "Export PSD (Layer Pack)",
  "export.cbz": "Export CBZ",
  "export.word": "Export Word Translation",
  "import.word": "Import Word Translation",
  "import.cbz": "Import CBZ",

  // Text editing
  "text.fontFamily": "Font",
  "text.fontSize": "Size",
  "text.color": "Color",
  "text.bold": "Bold",
  "text.italic": "Italic",
  "text.underline": "Underline",
  "text.alignLeft": "Align Left",
  "text.alignCenter": "Center",
  "text.alignRight": "Align Right",
  "text.direction": "Direction",
  "text.horizontal": "Horizontal",
  "text.vertical": "Vertical",
  "text.applyToAll": "Apply to All",
  "text.search": "Search",
  "text.searchPage": "Search Page",
  "text.searchGlobal": "Search Global",
  "text.fontDefault": "Default",
  "text.fontComic": "Comic",
  "text.fontSerif": "Serif",
  "text.fontHandwritten": "Handwritten",
};

const translations: Record<LanguageType, TranslationMap> = { zh, en };

export function t(key: TranslationKey, lang: LanguageType): string {
  return translations[lang]?.[key] ?? translations.zh[key] ?? key;
}

export type { TranslationKey, TranslationMap };
