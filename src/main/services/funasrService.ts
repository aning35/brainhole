/**
 * FunASR Audio Transcription Service
 *
 * Uses FunASR (paraformer-zh) to transcribe audio files to text/Markdown.
 * Environment lives in project-root funasr/ workspace (uv sync).
 *
 * Architecture:
 * - Project-root funasr/ has pyproject.toml + transcribe.py
 * - `uv sync` creates .venv/ inside funasr/
 * - Invoke transcribe.py with .venv/bin/python
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import os from 'os';
import { t } from '../i18n';

type LogCallback = (message: string, type?: 'info' | 'warning' | 'error') => void;

const isWin = process.platform === 'win32';

/** Get the project-root funasr/ workspace directory */
function getWorkspacePath(): string {
    const devPath = path.join(app.getAppPath(), 'funasr');
    if (fs.pathExistsSync(devPath)) return devPath;
    return path.join(process.resourcesPath || app.getAppPath(), 'funasr');
}

function getScriptPath(): string {
    return path.join(getWorkspacePath(), 'transcribe.py');
}

function getEnvPath(): string {
    return path.join(getWorkspacePath(), '.venv');
}

function getPythonExecutable(): string {
    const envPath = getEnvPath();
    return path.join(envPath, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
}

/**
 * Check if FunASR environment is ready.
 * If autoInstall is true and env is missing, runs `uv sync` automatically.
 */
export async function checkFunasrEnv(autoInstall = false): Promise<{ ready: boolean; envPath: string }> {
    const pythonExe = getPythonExecutable();
    const workspacePath = getWorkspacePath();

    // Check if .venv exists
    if (!(await fs.pathExists(pythonExe))) {
        if (autoInstall) {
            try {
                console.log('[FunASR] Auto-installing dependencies via uv sync...');
                const env = {
                    ...process.env,
                    PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
                    HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
                };
                await new Promise<void>((resolve, reject) => {
                    const child = spawn('uv', ['sync'], { cwd: workspacePath, shell: isWin, env });
                    child.on('close', code => code === 0 ? resolve() : reject(new Error(`uv sync failed (${code})`)));
                    child.on('error', reject);
                });
                console.log('[FunASR] uv sync completed successfully');
            } catch (e) {
                console.warn('[FunASR] Auto uv sync failed:', e);
                return { ready: false, envPath: getEnvPath() };
            }
        } else {
            return { ready: false, envPath: getEnvPath() };
        }
    }

    // Also check if funasr package is installed
    try {
        const result = await new Promise<boolean>((resolve) => {
            const child = spawn(pythonExe, ['-c', 'import funasr; print("ok")'], {
                timeout: 10000,
            });
            let output = '';
            child.stdout.on('data', (d) => { output += d.toString(); });
            child.on('close', (code) => resolve(code === 0 && output.includes('ok')));
            child.on('error', () => resolve(false));
        });
        return { ready: result, envPath: getEnvPath() };
    } catch {
        return { ready: false, envPath: getEnvPath() };
    }
}

/**
 * Run a shell command and stream output
 */
function runCmd(cmd: string, args: string[], cwd: string, sendLog: LogCallback): Promise<void> {
    return new Promise((resolve, reject) => {
        const env = {
            ...process.env,
            PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
            HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
        };
        const child = spawn(cmd, args, { cwd, shell: isWin, env });

        let buffer = '';
        const handleData = (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.trim()) sendLog(line.trim(), 'info');
            }
        };

        child.stdout.on('data', handleData);
        child.stderr.on('data', handleData);
        child.on('close', code => {
            if (buffer.trim()) sendLog(buffer.trim(), 'info');
            if (code === 0) resolve();
            else reject(new Error(`${cmd} ${args.join(' ')} failed with exit code ${code}`));
        });
        child.on('error', reject);
    });
}

/**
 * Setup FunASR Python environment
 */
export async function setupFunasrEnv(sendLog: LogCallback): Promise<string> {
    const workspacePath = getWorkspacePath();
    const pythonExe = getPythonExecutable();

    // Already set up?
    const { ready } = await checkFunasrEnv();
    if (ready) {
        sendLog(t('serviceMain.envReady').replace('{name}', 'FunASR'), 'info');
        return pythonExe;
    }

    // Use uv sync in the workspace directory
    try {
        sendLog(t('serviceMain.uvSyncInstallingWithSize').replace('{name}', 'FunASR').replace('{size}', '220MB'), 'info');
        await runCmd('uv', ['sync'], workspacePath, sendLog);
        sendLog(t('serviceMain.envCreatedSuccess').replace('{name}', 'FunASR'), 'info');
        return pythonExe;
    } catch (e) {
        sendLog(t('serviceMain.uvSyncFailed').replace('{error}', e instanceof Error ? e.message : String(e)), 'warning');

        try {
            const envPath = getEnvPath();
            const sysPython = isWin ? 'python' : 'python3';

            if (!(await fs.pathExists(pythonExe))) {
                await runCmd(sysPython, ['-m', 'venv', envPath], workspacePath, sendLog);
            }

            const pipExe = path.join(envPath, isWin ? 'Scripts' : 'bin', isWin ? 'pip.exe' : 'pip');
            sendLog(t('serviceMain.pipInstalling').replace('{name}', 'FunASR'), 'info');
            await runCmd(pipExe, ['install', '-U', 'funasr', 'modelscope', 'torch', 'torchaudio', 'pydub'], workspacePath, sendLog);

            sendLog(t('serviceMain.envCreatedPip').replace('{name}', 'FunASR'), 'info');
            return pythonExe;
        } catch (err) {
            sendLog(t('serviceMain.envCreateFailed').replace('{name}', 'FunASR').replace('{error}', err instanceof Error ? err.message : String(err)), 'error');
            throw new Error(t('serviceMain.envCreateError').replace('{name}', 'FunASR'));
        }
    }
}

/**
 * Generate a non-conflicting output filename for the .md transcript.
 */
async function getUniqueOutputPath(audioPath: string): Promise<string> {
    const dir = path.dirname(audioPath);
    const baseName = path.basename(audioPath, path.extname(audioPath));

    let candidate = path.join(dir, `${baseName}.md`);
    if (!(await fs.pathExists(candidate))) return candidate;

    let i = 1;
    while (true) {
        candidate = path.join(dir, `${baseName}_${i}.md`);
        if (!(await fs.pathExists(candidate))) return candidate;
        i++;
    }
}

/**
 * Format transcription result to Markdown
 */
function formatTranscriptMarkdown(result: any, audioFileName: string): string {
    const lines: string[] = [];

    lines.push(`# 音频转录：${audioFileName}`);
    lines.push('');

    // Metadata
    const duration = result.duration || 0;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);
    const durationStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;

    lines.push(`> 转录时间：${new Date().toLocaleDateString('zh-CN')}  |  时长：${durationStr}  |  模型：${result.model || 'paraformer-zh'}  |  耗时：${result.elapsed || 0}s`);
    lines.push('');

    // Content with timestamps
    const segments = result.segments || [];
    if (segments.length > 0 && segments[0].start !== undefined) {
        for (const seg of segments) {
            const startStr = formatTime(seg.start);
            const endStr = formatTime(seg.end);
            if (startStr !== '00:00' || endStr !== '00:00') {
                lines.push(`**[${startStr} - ${endStr}]**`);
                lines.push('');
            }
            lines.push(seg.text);
            lines.push('');
        }
    } else {
        // No timestamp info, just dump the full text
        lines.push(result.text || '');
    }

    return lines.join('\n');
}

function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Transcribe an audio or video file to Markdown.
 * For video files, ffmpeg is used to extract the audio track first.
 */
export async function transcribeAudioToMarkdown(
    inputPath: string,
    sendLog: LogCallback
): Promise<{ success: boolean; outputPath: string; content: string }> {
    // 1. Ensure environment is ready
    const { ready } = await checkFunasrEnv();
    if (!ready) {
        sendLog(t('serviceMain.envNotInstalled').replace('{name}', 'FunASR'), 'info');
        await setupFunasrEnv(sendLog);
    }

    const pythonExe = getPythonExecutable();
    const scriptPath = getScriptPath();

    if (!(await fs.pathExists(scriptPath))) {
        throw new Error(t('serviceMain.scriptNotFound').replace('{path}', scriptPath));
    }

    // 2. Check if input is a video file → extract audio via ffmpeg
    const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm'];
    const inputExt = path.extname(inputPath).toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.includes(inputExt);
    let audioPath = inputPath;
    let tmpAudioPath: string | null = null;

    if (isVideo) {
        sendLog(t('serviceMain.videoExtractAudio'), 'info');
        tmpAudioPath = path.join(os.tmpdir(), `funasr_${Date.now()}.wav`);
        try {
            await new Promise<void>((resolve, reject) => {
                const env = {
                    ...process.env,
                    PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
                    HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
                };
                const child = spawn('ffmpeg', [
                    '-i', inputPath,
                    '-vn',              // no video
                    '-acodec', 'pcm_s16le',  // WAV format
                    '-ar', '16000',     // 16kHz sample rate (optimal for speech recognition)
                    '-ac', '1',         // mono
                    '-y',               // overwrite
                    tmpAudioPath!
                ], { env, shell: false });

                child.stderr.on('data', (data: Buffer) => {
                    const line = data.toString().trim();
                    // ffmpeg outputs progress to stderr; only log key lines
                    if (line.includes('Duration') || line.includes('Output') || line.includes('time=')) {
                        sendLog(line, 'info');
                    }
                });
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(t('serviceMain.ffmpegFailed').replace('{code}', String(code))));
                });
                child.on('error', (err) => {
                    reject(new Error(t('serviceMain.ffmpegNotFound').replace('{error}', err.message)));
                });
            });
            sendLog(t('serviceMain.audioExtractDone'), 'info');
            audioPath = tmpAudioPath;
        } catch (error: any) {
            if (tmpAudioPath) await fs.remove(tmpAudioPath).catch(() => { });
            throw error;
        }
    }

    try {
        sendLog(t('serviceMain.startTranscribe').replace('{name}', path.basename(inputPath)), 'info');

        // 2. Run the transcription script
        const result = await new Promise<any>((resolve, reject) => {
            const env = {
                ...process.env,
                PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
                HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
            };
            const child = spawn(pythonExe, [scriptPath, audioPath], { env, shell: false });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data: Buffer) => {
                const text = data.toString();
                stdout += text;

                // Parse line-by-line JSON output
                const lines = text.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const obj = JSON.parse(trimmed);
                        if (obj.type === 'log') {
                            sendLog(obj.message, 'info');
                        }
                    } catch {
                        // Not JSON, ignore
                    }
                }
            });

            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
                // Forward stderr as log (FunASR emits progress here)
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) sendLog(line.trim(), 'info');
                }
            });

            child.on('close', (code) => {
                if (code === 0) {
                    // Find the last JSON line in stdout which should be the result
                    const allLines = stdout.trim().split('\n');
                    for (let i = allLines.length - 1; i >= 0; i--) {
                        try {
                            const obj = JSON.parse(allLines[i].trim());
                            if (obj.type === 'result') {
                                resolve(obj);
                                return;
                            }
                        } catch {
                            continue;
                        }
                    }
                    reject(new Error(t('serviceMain.noResultReturned')));
                } else {
                    reject(new Error(t('serviceMain.transcribeProcessFailed').replace('{code}', String(code)) + '\n' + stderr));
                }
            });
            child.on('error', reject);
        });

        // 3. Format to Markdown
        const sourceFileName = path.basename(inputPath);
        const mdContent = formatTranscriptMarkdown(result, sourceFileName);

        // 4. Save to disk (next to the original input file)
        const outputPath = await getUniqueOutputPath(inputPath);
        await fs.writeFile(outputPath, mdContent, 'utf-8');

        sendLog(t('serviceMain.transcribeDone').replace('{name}', path.basename(outputPath)), 'info');
        return { success: true, outputPath, content: mdContent };

    } catch (error: any) {
        sendLog(t('serviceMain.transcribeFailed').replace('{error}', error.message), 'error');
        throw error;
    } finally {
        // Clean up temp audio extracted from video
        if (tmpAudioPath) {
            await fs.remove(tmpAudioPath).catch(() => { });
        }
    }
}
