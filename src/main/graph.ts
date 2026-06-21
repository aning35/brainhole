import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { spawn } from 'child_process';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { DocumentParser } from './services/documentParser';
import { enqueueTaskAsync } from './services/taskQueue';
import { addLog } from './services/logService';
import { t } from './i18n';

import {
    getGraphs,
    getGraph,
    saveGraph,
    deleteGraph,
    KnowledgeGraphRecord
} from './database';

/** Get the project-root graphrag/ workspace directory */
function getGraphragWorkspacePath(): string {
    const devPath = path.join(app.getAppPath(), 'graphrag');
    if (fs.pathExistsSync(devPath)) return devPath;
    return path.join(process.resourcesPath || app.getAppPath(), 'graphrag');
}

async function setupPythonEnv(event: Electron.IpcMainInvokeEvent, filePath: string): Promise<string> {
    const isWin = process.platform === 'win32';
    const workspacePath = getGraphragWorkspacePath();

    // Primary: use graphrag/ project with uv sync (same pattern as funasr/mineru)
    const wsEnvPath = path.join(workspacePath, '.venv');
    const wsPythonExe = path.join(wsEnvPath, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');

    const sendLog = (msg: string, type: 'info' | 'warning' | 'error' = 'info') => {
        let output = msg.trim();
        if (output) {
            event.sender.send('graph:log', { filePath, message: output, type });
            addLog(type === 'warning' ? 'warn' : type, 'graphrag', output);
        }
    };

    // Helper to spawn and wait
    const runCmd = (cmd: string, args: string[], cwd: string = workspacePath) => {
        return new Promise<void>((resolve, reject) => {
            const env = { ...process.env, PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${require('os').homedir()}/.cargo/bin:${process.env.PATH}` };
            const child = spawn(cmd, args, { cwd, shell: isWin, env });

            let buffer = '';
            const handleData = (data: Buffer) => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.trim()) sendLog(line, 'info');
                }
            };

            child.stdout.on('data', handleData);
            child.stderr.on('data', handleData);
            child.on('close', code => {
                if (buffer.trim()) sendLog(buffer, 'info');
                if (code === 0) resolve();
                else reject(new Error(`${cmd} ${args.join(' ')} failed with code ${code}`));
            });
            child.on('error', reject);
        });
    };

    // Check if workspace .venv already exists
    if (await fs.pathExists(wsPythonExe)) {
        return wsPythonExe;
    }

    // Also check legacy location (userData/graphrag-env)
    const userDataPath = app.getPath('userData');
    const legacyEnvPath = path.join(userDataPath, 'graphrag-env');
    const legacyPythonExe = path.join(legacyEnvPath, isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python');
    if (await fs.pathExists(legacyPythonExe)) {
        return legacyPythonExe;
    }

    sendLog(t('graphMain.firstTimeInstall'));

    // Try uv sync in graphrag/ workspace
    try {
        sendLog(t('graphMain.uvSyncInstalling'));
        await runCmd('uv', ['sync'], workspacePath);
        sendLog(t('graphMain.envCreatedSuccess'));
        return wsPythonExe;
    } catch (e) {
        sendLog(t('graphMain.uvSyncFailed').replace('{error}', e instanceof Error ? e.message : String(e)), 'warning');

        try {
            // Fallback: create venv + pip install in legacy location
            const sysPython = isWin ? 'python' : 'python3';
            await runCmd(sysPython, ['-m', 'venv', legacyEnvPath], userDataPath);

            const pipExecutable = path.join(legacyEnvPath, isWin ? 'Scripts' : 'bin', isWin ? 'pip.exe' : 'pip');
            sendLog(t('graphMain.pipInstalling'));
            await runCmd(pipExecutable, ['install', 'graphrag>=3.0.6', 'tenacity>=8.0.0'], userDataPath);
            sendLog(t('graphMain.envCreatedPip'));
            return legacyPythonExe;
        } catch (err) {
            sendLog(t('graphMain.envCreateFailed').replace('{error}', err instanceof Error ? err.message : String(err)), 'error');
            throw new Error(t('graphMain.envCreateError'));
        }
    }
}

export const initGraphHandlers = () => {
    const userDataPath = app.getPath('userData');
    const graphsRoot = path.join(userDataPath, 'graphs');

    // Map to keep track of running child processes so we can kill them if requested
    const activeProcesses = new Map<string, ReturnType<typeof spawn>>();

    // Ensure graphs directory exists
    fs.ensureDirSync(graphsRoot);

    ipcMain.handle('graph:list', async () => {
        return getGraphs();
    });

    ipcMain.handle('graph:get', async (_, id: string) => {
        return getGraph(id);
    });

    ipcMain.handle('graph:save', async (_, graph: KnowledgeGraphRecord) => {
        return saveGraph(graph);
    });

    ipcMain.handle('graph:delete', async (_, id: string) => {
        // 'id' here is the file path in the new system
        const graphPath = id;

        // Terminate any active indexing process before deletion
        if (activeProcesses.has(graphPath)) {
            activeProcesses.get(graphPath)!.kill('SIGKILL');
            activeProcesses.delete(graphPath);
        }

        const indexFolder = graphPath + '_index';

        if (await fs.pathExists(graphPath)) {
            await fs.remove(graphPath);
        }
        if (await fs.pathExists(indexFolder)) {
            await fs.remove(indexFolder);
        }

        // This part is for legacy compatibility or if database is still used for something
        try {
            return deleteGraph(id);
        } catch (e) {
            return { success: true }; // File deletion is primary goal
        }
    });

    ipcMain.handle('graph:index', async (event, { filePath, llmConfig, embeddingConfig, entityTypes }: {
        filePath: string,
        llmConfig: { apiKey: string, baseUrl: string, model: string },
        embeddingConfig: { apiKey: string, baseUrl: string, model: string },
        entityTypes?: string[]
    }) => {
        if (!(await fs.pathExists(filePath))) throw new Error('Graph file not found');

        // Kill any existing process immediately if user is force restarting
        if (activeProcesses.has(filePath)) {
            activeProcesses.get(filePath)!.kill('SIGKILL');
            activeProcesses.delete(filePath);
        }

        const graphFileName = path.basename(filePath);

        // Enqueue the heavy indexing work — returns immediately, task runs when a slot opens
        const taskId = enqueueTaskAsync(`GraphRAG 索引: ${graphFileName}`, async () => {

            // Restore projectRoot exactly as it was needed by later scripts
            const projectRoot = app.isPackaged ? process.resourcesPath : process.cwd();

            // Fetch or provision the user-level Python environment independently
            const pythonCmd = await setupPythonEnv(event, filePath);

            let graph: { file_paths: string[], status: string, last_error?: string };
            try {
                graph = await fs.readJson(filePath);
            } catch (e) {
                throw new Error('Failed to read graph file');
            }

            const graphRoot = filePath + '_index';
            const legacyWorkspacePath = path.join(path.dirname(filePath), '.' + path.basename(filePath, '.graph') + '_workspace');

            console.log(`[GraphRAG] Starting index handler. V7 (Path Fix & Dual Config). Python: ${pythonCmd}`);
            console.log(`[GraphRAG] Root: ${graphRoot}`);

            // Cleanup legacy folder if it exists
            if (await fs.pathExists(legacyWorkspacePath)) {
                console.log(`[GraphRAG] Cleaning up redundant legacy workspace: ${legacyWorkspacePath}`);
                await fs.remove(legacyWorkspacePath);
            }
            const inputPath = path.join(graphRoot, 'input');

            await fs.ensureDir(graphRoot);

            // 1. Initialize if needed
            const settingsPath = path.join(graphRoot, 'settings.yaml');
            if (!(await fs.pathExists(settingsPath))) {
                console.log(`[GraphRAG] Initializing workspace at ${graphRoot}`);
                try {
                    await new Promise((resolve, reject) => {
                        const initProc = spawn(pythonCmd, [
                            '-m', 'graphrag', 'init',
                            '--root', graphRoot,
                            '--model', llmConfig.model || 'gpt-4o',
                            '--embedding', embeddingConfig.model || 'text-embedding-3-small',
                            '--force'
                        ], {
                            cwd: graphRoot,
                            shell: false,  // Use array args to avoid shell path-escaping issues with Chinese/spaces
                            env: { ...process.env, PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` }
                        });
                        let stderr = '';
                        initProc.stderr.on('data', (data) => {
                            stderr += data.toString();
                            console.error(`[GraphRAG Init Stderr] ${data}`);
                        });
                        initProc.stdout.on('data', (data) => {
                            console.log(`[GraphRAG] Init Out: ${data}`);
                        });
                        initProc.on('close', (code) => {
                            if (code === 0) resolve(true);
                            else reject(new Error(`Init failed with code ${code}. Stderr: ${stderr}`));
                        });
                    });
                } catch (e: any) {
                    console.error(`[GraphRAG] Init failed: ${e.message}`);
                    throw new Error(t('graphMain.initFailed').replace('{error}', e.message));
                }
            }

            // Post-init/Pre-run: Inject Chinese language constraints into all prompts
            const patchPromptForChinese = async (promptName: string) => {
                const promptPath = path.join(graphRoot, 'prompts', promptName);
                if (await fs.pathExists(promptPath)) {
                    let content = await fs.readFile(promptPath, 'utf8');
                    let modified = false;

                    // Replace explicit "in English" with "in Simplified Chinese"
                    if (content.includes('in English')) {
                        content = content.replace(/in English/g, 'in Simplified Chinese (简体中文)');
                        modified = true;
                    }

                    // Add comprehensive language instructions if not already present
                    if (!content.includes('简体中文')) {
                        content += '\n\nCRITICAL LANGUAGE REQUIREMENT: All output — including entity names, entity types, descriptions, relationship descriptions, community titles, summaries, findings, and any other generated text — MUST be written entirely in Simplified Chinese (简体中文). Do NOT output any English text unless it is a proper noun, technical term, or abbreviation that has no standard Chinese translation.';
                        modified = true;
                    }

                    if (modified) {
                        await fs.writeFile(promptPath, content);
                        console.log(`[GraphRAG] Patched prompt for Chinese: ${promptName}`);
                    }
                }
            };
            // GraphRAG v3 prompt filenames
            await patchPromptForChinese('extract_graph.txt');
            await patchPromptForChinese('summarize_descriptions.txt');
            await patchPromptForChinese('community_report_graph.txt');
            await patchPromptForChinese('community_report_text.txt');
            await patchPromptForChinese('extract_claims.txt');
            // Legacy filenames (in case of older graphrag versions)
            await patchPromptForChinese('entity_extraction.txt');
            await patchPromptForChinese('community_report.txt');

            // 2. Prepare input files — use unified DocumentParser to pre-convert
            //    all formats (PDF, DOCX, XLSX, PPTX, etc.) to .txt before feeding
            //    to GraphRAG. This removes dependency on Python-side MarkItDown.
            const filePaths = graph.file_paths || [];
            console.log(`[GraphRAG] file_paths from graph: ${JSON.stringify(filePaths)}`);
            await fs.ensureDir(inputPath);
            await fs.emptyDir(inputPath);
            let convertedCount = 0;
            let totalWords = 0;
            for (const fPath of filePaths) {
                const exists = await fs.pathExists(fPath);
                console.log(`[GraphRAG] Checking file: ${fPath} -> exists: ${exists}`);
                if (!exists) {
                    console.warn(`[GraphRAG] File not found, skipping: ${fPath}`);
                    continue;
                }
                const converted = await DocumentParser.convertToTextFile(fPath, inputPath);
                if (converted) {
                    convertedCount++;
                    totalWords += converted.result.wordCount;
                }
            }
            console.log(`[GraphRAG] Total files converted to text: ${convertedCount} (${totalWords} words)`);
            if (convertedCount === 0) {
                throw new Error(t('graphMain.noDocsToIndex'));
            }

            // Helper to clean inputs from potential markdown formatting or extra slashes
            const sanitize = (val: string) => {
                if (!val) return val;
                let s = val.trim();
                // Remove markdown link syntax: [text](link) -> link
                const mdLinkMatch = s.match(/\[.*?\]\((.*?)\)/);
                if (mdLinkMatch) s = mdLinkMatch[1];
                // Remove backslashes
                s = s.replace(/\\/g, '');
                return s;
            };

            const cleanLLM = {
                apiKey: sanitize(llmConfig.apiKey),
                baseUrl: sanitize(llmConfig.baseUrl),
                model: sanitize(llmConfig.model)
            };
            const cleanEmbed = {
                apiKey: sanitize(embeddingConfig.apiKey),
                baseUrl: sanitize(embeddingConfig.baseUrl),
                model: sanitize(embeddingConfig.model)
            };

            // Detect if base URL is SiliconFlow and map common short model names to their full IDs
            const isSiliconFlow = cleanLLM.baseUrl.includes('siliconflow');
            const SILICONFLOW_MODEL_MAP: Record<string, string> = {
                'deepseek-v4-flash': 'deepseek-ai/deepseek-v4-flash',
                'deepseek-v4-pro': 'deepseek-ai/deepseek-v4-pro',
                'deepseek-chat': 'deepseek-ai/deepseek-v4-flash',
                'deepseek-reasoner': 'deepseek-ai/deepseek-v4-pro',
                'deepseek-v3': 'deepseek-ai/deepseek-v4-flash',
                'deepseek-r1': 'deepseek-ai/deepseek-v4-pro',
                'qwen2.5-72b-instruct': 'Qwen/Qwen2.5-72B-Instruct',
                'qwen2.5-7b-instruct': 'Qwen/Qwen2.5-7B-Instruct',
            };
            if (isSiliconFlow) {
                const mapped = SILICONFLOW_MODEL_MAP[cleanLLM.model.toLowerCase()];
                if (mapped) {
                    console.log(`[GraphRAG] SiliconFlow model remapped: ${cleanLLM.model} → ${mapped}`);
                    cleanLLM.model = mapped;
                }
            }

            // 3. Update .env with API Keys
            const envPath = path.join(graphRoot, '.env');
            const envLines = [
                `GRAPHRAG_API_KEY=${cleanLLM.apiKey}`,
                `GRAPHRAG_LLM_API_KEY=${cleanLLM.apiKey}`,
                `GRAPHRAG_EMBEDDING_API_KEY=${cleanEmbed.apiKey}`
            ];
            await fs.writeFile(envPath, envLines.join('\n') + '\n');

            // 4. Update settings.yaml
            let settings: any = null;
            try {
                console.log(`[GraphRAG] Patching settings.yaml with dual config`);
                const settingsContent = await fs.readFile(settingsPath, 'utf-8');
                settings = yaml.load(settingsContent);
            } catch (e) {
                console.warn('[GraphRAG] settings.yaml is corrupted or missing. Attempting to recover...', e);
                // If corrupted, delete it and we'll throw error to let user retry (which will trigger re-init)
                if (await fs.pathExists(settingsPath)) {
                    await fs.remove(settingsPath);
                }
                throw new Error(t('graphMain.settingsCorrupted'));
            }

            if (settings) {
                // Patch completion models
                if (settings.completion_models) {
                    for (const key in settings.completion_models) {
                        const model = settings.completion_models[key];
                        if (model) {
                            model.model = cleanLLM.model;
                            model.api_base = cleanLLM.baseUrl;
                            model.model_provider = 'openai';
                            model.auth_method = 'api_key';
                            model.api_key = '${GRAPHRAG_LLM_API_KEY}';
                            // Use response_format_json_object mode to avoid Pydantic structured output
                            // issues with providers like SiliconFlow that reject response_format schemas.
                            if (!model.call_args) model.call_args = {};
                            model.call_args.response_format_json_object = true;
                        }
                    }
                }

                // Patch embedding models
                if (settings.embedding_models) {
                    for (const key in settings.embedding_models) {
                        const model = settings.embedding_models[key];
                        if (model) {
                            model.model = cleanEmbed.model;
                            model.api_base = cleanEmbed.baseUrl;
                            model.model_provider = 'openai';
                            model.auth_method = 'api_key';
                            model.api_key = '${GRAPHRAG_EMBEDDING_API_KEY}';
                            // Fix for SiliconFlow/LiteLLM 400 error: explicitly set encoding_format in call_args
                            if (!model.call_args) model.call_args = {};
                            model.call_args.encoding_format = 'float';
                        }
                    }
                }

                // Patch vector_store vector_size to match the actual embedding model dimension.
                // BAAI/bge-m3 outputs 1024-dim vectors; the default config assumes 3072 (OpenAI).
                // Mismatch causes: "Column vector expected length N but got N/3" in PyArrow.
                const embModelName = cleanEmbed.model.toLowerCase();
                const vectorSize =
                    embModelName.includes('bge-m3') || embModelName.includes('bge-large') ? 1024 :
                        embModelName.includes('text-embedding-ada') ? 1536 :
                            embModelName.includes('text-embedding-3-small') ? 1536 :
                                embModelName.includes('text-embedding-3-large') ? 3072 :
                                    1024; // safe default for unknowns
                console.log(`[GraphRAG] Embedding model vector_size resolved: ${vectorSize} (model: ${cleanEmbed.model})`);
                if (settings.vector_store) {
                    settings.vector_store.vector_size = vectorSize;
                    if (settings.vector_store.index_schema) {
                        for (const idx of Object.values(settings.vector_store.index_schema) as any[]) {
                            if (idx) idx.vector_size = vectorSize;
                        }
                    }
                }

                if (settings.chunking) {
                    // o200k_base is far more efficient for Chinese text (~1.3 chars/token vs 0.73)
                    // 2000 tokens ≈ ~2500 Chinese chars, good for dense domain documents
                    settings.chunking.encoding_model = 'o200k_base';
                    settings.chunking.size = 2000;
                    settings.chunking.overlap = 200;
                }

                if (settings.input) {
                    // We pre-convert everything to .txt via our unified DocumentParser,
                    // so GraphRAG only needs to read plain text files.
                    settings.input.type = 'text';
                    settings.input.file_pattern = ".*\\.txt";
                }

                if (settings.extract_graph) {
                    settings.extract_graph.entity_types = entityTypes && entityTypes.length > 0
                        ? entityTypes
                        : [
                            '人物', '组织机构', '位置与地点',
                            '项目任务', '产品服务', '目标与规划',
                            '独立事件', '行业领域', '前沿技术',
                            '技术文档', '工具框架', '信息与消息',
                            '核心机制', '总结笔记', '核心账号与凭据',
                            '硬件服务器设备', '动作执行', '业务策略',
                            '核心术语概念', '原理论点', '问题与缺陷',
                            '解决方案', '标准规范与法规', '数据指标'
                        ];
                    // Point to our Chinese-patched prompt file
                    const extractPrompt = path.join(graphRoot, 'prompts', 'extract_graph.txt');
                    if (await fs.pathExists(extractPrompt)) {
                        settings.extract_graph.prompt = extractPrompt;
                    }
                }

                // Point summarize_descriptions to Chinese-patched prompt
                if (settings.summarize_descriptions) {
                    const sumPrompt = path.join(graphRoot, 'prompts', 'summarize_descriptions.txt');
                    if (await fs.pathExists(sumPrompt)) {
                        settings.summarize_descriptions.prompt = sumPrompt;
                    }
                }

                // Point community_reports to Chinese-patched prompt
                if (settings.community_reports) {
                    const crPrompt = path.join(graphRoot, 'prompts', 'community_report_graph.txt');
                    if (await fs.pathExists(crPrompt)) {
                        settings.community_reports.prompt = crPrompt;
                    }
                }

                await fs.writeFile(settingsPath, yaml.dump(settings, { indent: 2, lineWidth: -1 }));
                console.log(`[GraphRAG] settings.yaml patched successfully (Dual)`);
            }

            // 5. Update graph file status
            graph.status = 'indexing';
            await fs.writeJson(filePath, graph, { spaces: 2 });
            event.sender.send('graph:status-changed', { filePath, status: 'indexing' });

            // 6. Spawn GraphRAG indexing process with runtime fixes
            console.log(`[GraphRAG] Starting indexing at ${graphRoot}. V8 (Monkeypatch Fix).`);
            const patchScriptPath = path.join(projectRoot, 'graphrag_patch.py');
            const child = spawn(pythonCmd, [
                patchScriptPath, 'index',
                '--root', graphRoot
            ], {
                env: { ...process.env, PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
                shell: false  // Use array args to avoid path escaping issues with Chinese characters/spaces
            });

            activeProcesses.set(filePath, child);

            child.stdout.on('data', (data) => {
                let output = data.toString();
                if (!output.endsWith('\n')) output += '\n';
                event.sender.send('graph:log', { filePath, message: output });
            });

            child.stderr.on('data', (data) => {
                let output = data.toString();
                if (!output.endsWith('\n')) output += '\n';

                // Python logging writes everything to stderr by default.
                // Only mark as error if it actually looks like an error/warning.
                let type: string | undefined = undefined;
                const lowerOutput = output.toLowerCase();
                if (
                    lowerOutput.includes('error:') ||
                    lowerOutput.includes('traceback (most recent call last)') ||
                    lowerOutput.includes('exception:') ||
                    lowerOutput.includes('critical:')
                ) {
                    type = 'error';
                } else if (lowerOutput.includes('warn:')) {
                    type = 'warning';
                }

                event.sender.send('graph:log', { filePath, message: output, type });
            });

            // Await child process completion so the queue slot is held for the entire duration
            await new Promise<void>((resolve) => {
                child.on('close', async (code) => {
                    activeProcesses.delete(filePath);
                    const updatedGraph = await fs.readJson(filePath);

                    if (code === 0) {
                        updatedGraph.status = 'ready';
                        updatedGraph.last_error = null;
                        await fs.writeJson(filePath, updatedGraph, { spaces: 2 });
                        event.sender.send('graph:status-changed', { filePath, status: 'ready' });
                    } else if (code === null) {
                        // The process was forcefully killed (e.g., cancelled by user)
                        updatedGraph.status = 'ready';
                        updatedGraph.last_error = null;
                        await fs.writeJson(filePath, updatedGraph, { spaces: 2 });
                        event.sender.send('graph:status-changed', { filePath, status: 'ready' });
                        event.sender.send('graph:log', { filePath, message: t('graphMain.indexStopped'), type: 'warning' });
                    } else {
                        updatedGraph.status = 'error';
                        updatedGraph.last_error = `Process exited with code ${code}`;
                        await fs.writeJson(filePath, updatedGraph, { spaces: 2 });
                        event.sender.send('graph:status-changed', { filePath, status: 'error', message: `Exit code ${code}` });
                    }
                    resolve();
                });
            });

        }); // end enqueueTaskAsync

        return { success: true, taskId };
    });

    // Provide a dedicated STOP handler
    ipcMain.handle('graph:stop', async (event, id: string) => {
        const filePath = id;

        let killed = false;
        if (activeProcesses.has(filePath)) {
            const child = activeProcesses.get(filePath)!;
            child.kill('SIGKILL');
            activeProcesses.delete(filePath);
            killed = true;
        }

        // Always reset status to break stale locks
        if (await fs.pathExists(filePath)) {
            const updatedGraph = await fs.readJson(filePath);
            updatedGraph.status = 'ready';
            updatedGraph.last_error = killed ? 'User cancelled indexing' : null;
            await fs.writeJson(filePath, updatedGraph, { spaces: 2 });
            event.sender.send('graph:status-changed', { filePath, status: 'ready' });

            if (!killed) {
                event.sender.send('graph:log', {
                    filePath,
                    message: t('graphMain.staleLockRemoved'),
                    type: 'warning'
                });
            }
        }

        return { success: killed, message: killed ? 'Process killed' : 'Process not found, lock removed' };
    });

    // Helper to resolve the graphPath from a canvas filePath
    const resolveGraphPath = (filePath: string) => {
        return filePath + '_index';
    };

    ipcMain.handle('graph:search', async (event, { filePath, query, method }: { filePath: string, query: string, method: 'local' | 'global' }) => {
        try {
            const graphRoot = resolveGraphPath(filePath);
            const pythonCmd = await setupPythonEnv(event, filePath);

            return new Promise<string>((resolve, reject) => {
                let output = '';
                let stderr = '';

                const child = spawn(pythonCmd, [
                    '-m', 'graphrag', 'query',
                    '--root', graphRoot,
                    '--method', method,
                    query
                ], {
                    env: { ...process.env, PATH: process.platform === 'win32' ? (process.env.PATH || process.env.Path) : `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}` },
                    shell: false
                });

                child.stdout.on('data', (data) => {
                    output += data.toString();
                });

                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                child.on('close', (code) => {
                    if (code === 0) {
                        // GraphRAG typical output might contain logs or "SUCCESS: ...". But standard stdout from `python -m graphrag query` usually just prints the answer to stdout.
                        // Sometimes it outputs "SUCCESS: Local Search Response:" or similar. We should return raw output and let the LLM see it.
                        resolve(output.trim());
                    } else {
                        reject(new Error(`GraphRAG query failed (${code}): ${stderr}`));
                    }
                });

                child.on('error', (err) => {
                    reject(err);
                });
            });
        } catch (error: any) {
            console.error('[GraphRAG] Search failed:', error);
            throw error;
        }
    });

    // Reads a parquet file and returns its rows as plain JSON-serializable objects
    const readParquetFile = async (filePath: string): Promise<Record<string, any>[]> => {
        const buffer = await fs.readFile(filePath);
        // hyparquet accepts a plain ArrayBuffer — create one from the node Buffer
        const arrayBuffer: ArrayBuffer = buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer;
        const rows = await parquetReadObjects({ file: arrayBuffer, compressors });
        return rows;
    };

    // Read Nodes from Parquet
    ipcMain.handle('graph:get-nodes', async (_, filePath: string) => {
        try {
            const graphPath = resolveGraphPath(filePath);
            console.log('[graph:get-nodes] Input filePath:', filePath);
            console.log('[graph:get-nodes] Resolved graphPath:', graphPath);

            // Try multiple possible filenames
            const candidates = [
                path.join(graphPath, 'output', 'create_final_nodes.parquet'),
                path.join(graphPath, 'output', 'entities.parquet'),
            ];

            let parquetPath: string | null = null;
            for (const c of candidates) {
                const exists = await fs.pathExists(c);
                console.log(`[graph:get-nodes] Checking candidate: ${c} -> exists: ${exists}`);
                if (exists) {
                    parquetPath = c;
                    break;
                }
            }

            if (!parquetPath) {
                console.warn('[graph:get-nodes] No parquet file found in:', graphPath);
                throw new Error(`No parquet file found. Checked: ${candidates.join(', ')}`);
            }

            console.log('[graph:get-nodes] Reading:', parquetPath);
            const rows = await readParquetFile(parquetPath);
            console.log('[graph:get-nodes] Got', rows.length, 'rows');
            return rows;
        } catch (error: any) {
            console.error('[GraphRAG] Failed to get nodes:', error);
            throw error;
        }
    });

    // Read Edges from Parquet
    ipcMain.handle('graph:get-edges', async (_, filePath: string) => {
        try {
            const graphPath = resolveGraphPath(filePath);
            console.log('[graph:get-edges] Input filePath:', filePath);
            console.log('[graph:get-edges] Resolved graphPath:', graphPath);

            const candidates = [
                path.join(graphPath, 'output', 'create_final_relationships.parquet'),
                path.join(graphPath, 'output', 'relationships.parquet'),
            ];

            let parquetPath: string | null = null;
            for (const c of candidates) {
                const exists = await fs.pathExists(c);
                console.log(`[graph:get-edges] Checking candidate: ${c} -> exists: ${exists}`);
                if (exists) {
                    parquetPath = c;
                    break;
                }
            }

            if (!parquetPath) {
                console.warn('[graph:get-edges] No parquet file found in:', graphPath);
                throw new Error(`No parquet file found. Checked: ${candidates.join(', ')}`);
            }

            console.log('[graph:get-edges] Reading:', parquetPath);
            const rows = await readParquetFile(parquetPath);
            console.log('[graph:get-edges] Got', rows.length, 'rows');
            return rows;
        } catch (error: any) {
            console.error('[GraphRAG] Failed to get edges:', error);
            throw error;
        }
    });

    // Read Documents from Parquet (for source tracing)
    ipcMain.handle('graph:get-documents', async (_, filePath: string) => {
        try {
            const graphPath = resolveGraphPath(filePath);
            const candidates = [
                path.join(graphPath, 'output', 'documents.parquet'),
                path.join(graphPath, 'output', 'create_final_documents.parquet'),
            ];

            let parquetPath: string | null = null;
            for (const c of candidates) {
                if (await fs.pathExists(c)) {
                    parquetPath = c;
                    break;
                }
            }

            if (!parquetPath) {
                console.warn('[graph:get-documents] No parquet file found');
                return [];
            }

            const rows = await readParquetFile(parquetPath);
            console.log('[graph:get-documents] Got', rows.length, 'rows');
            return rows;
        } catch (error: any) {
            console.error('[GraphRAG] Failed to get documents:', error);
            return [];
        }
    });

    // Read Text Units from Parquet (for source tracing: entity → text_unit → document)
    ipcMain.handle('graph:get-text-units', async (_, filePath: string) => {
        try {
            const graphPath = resolveGraphPath(filePath);
            const candidates = [
                path.join(graphPath, 'output', 'text_units.parquet'),
                path.join(graphPath, 'output', 'create_final_text_units.parquet'),
            ];

            let parquetPath: string | null = null;
            for (const c of candidates) {
                if (await fs.pathExists(c)) {
                    parquetPath = c;
                    break;
                }
            }

            if (!parquetPath) {
                console.warn('[graph:get-text-units] No parquet file found');
                return [];
            }

            const rows = await readParquetFile(parquetPath);
            console.log('[graph:get-text-units] Got', rows.length, 'rows');
            return rows;
        } catch (error: any) {
            console.error('[GraphRAG] Failed to get text units:', error);
            return [];
        }
    });
};
