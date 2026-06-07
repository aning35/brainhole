# Brainhole MinerU - PDF to Markdown parsing service

MinerU 是阿里达摩院出品的 PDF 文档解析工具，支持：
- OCR 扫描件识别
- 表格识别 → HTML
- 公式识别 → LaTeX
- 多栏布局理解
- 阅读顺序检测

## 安装

```bash
cd mineru
uv sync
```

## 使用

应用会自动在 `~/Library/Application Support/brainhole/mineru-env/` 创建独立 Python 环境并安装 MinerU。

也可以手动安装测试：

```bash
uv run mineru -p <pdf_file> -o <output_dir> -b pipeline
```
