# 🎨 AI Inpaint Studio

> 基于 Web 的专业 AI 图像局部重绘工具 — 框选、生成、合成，一步到位。

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-12-0055FF?logo=framer)](https://www.framer.com/motion/)

---

## ✨ 核心功能

- 🎯 **精准局部编辑** — 在画布上自由框选多个区域，AI 仅修改选中部分，原图其余区域保持不变
- ⚡ **批量自动化处理** — 文件夹上传 + "应用到所有图片"，一次设置处理数百张
- 🤖 **多模型支持** — Google Gemini (gemini-2.5-flash-image 等) 和 OpenAI 兼容接口 (GPT-4o、vLLM、Ollama 等)
- 🔀 **并发控制** — 并发 / 串行模式切换，控制并发数平衡速度与速率限制
- 🎨 **5 种精美主题** — Light / Dark / Ocean / Rose / Forest
- 🌐 **中英文国际化** — 内置一键切换
- 🎵 **本地音乐播放器** — 支持上传音乐 + LRC 歌词 + 浮动字幕

---

## 🚀 快速开始

```bash
# 克隆项目
git clone https://github.com/your-username/ai-inpaint-studio.git
cd ai-inpaint-studio

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

浏览器打开 `http://localhost:3000` 即可使用。

---

## 📸 使用流程

1. **上传图片** — 左侧边栏上传文件/文件夹，或 `Ctrl+V` 粘贴
2. **框选区域** — 在画布上按住鼠标拖动，支持多选区、手柄调整大小、旋转
3. **输入提示词** — 描述你想要的修改（如"去除水印""翻译这段日文"）
4. **配置 API** — 展开连接设置，填入 API Key 和模型
5. **开始生成** — 点击"开始生成"，AI 自动编辑并合成回原图
6. **查看与下载** — 切换原图/结果对比，单张下载或 ZIP 打包

### 🎌 漫画翻译工作流

```
上传文件夹 → 框选文字区域 → 输入翻译提示词 → 勾选"应用到所有" → 批量生成
```

> 💡 擦边图片只框选文字区域即可绕过 AI 安全过滤

### 🚫 去除水印

```
框选水印 → 提示词"去除水印，保持背景自然" → 开始生成
```

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `A` / `D` | 切换图片 |
| `Q` / `W` / `E` / `R` / `H` | 选择 / 画笔 / 橡皮擦 / 文本 / 抓手 |
| `Space` + 拖拽 | 平移画布 |
| 滚轮 | 缩放画布 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做 |
| `Ctrl+V` | 粘贴剪贴板图片 |
| `Delete` | 删除当前选区 |
| `0-9` | 调整透明度 |
| `T` / `P` | 文本编辑模式 / 画板模式 |
| `Alt+WASD` | 文本块间切换 |
| `Ctrl+Space` | 音乐播放/暂停 |

---

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 + React 19 |
| 语言 | TypeScript 6 |
| 样式 | Tailwind CSS 4 |
| 状态管理 | Zustand 5 |
| 动画 | Framer Motion 12 |
| 图标 | Lucide React |
| 导出 | JSZip |
| AI API | Gemini + OpenAI 兼容接口 |

---

## 📂 项目结构

```
src/
├── app/                      # Next.js App Router
│   ├── globals.css           # 5 主题 + 全局样式
│   ├── layout.tsx            # 根布局
│   └── page.tsx              # 主页面
├── components/               # 组件
│   ├── Canvas.tsx            # 画布引擎（渲染/缩放/选区/画笔/旋转）
│   ├── Sidebar.tsx           # 侧边栏（上传/提示词/连接设置）
│   ├── Toolbar.tsx           # 工具栏（导航/缩放/工具切换/主题）
│   ├── ImageList.tsx         # 缩略图列表
│   ├── SettingsPanel.tsx     # 自动化设置面板
│   ├── TextEditor.tsx        # 富文本编辑器
│   ├── MusicPlayer.tsx       # 本地音乐播放器 + 浮动歌词
│   └── Onboarding.tsx        # 新用户引导
├── lib/                      # 核心模块
│   ├── api.ts                # AI API 集成（Gemini + OpenAI）
│   ├── store.ts              # Zustand 状态管理
│   ├── image.ts              # 图像合成引擎
│   ├── i18n.ts               # 中英文国际化
│   ├── ocr.ts                # OCR 文本检测
│   ├── translator.ts         # 翻译 + 跨页上下文
│   ├── lyrics.ts             # LRC 歌词解析
│   ├── typesetting.ts        # 智能嵌字排版引擎
│   ├── export.ts             # PSD/CBZ/Word 导入导出
│   ├── acbf.ts               # ACBF XML 解析
│   ├── schema.ts             # 合约 JSON 配置驱动
│   └── guard.ts              # 可行性门控 + 优雅降级
└── types.ts                  # 核心类型定义
```

---

## 🔧 自动化管线模块

| 模块 | 功能 | AI 支持 |
|------|------|---------|
| Detector | 自动检测图片中的文字区域 | Gemini / OpenAI |
| OCR | 识别文字内容（日/中/英） | Gemini / OpenAI |
| Inpaint | 修复/抹除原图文字 | Gemini / OpenAI |
| Translator | 翻译 + 智能断句 + 术语提取 | Gemini / OpenAI |

每个模块支持独立的 AI 渠道配置（Provider + API Key + Base URL）。

---

## 📦 构建部署

```bash
npm run build    # 生产构建
npm start        # 启动生产服务器
```

---

## 📄 许可证

MIT License

---

<sub>Made with ❤️ by AI Inpaint Studio Team</sub>
