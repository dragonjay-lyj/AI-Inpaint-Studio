# 🎨 AI Inpaint Studio

> 基于 Web 的专业 AI 图像局部重绘工具 — 框选、生成、合成，一步到位。

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)

---

## ✨ 核心功能

### 🎯 图像编辑
- **多区域局部编辑** — 自由框选多个区域，AI 仅修改选中部分
- **裁剪 + 合成** — 只把选区+少量上下文发给 AI，结果精确合成回原图
- **矩形抹字工具** — 拖框抹除文字（左键修复 / 右键恢复 / Ctrl+D 取消 / Space 触发 / 自动模式）
- **蒙版画笔/橡皮擦** — 像素级蒙版编辑，半透明叠加显示
- **修复画笔** — 蒙版优化（膨胀+模糊+二值化）后局部 inpaint
- **多边形选区** — 异形气泡支持，每个顶点独立编辑

### 🤖 AI 模型支持
- **Google Gemini** — gemini-2.5-flash-image / gemini-3-pro-image-preview / 等
- **OpenAI 兼容** — GPT-4o / vLLM / Ollama / 自定义 baseUrl
- **可插拔翻译引擎** — Gemini / OpenAI / Vertex AI / Sakura(本地LLM) / DeepL
- **GPT-Image** — 独立的 /v1/images/generations 端点

### 🎌 漫画翻译流水线
- **自动文本检测** — Gemini 视觉输出气泡 polygon（含 4-12 顶点的异形气泡）
- **多语言 OCR** — Gemini 识别 + 边缘检测 fallback
- **智能 inpaint** — "去字保背景"prompt + 优化蒙版
- **译文嵌字** — 自适应字号、阴影、描边，5 种字体预设
- **跨页上下文** — 多章节 ChapterContext，可配置上下文窗口
- **术语库 + 加权评分** — 自动 AI 翻译候选词，按 BM25-style 评分注入相关术语
- **AI 智能断句** — 让模型基于语义而非字符宽度断行

### 🛡️ 质量保障（架构原则落地）
- **自我审查循环** — 生成 → OCR 校验 → 检测残留源字符/长度漂移 → 追加约束重试
- **语言检测注入** — OCR 探到源语言自动加进 prompt
- **可行性门控** — `feasible:false` 拒绝错误模型名（如 Gemini 模型必须含 `image`）
- **优雅降级** — AI 失败时回退到边缘检测/启发式实现
- **置信度评分** — 每张图算 quality 分（0-1），缩略图底部彩色质量条
- **长度漂移检查** — META 行解析 + Unicode 字符数比对

### ⚡ 工程化
- **批量自动化** — 文件夹上传，"应用到所有图片" 一键复用选区
- **并发/串行模式** — 可控并发数，Promise.allSettled 独立失败
- **IndexedDB 持久化** — 刷新不丢图，所有状态自动保存
- **批量断点续跑** — 检测未完成图片，一键继续上次任务
- **查找替换** — Ctrl+F 当前页 / Ctrl+G 全局，支持原文/译文/正则/区分大小写
- **撤销重做** — 选区操作历史栈
- **prompt 模式选择** — 翻译/编辑/去水印/自动判断

### 🎨 UI/UX
- **5 种主题** — Light / Dark / Ocean / Rose / Forest
- **中英文国际化** — 一键切换
- **原图/结果切换** — 实时对比
- **PSD/CBZ/Word 导出** — 含 ACBF 多语言层级
- **ZIP 全量下载** — 重名自动追加 -1/-2

---

## 🚀 快速开始

```bash
git clone https://github.com/your-username/ai-inpaint-studio.git
cd ai-inpaint-studio
npm install
npm run dev
```

打开 `http://localhost:3000`。

---

## 📸 使用流程

### 通用流程
1. **上传图片** — 左侧上传文件/文件夹，或 `Ctrl+V` 粘贴
2. **框选区域** — 在画布上拖动鼠标，支持多选区、旋转、自由变形
3. **选择 prompt 模式** — 翻译 / 编辑 / 去水印 / 自动判断
4. **输入提示词** — 描述你想要的修改
5. **配置 API** — 展开连接设置，填入 API Key 和模型
6. **生成** — 单张点"开始生成"，批量勾"应用到所有"后点"批量生成所有"
7. **下载** — 单张下载，或 ZIP 全量打包

### 🎌 漫画翻译工作流
```
上传文件夹 → [自动检测文本框] → 选择"翻译"模式
→ 输入"翻译为中文" → [批量生成所有] → ZIP 下载
```

> 💡 擦边图片只框选文字区域即可绕过 AI 安全过滤

### 🚫 去除水印
```
[去水印] 模式 → 框选水印 → 提示词留空或写"重建背景" → 开始生成
```

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|---|---|
| `A` / `D` | 切换图片 |
| `Q` / `W` / `E` / `R` / `H` | 选择 / 画笔 / 橡皮擦 / 文本 / 抓手 |
| `T` / `P` | 文本编辑模式 / 画板模式 |
| `Space` + 拖拽 | 平移画布 |
| 滚轮 | 缩放画布 |
| `Shift` + 滚轮 | 调整画笔大小 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做 |
| `Ctrl+V` | 粘贴剪贴板图片 |
| `Ctrl+F` / `Ctrl+G` | 查找当前页 / 全局查找 |
| `Ctrl+H` | 查找替换 |
| `Ctrl+B` / `I` / `U` | 文本块加粗 / 斜体 / 下划线 |
| `Ctrl+A` | 全选文本块 |
| `Ctrl+Q` / `W` / `E` | 文件操作（打开 / 保存 / 导出）|
| `Ctrl+D` | 删除待提交矩形抹字框 |
| `Space` (erase-rect 工具) | 触发修复 |
| `Delete` | 删除当前选区 |
| `0-9` | 调整透明度 |
| `Alt+WASD` / `Alt+方向键` | 文本块间切换 |
| `Esc` | 关闭弹窗 |

---

## 🛠️ 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Next.js 16 + React 19 |
| 语言 | TypeScript 6 |
| 样式 | Tailwind CSS 4 |
| 状态管理 | Zustand 5 |
| 动画 | Framer Motion 12 |
| 图标 | Lucide React |
| 持久化 | IndexedDB（自定义 wrapper）|
| 导出 | JSZip |
| AI API | Gemini / OpenAI / Vertex / Sakura / DeepL |

---

## 📂 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── globals.css           # 5 主题 + 全局样式
│   ├── layout.tsx
│   └── page.tsx              # 启动时 hydrate IndexedDB
├── components/
│   ├── Canvas.tsx            # 画布（渲染/缩放/选区/画笔/旋转/矩形抹字）
│   ├── Sidebar.tsx           # 侧边栏 + prompt 模式选择 + 自动检测按钮
│   ├── Toolbar.tsx           # 工具栏
│   ├── ImageList.tsx         # 缩略图（含 quality 彩色条）
│   ├── SettingsPanel.tsx     # 自动化模块设置
│   ├── TextEditor.tsx        # 富文本编辑器（B/I/U + 阴影/描边）
│   ├── FindReplace.tsx       # 查找替换（Ctrl+F/G/H）
│   ├── MusicPlayer.tsx       # 本地音乐 + LRC 歌词
│   └── Onboarding.tsx
└── lib/
    ├── api.ts                # AI 调用 + 自我审查循环 + prompt 模式
    ├── store.ts              # Zustand + IndexedDB 订阅
    ├── persistence.ts        # IndexedDB wrapper
    ├── image.ts              # 裁剪 + 合成（带 padding 上下文）
    ├── ocr.ts                # 文本检测/OCR/polygon 检测
    ├── inpaint.ts            # 矩形抹字 + 蒙版优化 + 修复画笔
    ├── translator.ts         # 翻译 + 跨章节上下文 + 加权评分
    ├── translator-backends.ts # 可插拔翻译引擎注册表
    ├── typesetting.ts        # 智能嵌字（自适应字号/阴影/描边）
    ├── export.ts             # PSD/CBZ/Word/全量 ZIP
    ├── acbf.ts               # ACBF 多语言层级
    ├── i18n.ts               # 中英文
    ├── lyrics.ts             # LRC 解析
    ├── schema.ts             # 合约 JSON 单一数据源
    └── guard.ts              # 可行性门控
```

---

## 🏛️ 架构原则

本项目实践了以下原则：

1. **合约 JSON 作为单一数据源** — `schema.ts` + `types.ts` 驱动整个应用
2. **自我审查循环** — `callAIWithSelfReview` 生成→审查→追加约束→重试
3. **AI 做擅长的，代码做精确的** — AI 出意图，Canvas 强制像素约束
4. **可行性门控** — `guard.ts` 在调 API 前拒绝不可行请求
5. **优雅降级** — 每个 AI 调用都有启发式 fallback
6. **加权评分替代 embedding** — 术语库用 BM25-lite 透明可调
7. **并行管线 + 独立失败** — `Promise.allSettled` 用于批量
8. **双层渲染** — Canvas 专业引擎 + React UI 解耦

---

## 🔧 自动化管线模块

| 模块 | 功能 | AI 支持 |
|---|---|---|
| Detector | 文本区域检测（含 polygon） | Gemini / 边缘检测 fallback |
| OCR | 文字识别（日/中/英/韩） | Gemini / 启发式 fallback |
| Inpaint | 修复/抹除文字 | Gemini 图像编辑 |
| Translator | 翻译 + 智能断句 + 术语提取 + 跨页上下文 | Gemini/OpenAI/Vertex/Sakura/DeepL |

---

## 📦 构建部署

```bash
npm run build
npm start
```

---

## 📄 许可证

MIT License

---

<sub>用 AI 做局部重绘，从原型到可用的工程化工具</sub>
