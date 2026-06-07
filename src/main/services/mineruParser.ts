/**
 * MinerU Advanced Document Parser
 * 
 * Uses MinerU (mineru[all]) to convert PDF to high-quality Markdown.
 * This is separate from the basic documentParser and provides:
 * - OCR for scanned documents
 * - Table recognition → HTML
 * - Formula recognition → LaTeX  
 * - Multi-column layout understanding
 * - Reading order detection
 * 
 * Environment is auto-provisioned in userData/mineru-env/
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import os from 'os';
import { t } from '../i18n';

type LogCallback = (message: string, type?: 'info' | 'warning' | 'error') => void;

const isWin = process.platform === 'win32';

/** Get the project-root mineru/ workspace directory */
function getWorkspacePath(): string {
    // Dev: app.getAppPath() is the project root
    const devPath = path.join(app.getAppPath(), 'mineru');
    if (fs.pathExistsSync(devPath)) return devPath;
    // Production: bundled alongside the app
    return path.join(process.resourcesPath || app.getAppPath(), 'mineru');
}

function getEnvPath(): string {
    return path.join(getWorkspacePath(), '.venv');
}

function getPythonExecutable(): string {
    const envPath = getEnvPath();
    return path.join(envPath, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
}

function getMineruExecutable(): string {
    const envPath = getEnvPath();
    return path.join(envPath, isWin ? 'Scripts' : 'bin', isWin ? 'mineru.exe' : 'mineru');
}

/**
 * Check if MinerU environment is ready.
 * If autoInstall is true and env is missing, runs `uv sync` automatically.
 */
export async function checkMineruEnv(autoInstall = false): Promise<{ ready: boolean; envPath: string }> {
    const pythonExe = getPythonExecutable();
    const mineruExe = getMineruExecutable();
    const workspacePath = getWorkspacePath();

    if ((await fs.pathExists(pythonExe)) && (await fs.pathExists(mineruExe))) {
        return { ready: true, envPath: getEnvPath() };
    }

    if (autoInstall) {
        try {
            console.log('[MinerU] Auto-installing dependencies via uv sync...');
            const env = {
                ...process.env,
                PATH: `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
                HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
            };
            await new Promise<void>((resolve, reject) => {
                const child = spawn('uv', ['sync'], { cwd: workspacePath, shell: isWin, env });
                child.on('close', code => code === 0 ? resolve() : reject(new Error(`uv sync failed (${code})`)));
                child.on('error', reject);
            });
            console.log('[MinerU] uv sync completed successfully');
            const ready = (await fs.pathExists(pythonExe)) && (await fs.pathExists(mineruExe));
            return { ready, envPath: getEnvPath() };
        } catch (e) {
            console.warn('[MinerU] Auto uv sync failed:', e);
        }
    }

    return { ready: false, envPath: getEnvPath() };
}

/**
 * Run a shell command and stream output
 */
function runCmd(cmd: string, args: string[], cwd: string, sendLog: LogCallback): Promise<void> {
    return new Promise((resolve, reject) => {
        const env = {
            ...process.env,
            PATH: `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
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
 * Setup MinerU Python environment
 */
export async function setupMineruEnv(sendLog: LogCallback): Promise<string> {
    const workspacePath = getWorkspacePath();
    const pythonExe = getPythonExecutable();
    const mineruExe = getMineruExecutable();

    // Already set up?
    if ((await fs.pathExists(pythonExe)) && (await fs.pathExists(mineruExe))) {
        sendLog(t('serviceMain.envReady').replace('{name}', 'MinerU'), 'info');
        return pythonExe;
    }

    // Use uv sync in the workspace directory
    try {
        sendLog(t('serviceMain.uvSyncInstalling').replace('{name}', 'MinerU'), 'info');
        await runCmd('uv', ['sync'], workspacePath, sendLog);
        sendLog(t('serviceMain.envCreatedSuccess').replace('{name}', 'MinerU'), 'info');
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
            sendLog(t('serviceMain.pipInstalling').replace('{name}', 'MinerU'), 'info');
            await runCmd(pipExe, ['install', '-U', 'mineru[all]'], workspacePath, sendLog);

            sendLog(t('serviceMain.envCreatedPip').replace('{name}', 'MinerU'), 'info');
            return pythonExe;
        } catch (err) {
            sendLog(t('serviceMain.envCreateFailed').replace('{name}', 'MinerU').replace('{error}', err instanceof Error ? err.message : String(err)), 'error');
            throw new Error(t('serviceMain.envCreateError').replace('{name}', 'MinerU'));
        }
    }
}

/**
 * Generate a non-conflicting output filename.
 * Given "report.pdf" → tries "report.md", "report_1.md", "report_2.md", etc.
 */
async function getUniqueOutputPath(pdfPath: string): Promise<string> {
    const dir = path.dirname(pdfPath);
    const baseName = path.basename(pdfPath, path.extname(pdfPath));
    
    let candidate = path.join(dir, `${baseName}.md`);
    if (!(await fs.pathExists(candidate))) return candidate;

    let i = 1;
    while (true) {
        candidate = path.join(dir, `${baseName}_${i}.md`);
        if (!(await fs.pathExists(candidate))) return candidate;
        i++;
    }
}

/** Extensions that should force MinerU OCR mode (images have no text layer) */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif', '.webp'];

function isImageFile(filePath: string): boolean {
    return IMAGE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

/**
 * Preprocess an image for better OCR results using Pillow.
 * Converts to grayscale and enhances contrast so colored text
 * (green, light blue, etc.) becomes dark enough for OCR to detect.
 */
async function preprocessImageForOCR(imagePath: string, sendLog: LogCallback): Promise<string> {
    sendLog(t('serviceMain.imagePreprocess'), 'info');

    const pythonExe = getPythonExecutable();
    const tmpImagePath = path.join(os.tmpdir(), `ocr_preprocess_${Date.now()}.png`);

    const pyScript = [
        'from PIL import Image, ImageEnhance, ImageOps',
        'import sys',
        '',
        'img = Image.open(sys.argv[1])',
        '# Convert to grayscale — colored text becomes visible gray/black',
        'gray = img.convert("L")',
        '# Auto-contrast: stretch histogram to use full 0-255 range',
        'gray = ImageOps.autocontrast(gray, cutoff=1)',
        '# Boost contrast further to make faint text pop',
        'enhancer = ImageEnhance.Contrast(gray)',
        'gray = enhancer.enhance(1.8)',
        '# Sharpen for cleaner character edges',
        'enhancer = ImageEnhance.Sharpness(gray)',
        'gray = enhancer.enhance(1.5)',
        '# Save as high-quality PNG',
        'gray.save(sys.argv[2], "PNG")',
        'w, h = img.size',
        'print(f"{w}x{h}")',
    ].join('\n');

    const dimensions = await new Promise<string>((resolve, reject) => {
        const env = {
            ...process.env,
            PATH: `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
            HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
        };
        const child = spawn(pythonExe, ['-c', pyScript, imagePath, tmpImagePath], {
            env, shell: false
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
        child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        child.on('close', (code) => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(t('serviceMain.imagePreprocessFailed').replace('{code}', String(code)).replace('{error}', stderr.trim())));
        });
        child.on('error', reject);
    });

    sendLog(t('serviceMain.imagePreprocessDone').replace('{dimensions}', dimensions), 'info');
    console.log(`[MinerU] Preprocessed image: ${tmpImagePath}`);
    return tmpImagePath;
}

/**
 * Parse a PDF or image to Markdown using MinerU.
 * MinerU natively supports: pdf, image, docx, pptx, xlsx.
 * For image inputs: preprocessed for contrast + OCR mode forced.
 */
export async function parsePdfToMarkdown(
    inputPath: string,
    sendLog: LogCallback
): Promise<{ success: boolean; outputPath: string; content: string }> {
    // 1. Ensure environment is ready
    const { ready } = await checkMineruEnv();
    if (!ready) {
        sendLog(t('serviceMain.envNotInstalled').replace('{name}', 'MinerU'), 'info');
        console.log('[MinerU] Environment not ready, setting up...');
        await setupMineruEnv(sendLog);
    }

    const isImage = isImageFile(inputPath);
    const mineruExe = getMineruExecutable();
    let processedImagePath: string | null = null;

    // Determine the actual file to pass to MinerU
    let mineruInputPath = inputPath;

    // Build MinerU CLI args
    const mineruArgs: string[] = [];

    if (isImage) {
        // Preprocess image for better OCR (grayscale + contrast enhancement)
        processedImagePath = await preprocessImageForOCR(inputPath, sendLog);
        mineruInputPath = processedImagePath;

        mineruArgs.push('-p', mineruInputPath, '-o', '', '-b', 'pipeline', '-m', 'ocr');
        console.log(`[MinerU] Image detected: ${path.basename(inputPath)}, preprocessed + forcing OCR mode`);
        sendLog(t('serviceMain.imageOcrMode'), 'info');
    } else {
        mineruArgs.push('-p', mineruInputPath, '-o', '', '-b', 'pipeline');
        console.log(`[MinerU] Processing: ${path.basename(inputPath)}`);
    }

    // 2. Create a temp output directory
    const tmpDir = path.join(os.tmpdir(), `mineru_${Date.now()}`);
    await fs.ensureDir(tmpDir);
    mineruArgs[3] = tmpDir; // set -o value

    try {
        sendLog(t('serviceMain.startParse').replace('{name}', path.basename(inputPath)), 'info');
        console.log(`[MinerU] Command: ${mineruExe} ${mineruArgs.join(' ')}`);

        // 3. Run MinerU CLI
        await new Promise<void>(async (resolve, reject) => {
            const mineruMsModels = path.join(os.homedir(), '.cache', 'modelscope', 'hub', 'models', 'OpenDataLab', 'PDF-Extract-Kit-1.0');
            const mineruMs = path.join(os.homedir(), '.cache', 'modelscope', 'hub', 'OpenDataLab', 'PDF-Extract-Kit-1.0');
            const isModelScope = await fs.pathExists(mineruMsModels) || await fs.pathExists(mineruMs);

            const env = {
                ...process.env,
                PATH: `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`,
                HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
                MINERU_MODEL_SOURCE: isModelScope ? 'modelscope' : 'huggingface'
            };
            const child = spawn(mineruExe, mineruArgs, { env, shell: false });

            let buffer = '';
            const handleData = (data: Buffer) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.trim()) {
                        sendLog(line.trim(), 'info');
                        console.log(`[MinerU Output] ${line.trim()}`);
                    }
                }
            };

            child.stdout.on('data', handleData);
            child.stderr.on('data', handleData);
            child.on('close', code => {
                if (buffer.trim()) sendLog(buffer.trim(), 'info');
                if (code === 0) resolve();
                else reject(new Error(t('serviceMain.mineruProcessFailed').replace('{code}', String(code))));
            });
            child.on('error', reject);
        });

        // 4. Find the generated .md file in the output dir
        // MinerU outputs: <tmpDir>/<basename>/<basename>.md
        const fileBaseName = path.basename(inputPath, path.extname(inputPath));
        const possiblePaths = [
            path.join(tmpDir, fileBaseName, `${fileBaseName}.md`),
            path.join(tmpDir, fileBaseName, 'full.md'),
        ];

        let mdContent = '';
        let foundMdPath = '';

        // Also do a recursive search for any .md file
        for (const p of possiblePaths) {
            if (await fs.pathExists(p)) {
                mdContent = await fs.readFile(p, 'utf-8');
                foundMdPath = p;
                break;
            }
        }

        if (!mdContent) {
            // Fallback: find any .md file in tmpDir recursively
            const findMd = async (dir: string): Promise<string | null> => {
                const entries = await fs.readdir(dir);
                for (const entry of entries) {
                    const full = path.join(dir, entry);
                    const stat = await fs.stat(full);
                    if (stat.isDirectory()) {
                        const found = await findMd(full);
                        if (found) return found;
                    } else if (entry.endsWith('.md')) {
                        return full;
                    }
                }
                return null;
            };
            foundMdPath = (await findMd(tmpDir)) || '';
            if (foundMdPath) {
                mdContent = await fs.readFile(foundMdPath, 'utf-8');
            }
        }

        if (!mdContent) {
            throw new Error(t('serviceMain.mineruNoOutput'));
        }

        // Prevent MDX AST crashing in the frontend UI:
        // MinerU outputs raw HTML <table> blocks with content like `*1.1` (emphasis) and
        // `0.6m~1.8m` (strikethrough) inside <td> cells. The MDX parser interprets these as
        // markdown formatting which crashes when the "tag" isn't closed before </td>.
        // Fix: replace dangerous chars with HTML entities inside <td> cells.
        // HTML entities are rendered correctly but MDX won't parse them as markdown.
        mdContent = mdContent.replace(/(<td[^>]*>)([\s\S]*?)(<\/td>)/g, (_match, open, inner, close) => {
            let fixed = inner;
            fixed = fixed.replace(/\*/g, '&#42;');   // asterisk entity → no emphasis
            fixed = fixed.replace(/~/g, '&#126;');   // tilde entity → no strikethrough
            fixed = fixed.replace(/_/g, '&#95;');    // underscore entity → no emphasis
            return open + fixed + close;
        });
        // Also handle tildes outside tables (e.g. in plain text ranges)
        mdContent = mdContent.replace(/([A-Za-z0-9\u4e00-\u9fa5\s])~([A-Za-z0-9\u4e00-\u9fa5\s])/g, '$1～$2');
        mdContent = mdContent.replace(/([A-Za-z0-9\u4e00-\u9fa5\s])~([A-Za-z0-9\u4e00-\u9fa5\s])/g, '$1～$2');

        // 5. Save .md next to the original file with dedup naming
        const outputPath = await getUniqueOutputPath(inputPath);
        await fs.writeFile(outputPath, mdContent, 'utf-8');

        // 6. Also copy any images from the output (if MinerU extracted them)
        const outputImgDir = path.dirname(foundMdPath);
        const imagesDir = path.join(outputImgDir, 'images');
        if (await fs.pathExists(imagesDir)) {
            const targetImagesDir = path.join(path.dirname(outputPath), `${path.basename(outputPath, '.md')}_images`);
            await fs.copy(imagesDir, targetImagesDir);
            // Update image paths in markdown content
            let updatedContent = mdContent.replace(
                /!\[([^\]]*)\]\(images\//g,
                `![$1](${path.basename(outputPath, '.md')}_images/`
            );
            // Also update <img src="images/..."> references (e.g. inside HTML tables)
            updatedContent = updatedContent.replace(
                /src="images\//g,
                `src="${path.basename(outputPath, '.md')}_images/`
            );
            await fs.writeFile(outputPath, updatedContent, 'utf-8');
            sendLog(t('serviceMain.imagesCopied').replace('{count}', String((await fs.readdir(targetImagesDir)).length)), 'info');
        }

        sendLog(t('serviceMain.mdGenerated').replace('{name}', path.basename(outputPath)), 'info');
        console.log(`[MinerU] Output: ${outputPath}`);
        return { success: true, outputPath, content: mdContent };

    } finally {
        // Cleanup temp MinerU output dir
        try {
            await fs.remove(tmpDir);
        } catch {
            // ignore cleanup errors
        }
        // Cleanup preprocessed temp image
        if (processedImagePath) {
            try {
                await fs.remove(processedImagePath);
            } catch {
                // ignore cleanup errors
            }
        }
    }
}
