import { dialog, ipcMain, shell } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DocumentParser } from './services/documentParser';
import { checkMineruEnv, setupMineruEnv, parsePdfToMarkdown } from './services/mineruParser';
import { parseWithDocling } from './services/doclingParser';
import { parseWithMarkItDown } from './services/markitdownParser';
import { checkFunasrEnv, setupFunasrEnv, transcribeAudioToMarkdown } from './services/funasrService';
import { enqueueTask, setTaskConcurrency } from './services/taskQueue';
import { addLog } from './services/logService';
import { spawn } from 'child_process';
import { t } from './i18n';

export let globalBackendSettings: Record<string, any> = {};

export interface VaultItem {
    id: string; // We'll use absolute path as a stable ID for now, or a hash
    name: string;
    path: string;
    type: 'folder' | 'canvas';
    parentId: string | null;
    updatedAt: number;
}

export const initVaultHandlers = () => {
    // Sync settings from frontend
    ipcMain.on('vault:update-settings', (event, settings: any) => {
        globalBackendSettings = settings;
        if (settings.maxConcurrentTasks !== undefined) {
            setTaskConcurrency(Number(settings.maxConcurrentTasks));
        }
    });

    // Select a directory as the vault
    ipcMain.handle('vault:select', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
        });

        if (result.canceled) return null;
        return result.filePaths[0];
    });

    // Recursively list all items in the vault
    ipcMain.handle('vault:get-structure', async (_, vaultPath: string) => {
        if (!vaultPath || !(await fs.pathExists(vaultPath))) return { folders: [], canvases: [] };

        const items: VaultItem[] = [];

        // Directories/files to always skip by exact name
        const SKIP_ENTRIES = new Set([
            'node_modules', 'venv', '__pycache__',
            'dist', 'build', '.next', '.nuxt', '.output', 'coverage',
            '.idea', '.vscode', '.cache', '.tmp', 'tmp', '.turbo',
            'target', 'vendor', '.svn', '.hg'
        ]);

        // Whitelist: only show files with these extensions
        // Everything else (binary, index data, hash files, etc.) is excluded
        const SUPPORTED_EXTENSIONS = new Set([
            '.canvas', '.graph',                              // app-native
            '.md', '.txt', '.log',                           // text
            '.csv', '.xlsx', '.xls',                         // spreadsheet
            '.docx', '.doc',                                 // word
            '.pdf',                                          // PDF
            '.json', '.yaml', '.yml',                        // structured data
            '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', // Images
            '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.wma', '.webm', // Audio
            '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm',          // Video (.webm is both audio & video)
        ]);

        async function scan(currentPath: string, parentId: string | null = null) {
            const files = await fs.readdir(currentPath);

            for (const file of files) {
                // Skip hidden files/dirs (starting with .)
                if (file.startsWith('.')) continue;
                // Skip known dev/tool directories
                if (SKIP_ENTRIES.has(file)) continue;

                const fullPath = path.normalize(path.join(currentPath, file));
                const stats = await fs.stat(fullPath);
                const id = fullPath;

                if (stats.isDirectory()) {
                    // Skip internal index directories (e.g. "xxx.graph_index")
                    if (file.endsWith('_index') || file.endsWith('.graph_index')) continue;

                    items.push({
                        id,
                        name: file,
                        path: fullPath,
                        type: 'folder',
                        parentId,
                        updatedAt: stats.mtimeMs
                    });
                    await scan(fullPath, id);
                } else {
                    const ext = path.extname(file).toLowerCase();
                    // Only include files with supported extensions
                    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

                    items.push({
                        id,
                        name: file.replace(path.extname(file), ''),
                        path: fullPath,
                        type: 'canvas', // Mapped to canvas internally for tree rendering
                        parentId,
                        updatedAt: stats.mtimeMs
                    });
                }
            }
        }

        await scan(vaultPath);

        return {
            folders: items.filter(i => i.type === 'folder'),
            canvases: items.filter(i => i.type === 'canvas')
        };
    });

    // Read a canvas file
    ipcMain.handle('vault:read-canvas', async (_, filePath: string) => {
        try {
            const content = await fs.readJson(filePath);
            const stats = await fs.stat(filePath);
            return {
                id: filePath,
                name: path.basename(filePath, '.canvas'),
                content: JSON.stringify(content),
                updated_at: stats.mtimeMs,
                created_at: stats.birthtimeMs
            };
        } catch (error) {
            console.error('Failed to read canvas:', error);
            return null;
        }
    });

    // Read a generic text file
    ipcMain.handle('vault:read-file', async (_, filePath: string) => {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const stats = await fs.stat(filePath);
            return {
                id: filePath,
                name: path.basename(filePath),
                content: content,
                updated_at: stats.mtimeMs,
                created_at: stats.birthtimeMs
            };
        } catch (error) {
            console.error('Failed to read file:', error);
            return null;
        }
    });

    // Write a generic file
    ipcMain.handle('vault:save-file', async (_, { filePath, name, buffer, text }: { filePath: string, name: string, buffer?: ArrayBuffer, text?: string }) => {
        try {
            const finalPath = path.join(filePath, name);
            if (text !== undefined) {
                await fs.writeFile(finalPath, text, 'utf-8');
            } else if (buffer) {
                await fs.writeFile(finalPath, Buffer.from(buffer));
            }
            return finalPath;
        } catch (error) {
            console.error('Failed to save file:', error);
            throw error;
        }
    });

    // Write a canvas file
    ipcMain.handle('vault:save-canvas', async (_, { filePath, name, content }: { filePath: string, name?: string, content: string }) => {
        try {
            let finalPath = filePath;

            // If it's a new canvas or rename, filePath might be a directory or old path
            if (name && !filePath.endsWith('.canvas')) {
                finalPath = path.join(filePath, `${name}.canvas`);
            }

            await fs.writeJson(finalPath, JSON.parse(content), { spaces: 2 });
            return finalPath;
        } catch (error) {
            console.error('Failed to save canvas:', error);
            throw error;
        }
    });

    // Write a graph file
    ipcMain.handle('vault:save-graph', async (_, { filePath, name, content }: { filePath: string, name?: string, content: string }) => {
        try {
            let finalPath = filePath;
            if (name && !filePath.endsWith('.graph')) {
                finalPath = path.join(filePath, `${name}.graph`);
            }
            await fs.writeJson(finalPath, JSON.parse(content), { spaces: 2 });
            return finalPath;
        } catch (error) {
            console.error('Failed to save graph:', error);
            throw error;
        }
    });

    // Check if a file exists
    ipcMain.handle('vault:check-file-exists', async (_, filePath: string) => {
        return await fs.pathExists(filePath);
    });

    // Create a folder
    ipcMain.handle('vault:create-folder', async (_, { parentPath, name }: { parentPath: string, name: string }) => {
        const fullPath = path.join(parentPath, name);
        await fs.ensureDir(fullPath);
        return fullPath;
    });

    // Delete an item
    ipcMain.handle('vault:delete-item', async (_, filePath: string) => {
        await fs.remove(filePath);

        // If deleting a .graph file, also clean up its _index directory
        if (filePath.endsWith('.graph')) {
            const indexDir = filePath + '_index';
            if (await fs.pathExists(indexDir)) {
                console.log(`[Vault] Cleaning up graph index directory: ${indexDir}`);
                await fs.remove(indexDir);
            }
        }

        return true;
    });

    // Rename/Move an item
    ipcMain.handle('vault:rename-item', async (_, { oldPath, newPath }: { oldPath: string, newPath: string }) => {
        await fs.move(oldPath, newPath);

        // If renaming a .graph file, also rename its _index directory if it exists
        if (oldPath.endsWith('.graph')) {
            const oldIndexDir = oldPath + '_index';
            const newIndexDir = newPath + '_index';
            if (await fs.pathExists(oldIndexDir)) {
                console.log(`[Vault] Renaming graph index directory: ${oldIndexDir} -> ${newIndexDir}`);
                await fs.move(oldIndexDir, newIndexDir);
            }
        }

        return newPath;
    });

    // Copy an item
    ipcMain.handle('vault:copy-item', async (_, { oldPath, newPath }: { oldPath: string, newPath: string }) => {
        await fs.copy(oldPath, newPath);
        return newPath;
    });

    // Reveal item in default file manager
    ipcMain.handle('vault:reveal-in-explorer', async (_, filePath: string) => {
        try {
            const normalizedPath = path.normalize(filePath);
            if (await fs.pathExists(normalizedPath)) {
                await shell.showItemInFolder(normalizedPath);
                return true;
            }
            console.error('File does not exist to reveal:', normalizedPath);
            return false;
        } catch (error) {
            console.error('Failed to reveal file:', error);
            return false;
        }
    });

    // Read a file as base64 (used for PDF preview in renderer)
    ipcMain.handle('vault:read-file-base64', async (_, filePath: string) => {
        try {
            const buffer = await fs.readFile(filePath);
            return buffer.toString('base64');
        } catch (error) {
            console.error('Failed to read file as base64:', error);
            return null;
        }
    });

    // Read a URL as base64 (used for bypassing CORS in renderer for PDF preview)
    ipcMain.handle('vault:read-url-base64', async (_, url: string) => {
        try {
            const axios = require('axios');
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            return Buffer.from(response.data).toString('base64');
        } catch (error) {
            console.error('Failed to read url as base64:', error);
            return null;
        }
    });

    // Parse a file to text
    ipcMain.handle('vault:parse-file', async (_, filePath: string) => {
        return await DocumentParser.parseFile(filePath);
    });

    // Parse a file from URL
    ipcMain.handle('vault:parse-url', async (_, url: string, ext: string, headers?: any) => {
        let tmpPath = '';
        try {
            const axios = require('axios');
            const response = await axios.get(url, { responseType: 'arraybuffer', headers });
            tmpPath = path.join(os.tmpdir(), `remote_${Date.now()}${ext}`);
            await fs.writeFile(tmpPath, response.data);
            const parsedText = await DocumentParser.parseFile(tmpPath);
            return parsedText;
        } catch (error) {
            console.error('Failed to parse remote url:', error);
            return null;
        } finally {
            if (tmpPath && await fs.pathExists(tmpPath)) {
                await fs.remove(tmpPath);
            }
        }
    });

    // --- MinerU Advanced Document Parsing ---

    // Check if MinerU environment is installed
    ipcMain.handle('vault:mineru-check-env', async () => {
        return await checkMineruEnv();
    });

    // Setup MinerU environment (install Python venv + mineru package)
    ipcMain.handle('vault:mineru-setup-env', async (event) => {
        try {
            const sendLog = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
                event.sender.send('mineru:log', { message, type });
                addLog(type === 'warning' ? 'warn' : type, 'mineru', message);
            };
            await setupMineruEnv(sendLog);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // Parse PDF to Markdown using Docling (queued)
    ipcMain.handle('vault:mineru-parse', async (event, filePath: string) => {
        const sendLog = (message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
            event.sender.send('mineru:log', { message, type });
            addLog(type === 'warning' ? 'warn' : (type === 'success' ? 'info' : type), 'docling', message);
        };
        try {
            const fileName = path.basename(filePath);
            const engine = globalBackendSettings.docParserEngine || process.env.VITE_DOC_PARSER_ENGINE || (import.meta as any).env?.VITE_DOC_PARSER_ENGINE || 'docling';
            
            if (engine === 'markitdown') {
                const result = await enqueueTask(t('vaultMain.markitdownTask').replace('{name}', fileName), () =>
                    parseWithMarkItDown(filePath, sendLog)
                );
                return result;
            } else if (engine === 'docling') {
                const result = await enqueueTask(t('vaultMain.doclingTask').replace('{name}', fileName), () =>
                    parseWithDocling(filePath, sendLog)
                );
                return result;
            } else {
                const result = await enqueueTask(t('vaultMain.mineruTask').replace('{name}', fileName), () =>
                    parsePdfToMarkdown(filePath, sendLog)
                );
                return result;
            }
        } catch (error: any) {
            sendLog(t('vaultMain.parseFailed').replace('{error}', error.message), 'error');
            return { success: false, outputPath: '', content: '', error: error.message };
        }
    });

    // --- FunASR Audio Transcription ---

    // Check if FunASR environment is installed
    ipcMain.handle('vault:funasr-check-env', async () => {
        return await checkFunasrEnv();
    });

    // Setup FunASR environment (install Python venv + funasr package)
    ipcMain.handle('vault:funasr-setup-env', async (event) => {
        try {
            const sendLog = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
                event.sender.send('funasr:log', { message, type });
                addLog(type === 'warning' ? 'warn' : type, 'funasr', message);
            };
            await setupFunasrEnv(sendLog);
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    // Transcribe audio to Markdown using FunASR (queued)
    ipcMain.handle('vault:funasr-transcribe', async (event, filePath: string) => {
        const sendLog = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
            event.sender.send('funasr:log', { message, type });
            addLog(type === 'warning' ? 'warn' : type, 'funasr', message);
        };
        try {
            const audioName = path.basename(filePath);
            const result = await enqueueTask(t('vaultMain.funasrTask').replace('{name}', audioName), () =>
                transcribeAudioToMarkdown(filePath, sendLog)
            );
            return result;
        } catch (error: any) {
            sendLog(t('serviceMain.transcribeFailed').replace('{error}', error.message), 'error');
            return { success: false, outputPath: '', content: '', error: error.message };
        }
    });

    // Extract audio from video using ffmpeg (queued)
    ipcMain.handle('vault:extract-audio', async (event, filePath: string) => {
        const sendLog = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
            event.sender.send('funasr:log', { message, type });
            addLog(type === 'warning' ? 'warn' : type, 'ffmpeg', message);
        };
        try {
            const videoName = path.basename(filePath);
            const result = await enqueueTask(t('vaultMain.ffmpegTask').replace('{name}', videoName), async () => {
                const dir = path.dirname(filePath);
                const baseName = path.basename(filePath, path.extname(filePath));

                // Find a non-conflicting output name
                let outputPath = path.join(dir, `${baseName}.mp3`);
                let i = 1;
                while (await fs.pathExists(outputPath)) {
                    outputPath = path.join(dir, `${baseName}_${i}.mp3`);
                    i++;
                }

                sendLog(t('vaultMain.ffmpegExtracting'), 'info');

                await new Promise<void>((resolve, reject) => {
                    const env = {
                        ...process.env,
                        PATH: `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.cargo/bin:${process.env.PATH}`
                    };
                    const child = spawn('ffmpeg', [
                        '-i', filePath,
                        '-vn',
                        '-acodec', 'libmp3lame',
                        '-q:a', '2',
                        '-y',
                        outputPath
                    ], { env, shell: false });

                    child.stderr.on('data', (data: Buffer) => {
                        const line = data.toString().trim();
                        if (line.includes('Duration') || line.includes('time=')) {
                            sendLog(line, 'info');
                        }
                    });
                    child.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(t('vaultMain.ffmpegFailed').replace('{code}', String(code))));
                    });
                    child.on('error', (err) => {
                        reject(new Error(t('serviceMain.ffmpegNotFound').replace('{error}', err.message)));
                    });
                });

                sendLog(t('vaultMain.audioExtractDone').replace('{name}', path.basename(outputPath)), 'info');
                return { success: true, outputPath };
            });
            return result;
        } catch (error: any) {
            sendLog(t('vaultMain.extractFailed').replace('{error}', error.message), 'error');
            return { success: false, outputPath: '', error: error.message };
        }
    });

    // Read files from clipboard
    ipcMain.handle('vault:read-clipboard-files', async () => {
        try {
            const { clipboard } = require('electron');
            const fileUriList: string[] = [];

            // macOS copy file usually sets 'NSFilenamesPboardType' (an XML plist containing paths)
            const nsFilenames = clipboard.read('NSFilenamesPboardType');
            console.log('[vault:read-clipboard-files] NSFilenamesPboardType:', nsFilenames);
            if (nsFilenames) {
                try {
                    // Quick and dirty extraction of paths from the XML plist
                    const matches = [...nsFilenames.matchAll(/<string>([^<]+)<\/string>/g)];
                    for (const match of matches) {
                        const extractedPath = match[1].trim();
                        console.log('[vault:read-clipboard-files] Extracted path:', extractedPath);
                        if (extractedPath && await fs.pathExists(extractedPath)) {
                            fileUriList.push(extractedPath);
                            console.log('[vault:read-clipboard-files] Found matching file:', extractedPath);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing NSFilenamesPboardType', e);
                }
            } else {
                // macOS generic fallback or Windows fallback
                const fileUri = clipboard.read('public.file-url');
                console.log('[vault:read-clipboard-files] public.file-url:', fileUri);
                if (fileUri) {
                    try {
                        const decodedPath = decodeURIComponent(fileUri.replace('file://', ''));
                        if (await fs.pathExists(decodedPath)) {
                            fileUriList.push(decodedPath);
                        }
                    } catch (e) { }
                } else {
                    // Windows fallback: read standard file list format 
                    try {
                        const buf = clipboard.readBuffer('FileNameW');
                        const fileStr = buf.toString('ucs2').replace(/\0/g, '');
                        console.log('[vault:read-clipboard-files] Windows fallback:', fileStr);
                        if (fileStr && await fs.pathExists(fileStr)) {
                            fileUriList.push(fileStr);
                        }
                    } catch (e) { }
                }
            }

            return fileUriList;
        } catch (e) {
            console.error('Error reading clipboard files', e);
            return [];
        }
    });
};
