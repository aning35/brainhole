import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import os from 'os';
import { t } from '../i18n';

type LogCallback = (msg: string, type?: 'info' | 'error' | 'warning' | 'success') => void;



function getMineruWorkspacePath(): string {
    const devPath = path.join(process.cwd(), 'mineru');
    if (fs.existsSync(devPath)) return devPath;
    return path.join(process.cwd(), 'mineru');
}

async function ensurePythonExecutable(sendLog?: LogCallback): Promise<string> {
    const isWindows = process.platform === 'win32';
    const workspacePath = getMineruWorkspacePath();
    const pythonPath = path.join(workspacePath, '.venv', isWindows ? 'Scripts' : 'bin', isWindows ? 'python.exe' : 'python');

    if (fs.existsSync(pythonPath)) {
        return pythonPath;
    }

    // Auto-install via uv sync
    console.log('[Docling] Python environment not found, auto-installing via uv sync...');
    sendLog?.(t('serviceMain.envNotInstalled').replace('{name}', 'Docling'), 'info');
    try {
        const env = {
            ...process.env,
            PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
        };
        await new Promise<void>((resolve, reject) => {
            const child = spawn('uv', ['sync'], { cwd: workspacePath, shell: isWindows, env });
            child.stdout?.on('data', (d: Buffer) => console.log('[Docling uv sync]', d.toString().trim()));
            child.stderr?.on('data', (d: Buffer) => console.warn('[Docling uv sync]', d.toString().trim()));
            child.on('close', code => code === 0 ? resolve() : reject(new Error(`uv sync failed (${code})`)));
            child.on('error', reject);
        });
        console.log('[Docling] uv sync completed successfully');
        sendLog?.(t('serviceMain.envCreatedSuccess').replace('{name}', 'Docling'), 'success');

        if (fs.existsSync(pythonPath)) {
            return pythonPath;
        }
    } catch (e) {
        console.warn('[Docling] Auto uv sync failed:', e);
    }

    throw new Error('MinerU/Docling Python environment not found and auto-install failed. Please run "uv sync" in the mineru/ directory.');
}

async function getUniqueOutputPath(inputPath: string): Promise<string> {
    const dir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    let outputPath = path.join(dir, `${baseName}.md`);
    let counter = 1;

    while (await fs.pathExists(outputPath)) {
        outputPath = path.join(dir, `${baseName}_${counter}.md`);
        counter++;
    }

    return outputPath;
}

/**
 * Parse a document (PDF, image, etc.) to Markdown using Docling.
 */
export async function parseWithDocling(
    inputPath: string,
    sendLog: LogCallback
): Promise<{ success: boolean; outputPath: string; content: string }> {
    const pythonExe = await ensurePythonExecutable(sendLog);
    const outputPath = await getUniqueOutputPath(inputPath);
    
    // We'll create a temporary python script to run Docling
    const pyScriptPath = path.join(os.tmpdir(), `run_docling_${Date.now()}.py`);
    const pyScript = `
import os
import sys
import json
import traceback
import platform

# Patch huggingface_hub to prefer local cache, avoiding network HEAD requests
# that fail behind proxies or with hf-mirror.com redirects.
try:
    import huggingface_hub
    import huggingface_hub._snapshot_download as _snap_mod
    _orig_snapshot = _snap_mod.snapshot_download

    def _patched_snapshot(*args, **kwargs):
        # Try local cache first (no network)
        if not kwargs.get('force_download'):
            try:
                kw = dict(kwargs)
                kw['local_files_only'] = True
                return _orig_snapshot(*args, **kw)
            except Exception:
                pass
        # Fall back to network download
        return _orig_snapshot(*args, **kwargs)

    _snap_mod.snapshot_download = _patched_snapshot
    huggingface_hub.snapshot_download = _patched_snapshot
except Exception:
    pass

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
from docling.datamodel.base_models import InputFormat

def main():
    try:
        input_path = sys.argv[1]
        output_path = sys.argv[2]

        is_windows = platform.system() == "Windows"

        if is_windows:
            # Windows: always use full-page OCR with RapidOCR (Chinese+English).
            # pypdfium2 on Windows lacks CIDFont/CMap system font fallback,
            # causing garbled /Gxx output or missing pages for many Chinese PDFs.
            print("Windows: using full-page OCR mode", file=sys.stderr, flush=True)
            ocr_options = RapidOcrOptions(
                lang=["chinese", "english"],
                force_full_page_ocr=True,
            )
            pipeline_options = PdfPipelineOptions(
                do_ocr=True,
                ocr_options=ocr_options,
            )
            converter = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
                }
            )
        else:
            # macOS/Linux: text extraction works fine with system font fallback
            converter = DocumentConverter()

        result = converter.convert(input_path)
        markdown = result.document.export_to_markdown()

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(markdown)

        print(json.dumps({"success": True, "output": output_path}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "traceback": traceback.format_exc()}))
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

    await fs.writeFile(pyScriptPath, pyScript, 'utf-8');

    try {
        sendLog(t('serviceMain.startDocling').replace('{name}', path.basename(inputPath)), 'info');
        console.log(`[Docling] Command: ${pythonExe} ${pyScriptPath} ${inputPath} ${outputPath}`);

        await new Promise<void>((resolve, reject) => {
            const env = {
                ...process.env,
                PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
                HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://huggingface.co',
                // Inherit proxy settings if present (needed for model downloads)
                ...(process.env.HTTP_PROXY ? { HTTP_PROXY: process.env.HTTP_PROXY } : {}),
                ...(process.env.HTTPS_PROXY ? { HTTPS_PROXY: process.env.HTTPS_PROXY } : {}),
                ...(process.env.http_proxy ? { http_proxy: process.env.http_proxy } : {}),
                ...(process.env.https_proxy ? { https_proxy: process.env.https_proxy } : {}),
            };
            const child = spawn(pythonExe, [pyScriptPath, inputPath, outputPath], { env, shell: false });

            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });
            
            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
                // Docling outputs progress to stderr, so we can log it
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim() && (line.includes('[INFO]') || line.includes('OCR mode'))) {
                         sendLog(line.trim().replace(/\[INFO\][^\[]+\[RapidOCR\]/, '[OCR]'), 'info');
                    }
                }
            });
            
            child.on('close', async (code) => {
                try {
                    // Try to parse the last line of stdout as JSON
                    const lines = stdout.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    let result;
                    try {
                        result = JSON.parse(lastLine);
                    } catch (e) {
                         // If not JSON, just check exit code
                         if (code === 0) resolve();
                         else reject(new Error(`Docling exited with code ${code}: ${stderr}`));
                         return;
                    }
                    
                    if (result.success) {
                        resolve();
                    } else {
                        reject(new Error(`Docling failed: ${result.error}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
            
            child.on('error', reject);
        });

        // Read the generated markdown
        const mdContent = await fs.readFile(outputPath, 'utf-8');
        sendLog(t('serviceMain.doclingDone').replace('{name}', path.basename(outputPath)), 'success');
        console.log(`[Docling] Output: ${outputPath}`);
        
        return { success: true, outputPath, content: mdContent };

    } finally {
        // Cleanup temp script
        try {
            await fs.remove(pyScriptPath);
        } catch {
            // ignore
        }
    }
}
