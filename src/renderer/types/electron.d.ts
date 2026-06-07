export interface ElectronAPI {
    getVersion: () => Promise<string>;
    onMenuAction: (callback: (action: string) => void) => void;
    showSaveDialog: (options: any) => Promise<any>;
    showOpenDialog: (options: any) => Promise<any>;
    platform: string;
    setFullscreen: (fullscreen: boolean) => Promise<boolean>;
    isFullscreen: () => Promise<boolean>;
    hideTrafficLights: () => Promise<boolean>;
    showTrafficLights: () => Promise<boolean>;

    // Database operations
    db: {
        getAll: () => Promise<Array<{
            id: string;
            name: string;
            thumbnail?: string;
            created_at: number;
            updated_at: number;
            tags?: string; // JSON string
        }>>;
        getOne: (id: string) => Promise<{
            id: string;
            name: string;
            content: string; // JSON string
            thumbnail?: string;
            created_at: number;
            updated_at: number;
            tags?: string;
        } | undefined>;
        save: (canvas: {
            id: string;
            name: string;
            content: string;
            thumbnail?: string;
            created_at: number;
            updated_at: number;
            tags?: string;
        }) => Promise<void>;
        delete: (id: string) => Promise<void>;
        getFolders: () => Promise<Array<{
            id: string;
            name: string;
            parent_id?: string;
            created_at: number;
            updated_at: number;
        }>>;
        createFolder: (folder: {
            id: string;
            name: string;
            parent_id?: string;
            created_at: number;
            updated_at: number;
        }) => Promise<void>;
        deleteFolder: (id: string) => Promise<void>;
        updateFolder: (data: { id: string; name: string }) => Promise<void>;
        updateCanvasFolder: (data: { canvasId: string; folderId: string | null; displayOrder?: number }) => Promise<void>;
        updateFolderOrder: (data: { id: string; order: number }) => Promise<void>;
        updateCanvasOrder: (data: { id: string; order: number }) => Promise<void>;
        reorderItem: (data: { type: 'folder' | 'canvas'; id: string; targetId: string; position: 'top' | 'bottom' | 'inside' }) => Promise<void>;
        // Knowledge Base (Vault) operations
        vault: {
            select: () => Promise<string | null>;
            getStructure: (vaultPath: string) => Promise<{ folders: any[]; canvases: any[] }>;
            readCanvas: (filePath: string) => Promise<any>;
            saveCanvas: (data: { filePath: string; name?: string; content: string }) => Promise<string>;
            saveFile: (data: { filePath: string; name: string; text?: string; buffer?: ArrayBuffer }) => Promise<string>;
            deleteItem: (filePath: string) => Promise<boolean>;
            renameItem: (data: { oldPath: string; newPath: string }) => Promise<string>;
            revealInExplorer: (filePath: string) => Promise<boolean>;
            copyItem: (data: { oldPath: string; newPath: string }) => Promise<string>;
        };
    };

    // GraphRAG operations
    graph: {
        list: () => Promise<any[]>;
        get: (id: string) => Promise<any>;
        save: (graph: any) => Promise<void>;
        delete: (id: string) => Promise<void>;
        index: (data: any) => Promise<any>;
        search: (data: { filePath: string, query: string, method: 'local' | 'global' }) => Promise<string>;
        getNodes: (filePath: string) => Promise<any[]>;
        getEdges: (filePath: string) => Promise<any[]>;
        onStatusChanged: (callback: (data: { filePath: string, status: string, message?: string }) => void) => () => void;
        onLog: (callback: (data: { filePath: string, message: string, type?: 'info' | 'error' | 'warning' }) => void) => () => void;
    };
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
