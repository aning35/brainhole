import { StateCreator } from 'zustand';
import { CanvasMetadata, mapDBRecordToMetadata } from '../../services/storageService';
import { CanvasSessionState } from '../../types/store';
import { CanvasState } from '../canvasStore';

// Cache for IMA note content loaded via API (ima-note:// protocol)
export const imaNoteContentCache = new Map<string, string>();

export interface CanvasSlice {
    canvases: CanvasMetadata[];
    activeCanvasId: string | null;
    openCanvasIds: string[];
    previewCanvasId: string | null;
    canvasSessionStates: Record<string, CanvasSessionState>;

    loadCanvases: () => Promise<void>;
    createNewCanvas: (name?: string, folderId?: string) => Promise<string>;
    createNewGraph: (name?: string, folderId?: string) => Promise<string>;
    createNewMarkdown: (name?: string, folderId?: string) => Promise<string>;
    saveCanvas: (canvas: any) => Promise<void>;
    saveCanvasById: (id: string) => Promise<void>;
    deleteCanvas: (id: string) => Promise<void>;
    moveCanvasToFolder: (canvasId: string, folderId: string | null, displayOrder?: number) => Promise<void>;
    updateCanvasOrder: (canvasId: string, order: number) => Promise<void>;
    reorderItem: (type: 'folder' | 'canvas', id: string, targetId: string, position: 'top' | 'bottom' | 'inside') => Promise<void>;
    renameCanvas: (id: string, name: string) => Promise<void>;

    // Session management
    openCanvas: (id: string, options?: { replace?: boolean }) => Promise<void>;
    closeCanvas: (id: string) => Promise<void>;
    setActiveCanvas: (id: string) => Promise<void>;
    updateCanvasTextContent: (id: string, text: string) => void;
    updateCanvasViewport: (id: string, viewport: any) => void;

    // Toolbar actions
    saveCurrentCanvas: () => Promise<void>;
    exportCanvas: () => any;
    loadCanvas: (data: any) => void;
    duplicateCanvas: (id: string, targetFolderId?: string) => Promise<string>;
}

export const createCanvasSlice: StateCreator<
    CanvasState,
    [],
    [],
    CanvasSlice
> = (set, get) => ({
    canvases: [],
    activeCanvasId: null,
    openCanvasIds: [],
    previewCanvasId: null,
    canvasSessionStates: {},

    duplicateCanvas: async (id, targetFolderId) => {
        const { vaultPath, canvases } = get();
        const sourceMetadata = canvases.find(c => c.id === id);
        if (!sourceMetadata) return '';

        if (vaultPath) {
            const parentPath = targetFolderId || id.substring(0, Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\')));
            const separator = parentPath.includes('\\') ? '\\' : '/';

            // Handle filename and extension correctly
            const fullFileName = id.substring(id.lastIndexOf(separator) + 1);
            const dotIdx = fullFileName.lastIndexOf('.');
            const baseName = dotIdx !== -1 ? fullFileName.substring(0, dotIdx) : fullFileName;
            const ext = dotIdx !== -1 ? fullFileName.substring(dotIdx) : '';

            let newName = `${baseName} (副本)`;
            let newPath = `${parentPath}${separator}${newName}${ext}`;

            let counter = 1;
            while (await window.electronAPI.vault.checkFileExists(newPath)) {
                counter++;
                newName = `${baseName} (副本 ${counter})`;
                newPath = `${parentPath}${separator}${newName}${ext}`;
            }

            // Use the main process copyItem which handles generic files
            await window.electronAPI.vault.copyItem({ oldPath: id, newPath });

            await get().loadCanvases();
            // If it's a canvas or editable text, we might want to open it
            if (ext === '.canvas' || ext === '.md' || ext === '.txt' || ext === '.log') {
                await get().openCanvas(newPath);
            }
            return newPath;
        } else {
            const sourceRecord = await window.electronAPI.db.getOne(id);
            if (!sourceRecord) return '';

            const newId = crypto.randomUUID();
            const now = Date.now();
            const newCanvas = {
                ...sourceRecord,
                id: newId,
                name: `${sourceRecord.name} (副本)`,
                folder_id: targetFolderId !== undefined ? targetFolderId : sourceRecord.folder_id,
                created_at: now,
                updated_at: now,
            };

            await window.electronAPI.db.save(newCanvas);
            await get().loadCanvases();
            await get().openCanvas(newId);
            return newId;
        }
    },

    loadCanvases: async () => {
        const { vaultPath } = get();
        if (vaultPath) {
            const structure = await window.electronAPI.vault.getStructure(vaultPath);
            set({
                canvases: structure.canvases.map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    updatedAt: new Date(c.updatedAt),
                    createdAt: new Date(c.updatedAt), // Filesystem might not track birthtime consistently
                    folderId: c.parentId,
                    tags: []
                }))
            });
        } else {
            const data = await window.electronAPI.db.getAll();
            set({ canvases: data.map(mapDBRecordToMetadata) });
        }
    },

    createNewCanvas: async (name, folderId) => {
        const { vaultPath } = get();
        // Generate default name if not provided
        let finalName = name;
        if (!finalName) {
            const canvases = get().canvases;
            let counter = 1;
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const proposedName = `未命名画布 ${counter}`;
                if (!canvases.find(c => c.name === proposedName)) {
                    finalName = proposedName;
                    break;
                }
                counter++;
            }
        }

        const now = Date.now();
        const content = JSON.stringify({ nodes: [], edges: [] });

        if (vaultPath) {
            // In Vault mode, folderId is the absolute path of the directory
            const parentPath = folderId || vaultPath;
            const filePath = await window.electronAPI.vault.saveCanvas({
                filePath: parentPath,
                name: finalName,
                content
            });
            await get().loadCanvases();
            await get().openCanvas(filePath);
            return filePath;
        } else {
            const id = crypto.randomUUID();
            const newCanvas = {
                id,
                name: finalName || '未命名',
                content,
                created_at: now,
                updated_at: now,
                folder_id: folderId,
                tags: '[]'
            };

            await window.electronAPI.db.save(newCanvas);
            await get().loadCanvases();
            await get().openCanvas(id);
            return id;
        }
    },

    createNewGraph: async (name, folderId) => {
        const { vaultPath } = get();
        if (!vaultPath) throw new Error('Vault mode required for graphs');

        let finalName = name;
        if (!finalName) {
            const canvases = get().canvases;
            let counter = 1;
            while (true) {
                const proposedName = `未命名图谱 ${counter}`;
                if (!canvases.find(c => c.name === proposedName)) {
                    finalName = proposedName;
                    break;
                }
                counter++;
            }
        }

        const now = Date.now();
        const content = JSON.stringify({
            file_paths: [],
            status: 'idle',
            updatedAt: now
        });

        const parentPath = folderId || vaultPath;
        const filePath = await window.electronAPI.vault.saveGraph({
            filePath: parentPath,
            name: finalName,
            content
        });
        await get().loadCanvases();
        await get().openCanvas(filePath);
        return filePath;
    },

    createNewMarkdown: async (name, folderId) => {
        const { vaultPath } = get();
        if (!vaultPath) throw new Error('Vault mode required for markdown files');

        let finalName = name;
        if (!finalName) {
            const canvases = get().canvases;
            let counter = 1;
            while (true) {
                const proposedName = `未命名文档 ${counter}`;
                if (!canvases.find(c => c.name === proposedName)) {
                    finalName = proposedName;
                    break;
                }
                counter++;
            }
        }

        const parentPath = folderId || vaultPath;
        const fileName = `${finalName}.md`;
        const content = `# ${finalName}\n\n`;

        const filePath = await window.electronAPI.vault.saveFile({
            filePath: parentPath,
            name: fileName,
            text: content,
        });
        await get().loadCanvases();
        await get().openCanvas(filePath);
        return filePath;
    },

    saveCanvas: async (canvas) => {
        const { vaultPath } = get();
        if (vaultPath) {
            await window.electronAPI.vault.saveCanvas({
                filePath: canvas.id, // In vault mode, id is the path
                content: canvas.content
            });
            await get().loadCanvases();
        } else {
            const dbCanvas = {
                ...canvas,
                created_at: canvas.createdAt instanceof Date ? canvas.createdAt.getTime() : canvas.created_at,
                updated_at: Date.now(),
                folder_id: canvas.folderId !== undefined ? canvas.folderId : canvas.folder_id,
                display_order: canvas.displayOrder !== undefined ? canvas.displayOrder : canvas.display_order,
                tags: Array.isArray(canvas.tags) ? JSON.stringify(canvas.tags) : canvas.tags
            };
            await window.electronAPI.db.save(dbCanvas);
            await get().loadCanvases();
        }
    },

    saveCanvasById: async (id) => {
        const { activeCanvasId, nodes, edges, canvases, canvasSessionStates, saveCanvas, vaultPath } = get();
        const currentCanvas = canvases.find(c => c.id === id);
        if (!currentCanvas) return;

        const session = canvasSessionStates[id];
        const ext = id.substring(id.lastIndexOf('.')).toLowerCase();
        const isMarkdown = ext === '.md';
        const isText = ext === '.txt' || ext === '.log' || ext === '.json' || ext === '.yaml' || ext === '.yml';
        const isGraph = ext === '.graph';

        if (isGraph && vaultPath) {
            if (session && session.graphData) {
                await window.electronAPI.vault.saveGraph({
                    filePath: id,
                    content: JSON.stringify(session.graphData)
                });
                await get().loadCanvases();
            }
            return;
        }

        if ((isMarkdown || isText) && vaultPath) {
            // Bypass JSON canvas saving natively and write the file directly
            if (session) {
                const textContent = id === activeCanvasId ? (session.textContent || '') : (session.textContent || '');
                const separator = id.includes('\\') ? '\\' : '/';
                const fileDir = id.substring(0, id.lastIndexOf(separator));
                // Extract filename with extension from the ID (which is the full path)
                const fullName = id.substring(id.lastIndexOf(separator) + 1);

                await window.electronAPI.vault.saveFile({
                    filePath: fileDir,
                    name: fullName,
                    text: textContent
                });
                const now = new Date();
                set(state => ({
                    canvases: state.canvases.map(c => c.id === id ? { ...c, updatedAt: now } : c)
                }));
                // Refresh to ensure sidebar/filetree is in sync
                await get().loadCanvases();
            }
            return;
        }

        // IMPORTANT: Prevent auto-save from overwriting PDFs and other binary/readonly files with empty Canvas JSON!
        const isCanvas = ext === '.canvas' || ext === '';
        if (vaultPath && !isCanvas) {
            return; // It's an unsupported/read-only file type (e.g. .pdf), do not attempt to save it as JSON
        }



        let contentNodes = [];
        let contentEdges = [];

        if (id === activeCanvasId) {
            contentNodes = nodes;
            contentEdges = edges;
        } else {
            const session = canvasSessionStates[id];
            if (session) {
                contentNodes = session.nodes;
                contentEdges = session.edges;
            } else {
                return;
            }
        }

        const content = JSON.stringify({ nodes: contentNodes, edges: contentEdges });
        const now = new Date();

        await saveCanvas({
            ...currentCanvas,
            content,
            updatedAt: now,
        });
    },

    saveCurrentCanvas: async () => {
        const { activeCanvasId } = get();
        if (activeCanvasId) {
            await get().saveCanvasById(activeCanvasId);
        }
    },

    exportCanvas: () => {
        const { nodes, edges } = get();
        return { nodes, edges, version: '1.0' };
    },

    loadCanvas: (data: any) => {
        if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
            set(_state => ({
                nodes: data.nodes,
                edges: data.edges,
                // Reset history on load?
                history: { past: [], future: [] }
            }));
        }
    },

    deleteCanvas: async (id) => {
        const { vaultPath } = get();
        if (vaultPath) {
            await window.electronAPI.vault.deleteItem(id);
        } else {
            await window.electronAPI.db.delete(id);
        }

        // Remove from session state without saving
        set(state => {
            const newOpenIds = state.openCanvasIds.filter(oid => oid !== id);
            const newSessionStates = { ...state.canvasSessionStates };
            delete newSessionStates[id];

            let newActiveId = state.activeCanvasId;
            if (state.activeCanvasId === id) {
                newActiveId = newOpenIds.length > 0 ? newOpenIds[newOpenIds.length - 1] : null;
            }

            return {
                openCanvasIds: newOpenIds,
                canvasSessionStates: newSessionStates,
                activeCanvasId: newActiveId,
                nodes: newActiveId ? state.canvasSessionStates[newActiveId]?.nodes || [] : [],
                edges: newActiveId ? state.canvasSessionStates[newActiveId]?.edges || [] : []
            };
        });

        await get().loadCanvases();
    },

    moveCanvasToFolder: async (canvasId, folderId, displayOrder = 0) => {
        const { vaultPath } = get();
        if (vaultPath) {
            const targetDir = folderId || vaultPath;
            const lastSeparatorIndex = Math.max(canvasId.lastIndexOf('/'), canvasId.lastIndexOf('\\'));
            const fileName = canvasId.substring(lastSeparatorIndex + 1);
            const separator = targetDir.includes('\\') ? '\\' : '/';
            const newPath = `${targetDir}${separator}${fileName}`;
            if (canvasId !== newPath) {
                await window.electronAPI.vault.renameItem({ oldPath: canvasId, newPath });
                
                // If it's a .graph file, also move its index folder
                if (canvasId.endsWith('.graph')) {
                    const oldIndexPath = `${canvasId}_index`;
                    const newIndexPath = `${newPath}_index`;
                    try {
                        await window.electronAPI.vault.renameItem({ oldPath: oldIndexPath, newPath: newIndexPath });
                    } catch (e) {
                         // Ignore if index doesn't exist
                    }
                }
            }
        } else {
            await window.electronAPI.db.updateCanvasFolder({ canvasId, folderId, displayOrder });
        }
        await get().loadCanvases();
    },

    updateCanvasOrder: async (canvasId, order) => {
        const { vaultPath } = get();
        if (!vaultPath) {
            await window.electronAPI.db.updateCanvasOrder({ id: canvasId, order });
            await get().loadCanvases();
        }
    },

    reorderItem: async (type, id, targetId, position) => {
        const { vaultPath } = get();
        if (!vaultPath) {
            await window.electronAPI.db.reorderItem({ type, id, targetId, position });
            if (type === 'folder') {
                await get().loadFolders();
            } else {
                await get().loadCanvases();
            }
        }
    },

    renameCanvas: async (id, name) => {
        const { vaultPath } = get();
        if (vaultPath) {
            // Find directory and extension
            const lastSeparatorIndex = Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\'));
            const dir = id.substring(0, lastSeparatorIndex);
            const separator = id.includes('\\') ? '\\' : '/';
            // Preserve the original file extension instead of forcing .canvas
            const oldFileName = id.substring(lastSeparatorIndex + 1);
            const lastDotIdx = oldFileName.lastIndexOf('.');
            const ext = lastDotIdx !== -1 ? oldFileName.substring(lastDotIdx) : '.canvas';
            const newPath = `${dir}${separator}${name}${ext}`;

            if (id !== newPath) {
                await window.electronAPI.vault.renameItem({ oldPath: id, newPath });

                // Update open ids and session states if it was open
                set(state => {
                    const newOpenIds = state.openCanvasIds.map(oid => oid === id ? newPath : oid);
                    const newSessionStates = { ...state.canvasSessionStates };
                    if (newSessionStates[id]) {
                        newSessionStates[newPath] = {
                            ...newSessionStates[id],
                            canvasId: newPath,
                            canvasName: name
                        };
                        delete newSessionStates[id];
                    }
                    return {
                        openCanvasIds: newOpenIds,
                        activeCanvasId: state.activeCanvasId === id ? newPath : state.activeCanvasId,
                        canvasSessionStates: newSessionStates
                    };
                });
            }
        } else {
            const canvas = await window.electronAPI.db.getOne(id);
            if (canvas) {
                await window.electronAPI.db.save({ ...canvas, name });
                // Update session state name if open
                set(state => {
                    const session = state.canvasSessionStates[id];
                    if (session) {
                        return {
                            canvasSessionStates: {
                                ...state.canvasSessionStates,
                                [id]: { ...session, canvasName: name }
                            }
                        };
                    }
                    return {};
                });
            }
        }
        await get().loadCanvases();
    },

    openCanvas: async (id, options = {}) => {
        const { openCanvasIds, activeCanvasId, vaultPath } = get();

        // Helper to normalize paths for comparison and storage
        const normalizePath = (p: string) => p.replace(/\\/g, '/');
        const normalizedId = normalizePath(id);

        // If already open AND session is loaded, just activate it
        const existingId = openCanvasIds.find(oid => normalizePath(oid) === normalizedId);
        if (existingId && get().canvasSessionStates[existingId]) {
            await get().setActiveCanvas(existingId);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('switch-to-canvas'));
            }
            return;
        }

        // Save current session before opening/switching
        if (activeCanvasId) {
            const { nodes, edges, history } = get();
            set(state => ({
                canvasSessionStates: {
                    ...state.canvasSessionStates,
                    [activeCanvasId]: {
                        ...(state.canvasSessionStates[activeCanvasId] || {}),
                        nodes,
                        edges,
                        history
                    }
                }
            }));
            // Save to DB
            await get().saveCanvasById(activeCanvasId);
        }

        // Load canvas data
        let saved;
        let content;
        
        const isImaNote = id.startsWith('ima-note://');
        const isHttpUrl = id.startsWith('http://') || id.startsWith('https://');
        let ext = id.substring(id.lastIndexOf('.')).toLowerCase();
        
        if (isImaNote) {
            ext = '.md';
        } else if (isHttpUrl) {
            try {
                const urlObj = new URL(id);
                const mediaTitle = urlObj.searchParams.get('media_title') || '';
                if (mediaTitle.includes('.')) {
                    ext = mediaTitle.substring(mediaTitle.lastIndexOf('.')).toLowerCase();
                } else {
                    const pathname = urlObj.pathname;
                    if (pathname.includes('.')) {
                        ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
                    } else {
                        ext = '';
                    }
                }
            } catch (e) {}
        }
        
        const isMarkdown = ext === '.md';
        const isText = ext === '.txt' || ext === '.log' || ext === '.json' || ext === '.yaml' || ext === '.yml';
        const isCanvas = ext === '.canvas';
        const isGraph = ext === '.graph';

        if (isImaNote) {
            // IMA note: read pre-fetched content from cache
            const noteTitle = decodeURIComponent(id.replace('ima-note://', '').split('?')[0] || 'IMA Note');
            const textContent = imaNoteContentCache.get(id) || '';
            saved = { id, name: noteTitle, content: '' };
            content = { type: 'file', extension: '.md', textContent };
        } else if (isHttpUrl) {
            // For URLs, don't read from vault or DB. Just create a virtual file record.
            let name = id.substring(Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\')) + 1) || 'URL';
            if (id.includes('?')) {
                try {
                    const urlObj = new URL(id);
                    name = urlObj.searchParams.get('media_title') || urlObj.pathname.split('/').pop() || 'URL';
                } catch (e) {}
            }
            
            let textContent = '';
            if (isMarkdown || isText) {
                try {
                    const base64Str = await window.electronAPI.vault.readUrlBase64(id);
                    if (base64Str) {
                        const binStr = atob(base64Str);
                        const bytes = new Uint8Array(binStr.length);
                        for (let i = 0; i < binStr.length; i++) {
                            bytes[i] = binStr.charCodeAt(i);
                        }
                        textContent = new TextDecoder('utf-8').decode(bytes);
                    }
                } catch (e) {
                    console.error('Failed to fetch remote text:', e);
                }
            }
            
            saved = { id, name, content: '' };
            content = { type: 'file', extension: ext, textContent };
        } else if (vaultPath) {
            if (isMarkdown || isText) {
                saved = await window.electronAPI.vault.readFile(id);
                content = { textContent: saved?.content || '' };
            } else if (isCanvas) {
                saved = await window.electronAPI.vault.readCanvas(id);
                content = saved ? JSON.parse(saved.content) : { nodes: [], edges: [] };
            } else if (isGraph) {
                saved = await window.electronAPI.vault.readCanvas(id); // readCanvas is essentially readJson
                content = { graphData: saved ? JSON.parse(saved.content) : null };
            } else {
                // For other types (pdf, excel, word, csv), just treat as metadata for now
                // We might need a generic file reader or just stat info
                saved = { id, name: id.substring(Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\')) + 1), content: '' };
                content = { type: 'file', extension: ext };
            }
        } else {
            saved = await window.electronAPI.db.getOne(id);
            content = saved && saved.content ? JSON.parse(saved.content) : { nodes: [], edges: [] };
        }

        if (!saved) return;

        // Implementation of replacement logic
        set(state => {
            let nextOpenIds = [...state.openCanvasIds];
            let nextPreviewId = state.previewCanvasId;
            const nextSessionStates = { ...state.canvasSessionStates };

            if (options.replace) {
                if (nextPreviewId && normalizePath(nextPreviewId) !== normalizedId && nextOpenIds.some(oid => normalizePath(oid) === normalizePath(nextPreviewId!))) {
                    // Replace the existing preview tab
                    const idx = nextOpenIds.findIndex(oid => normalizePath(oid) === normalizePath(nextPreviewId!));
                    if (idx !== -1) {
                        nextOpenIds[idx] = id;
                        delete nextSessionStates[nextPreviewId];
                    }
                } else if (!nextOpenIds.some(oid => normalizePath(oid) === normalizedId)) {
                    nextOpenIds.push(id);
                }
                nextPreviewId = id; // Set the new preview ID
            } else {
                // Permanent tab opened
                if (nextPreviewId && normalizePath(nextPreviewId) === normalizedId) {
                    nextPreviewId = null; // Promote to permanent if it was preview
                }
                if (!nextOpenIds.some(oid => normalizePath(oid) === normalizedId)) {
                    nextOpenIds.push(id);
                }
            }

            nextSessionStates[id] = {
                canvasId: id,
                canvasName: saved.name,
                nodes: content.nodes || [],
                edges: content.edges || [],
                history: {
                    past: [],
                    future: []
                },
                ...(content.viewport ? { viewport: content.viewport } : {}),
                ...((isMarkdown || isText) ? { textContent: content.textContent } : {}),
                ...(isGraph ? { graphData: content.graphData } : {}),
                ...(content.type === 'file' ? { contentType: 'file', extension: content.extension } : {})
            };

            return {
                openCanvasIds: nextOpenIds,
                activeCanvasId: id,
                previewCanvasId: nextPreviewId,
                canvasSessionStates: nextSessionStates,
                nodes: content.nodes || [],
                edges: content.edges || [],
                history: { past: [], future: [] }
            };
        });
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('switch-to-canvas'));
        }
        await get().loadCanvases();
    },

    closeCanvas: async (id) => {
        // Save the canvas to DB before closing
        await get().saveCanvasById(id);

        set(state => {
            const newOpenIds = state.openCanvasIds.filter(oid => oid !== id);
            const newSessionStates = { ...state.canvasSessionStates };
            delete newSessionStates[id];

            let newPreviewId = state.previewCanvasId;
            if (state.previewCanvasId === id) {
                newPreviewId = null;
            }

            let newActiveId = state.activeCanvasId;
            if (state.activeCanvasId === id) {
                newActiveId = newOpenIds.length > 0 ? newOpenIds[newOpenIds.length - 1] : null;
            }

            return {
                openCanvasIds: newOpenIds,
                canvasSessionStates: newSessionStates,
                activeCanvasId: newActiveId,
                previewCanvasId: newPreviewId,
                // Only clear global nodes if no active canvas? 
                // Currently set to:
                nodes: newActiveId ? state.canvasSessionStates[newActiveId]?.nodes || [] : [],
                edges: newActiveId ? state.canvasSessionStates[newActiveId]?.edges || [] : []
            };
        });
    },

    setActiveCanvas: async (id) => {
        const { activeCanvasId, nodes, edges, history } = get();

        // 1. Save current logic
        if (activeCanvasId && activeCanvasId !== id) {
            set(state => ({
                canvasSessionStates: {
                    ...state.canvasSessionStates,
                    [activeCanvasId]: {
                        ...(state.canvasSessionStates[activeCanvasId] || {}), // Ensure object exists
                        canvasId: activeCanvasId,
                        canvasName: state.canvasSessionStates[activeCanvasId]?.canvasName || '未命名',
                        nodes,
                        edges,
                        history,
                        viewport: state.canvasSessionStates[activeCanvasId]?.viewport
                    }
                }
            }));

            // Save to DB before switching
            await get().saveCanvasById(activeCanvasId);
        }

        // 2. Restore new logic
        const session = get().canvasSessionStates[id];
        if (session) {
            set({
                activeCanvasId: id,
                nodes: session.nodes,
                edges: session.edges,
                history: session.history || { past: [], future: [] }
            });
        } else {
            // If session is missing (e.g. after refresh, since we don't persist heavy state), fetch it
            await get().openCanvas(id);
        }
    },

    updateCanvasTextContent: (id, text) => {
        set(state => {
            const session = state.canvasSessionStates[id];
            if (!session) return state;

            return {
                canvasSessionStates: {
                    ...state.canvasSessionStates,
                    [id]: {
                        ...session,
                        textContent: text
                    }
                }
            };
        });
    },

    updateCanvasViewport: (id, viewport) => {
        set(state => {
            const session = state.canvasSessionStates[id];
            if (!session) return state;

            return {
                canvasSessionStates: {
                    ...state.canvasSessionStates,
                    [id]: {
                        ...session,
                        viewport
                    }
                }
            };
        });
    },
});
