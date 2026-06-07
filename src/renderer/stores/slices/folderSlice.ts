import { StateCreator } from 'zustand';
import { Folder } from '../../services/storageService';
import { CanvasState } from '../canvasStore';

export interface FolderSlice {
    folders: Folder[];
    selectedFolderId: string | null;
    loadFolders: () => Promise<void>;
    createFolder: (name: string, parentId?: string) => Promise<void>;
    updateFolder: (id: string, name: string) => Promise<void>;
    deleteFolder: (id: string) => Promise<void>;
    moveFolderToParent: (folderId: string, newParentId: string | null, displayOrder?: number) => Promise<void>;
    updateFolderOrder: (folderId: string, order: number) => Promise<void>;
    getFolderLevel: (folderId: string) => number;
    isDescendant: (potentialAncestorId: string, folderId: string) => boolean;
    getSubtreeDepth: (folderId: string) => number;
    setSelectedFolder: (folderId: string | null) => void;
    duplicateFolder: (id: string, targetParentId?: string) => Promise<string>;
}

export const createFolderSlice: StateCreator<
    CanvasState,
    [],
    [],
    FolderSlice
> = (set, get) => ({
    folders: [],
    selectedFolderId: null,

    loadFolders: async () => {
        const { vaultPath } = get();
        if (vaultPath) {
            const structure = await window.electronAPI.vault.getStructure(vaultPath);
            set({
                folders: structure.folders.map((f: any) => ({
                    id: f.id,
                    name: f.name,
                    parent_id: f.parentId,
                    display_order: 0,
                    created_at: f.updatedAt,
                    updated_at: f.updatedAt
                }))
            });
        } else {
            const folders = await window.electronAPI.db.getFolders();
            set({ folders });
        }
    },

    createFolder: async (name: string, parentId?: string) => {
        const { vaultPath } = get();
        if (vaultPath) {
            const parentPath = parentId || vaultPath;
            await window.electronAPI.vault.createFolder({ parentPath, name });
            await get().loadFolders();
        } else {
            const id = crypto.randomUUID();
            const now = Date.now();
            const newFolder = {
                id,
                name,
                parent_id: parentId,
                display_order: 0,
                created_at: now,
                updated_at: now,
            };
            await window.electronAPI.db.createFolder(newFolder);
            await get().loadFolders();
        }
    },

    updateFolder: async (id: string, name: string) => {
        const { vaultPath } = get();
        if (vaultPath) {
            const lastSeparatorIndex = Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\'));
            const dir = id.substring(0, lastSeparatorIndex);
            const separator = id.includes('\\') ? '\\' : '/';
            const newPath = `${dir}${separator}${name}`;
            if (id !== newPath) {
                await window.electronAPI.vault.renameItem({ oldPath: id, newPath });
            }
        } else {
            await window.electronAPI.db.updateFolder({ id, name });
        }
        await get().loadFolders();
    },

    deleteFolder: async (id: string) => {
        const { vaultPath } = get();
        if (vaultPath) {
            await window.electronAPI.vault.deleteItem(id);
        } else {
            await window.electronAPI.db.deleteFolder(id);
        }
        await get().loadFolders();
        await get().loadCanvases(); // Canvases might be deleted if folder is deleted
    },

    moveFolderToParent: async (folderId: string, newParentId: string | null, displayOrder = 0) => {
        const { vaultPath } = get();
        if (vaultPath) {
            // Check for cycle
            if (newParentId && get().isDescendant(folderId, newParentId)) {
                throw new Error('Cannot move folder into its own descendant');
            }
            const targetDir = newParentId || vaultPath;
            const lastSeparatorIndex = Math.max(folderId.lastIndexOf('/'), folderId.lastIndexOf('\\'));
            const folderName = folderId.substring(lastSeparatorIndex + 1);
            const separator = targetDir.includes('\\') ? '\\' : '/';
            const newPath = `${targetDir}${separator}${folderName}`;
            if (folderId !== newPath) {
                await window.electronAPI.vault.renameItem({ oldPath: folderId, newPath });
            }
        } else {
            await window.electronAPI.db.moveFolderToParent({ folderId, newParentId, displayOrder });
        }
        await get().loadFolders();
    },

    updateFolderOrder: async (folderId: string, order: number) => {
        const { vaultPath } = get();
        if (!vaultPath) {
            await window.electronAPI.db.updateFolderOrder({ id: folderId, order });
            await get().loadFolders();
        }
    },

    setSelectedFolder: (folderId) => {
        set({ selectedFolderId: folderId });
    },

    getFolderLevel: (folderId: string): number => {
        const folders = get().folders;
        let level = 0;
        let currentId: string | undefined = folderId;

        while (currentId) {
            const folder = folders.find(f => f.id === currentId);
            if (!folder) break;
            currentId = folder.parent_id;
            level++;
            if (level > 10) break; // Safety check
        }
        return level;
    },

    isDescendant: (potentialAncestorId: string, folderId: string): boolean => {
        const folders = get().folders;
        let currentId: string | undefined = folderId;
        const visited = new Set<string>();

        while (currentId) {
            if (currentId === potentialAncestorId) return true;
            if (visited.has(currentId)) break;
            visited.add(currentId);

            const folder = folders.find(f => f.id === currentId);
            if (!folder) break;
            currentId = folder.parent_id;
        }
        return false;
    },

    getSubtreeDepth: (folderId: string): number => {
        const folders = get().folders;
        const children = folders.filter(f => f.parent_id === folderId);
        if (children.length === 0) return 0;
        return 1 + Math.max(...children.map(child => get().getSubtreeDepth(child.id)));
    },

    duplicateFolder: async (id: string, targetParentId?: string) => {
        const { vaultPath, folders, canvases } = get();
        const folder = folders.find(f => f.id === id);
        if (!folder) return '';

        if (vaultPath) {
            const parentPath = targetParentId || id.substring(0, Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\')));
            const separator = parentPath.includes('\\') ? '\\' : '/';
            let newName = `${folder.name} (副本)`;
            let newPath = `${parentPath}${separator}${newName}`;

            let counter = 1;
            while (await window.electronAPI.vault.checkFileExists(newPath)) {
                counter++;
                newName = `${folder.name} (副本 ${counter})`;
                newPath = `${parentPath}${separator}${newName}`;
            }

            await window.electronAPI.vault.copyItem({ oldPath: id, newPath });
            await get().loadFolders();
            await get().loadCanvases();
            return newPath;
        } else {
            const duplicateRecursive = async (srcId: string, parentId?: string): Promise<string> => {
                const srcFolder = folders.find(f => f.id === srcId);
                if (!srcFolder) return '';

                const newId = crypto.randomUUID();
                const now = Date.now();
                const isTopLevel = srcId === id;
                const newName = isTopLevel ? `${srcFolder.name} (副本)` : srcFolder.name;

                await window.electronAPI.db.createFolder({
                    id: newId,
                    name: newName,
                    parent_id: parentId || targetParentId,
                    display_order: srcFolder.display_order,
                    created_at: now,
                    updated_at: now,
                });

                // Duplicate canvases in this folder
                const folderCanvases = canvases.filter(c => c.folderId === srcId);
                for (const canvas of folderCanvases) {
                    const source = await window.electronAPI.db.getOne(canvas.id);
                    if (source) {
                        const newCanvasId = crypto.randomUUID();
                        await window.electronAPI.db.save({
                            ...source,
                            id: newCanvasId,
                            folder_id: newId,
                            created_at: now,
                            updated_at: now,
                        });
                    }
                }

                // Duplicate subfolders
                const subfolders = folders.filter(f => f.parent_id === srcId);
                for (const sub of subfolders) {
                    await duplicateRecursive(sub.id, newId);
                }

                return newId;
            };

            const newRootId = await duplicateRecursive(id, targetParentId);
            await get().loadFolders();
            await get().loadCanvases();
            return newRootId;
        }
    },
});
