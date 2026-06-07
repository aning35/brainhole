import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { createFolderSlice, FolderSlice } from './slices/folderSlice';
import { createCanvasSlice, CanvasSlice } from './slices/canvasSlice';
import { createGraphSlice, GraphSlice } from './slices/graphSlice';
import { createUISlice, UISlice } from './slices/uiSlice';
import { createSettingsSlice, SettingsSlice } from './slices/settingsSlice';

// Combined State Interface
export type CanvasState = FolderSlice & CanvasSlice & GraphSlice & UISlice & SettingsSlice & {
  pasteItem: (targetFolderId?: string) => Promise<void>;
  copyExternalFilesToVault: (filePaths: string[], targetFolderId?: string) => Promise<void>;
};

export interface NodeData {
  label: string;
  content?: string;
  [key: string]: any;
}

export interface DataNodeData extends NodeData {
  sourceType?: 'text' | 'file'; // explicit source selector
  dataType?: 'text' | 'table' | 'document' | 'image' | 'video' | 'knowledge_graph' | 'ima_knowledge_base'; // detailed type for file source
  textContent?: string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string; // Preview URL
  fileMimeType?: string;
  sheets?: string[];
  selectedSheet?: string;
  columns?: string[];
  data?: any[];
  previewData?: any[];
  status?: 'empty' | 'loading' | 'ready' | 'error';
  error?: string;
  isCustomTitle?: boolean;
  initialTitle?: string;
  displayMode?: 'source' | 'preview';
  // IMA Knowledge Base fields
  imaKbId?: string;
  imaKbName?: string;
  imaFolderId?: string;
  imaFolderName?: string;
}

export interface PromptNodeData extends NodeData {
  promptText?: string;
  status?: 'idle' | 'generating' | 'completed' | 'error';
  error?: string;
  contextNodeIds?: string[];
  temperature?: number;
  maxTokens?: number;
  thinkingMode?: boolean; // true = thinking enabled, false = thinking disabled
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'; // for reasoning_effort
  requiresListOutput?: boolean; // If true, instructs AI to output as a split list
}

export interface OutputVersion {
  id: string;
  content: string;
  snapshot?: any;
  usage?: any;
  createdAt: number;
}

export interface OutputNodeData extends NodeData {
  content?: string;
  isListMode?: boolean;
  parsedListItems?: { id: string; content: string }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  snapshot?: {
    generatedAt: number;
    inputNodes: any[];
    requiresListOutput?: boolean;
    [key: string]: any;
  };
  savedAsDataNode?: boolean;
  versions?: OutputVersion[];
  currentVersionId?: string;
}

export const useCanvasStore = create<CanvasState>()(
  devtools(
    persist(
      (set, get, api) => ({
        ...createFolderSlice(set, get, api),
        ...createCanvasSlice(set, get, api),
        ...createGraphSlice(set, get, api),
        ...createUISlice(set, get, api),
        ...createSettingsSlice(set, get, api),
        copyExternalFilesToVault: async (filePaths, targetFolderId) => {
          const { vaultPath, loadCanvases } = get();
          if (!vaultPath || !filePaths || filePaths.length === 0) return;

          try {
            let anyPasted = false;
            for (const filePath of filePaths) {
              const parentPath = targetFolderId || vaultPath;
              const separator = parentPath.includes('\\') ? '\\' : '/';

              const fullFileName = filePath.substring(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
              const dotIdx = fullFileName.lastIndexOf('.');
              const baseName = dotIdx !== -1 ? fullFileName.substring(0, dotIdx) : fullFileName;
              const ext = dotIdx !== -1 ? fullFileName.substring(dotIdx) : '';

              let newName = fullFileName;
              let newPath = `${parentPath}${separator}${newName}`;

              let counter = 1;
              while (await window.electronAPI.vault.checkFileExists(newPath)) {
                newName = `${baseName} (副本 ${counter})${ext}`;
                newPath = `${parentPath}${separator}${newName}`;
                counter++;
              }

              await window.electronAPI.vault.copyItem({ oldPath: filePath, newPath });
              anyPasted = true;
            }

            if (anyPasted) {
              await loadCanvases();
            }
          } catch (e) {
            console.error('Failed to copy external files to vault', e);
          }
        },
        pasteItem: async (targetFolderId) => {
          const currentState = get();
          const { clipboard, duplicateFolder, duplicateCanvas, vaultPath, copyExternalFilesToVault } = currentState;

          // First try internal clipboard
          if (clipboard) {
            if (clipboard.type === 'folder') {
              await duplicateFolder(clipboard.id, targetFolderId);
            } else {
              await duplicateCanvas(clipboard.id, targetFolderId);
            }
            return;
          }

          // If internal clipboard is empty, check OS clipboard for copied files
          if (vaultPath) {
            try {
              const clipboardFiles = await window.electronAPI.vault.readClipboardFiles();
              if (clipboardFiles && clipboardFiles.length > 0) {
                await copyExternalFilesToVault(clipboardFiles, targetFolderId);
              }
            } catch (e) {
              console.error('Failed to paste from OS clipboard', e);
            }
          }
        },
      }),
      {
        name: 'canvas-storage',
        partialize: (state) => ({
          openCanvasIds: state.openCanvasIds,
          activeCanvasId: state.activeCanvasId,
          expandedFolders: Array.from(state.expandedFolders || []),
          vaultPath: state.vaultPath,
          aiModel: state.aiModel,
          aiApiKey: state.aiApiKey,
          aiBaseUrl: state.aiBaseUrl,
          aiEmbeddingModel: state.aiEmbeddingModel,
          aiEmbeddingApiKey: state.aiEmbeddingApiKey,
          aiEmbeddingBaseUrl: state.aiEmbeddingBaseUrl,
          systemPrompt: state.systemPrompt,
          docParserEngine: state.docParserEngine,
          maxConcurrentTasks: state.maxConcurrentTasks,
          graphEntityTypes: state.graphEntityTypes,
          language: state.language,
          customEntityTemplates: state.customEntityTemplates,
          imaClientId: state.imaClientId,
          imaApiKey: state.imaApiKey,
        }),
        merge: (persistedState: any, currentState) => ({
          ...currentState,
          ...(persistedState as object),
          expandedFolders: new Set((persistedState as any)?.expandedFolders || []),
        }),
      }
    )
  )
);