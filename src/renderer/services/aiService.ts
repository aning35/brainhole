import i18next, { t } from 'i18next';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, jsonSchema } from 'ai';
import { imaService } from './imaService';
import * as XLSX from 'xlsx';

export interface AIContextItem {
    nodeId: string;
    title: string;
    dataType: 'text' | 'table' | 'document' | 'image' | 'video' | 'knowledge_graph' | 'ima_knowledge_base';
    content?: string;
    data?: any[];
    columns?: string[];
    fileUrl?: string;
    fileName?: string;
    selectedSheet?: string;
    imaKbId?: string;
    imaFolderId?: string;
}

export interface GenerateRequest {
    prompt: string;
    context: AIContextItem[];
    temperature?: number;
    maxTokens?: number;
    settings?: {
        aiModel?: string;
        aiApiKey?: string;
        aiBaseUrl?: string;
        systemPrompt?: string;
        thinkingMode?: boolean;
        reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
        imaClientId?: string;
        imaApiKey?: string;
        [key: string]: any;
    };
}

export interface GenerateResponse {
    content: string;
    suggestedActions?: string[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

class AIService {

    private getProvider(settings?: GenerateRequest['settings']): ReturnType<typeof createOpenAI> | null {
        const apiKey = settings?.aiApiKey || import.meta.env.VITE_DEEPSEEK_API_KEY;
        const baseURL = settings?.aiBaseUrl || import.meta.env.VITE_AI_BASE_URL || 'https://api.deepseek.com/v1';

        if (!apiKey) return null;

        return createOpenAI({
            apiKey: apiKey,
            baseURL: baseURL,
            // @ts-ignore
            compatibility: 'compatible',
        });
    }

    async generateContent(
        request: GenerateRequest,
        signal?: AbortSignal,
        onProgress?: (partial: string) => void
    ): Promise<GenerateResponse> {
        let provider = this.getProvider(request.settings);
        let modelName = request.settings?.aiModel || 'deepseek-reasoner';
        const systemPrompt = request.settings?.systemPrompt || 'You are a helpful AI assistant in a knowledge canvas environment. Use the provided context to answer the user request. Output in Markdown.';
        const targetLang = i18next.language?.startsWith('zh') ? 'Chinese' : 'English';
        const targetLangUpper = targetLang.toUpperCase();

        if (!provider) {
            console.warn('No VITE_DEEPSEEK_API_KEY found. Using Mock Response.');
            return this.generateMockResponse(request);
        }

        // Separate Graph nodes from standard context
        const standardContexts = request.context.filter(c => c.dataType !== 'knowledge_graph');
        const graphContexts = request.context.filter(c => c.dataType === 'knowledge_graph');

        // Force deepseek-v4-flash if tools are needed, as reasoner might not support tools out-of-the-box
        if (graphContexts.length > 0 && modelName === 'deepseek-reasoner') {
            modelName = 'deepseek-v4-flash';
        }

        // Build context message
        let contextMessage = '';
        if (standardContexts.length > 0) {
            const contextStrArray = await Promise.all(standardContexts.map(async (c, index) => {
                let content = '';
                if (c.dataType === 'table') content = await this.readTableContext(c);
                else if (c.dataType === 'document' || c.dataType === 'text') content = await this.readDocumentContext(c);
                else content = `[${c.dataType} file: ${c.fileName}]`;
                return `Context #${index + 1} (${c.dataType}): ${c.title}\n${content}`;
            }));
            contextMessage += `Standard Context Data:\n${contextStrArray.join('\n\n')}\n\n`;
        }

        if (graphContexts.length > 0) {
            const availableGraphs = graphContexts.map(c => `- ${c.fileName || c.title}`).join('\n');
            contextMessage += `Available Knowledge Graphs (Search tools enabled):\n${availableGraphs}\n\n`;
        }

        try {

            // ===== DEBUG: inspect what jsonSchema() and tool() produce =====
            
            const hasGraphTools = graphContexts.length > 0;
            const hasTools = hasGraphTools;
            
            let toolsConfig: any = hasTools ? {} : undefined;

            if (hasGraphTools) {
                const paramSchema = jsonSchema<{ graphFileName: string, method: 'local' | 'global', query: string }>({
                    type: 'object',
                    properties: {
                        graphFileName: { type: 'string', description: 'The name of the graph file to search.' },
                        method: {
                            type: 'string',
                            enum: ['local', 'global'],
                            description: 'Search method: use "local" by default for ALMOST ALL queries regarding specific keywords, facts, entities, or rules. USE "global" ONLY when the user explicitly asks for a high-level summary or overall theme of the entire document.'
                        },
                        query: { type: 'string', description: 'The search query to execute against the graph.' }
                    },
                    required: ['graphFileName', 'method', 'query'],
                    additionalProperties: false
                });

                const searchTool = tool({
                    description: 'Search across connected knowledge graphs.',
                    inputSchema: paramSchema,
                    execute: async ({ graphFileName, method, query }: { graphFileName: string, method: 'local' | 'global', query: string }) => {
                        const graph = graphContexts.find(g => g.fileName === graphFileName || g.title === graphFileName);
                        if (!graph || !graph.fileUrl) {
                            return `Tool Error: Graph ${graphFileName} not found. Available: ${graphContexts.map(g => g.fileName).join(', ')}`;
                        }

                        let filePath = graph.fileUrl;
                        // Strip known URL scheme prefixes and decode URI-encoded characters (Chinese, spaces, etc.)
                        if (filePath.startsWith('local-file://')) {
                            filePath = decodeURIComponent(filePath.replace('local-file://', ''));
                        } else if (filePath.startsWith('local-asset://')) {
                            filePath = decodeURIComponent(filePath.replace('local-asset://', ''));
                        }

                        try {
                            console.log(`[AI Tool Exec] Searching graph ${filePath} with ${method} method...`);
                            // @ts-ignore
                            const searchResult = await window.electronAPI.graph.search({ filePath, query, method });

                            // Translate GraphRAG's hardcoded English empty response into a strict instruction for the AI
                            if (searchResult && (searchResult.includes('I am sorry but I am unable to answer') || searchResult.includes('I am unable to answer'))) {
                                return `Graph search completed, but no relevant information was found. PLEASE RESPOND TO THE USER IN ${targetLangUpper} STATING THAT NO RELEVANT INFORMATION WAS FOUND IN THE GRAPH.`;
                            }

                            return searchResult || `No results found. Please reply in ${targetLang}.`;
                        } catch (err: any) {
                            console.error('[AI Tool Error]', err);
                            return `Tool execution failed: ${err.message}. Please inform the user in ${targetLang}.`;
                        }
                    }
                });

                toolsConfig.search_graph = searchTool;
            }
            // ===== END DEBUG =====

            const result = await streamText({
                model: provider.chat(modelName),
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt + (hasTools ? `\nIMPORTANT: You must ALWAYS synthesize tool results and respond in ${targetLang}. Never output raw tool result logs directly. If the tool indicates no information was found, strictly inform the user of that fact in fluent ${targetLang}.` : '')
                    },
                    {
                        role: 'user',
                        content: `${contextMessage}User Question: ${request.prompt}`
                    }
                ],
                temperature: request.settings?.thinkingMode ? undefined : (request.temperature ?? 0.7), // Temperature not supported in thinking mode
                ...(request.maxTokens ? { maxTokens: request.maxTokens } : {}),
                abortSignal: signal,
                maxSteps: hasTools ? 5 : 1,
                tools: toolsConfig,
                providerOptions: {
                    openai: {
                        ...(request.settings?.thinkingMode ? {
                            reasoningEffort: request.settings.reasoningEffort || 'high',
                            reasoningSummary: 'detailed',
                        } : {}),
                    }
                }
            } as any);

            let fullContent = '';

            for await (const chunk of result.fullStream) {
                if (chunk.type === 'text-delta') {
                    fullContent += chunk.text;
                    onProgress?.(fullContent);
                } else if (chunk.type === 'reasoning') {
                    // Prepend a "thinking" block or just append to content if needed
                    // For now, we'll just log it or we could use a specific formatting
                    // Usually reasoning is not part of the final answer but helpful for debugging
                    console.log('[AI Reasoning]', chunk.textDelta);
                } else if (chunk.type === 'tool-call') {
                    console.log(`[AI Stream] tool-call: ${chunk.toolName}`, chunk.args);
                    fullContent += `\n\n> 🔍 ${t('ai.retrieving')} (${chunk.toolName})...\n\n`;
                    onProgress?.(fullContent);
                } else if (chunk.type === 'tool-result') {
                    try {
                        const chunkAny = chunk as any;
                        const resultData = chunkAny.result ?? chunkAny.output ?? chunkAny.content;
                        const resultStr = resultData != null ? String(resultData) : '(no result data)';

                        // Clean GraphRAG prefix if present
                        let cleanStr = resultStr.replace(/SUCCESS: (Global|Local) Search Response:/i, '').trim();

                        // Parse any internal directives to clean UI text
                        if (cleanStr.includes(`PLEASE RESPOND TO THE USER IN ${targetLangUpper}`)) {
                            cleanStr = t('ai.notFound');
                        }

                        console.log(`[AI Stream] tool-result:`, cleanStr.substring(0, 200) + '...');

                        // Update UI seamlessly to show we are formatting the AI response
                        const searchingBanner = `\n\n> 🔍 ${t('ai.retrieving')} (${chunkAny.toolName})...\n\n`;
                        if (fullContent.includes(searchingBanner)) {
                            fullContent = fullContent.replace(searchingBanner, `\n\n> ✅ ${t('ai.retrieveDone')} (${chunkAny.toolName})\n\n`);
                        }

                        // DeepSeek usually skips text generation after a tool result, so we MUST append the tool text here
                        fullContent += `**🔍 ${t('ai.retrieveResult')}**\n\n${cleanStr}\n\n`;
                        onProgress?.(fullContent);
                    } catch (e) {
                        console.log(`[AI Stream] tool-result (could not stringify)`);
                    }
                } else if (chunk.type === 'step-finish') {
                    console.log(`[AI Stream] step-finish, usage:`, (chunk as any).usage);
                } else {
                    console.log(`[AI Stream] chunk type: ${chunk.type}`);
                }
            }

            const usage = await result.usage;

            return {
                content: fullContent,
                usage: usage ? {
                    promptTokens: (usage as any).promptTokens as number || 0,
                    completionTokens: (usage as any).completionTokens as number || 0,
                    totalTokens: (usage as any).totalTokens as number || 0,
                } : undefined
            };

        } catch (error) {
            console.error('AI generation error:', error);
            throw error;
        }
    }

    /**
     * Proofread and correct ASR-transcribed text using LLM.
     * Returns the corrected full text via streaming.
     */
    async proofreadContent(
        text: string,
        settings?: GenerateRequest['settings'],
        signal?: AbortSignal,
        onProgress?: (partial: string) => void
    ): Promise<string> {
        const provider = this.getProvider(settings);
        if (!provider) {
            throw new Error(t('ai.noApiKey'));
        }

        const modelName = settings?.aiModel || 'deepseek-v4-flash';

        const systemPrompt = t('ai.proofreadSystemPrompt');

        try {
            const result = await streamText({
                model: provider.chat(modelName),
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                temperature: 0.3, // Low temperature for precise correction
                abortSignal: signal,
            } as any);

            let fullContent = '';
            for await (const chunk of result.fullStream) {
                if (chunk.type === 'text-delta') {
                    fullContent += chunk.text;
                    onProgress?.(fullContent);
                }
            }

            return fullContent;
        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw error; // Re-throw abort so caller can handle gracefully
            }
            console.error('Proofreading error:', error);
            throw new Error(t('ai.proofreadFail', { error: error.message }));
        }
    }

    private generateMockResponse(request: GenerateRequest): Promise<GenerateResponse> {
        return new Promise((resolve) => {
            setTimeout(() => {
                const { prompt, context } = request;
                const contextSummary = context.map(c => `- [${c.dataType}] ${c.title}`).join('\n');

                resolve({
                    content: `**[MOCK RESPONSE - API Key missing]**\n\nPrompt: "${prompt}"\n\nContext Used:\n${contextSummary}\n\nTo use real AI, ensure \`VITE_DEEPSEEK_API_KEY\` is set in \`.env\` and restart the dev server.`
                });
            }, 1000);
        });
    }

    private async readDocumentContext(c: AIContextItem): Promise<string> {
        const MAX_CHARS = 100000; // ~50k-70k tokens, very safe for 128k/64k context limits
        let text = '';
        if (c.fileUrl) {
            try {
                let filePath = c.fileUrl;
                if (filePath.startsWith('local-file://')) {
                    filePath = decodeURIComponent(filePath.replace('local-file://', ''));
                    // Use native DocumentParser via IPC
                    text = await window.electronAPI.vault.parseFile(filePath) || '';
                } else if (filePath.startsWith('blob:') || filePath.startsWith('http')) {
                    // Blob/URL parsing
                    const ext = c.fileName ? c.fileName.substring(c.fileName.lastIndexOf('.')) : '.txt';
                    text = await window.electronAPI.vault.parseUrl(filePath, ext) || '';
                }
            } catch (error) {
                console.error("Failed to dynamically read document in aiService:", error);
            }
        }
        
        if (!text) {
            text = c.content || '';
        }

        if (text.length > MAX_CHARS) {
            throw new Error(t('ai.documentTooLarge', { title: c.title, length: text.length }));
        }
        return text;
    }

    private async readTableContext(c: AIContextItem): Promise<string> {
        if (c.fileUrl) {
            try {
                let arrayBuffer: ArrayBuffer | null = null;
                let filePath = c.fileUrl;

                if (filePath.startsWith('local-file://')) {
                    filePath = decodeURIComponent(filePath.replace('local-file://', ''));
                    const base64Str = await window.electronAPI.vault.readFileBase64(filePath);
                    if (base64Str) {
                        const binStr = atob(base64Str);
                        const arr = new Uint8Array(binStr.length);
                        for (let i = 0; i < binStr.length; i++) {
                            arr[i] = binStr.charCodeAt(i);
                        }
                        arrayBuffer = arr.buffer;
                    }
                } else if (filePath.startsWith('blob:') || filePath.startsWith('http')) {
                    const res = await fetch(filePath);
                    arrayBuffer = await res.arrayBuffer();
                }

                if (arrayBuffer) {
                    let workbook;
                    if (c.fileName?.toLowerCase().endsWith('.csv')) {
                        try {
                            const text = new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
                            workbook = XLSX.read(text, { type: 'string' });
                        } catch (e) {
                            const text = new TextDecoder('gbk').decode(arrayBuffer);
                            workbook = XLSX.read(text, { type: 'string' });
                        }
                    } else {
                        workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    }

                    const sheetName = c.selectedSheet || workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                    
                    const MAX_ROWS = 50000; // Allow much larger rows since we are not truncating silently anymore, but checking overall string length
                    const MAX_CHARS = 100000;
                    let tableStr = JSON.stringify(rows.slice(0, MAX_ROWS));
                    
                    if (tableStr.length > MAX_CHARS) {
                        throw new Error(t('ai.tableTooLarge', { title: c.title, length: tableStr.length }));
                    }
                    return tableStr;
                }
            } catch (error) {
                console.error("Failed to dynamically read table file in aiService:", error);
                // Fallback to the saved preview state
            }
        }
        
        // Fallback for old nodes without fileUrl or if file reading failed
        const MAX_ROWS_FB = 50000;
        const MAX_CHARS_FB = 100000;
        let fallbackStr = JSON.stringify(c.data?.slice(0, MAX_ROWS_FB) || []);
        
        if (fallbackStr.length > MAX_CHARS_FB) {
            throw new Error(t('ai.tableTooLarge', { title: c.title, length: fallbackStr.length }));
        }
        return fallbackStr;
    }
}

export const aiService = new AIService();
