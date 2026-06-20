<div align="center">

<img src="./assets/icon.png" width="100" alt="Brainhole Logo" />

# Brainhole 脑洞

**开源的 AI 知识工作台 — 可视化画布 × 知识图谱 × 多模态文档解析**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-25-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)

一个面向知识工作者的桌面 AI 应用。通过可视化画布连接数据源、提示词和 AI 输出，构建你自己的知识分析工作流。

[English](./README.md) | [中文](./README_zh.md)

[快速开始](#快速开始) · [功能特性](#功能特性) · [截图预览](./docs/screenshots_zh.md) · [架构设计](#架构设计) · [开发指南](#开发指南)

</div>

---

## ✨ 功能特性

> 📸 查看 [完整截图预览](./docs/screenshots_zh.md) 了解各功能模块的界面展示

### 🎨 可视化画布

- **节点式工作流**：数据源 → 提示词 → AI 输出，通过可视化连线构建分析管道
- **拖拽操作**：从文件树或桌面直接拖入文件到画布，自动创建数据节点
- **点击连线**：支持拖拽连线和点击连线两种交互方式，释放到节点卡片任意位置即可连接
- **智能创建**：从输出端口拖到空白处自动创建下游节点并连线
- **撤销/重做**：完整的操作历史记录
- **自动布局**：一键将节点重新排列为清晰的流程图

### 🤖 AI 分析引擎

- **多模型支持**：兼容 OpenAI API 协议的任何大模型（DeepSeek、GPT、Claude、Qwen 等）
- **独立 Embedding**：支持配置独立的 Embedding 模型和端点
- **上下文组装**：自动收集上游节点内容作为 AI 上下文
- **流式输出**：Markdown 实时渲染，支持代码高亮、表格、Mermaid 图表
- **列表模式**：AI 输出可解析为列表，每项独立向下游节点传递

### 📄 多模态文档解析

| 格式 | 支持 | 引擎 |
|------|------|------|
| PDF | ✅ OCR + 表格 + 公式 + 多栏 | MarkItDown / Docling / MinerU |
| Word / PPTX / XLSX | ✅ | MarkItDown / 内置解析器 |
| Markdown / TXT | ✅ | 原生支持 |
| 图片 (PNG/JPG) | ✅ 自动预处理 + OCR | MinerU |
| CSV / Excel | ✅ 表格预览 + 多工作表 | SheetJS |
| 音频 / 视频 | ✅ 自动提取音轨 + 转写 | FunASR + ffmpeg |

> **三种解析引擎可在设置中切换**：MarkItDown（轻量快速）、Docling（推荐，高质量）、MinerU（复杂公式与版面）

### 🕸️ 知识图谱 (GraphRAG)

- **自动抽取**：从文档中抽取实体和关系，构建知识图谱
- **可视化展示**：基于 D3.js 力导向图交互式浏览
- **图谱问答**：支持全局搜索和局部搜索两种 RAG 模式
- **自定义模板**：预置人物、地点、概念等实体类型模板，支持自定义

### 📚 IMA 知识库集成

- **知识库浏览**：在侧边栏浏览腾讯 IMA 知识库的文件树
- **文件拖入画布**：笔记、PDF、Word、TXT 等文件可直接拖入画布作为数据源
- **内容自动获取**：笔记通过 API 获取原文，其他文件下载后本地解析

### 🗄️ 离线模型管理

- **内置模型管理器**：在设置页中直接管理下载和清理用于 OCR 和语音识别的离线模型
- **多下载源支持**：支持选择 HuggingFace、ModelScope 魔搭或 HF-Mirror 国内镜像，实现极速下载
- **自动化环境**：底层依托 `uv` 自动隔离安装 Python 虚拟环境，全程无需配置

### 🌐 国际化

- 🇨🇳 中文 / 🇬🇧 English 完整支持
- 设置面板一键切换

---

## 快速开始

### 下载与安装

你可以直接从我们的 [GitHub Releases](https://github.com/aning35/brainhole/releases) 页面下载适用于你操作系统的预编译桌面应用程序。

- **macOS**: 下载 `.dmg` 文件。
- **Windows**: 下载 `.exe` 文件。
- *注意：用于 OCR、语音识别和 GraphRAG 的 Python 运行环境将在首次运行相关功能时自动下载和配置，无需手动干预。*

### 环境要求 (针对开发者)

- **Node.js** ≥ 18
- **uv** — Python 包管理器（[安装指南](https://docs.astral.sh/uv/getting-started/installation/)）
- **ffmpeg**（可选，用于视频音频提取）

### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/aning35/brainhole.git
cd brainhole

# 安装依赖
npm install

# 复制环境配置
cp .env.example .env
# 编辑 .env 填入你的 API Key

# 启动开发环境
./start.sh
# 或
npm run dev
```

### 配置 AI 模型

启动后打开 **设置 → AI 服务**，填入：

| 配置项 | 示例 | 说明 |
|--------|------|------|
| Base URL | `https://api.deepseek.com/v1` | 兼容 OpenAI 协议的 API 地址 |
| API Key | `sk-xxx` | 你的 API 密钥 |
| Model | `deepseek-v4-flash` | 模型名称 |

Embedding 模型可单独配置，用于知识图谱功能。

### AI 引擎环境 (Python)

FunASR、MinerU、GraphRAG 三个 AI 引擎**首次使用时自动安装**，无需手动配置：

```
funasr/    → 语音转写引擎 (uv sync 自动安装)
mineru/    → 文档解析引擎 (uv sync 自动安装)
graphrag/  → 知识图谱引擎 (uv sync 自动安装)
```

每个目录包含独立的 `pyproject.toml` + `uv.lock`，由 `uv` 管理虚拟环境。

---

## 架构设计

```
brainhole/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── main.ts             # 入口 & 窗口管理
│   │   ├── vault.ts            # 文件系统 & 文档解析 IPC
│   │   ├── graph.ts            # GraphRAG 知识图谱 IPC
│   │   ├── database.ts         # SQLite 数据持久化
│   │   └── services/
│   │       ├── documentParser.ts   # 多格式文档解析
│   │       ├── markitdownParser.ts # MarkItDown 轻量解析
│   │       ├── mineruParser.ts     # MinerU PDF/图片解析
│   │       ├── doclingParser.ts    # Docling 文档解析
│   │       ├── funasrService.ts    # FunASR 语音转写
│   │       ├── logService.ts       # 运行日志服务
│   │       ├── modelManager.ts     # 离线模型下载与管理
│   │       └── taskQueue.ts        # 并发任务队列
│   ├── preload/                 # Electron 预加载 (IPC 桥接)
│   └── renderer/                # React 渲染进程
│       ├── features/
│       │   ├── canvas/          # 画布核心 (React Flow)
│       │   ├── nodes/           # 节点组件 (Data/Prompt/Output)
│       │   ├── knowledge-graph/ # 知识图谱编辑器
│       │   ├── editor/          # Markdown 编辑器
│       │   ├── sidebar/         # 侧边栏 (文件树/IMA)
│       │   └── workspace/       # 工作区管理
│       ├── stores/              # Zustand 状态管理
│       ├── services/            # AI 服务 & IMA 服务
│       └── i18n/                # 国际化 (zh/en)
├── funasr/                      # FunASR Python 工作区
├── graphrag/                    # GraphRAG Python 工作区
├── mineru/                      # MinerU Python 工作区
└── start.sh                     # 开发启动脚本
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 25 |
| UI 框架 | React 18 + TypeScript |
| 画布引擎 | React Flow (xyflow) |
| 状态管理 | Zustand + Immer |
| 样式 | Tailwind CSS |
| 图表 | ECharts |
| 图谱可视化 | D3.js |
| Markdown | React Markdown + MDX Editor |
| 数据库 | better-sqlite3 |
| AI SDK | Vercel AI SDK + OpenAI |
| Python 环境 | uv (高性能包管理) |
| 构建 | Vite + Electron Forge |

---

## 构建与打包

```bash
# 构建
npm run build

# 打包应用
npm run package

# 制作安装包
npm run make
```

### 支持平台

| 平台 | 格式 |
|------|------|
| macOS | `.dmg` |
| Windows | `.exe` |
| Linux | `.deb` / `.rpm` |

---

## 开发指南

### 添加新节点类型

1. 在 `src/renderer/features/nodes/` 创建内容组件
2. 在 `CustomNode.tsx` 中注册渲染逻辑
3. 在 `canvasStore` 中添加节点类型配置

### 扩展文档解析

1. 在 `src/main/services/` 中添加新的解析器
2. 在 `vault.ts` 中注册 IPC handler
3. 在 `preload.ts` 中暴露给渲染进程

### 自定义主题

修改 `tailwind.config.ts` 中的主题配置。

---

## 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

## 许可证

[MIT License](LICENSE)

---

<div align="center">

**Brainhole** — 让知识连接成网，让 AI 触手可及 🚀

</div>
