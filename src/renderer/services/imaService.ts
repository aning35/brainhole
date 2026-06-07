export interface ImaOptions {
    clientId: string;
    apiKey: string;
}

// Custom error class that carries IMA error code
export class ImaApiError extends Error {
    code: number;
    constructor(code: number, msg: string) {
        super(msg);
        this.code = code;
        this.name = 'ImaApiError';
    }
}

const IMA_BASE_URL = 'https://ima.qq.com';

async function imaApi<T>(path: string, body: any, options: ImaOptions): Promise<T> {
    const { clientId, apiKey } = options;

    if (!clientId || !apiKey) {
        throw new Error('Missing IMA credentials');
    }

    const url = `${IMA_BASE_URL}/${path}`;
    const reqOptions = {
        method: 'POST',
        headers: {
            'ima-openapi-clientid': clientId,
            'ima-openapi-apikey': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    };
    
    console.log('[IMA_DEBUG] Sending IPC fetch with headers:', reqOptions.headers);

    let responseOk = false;
    let responseStatus = 0;
    let responseJson: any = null;

    if (window.electronAPI?.net?.fetch) {
        const res = await window.electronAPI.net.fetch(url, reqOptions);
        responseOk = res.ok;
        responseStatus = res.status;
        if (res.ok && res.text) {
            try {
                responseJson = JSON.parse(res.text);
            } catch (e) {
                throw new Error('Failed to parse IMA response');
            }
        } else if (!res.ok) {
            // Try to extract IMA's error code and message from the response body
            let errCode = 0;
            let errMsg = '';
            try {
                const errBody = res.text ? JSON.parse(res.text) : null;
                if (errBody?.code) errCode = errBody.code;
                if (errBody?.msg) errMsg = errBody.msg;
            } catch (_) {}
            
            throw new ImaApiError(errCode, errMsg || `IMA API 请求失败 (${res.status})`);
        }
    } else {
        const response = await fetch(url, reqOptions);
        responseOk = response.ok;
        responseStatus = response.status;
        if (responseOk) {
            responseJson = await response.json();
        }
    }

    if (!responseOk) {
        throw new Error(`IMA API Error: HTTP ${responseStatus}`);
    }

    if (responseJson.code !== 0) {
        throw new Error(responseJson.msg || 'Unknown IMA Error');
    }

    return responseJson.data;
}

export const imaService = {
    async searchKnowledgeBase(options: ImaOptions, query: string = '', cursor: string = '', limit: number = 20) {
        return imaApi<any>('openapi/wiki/v1/search_knowledge_base', { query, cursor, limit }, options);
    },

    async searchKnowledge(options: ImaOptions, knowledgeBaseId: string, query: string, cursor: string = '') {
        return imaApi<any>('openapi/wiki/v1/search_knowledge', { knowledge_base_id: knowledgeBaseId, query, cursor }, options);
    },

    async getKnowledgeBase(options: ImaOptions, ids: string[]) {
        return imaApi<any>('openapi/wiki/v1/get_knowledge_base', { ids }, options);
    },

    async getKnowledgeList(options: ImaOptions, knowledgeBaseId: string, folderId?: string, cursor: string = '', limit: number = 50, query?: string) {
        const body: any = { knowledge_base_id: knowledgeBaseId, cursor, limit };
        if (folderId) {
            body.folder_id = folderId;
        }
        if (query) {
            body.query = query;
        }
        return imaApi<any>('openapi/wiki/v1/get_knowledge_list', body, options);
    },

    async getMediaInfo(options: ImaOptions, mediaId: string) {
        return imaApi<any>('openapi/wiki/v1/get_media_info', { media_id: mediaId }, options);
    },

    async getNoteContent(options: ImaOptions, docId: string) {
        return imaApi<any>('openapi/note/v1/get_doc_content', { doc_id: docId }, options);
    },

    async searchAndFetchContent(options: ImaOptions, knowledgeBaseId: string, folderId?: string, query: string = '', limit: number = 3) {
        let items: any[] = [];
        
        if (query) {
            // 1. Semantic search if query is provided
            const searchRes = await this.searchKnowledge(options, knowledgeBaseId, query, '');
            items = searchRes.info_list || [];
            
            // 2. Filter by folder if requested
            if (folderId && folderId !== knowledgeBaseId) {
                items = items.filter((item: any) => item.parent_folder_id === folderId);
            }
            
            items = items.slice(0, limit);
        } else {
            // Fallback to get_knowledge_list if no query
            const listRes = await this.getKnowledgeList(options, knowledgeBaseId, folderId, '', limit);
            items = listRes.knowledge_list || [];
        }
        
        if (items.length === 0) {
            return [];
        }

        // 2. Fetch content for each matched item
        const results = await Promise.all(items.map(async (item: any) => {
            try {
                // media_type: 11=note, 99=folder, 1/2/3/6/9=files/urls
                if (item.media_type === 11 || item.media_type === 1) {
                    // Notes: extract notebook_id from media_id to avoid extra get_media_info call
                    // media_id format: note_{hash}_{32digits} → notebook_id = first 16 digits of suffix
                    let notebookId: string | undefined;
                    const parts = item.media_id.split('_');
                    const lastPart = parts[parts.length - 1] || '';
                    if (lastPart.length > 16 && /^\d+$/.test(lastPart)) {
                        notebookId = lastPart.substring(0, 16);
                    }
                    
                    // Fallback: call get_media_info only if we can't extract notebook_id
                    if (!notebookId) {
                        try {
                            const infoRes = await this.getMediaInfo(options, item.media_id);
                            notebookId = infoRes.notebook_ext_info?.notebook_id;
                        } catch (e) {
                            console.warn(`get_media_info failed for ${item.title}, skipping`);
                        }
                    }

                    if (notebookId) {
                        try {
                            const contentRes = await this.getNoteContent(options, notebookId);
                            if (contentRes?.content) {
                                return {
                                    id: item.media_id,
                                    title: item.title,
                                    type: 'note',
                                    content: contentRes.content
                                };
                            }
                        } catch (e) {
                            console.warn(`get_doc_content failed for ${item.title}, using title only`);
                        }
                    }
                    return {
                        id: item.media_id,
                        title: item.title,
                        type: 'note',
                        content: item.highlight_content || `[Note: ${item.title}]`
                    };
                } else if (item.media_type !== 99) {
                    // Non-note, non-folder: return title + highlight directly (no extra API call)
                    return {
                        id: item.media_id,
                        title: item.title,
                        type: 'media',
                        content: item.highlight_content || `[Document: ${item.title}]`
                    };
                }
            } catch (err) {
                console.error(`Failed to fetch content for ${item.title}:`, err);
            }
            return null;
        }));

        return results.filter(Boolean);
    },
};
