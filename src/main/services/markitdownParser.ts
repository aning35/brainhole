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
    console.log('[MarkItDown] Python environment not found, auto-installing via uv sync...');
    sendLog?.(t('serviceMain.envNotInstalled').replace('{name}', 'MarkItDown'), 'info');
    try {
        const env = {
            ...process.env,
            ...(isWindows ? {} : { PATH: `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}` }),
        };
        await new Promise<void>((resolve, reject) => {
            const child = spawn('uv', ['sync'], { cwd: workspacePath, shell: isWindows, env });
            child.stdout?.on('data', (d: Buffer) => console.log('[MarkItDown uv sync]', d.toString().trim()));
            child.stderr?.on('data', (d: Buffer) => console.warn('[MarkItDown uv sync]', d.toString().trim()));
            child.on('close', code => code === 0 ? resolve() : reject(new Error(`uv sync failed (${code})`)));
            child.on('error', reject);
        });
        console.log('[MarkItDown] uv sync completed successfully');
        sendLog?.(t('serviceMain.envCreatedSuccess').replace('{name}', 'MarkItDown'), 'success');

        if (fs.existsSync(pythonPath)) {
            return pythonPath;
        }
    } catch (e) {
        console.warn('[MarkItDown] Auto uv sync failed:', e);
    }

    throw new Error('MarkItDown Python environment not found and auto-install failed. Please run "uv sync" in the mineru/ directory.');
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
 * Parse a document to Markdown using MarkItDown (lightweight, fast).
 * Supports: PDF, DOCX, XLSX, PPTX, images, audio, HTML, etc.
 */
export async function parseWithMarkItDown(
    inputPath: string,
    sendLog: LogCallback
): Promise<{ success: boolean; outputPath: string; content: string }> {
    const pythonExe = await ensurePythonExecutable(sendLog);
    const outputPath = await getUniqueOutputPath(inputPath);

    const pyScriptPath = path.join(os.tmpdir(), `run_markitdown_${Date.now()}.py`);
    const pyScript = `
import sys
import json
import traceback

from markitdown import MarkItDown

def main():
    try:
        input_path = sys.argv[1]
        output_path = sys.argv[2]

        print(f"[MarkItDown] Parsing: {input_path}", file=sys.stderr, flush=True)

        md = MarkItDown()
        result = md.convert(input_path)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(result.text_content)

        print(json.dumps({"success": True, "output": output_path, "chars": len(result.text_content)}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "traceback": traceback.format_exc()}))
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

    await fs.writeFile(pyScriptPath, pyScript, 'utf-8');

    try {
        sendLog(t('serviceMain.startMarkItDown').replace('{name}', path.basename(inputPath)), 'info');
        console.log(`[MarkItDown] Command: ${pythonExe} ${pyScriptPath} ${inputPath} ${outputPath}`);

        await new Promise<void>((resolve, reject) => {
            const isWindows = process.platform === 'win32';
            const env = {
                ...process.env,
                ...(isWindows ? {} : { PATH: `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}` }),
            };
            const child = spawn(pythonExe, [pyScriptPath, inputPath, outputPath], { env, shell: false });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        sendLog(line.trim(), 'info');
                    }
                }
            });

            child.on('close', async (code) => {
                try {
                    const lines = stdout.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    let result;
                    try {
                        result = JSON.parse(lastLine);
                    } catch (e) {
                        if (code === 0) resolve();
                        else reject(new Error(`MarkItDown exited with code ${code}: ${stderr}`));
                        return;
                    }

                    if (result.success) {
                        resolve();
                    } else {
                        reject(new Error(`MarkItDown failed: ${result.error}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });

            child.on('error', reject);
        });

        const mdContent = await fs.readFile(outputPath, 'utf-8');
        sendLog(t('serviceMain.markItDownDone').replace('{name}', path.basename(outputPath)), 'success');
        console.log(`[MarkItDown] Output: ${outputPath}`);

        return { success: true, outputPath, content: mdContent };

    } finally {
        try {
            await fs.remove(pyScriptPath);
        } catch {
            // ignore
        }
    }
}
