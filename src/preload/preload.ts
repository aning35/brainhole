import { contextBridge, ipcRenderer } from 'electron';

// API exposed to renderer process
const electronAPI = {
  // Application info
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Menu event listeners
  onMenuAction: (callback: (action: string) => void) => {
    const events = [
      'menu-new-canvas',
      'menu-open',
      'menu-save',
      'menu-save-as',
      'menu-undo',
      'menu-redo',
      'menu-zoom-in',
      'menu-zoom-out',
      'menu-fit-view',
      'menu-about',
    ];

    events.forEach(event => {
      ipcRenderer.on(event, () => callback(event.replace('menu-', '')));
    });
  },

  // File operations
  showSaveDialog: (options: any) => ipcRenderer.invoke('dialog:save', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('dialog:open', options),

  // Platform info
  platform: process.platform,

  // Window controls
  setFullscreen: (fullscreen: boolean) => ipcRenderer.invoke('window:set-fullscreen', fullscreen),
  isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  hideTrafficLights: () => ipcRenderer.invoke('window:hide-traffic-lights'),
  showTrafficLights: () => ipcRenderer.invoke('window:show-traffic-lights'),

  // Database operations
  db: {
    getAll: () => ipcRenderer.invoke('db:get-all'),
    getOne: (id: string) => ipcRenderer.invoke('db:get-one', id),
    save: (canvas: any) => ipcRenderer.invoke('db:save', canvas),
    delete: (id: string) => ipcRenderer.invoke('db:delete', id),
    getFolders: () => ipcRenderer.invoke('db:get-folders'),
    createFolder: (folder: any) => ipcRenderer.invoke('db:create-folder', folder),
    deleteFolder: (id: string) => ipcRenderer.invoke('db:delete-folder', id),
    updateFolder: (folder: any) => ipcRenderer.invoke('db:update-folder', folder),
    updateCanvasFolder: (data: any) => ipcRenderer.invoke('db:update-canvas-folder', data),
    updateFolderOrder: (data: any) => ipcRenderer.invoke('db:update-folder-order', data),
    updateCanvasOrder: (data: any) => ipcRenderer.invoke('db:update-canvas-order', data),
    reorderItem: (data: any) => ipcRenderer.invoke('db:reorderItem', data),
    moveFolderToParent: (data: any) => ipcRenderer.invoke('db:move-folder-to-parent', data),
  },

  // Vault operations
    vault: {
    updateSettings: (settings: any) => ipcRenderer.send('vault:update-settings', settings),
    select: () => ipcRenderer.invoke('vault:select'),
    getStructure: (vaultPath: string) => ipcRenderer.invoke('vault:get-structure', vaultPath),
    checkFileExists: (filePath: string) => ipcRenderer.invoke('vault:check-file-exists', filePath),
    readCanvas: (filePath: string) => ipcRenderer.invoke('vault:read-canvas', filePath),
    readFile: (filePath: string) => ipcRenderer.invoke('vault:read-file', filePath),
    readFileBase64: (filePath: string) => ipcRenderer.invoke('vault:read-file-base64', filePath),
    readUrlBase64: (url: string) => ipcRenderer.invoke('vault:read-url-base64', url),
    saveCanvas: (data: { filePath: string, name?: string, content: string }) => ipcRenderer.invoke('vault:save-canvas', data),
    saveGraph: (data: { filePath: string, name?: string, content: string }) => ipcRenderer.invoke('vault:save-graph', data),
    saveFile: (data: { filePath: string, name: string, text?: string, buffer?: ArrayBuffer }) => ipcRenderer.invoke('vault:save-file', data),
    createFolder: (data: { parentPath: string, name: string }) => ipcRenderer.invoke('vault:create-folder', data),
    deleteItem: (filePath: string) => ipcRenderer.invoke('vault:delete-item', filePath),
    renameItem: (data: { oldPath: string, newPath: string }) => ipcRenderer.invoke('vault:rename-item', data),
    revealInExplorer: (filePath: string) => ipcRenderer.invoke('vault:reveal-in-explorer', filePath),
    copyItem: (data: { oldPath: string, newPath: string }) => ipcRenderer.invoke('vault:copy-item', data),
    parseFile: (filePath: string) => ipcRenderer.invoke('vault:parse-file', filePath),
    parseUrl: (url: string, ext: string, headers?: any) => ipcRenderer.invoke('vault:parse-url', url, ext, headers),
    readClipboardFiles: () => ipcRenderer.invoke('vault:read-clipboard-files'),
    // MinerU advanced PDF parsing
    mineruCheckEnv: () => ipcRenderer.invoke('vault:mineru-check-env'),
    mineruSetupEnv: () => ipcRenderer.invoke('vault:mineru-setup-env'),
    mineruParse: (filePath: string) => ipcRenderer.invoke('vault:mineru-parse', filePath),
    onMineruLog: (callback: (data: { message: string, type?: 'info' | 'error' | 'warning' }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('mineru:log', listener);
      return () => ipcRenderer.removeListener('mineru:log', listener);
    },
    // FunASR audio transcription
    funasrCheckEnv: () => ipcRenderer.invoke('vault:funasr-check-env'),
    funasrSetupEnv: () => ipcRenderer.invoke('vault:funasr-setup-env'),
    funasrTranscribe: (filePath: string) => ipcRenderer.invoke('vault:funasr-transcribe', filePath),
    extractAudio: (filePath: string) => ipcRenderer.invoke('vault:extract-audio', filePath),
    onFunasrLog: (callback: (data: { message: string, type?: 'info' | 'error' | 'warning' }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('funasr:log', listener);
      return () => ipcRenderer.removeListener('funasr:log', listener);
    },
  },

  // GraphRAG operations
  graph: {
    list: () => ipcRenderer.invoke('graph:list'),
    get: (id: string) => ipcRenderer.invoke('graph:get', id),
    save: (graph: any) => ipcRenderer.invoke('graph:save', graph),
    delete: (id: string) => ipcRenderer.invoke('graph:delete', id),
    index: (data: any) => ipcRenderer.invoke('graph:index', data),
    stop: (id: string) => ipcRenderer.invoke('graph:stop', id),
    search: (data: { filePath: string, query: string, method: 'local' | 'global' }) => ipcRenderer.invoke('graph:search', data),
    getNodes: (filePath: string) => ipcRenderer.invoke('graph:get-nodes', filePath),
    getEdges: (filePath: string) => ipcRenderer.invoke('graph:get-edges', filePath),
    getDocuments: (filePath: string) => ipcRenderer.invoke('graph:get-documents', filePath),
    getTextUnits: (filePath: string) => ipcRenderer.invoke('graph:get-text-units', filePath),
    onStatusChanged: (callback: (data: { filePath: string, status: string, message?: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('graph:status-changed', listener);
      return () => ipcRenderer.removeListener('graph:status-changed', listener);
    },
    onLog: (callback: (data: { filePath: string, message: string, type?: 'info' | 'error' | 'warning' }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('graph:log', listener);
      return () => ipcRenderer.removeListener('graph:log', listener);
    },
  },

  // Task Queue status
  taskQueue: {
    getStatus: () => ipcRenderer.invoke('taskQueue:get-status'),
    onStatusChanged: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('taskQueue:status', listener);
      return () => ipcRenderer.removeListener('taskQueue:status', listener);
    },
  },

  // Network requests
  net: {
    fetch: (url: string, options?: any) => ipcRenderer.invoke('net:fetch', url, options),
  },

  // Models Management
  models: {
    getStatus: () => ipcRenderer.invoke('models:get-status'),
    delete: (target: 'funasr' | 'mineru' | 'docling') => ipcRenderer.invoke('models:delete', target),
    download: (data: { target: string, source: string, taskId: string }) => ipcRenderer.invoke('models:download', data),
    onDownloadProgress: (callback: (data: { target: string, progress: number, message: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('models:download-progress', listener);
      return () => ipcRenderer.removeListener('models:download-progress', listener);
    }
  },

  // Logs
  logs: {
    get: () => ipcRenderer.invoke('logs:get'),
    clear: () => ipcRenderer.invoke('logs:clear'),
    onNewEntry: (callback: (entry: any) => void) => {
      const listener = (_event: any, entry: any) => callback(entry);
      ipcRenderer.on('logs:new-entry', listener);
      return () => ipcRenderer.removeListener('logs:new-entry', listener);
    },
  },

  // Language
  setLanguage: (lang: string) => ipcRenderer.send('set-language', lang),
};

// Type declarations
declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}

// Expose API to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI); 