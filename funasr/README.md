# Brainhole FunASR - Audio transcription service

FunASR 是阿里达摩院出品的语音识别工具，使用 paraformer-zh 模型（~220MB），专为中文优化。

## 安装

```bash
cd funasr
uv sync
```

## 使用

应用会自动在 `~/Library/Application Support/brainhole/funasr-env/` 创建独立 Python 环境并安装 FunASR。

也可以手动测试：

```bash
uv run python transcribe.py <audio_file>
```

## 输出格式

脚本输出 JSON 到 stdout，包含：
- `text`: 完整转录文本
- `segments`: 带时间戳的分段
- `duration`: 音频时长（秒）
- `elapsed`: 转录耗时（秒）
