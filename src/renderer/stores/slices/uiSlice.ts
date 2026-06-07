import { StateCreator } from 'zustand';
import { CanvasState } from '../canvasStore';

export interface UISlice {
    isShortcutHelpOpen: boolean;
    setShortcutHelpOpen: (open: boolean) => void;
    vaultPath: string | null;
    setVaultPath: (path: string | null) => void;
    sidebarActiveTab: 'files' | 'search' | 'recent' | 'tasks' | 'logs' | 'settings';
    setSidebarActiveTab: (tab: 'files' | 'search' | 'recent' | 'tasks' | 'logs' | 'settings') => void;
    expandedFolders: Set<string>;
    setExpandedFolders: (folders: Set<string>) => void;
    toggleFolder: (folderId: string, force?: boolean) => void;
    expandFoldersForPath: (path: string) => void;
    clipboard: { id: string; type: 'folder' | 'canvas' } | null;
    setClipboard: (item: { id: string; type: 'folder' | 'canvas' } | null) => void;
    selectedItemId: string | null;
    selectedItemType: 'folder' | 'canvas' | null;
    multiSelectedIds: string[];
    setSelection: (id: string | null, type: 'folder' | 'canvas' | null, modifier?: 'cmd' | 'shift', siblingIds?: string[]) => void;
    scrollTargetId: string | null;
    setScrollTargetId: (id: string | null) => void;
}

export const createUISlice: StateCreator<
    CanvasState,
    [],
    [],
    UISlice
> = (set, get) => ({
    isShortcutHelpOpen: false,
    vaultPath: null,
    sidebarActiveTab: 'files',
    expandedFolders: new Set(),
    clipboard: null,
    selectedItemId: null,
    selectedItemType: null,
    multiSelectedIds: [],
    scrollTargetId: null,

    setScrollTargetId: (id) => {
        set({ scrollTargetId: id });
    },

    setSelection: (id, type, modifier, siblingIds) => {
        const { multiSelectedIds, selectedItemId } = get();
        if (!id) {
            set({ selectedItemId: null, selectedItemType: null, multiSelectedIds: [] });
            return;
        }

        if (modifier === 'cmd') {
            if (multiSelectedIds.includes(id)) {
                const newMulti = multiSelectedIds.filter(x => x !== id);
                set({ 
                    multiSelectedIds: newMulti, 
                    selectedItemId: newMulti.length > 0 ? newMulti[newMulti.length-1] : null,
                    selectedItemType: newMulti.length > 0 ? type : null 
                });
            } else {
                set({ multiSelectedIds: [...multiSelectedIds, id], selectedItemId: id, selectedItemType: type });
            }
        } else if (modifier === 'shift' && siblingIds && selectedItemId) {
            const lastIdx = siblingIds.indexOf(selectedItemId);
            const currentIdx = siblingIds.indexOf(id);
            if (lastIdx !== -1 && currentIdx !== -1) {
                const min = Math.min(lastIdx, currentIdx);
                const max = Math.max(lastIdx, currentIdx);
                const rangeIds = siblingIds.slice(min, max + 1);
                // Also retain previously selected ones if desired, or replace?
                // Standard file explorer replaces the selection if doing just shift-click without cmd
                // Wait, typical MacOS replaces. If cmd is NOT held, shift-click clears old selection outside the range.
                set({ multiSelectedIds: rangeIds, selectedItemId: id, selectedItemType: type });
            } else {
                set({ multiSelectedIds: [id], selectedItemId: id, selectedItemType: type });
            }
        } else {
            set({ selectedItemId: id, selectedItemType: type, multiSelectedIds: [id] });
        }
    },

    setClipboard: (item) => {
        set({ clipboard: item });
    },

    setShortcutHelpOpen: (open) => {
        set({ isShortcutHelpOpen: open });
    },

    setVaultPath: (path) => {
        set({ vaultPath: path });
    },

    setSidebarActiveTab: (tab) => {
        set({ sidebarActiveTab: tab });
    },

    setExpandedFolders: (folders) => {
        set({ expandedFolders: folders });
    },

    toggleFolder: (folderId, force) => {
        const { expandedFolders } = get();
        const newExpanded = new Set(expandedFolders);
        if (force !== undefined) {
            if (force) newExpanded.add(folderId);
            else newExpanded.delete(folderId);
        } else {
            if (newExpanded.has(folderId)) {
                newExpanded.delete(folderId);
            } else {
                newExpanded.add(folderId);
            }
        }
        set({ expandedFolders: newExpanded });
    },

    expandFoldersForPath: (filePath) => {
        const { vaultPath } = get();
        if (!vaultPath) return;

        const newExpanded = new Set(get().expandedFolders);
        const separator = filePath.includes('\\') ? '\\' : '/';

        let currentPath = filePath;
        // Traverse upwards from the file's path
        while (currentPath.includes(separator)) {
            const lastIdx = currentPath.lastIndexOf(separator);
            if (lastIdx === -1) break;

            currentPath = currentPath.substring(0, lastIdx);

            // Only add paths that are inside the vault (longer than vaultPath)
            // Folders at the root of the vault have parent_id: null and are always visible
            if (currentPath.length > vaultPath.length) {
                newExpanded.add(currentPath);
            } else {
                // Once we hit vaultPath or shorter, we've expanded everything needed
                break;
            }
        }

        set({ expandedFolders: newExpanded, sidebarActiveTab: 'files' });
    }
});
