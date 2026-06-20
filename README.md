<div align="center">

<img src="./assets/icon.png" width="100" alt="Brainhole Logo" />

# Brainhole

**Open-source AI Knowledge Workbench — Visual Canvas × Knowledge Graph × Multimodal Document Parsing**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-25-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)

A desktop AI application for knowledge workers. Build your own analysis workflows by connecting data sources, prompts, and AI outputs on a visual canvas.

[English](./README.md) | [中文](./README_zh.md)

[Getting Started](#getting-started) · [Features](#features) · [Screenshots](./docs/screenshots.md) · [Architecture](#architecture) · [Development](#development)

</div>

---

## ✨ Features

> 📸 See the [full screenshots gallery](./docs/screenshots.md) for a visual tour of all features

### 🎨 Visual Canvas

- **Node-based Workflow**: Data → Prompt → AI Output, build analysis pipelines through visual connections
- **Drag & Drop**: Drag files from file tree or desktop directly onto the canvas to create data nodes
- **Click-to-Connect**: Two connection modes — drag-connect and click-connect; drop anywhere on a node card to connect
- **Smart Creation**: Drag from an output port to empty space to auto-create a downstream node with connection
- **Undo/Redo**: Full operation history
- **Auto Layout**: One-click reorganization into a clean flow diagram

### 🤖 AI Analysis Engine

- **Multi-model Support**: Compatible with any LLM supporting the OpenAI API protocol (DeepSeek, GPT, Claude, Qwen, etc.)
- **Independent Embedding**: Configure separate embedding models and endpoints
- **Context Assembly**: Automatically collects upstream node content as AI context
- **Streaming Output**: Real-time Markdown rendering with code highlighting, tables, and Mermaid diagrams
- **List Mode**: AI output can be parsed into a list, with each item independently passed to downstream nodes

### 📄 Multimodal Document Parsing

| Format | Support | Engine |
|--------|---------|--------|
| PDF | ✅ OCR + Tables + Formulas + Multi-column | MarkItDown / Docling / MinerU |
| Word / PPTX / XLSX | ✅ | MarkItDown / Built-in parsers |
| Markdown / TXT | ✅ | Native support |
| Images (PNG/JPG) | ✅ Auto-preprocess + OCR | MinerU |
| CSV / Excel | ✅ Table preview + Multi-sheet | SheetJS |
| Audio / Video | ✅ Auto audio extraction + Transcription | FunASR + ffmpeg |

> **Three parsing engines available in settings**: MarkItDown (lightweight & fast), Docling (recommended, high quality), MinerU (complex formulas & layouts)

### 🕸️ Knowledge Graph (GraphRAG)

- **Auto Extraction**: Extract entities and relationships from documents to build knowledge graphs
- **Interactive Visualization**: D3.js force-directed graph with interactive browsing
- **Graph Q&A**: Supports both global search and local search RAG modes
- **Custom Templates**: Built-in entity type templates (Person, Location, Concept, etc.) with custom template support

### 📚 IMA Knowledge Base Integration

- **Knowledge Base Browser**: Browse Tencent IMA knowledge base file trees in the sidebar
- **Drag to Canvas**: Notes, PDFs, Word docs, TXT files can be dragged directly onto the canvas as data sources
- **Auto Content Fetching**: Notes fetched via API; other files downloaded and parsed locally

### 🗄️ Offline Models Management

- **Built-in Model Manager**: Manage offline models for OCR and Speech Recognition directly in settings
- **Multiple Sources**: Choose between HuggingFace, ModelScope, or HF-Mirror for optimal download speeds
- **Auto Environment**: Python virtual environments are automatically provisioned and isolated using `uv`

### 🌐 Internationalization

- 🇨🇳 Chinese / 🇬🇧 English fully supported
- One-click switching in settings

---

## Getting Started

### Download

You can download the pre-compiled desktop application for your operating system directly from our [GitHub Releases](https://github.com/aning35/brainhole/releases) page.

- **macOS**: Download the `.dmg` file.
- **Windows**: Download the `.exe` file.
- *Note: Python environments (for OCR, Speech Recognition, and GraphRAG) will be automatically downloaded and configured upon the first run.*

### Prerequisites (For Developers)

- **Node.js** ≥ 18
- **uv** — Python package manager ([Install Guide](https://docs.astral.sh/uv/getting-started/installation/))
- **ffmpeg** (optional, for video/audio extraction)

### Installation

```bash
# Clone the repository
git clone https://github.com/aning35/brainhole.git
cd brainhole

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env and fill in your API Key

# Start development environment
./start.sh
# or
npm run dev
```

### Configure AI Models

After launching, open **Settings → AI Services** and fill in:

| Setting | Example | Description |
|---------|---------|-------------|
| Base URL | `https://api.deepseek.com/v1` | Any OpenAI-compatible API endpoint |
| API Key | `sk-xxx` | Your API key |
| Model | `deepseek-v4-flash` | Model name |

Embedding models can be configured separately for knowledge graph features.

### AI Engine Environments (Python)

FunASR, MinerU, and GraphRAG are **auto-installed on first use** — no manual setup required:

```
funasr/    → Speech transcription engine (auto uv sync)
mineru/    → Document parsing engine   (auto uv sync)
graphrag/  → Knowledge graph engine    (auto uv sync)
```

Each directory contains an independent `pyproject.toml` + `uv.lock`, managed by `uv` with isolated virtual environments.

---

## Architecture

```
brainhole/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── main.ts             # Entry & window management
│   │   ├── vault.ts            # File system & document parsing IPC
│   │   ├── graph.ts            # GraphRAG knowledge graph IPC
│   │   ├── database.ts         # SQLite data persistence
│   │   └── services/
│   │       ├── documentParser.ts   # Multi-format document parsing
│   │       ├── markitdownParser.ts # MarkItDown lightweight parsing
│   │       ├── mineruParser.ts     # MinerU PDF/image parsing
│   │       ├── doclingParser.ts    # Docling document parsing
│   │       ├── funasrService.ts    # FunASR speech transcription
│   │       ├── logService.ts       # Runtime log service
│   │       ├── modelManager.ts     # Offline models download & management
│   │       └── taskQueue.ts        # Concurrent task queue
│   ├── preload/                 # Electron preload (IPC bridge)
│   └── renderer/                # React renderer process
│       ├── features/
│       │   ├── canvas/          # Canvas core (React Flow)
│       │   ├── nodes/           # Node components (Data/Prompt/Output)
│       │   ├── knowledge-graph/ # Knowledge graph editor
│       │   ├── editor/          # Markdown editor
│       │   ├── sidebar/         # Sidebar (file tree / IMA)
│       │   └── workspace/       # Workspace management
│       ├── stores/              # Zustand state management
│       ├── services/            # AI service & IMA service
│       └── i18n/                # Internationalization (zh/en)
├── funasr/                      # FunASR Python workspace
├── graphrag/                    # GraphRAG Python workspace
├── mineru/                      # MinerU Python workspace
└── start.sh                     # Development startup script
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | Electron 25 |
| UI Framework | React 18 + TypeScript |
| Canvas Engine | React Flow (xyflow) |
| State Management | Zustand + Immer |
| Styling | Tailwind CSS |
| Charts | ECharts |
| Graph Visualization | D3.js |
| Markdown | React Markdown + MDX Editor |
| Database | better-sqlite3 |
| AI SDK | Vercel AI SDK + OpenAI |
| Python Environment | uv (high-performance package manager) |
| Build | Vite + Electron Forge |

---

## Build & Package

```bash
# Build
npm run build

# Package application
npm run package

# Create installer
npm run make
```

### Supported Platforms

| Platform | Format |
|----------|--------|
| macOS | `.dmg` |
| Windows | `.exe` |
| Linux | `.deb` / `.rpm` |

---

## Development

### Adding New Node Types

1. Create a content component in `src/renderer/features/nodes/`
2. Register rendering logic in `CustomNode.tsx`
3. Add node type configuration in `canvasStore`

### Extending Document Parsing

1. Add a new parser in `src/main/services/`
2. Register IPC handler in `vault.ts`
3. Expose to renderer process in `preload.ts`

### Custom Themes

Modify theme configuration in `tailwind.config.ts`.

---

## Contributing

Contributions are welcome! Please feel free to submit Issues and Pull Requests.

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT License](LICENSE)

---

<div align="center">

**Brainhole** — Connect knowledge into networks, make AI accessible 🚀

</div>