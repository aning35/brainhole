import { app, ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import os from 'os';
import { getLang } from '../i18n';
import { checkFunasrEnv, setupFunasrEnv } from './funasrService';
import { checkMineruEnv, setupMineruEnv } from './mineruParser';

export interface ModelStatus {
    installed: boolean;
    size: number;
    path: string;
}

export interface AllModelsStatus {
    funasr: ModelStatus;
    mineru: ModelStatus;
    docling: ModelStatus;
}

const isWin = process.platform === 'win32';

function getPythonExecutable(target?: string): string {
    const pythonBin = isWin ? 'Scripts/python.exe' : 'bin/python';
    
    // Try multiple base paths (dev vs production)
    const basePaths = [
        process.resourcesPath || app.getAppPath(),
        app.getAppPath(),
        process.cwd(),
    ];
    
    // FunASR must use its own venv since funasr package is only installed there
    if (target === 'funasr') {
        for (const base of basePaths) {
            const p = path.join(base, 'funasr', '.venv', pythonBin);
            if (fs.existsSync(p)) {
                console.log(`[ModelManager] Using funasr python: ${p}`);
                return p;
            }
        }
    }
    
    // For other targets, prefer mineru venv
    for (const base of basePaths) {
        const p = path.join(base, 'mineru', '.venv', pythonBin);
        if (fs.existsSync(p)) return p;
    }

    // Fallback to any available funasr venv
    for (const base of basePaths) {
        const p = path.join(base, 'funasr', '.venv', pythonBin);
        if (fs.existsSync(p)) return p;
    }
    
    return isWin ? 'python' : 'python3';
}

const PYTHON_SCRIPT = `
import os
import sys
import json
import shutil
import requests
import argparse
from pathlib import Path

# i18n message dictionary
MESSAGES = {
    "zh": {
        "downloading": "下载中 {size}MB",
        "fetchingTree": "获取模型结构...",
        "fetchTreeFailed": "获取模型结构失败: {error}",
        "downloadingFile": "下载文件 {name}...",
        "downloadFileFailed": "下载文件 {name} 失败: {error}",
        "downloadComplete": "下载完成",
        "hfDownloading": "正在通过 HuggingFace 原生下载...",
        "hfFailed": "HuggingFace 下载失败: {error}",
        "msDownloading": "正在通过 ModelScope 下载...",
        "msFailed": "ModelScope 下载失败: {error}",
        "funasrInit": "正在初始化 FunASR 以触发下载 (ModelScope)...",
        "funasrFailed": "FunASR 下载失败: {error}",
        "funasrHfUnsupported": "FunASR (paraformer-zh) 官方主要发布在 ModelScope，目前此选项只推荐使用 ModelScope。如需支持 HF 请通过代码修改。",
    },
    "en": {
        "downloading": "Downloading {size}MB",
        "fetchingTree": "Fetching model structure...",
        "fetchTreeFailed": "Failed to fetch model structure: {error}",
        "downloadingFile": "Downloading file {name}...",
        "downloadFileFailed": "Failed to download file {name}: {error}",
        "downloadComplete": "Download complete",
        "hfDownloading": "Downloading via HuggingFace native...",
        "hfFailed": "HuggingFace download failed: {error}",
        "msDownloading": "Downloading via ModelScope...",
        "msFailed": "ModelScope download failed: {error}",
        "funasrInit": "Initializing FunASR to trigger download (ModelScope)...",
        "funasrFailed": "FunASR download failed: {error}",
        "funasrHfUnsupported": "FunASR (paraformer-zh) is officially published on ModelScope. Only ModelScope source is supported. For HF support, code modification is needed.",
    }
}

_lang = "zh"

def set_lang(lang):
    global _lang
    _lang = lang if lang in MESSAGES else "zh"

def msg(key, **kwargs):
    text = MESSAGES.get(_lang, MESSAGES["zh"]).get(key, key)
    for k, v in kwargs.items():
        text = text.replace("{" + k + "}", str(v))
    return text

# Provide required tools to bypass HF mirror constraints or use ModelScope
def log_progress(task_id, progress, message):
    print(json.dumps({"type": "progress", "taskId": task_id, "progress": progress, "message": message}), flush=True)

def log_error(task_id, message):
    print(json.dumps({"type": "error", "taskId": task_id, "message": message}), flush=True)

def log_success(task_id, message):
    print(json.dumps({"type": "success", "taskId": task_id, "message": message}), flush=True)

def get_cache_size(path):
    total_size = 0
    if os.path.exists(path):
        for dirpath, _, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if not os.path.islink(fp):
                    total_size += os.path.getsize(fp)
    return total_size

def check_status():
    status = {
        "funasr": {"installed": False, "size": 0, "path": ""},
        "mineru": {"installed": False, "size": 0, "path": ""},
        "docling": {"installed": False, "size": 0, "path": ""}
    }
    
    # Check FunASR — ModelScope caches in hub/iic (old) or hub/models/iic (new SDK)
    funasr_candidates = [
        os.path.expanduser("~/.cache/modelscope/hub/iic"),
        os.path.expanduser("~/.cache/modelscope/hub/models/iic"),
    ]
    funasr_size = 0
    funasr_path = ""
    for ms_iic_path in funasr_candidates:
        if os.path.exists(ms_iic_path):
            path_size = 0
            for d in os.listdir(ms_iic_path):
                if d.startswith("speech_") or d.startswith("punc_"):
                    d_path = os.path.join(ms_iic_path, d)
                    path_size += get_cache_size(d_path)
            if path_size > funasr_size:
                funasr_size = path_size
                funasr_path = ms_iic_path
    if funasr_size > 50_000_000: # At least 50MB
        status["funasr"] = {"installed": True, "size": funasr_size, "path": funasr_path}
        
    # Check MinerU
    mineru_hf = os.path.expanduser("~/.cache/huggingface/hub/models--OpenDataLab--PDF-Extract-Kit-1.0")
    mineru_ms = os.path.expanduser("~/.cache/modelscope/hub/OpenDataLab/PDF-Extract-Kit-1.0")
    mineru_ms_models = os.path.expanduser("~/.cache/modelscope/hub/models/OpenDataLab/PDF-Extract-Kit-1.0")
    
    if os.path.exists(mineru_hf) and get_cache_size(mineru_hf) > 100_000_000:
        status["mineru"] = {"installed": True, "size": get_cache_size(mineru_hf), "path": mineru_hf}
    elif os.path.exists(mineru_ms) and get_cache_size(mineru_ms) > 100_000_000:
        status["mineru"] = {"installed": True, "size": get_cache_size(mineru_ms), "path": mineru_ms}
    elif os.path.exists(mineru_ms_models) and get_cache_size(mineru_ms_models) > 100_000_000:
        status["mineru"] = {"installed": True, "size": get_cache_size(mineru_ms_models), "path": mineru_ms_models}
        
    # Check Docling
    docling_hf = os.path.expanduser("~/.cache/huggingface/hub/models--docling-project--docling-layout-heron")
    docling_ms = os.path.expanduser("~/.cache/modelscope/hub/docling-project/docling-layout-heron")
    docling_ms_models = os.path.expanduser("~/.cache/modelscope/hub/models/docling-project/docling-layout-heron")
    
    if os.path.exists(docling_hf) and get_cache_size(docling_hf) > 50_000_000:
        status["docling"] = {"installed": True, "size": get_cache_size(docling_hf), "path": docling_hf}
    elif os.path.exists(docling_ms) and get_cache_size(docling_ms) > 50_000_000:
        status["docling"] = {"installed": True, "size": get_cache_size(docling_ms), "path": docling_ms}
    elif os.path.exists(docling_ms_models) and get_cache_size(docling_ms_models) > 50_000_000:
        status["docling"] = {"installed": True, "size": get_cache_size(docling_ms_models), "path": docling_ms_models}
        
    print(json.dumps({"type": "status", "data": status}), flush=True)

def download_hf_native(repo_id, task_id):
    try:
        from huggingface_hub import snapshot_download
        log_progress(task_id, 5, msg("hfDownloading"))
        snapshot_download(repo_id)
        log_success(task_id, msg("downloadComplete"))
        return True
    except Exception as e:
        log_error(task_id, msg("hfFailed", error=str(e)))
        return False

def download_modelscope_model(repo_id, task_id):
    try:
        from modelscope.hub.snapshot_download import snapshot_download
        log_progress(task_id, 5, msg("msDownloading"))
        # Unfortunately modelscope doesn't expose easy progress callbacks via API, but it's fast
        snapshot_download(repo_id)
        log_success(task_id, msg("downloadComplete"))
        return True
    except Exception as e:
        log_error(task_id, msg("msFailed", error=str(e)))
        return False

def do_download(target, source, task_id):
    if target == "docling":
        # Docling
        if source == "modelscope":
            download_modelscope_model("docling-project/docling-layout-heron", task_id)
            download_modelscope_model("ds4sd/docling-models", task_id)
        else: # huggingface or hf-mirror
            download_hf_native("docling-project/docling-layout-heron", task_id)
            download_hf_native("ds4sd/docling-models", task_id)
            
    elif target == "mineru":
        # Force ModelScope for MinerU because hf-mirror is extremely unstable for this large repo
        # and OpenDataLab officially maintains the ModelScope version.
        download_modelscope_model("OpenDataLab/PDF-Extract-Kit-1.0", task_id)
            
    elif target == "funasr":
        # FunASR triggers download by initializing model
        if source == "modelscope":
            try:
                from funasr import AutoModel
                log_progress(task_id, 10, msg("funasrInit"))
                AutoModel(model="paraformer-zh", vad_model="fsmn-vad", punc_model="ct-punc")
                log_success(task_id, msg("downloadComplete"))
            except Exception as e:
                log_error(task_id, msg("funasrFailed", error=str(e)))
        else:
            log_error(task_id, msg("funasrHfUnsupported"))

def do_delete(target):
    if target == "funasr":
        # Clean both old and new modelscope SDK cache paths
        for p in [
            os.path.expanduser("~/.cache/modelscope/hub/iic"),
            os.path.expanduser("~/.cache/modelscope/hub/models/iic"),
        ]:
            if os.path.exists(p):
                shutil.rmtree(p, ignore_errors=True)
    elif target == "mineru":
        p1 = os.path.expanduser("~/.cache/huggingface/hub/models--OpenDataLab--PDF-Extract-Kit-1.0")
        p2 = os.path.expanduser("~/.cache/modelscope/hub/OpenDataLab/PDF-Extract-Kit-1.0")
        p3 = os.path.expanduser("~/.cache/modelscope/hub/models/OpenDataLab/PDF-Extract-Kit-1.0")
        if os.path.exists(p1): shutil.rmtree(p1, ignore_errors=True)
        if os.path.exists(p2): shutil.rmtree(p2, ignore_errors=True)
        if os.path.exists(p3): shutil.rmtree(p3, ignore_errors=True)
    elif target == "docling":
        p1 = os.path.expanduser("~/.cache/huggingface/hub/models--docling-project--docling-layout-heron")
        p2 = os.path.expanduser("~/.cache/huggingface/hub/models--ds4sd--docling-models")
        p3 = os.path.expanduser("~/.cache/modelscope/hub/docling-project/docling-layout-heron")
        p4 = os.path.expanduser("~/.cache/modelscope/hub/ds4sd/docling-models")
        p5 = os.path.expanduser("~/.cache/modelscope/hub/models/docling-project/docling-layout-heron")
        p6 = os.path.expanduser("~/.cache/modelscope/hub/models/ds4sd/docling-models")
        for p in [p1, p2, p3, p4, p5, p6]:
            if os.path.exists(p): shutil.rmtree(p, ignore_errors=True)
    
    check_status()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["status", "download", "delete"])
    parser.add_argument("--target", choices=["funasr", "mineru", "docling"], required=False)
    parser.add_argument("--source", choices=["huggingface", "hf-mirror", "modelscope"], default="hf-mirror")
    parser.add_argument("--task-id", default="task_1")
    parser.add_argument("--lang", choices=["zh", "en"], default="zh")
    args = parser.parse_args()
    
    set_lang(args.lang)
    
    if args.action == "status":
        check_status()
    elif args.action == "delete" and args.target:
        do_delete(args.target)
    elif args.action == "download" and args.target:
        do_download(args.target, args.source, args.task_id)
`;

function getScriptPath(): string {
    const userDataPath = app.getPath('userData');
    const scriptPath = path.join(userDataPath, 'brainhole_model_manager.py');
    // Always overwrite to ensure we have the latest version
    fs.writeFileSync(scriptPath, PYTHON_SCRIPT, 'utf-8');
    return scriptPath;
}

export async function getModelsStatus(): Promise<AllModelsStatus> {
    const pythonExe = getPythonExecutable();
    const scriptPath = getScriptPath();

    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script not found: ${scriptPath}`);
    }

    return new Promise((resolve, reject) => {
        const child = spawn(pythonExe, [scriptPath, 'status', '--lang', getLang()]);
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => stdout += data.toString());
        child.stderr.on('data', (data) => stderr += data.toString());

        child.on('close', (code) => {
            if (code === 0) {
                try {
                    const lines = stdout.trim().split('\n');
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const parsed = JSON.parse(lines[i]);
                        if (parsed.type === 'status') {
                            resolve(parsed.data);
                            return;
                        }
                    }
                    resolve({
                        funasr: { installed: false, size: 0, path: '' },
                        mineru: { installed: false, size: 0, path: '' },
                        docling: { installed: false, size: 0, path: '' }
                    });
                } catch (e) {
                    reject(new Error('Failed to parse status output'));
                }
            } else {
                reject(new Error(`Failed with exit code ${code}\n${stderr}`));
            }
        });
        
        child.on('error', reject);
    });
}

export async function deleteModel(target: 'funasr' | 'mineru' | 'docling'): Promise<AllModelsStatus> {
    const pythonExe = getPythonExecutable();
    const scriptPath = getScriptPath();

    return new Promise((resolve, reject) => {
        const child = spawn(pythonExe, [scriptPath, 'delete', '--target', target, '--lang', getLang()]);
        let stdout = '';
        child.stdout.on('data', (data) => stdout += data.toString());
        child.on('close', (code) => {
            if (code === 0) {
                try {
                    const lines = stdout.trim().split('\n');
                    for (let i = lines.length - 1; i >= 0; i--) {
                        const parsed = JSON.parse(lines[i]);
                        if (parsed.type === 'status') {
                            resolve(parsed.data);
                            return;
                        }
                    }
                } catch (e) {
                    // Ignore
                }
            }
            // Return status manually or reject
            getModelsStatus().then(resolve).catch(reject);
        });
        child.on('error', reject);
    });
}

// Keep track of active downloads so we don't spawn duplicates
const activeDownloads = new Map<string, any>();

export async function downloadModel(target: 'funasr' | 'mineru' | 'docling', source: 'huggingface' | 'hf-mirror' | 'modelscope', taskId: string, win: BrowserWindow) {
    if (activeDownloads.has(target)) {
        throw new Error(`Download for ${target} is already running.`);
    }

    // Ensure the target's python environment is installed before running the download script inside it
    const logToFrontend = (msg: string, type?: 'info' | 'error' | 'warning' | 'success') => {
        win.webContents.send('models:download-progress', {
            target,
            progress: 0, // 0 for env setup progress (frontend treats < 0 as error)
            message: msg
        });
    };

    if (target === 'funasr') {
        const { ready } = await checkFunasrEnv();
        if (!ready) {
            logToFrontend('Environment not found, installing via uv sync...');
            await setupFunasrEnv(logToFrontend);
            logToFrontend('Environment installation completed.');
        }
    } else if (target === 'mineru' || target === 'docling') {
        const { ready } = await checkMineruEnv();
        if (!ready) {
            logToFrontend('Environment not found, installing via uv sync...');
            await setupMineruEnv(logToFrontend);
            logToFrontend('Environment installation completed.');
        }
    }

    const pythonExe = getPythonExecutable(target);
    const scriptPath = getScriptPath();
    
    return new Promise<void>((resolve, reject) => {
        const env = {
            ...process.env,
            PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
            HF_ENDPOINT: source === 'huggingface' ? 'https://huggingface.co' : 'https://hf-mirror.com'
        };

        const child = spawn(pythonExe, [scriptPath, 'download', '--target', target, '--source', source, '--task-id', taskId, '--lang', getLang()], { env });
        activeDownloads.set(target, child);

        child.stdout.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line.trim());
                    if (parsed.type === 'progress') {
                        // Send progress to frontend
                        win.webContents.send('models:download-progress', {
                            target,
                            progress: parsed.progress,
                            message: parsed.message
                        });
                    } else if (parsed.type === 'error') {
                        win.webContents.send('models:download-progress', {
                            target,
                            progress: -1,
                            message: `Error: ${parsed.message}`
                        });
                    } else if (parsed.type === 'success') {
                        win.webContents.send('models:download-progress', {
                            target,
                            progress: 100,
                            message: parsed.message
                        });
                    }
                } catch (e) {
                    // Raw text, ignore or log
                }
            }
        });

        child.stderr.on('data', (data) => {
            const str = data.toString();
            // Log raw stderr to console but maybe not frontend unless critical
            console.warn(`[${target} download]`, str);

            // Extract tqdm progress (e.g. " 53%|█████▎    |") from stderr
            const match = str.match(/(\d{1,3})%\|/);
            if (match && match[1]) {
                const progress = parseInt(match[1], 10);
                // Cap at 99% to prevent frontend from prematurely thinking the entire process is done
                // since ModelScope might download multiple files and hit 100% multiple times
                win.webContents.send('models:download-progress', {
                    target,
                    progress: Math.max(1, Math.min(progress, 99)),
                    message: `Downloading... ${progress}%`
                });
            }
        });

        child.on('close', (code) => {
            activeDownloads.delete(target);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Download failed with exit code ${code}`));
            }
        });

        child.on('error', (err) => {
            activeDownloads.delete(target);
            reject(err);
        });
    });
}
