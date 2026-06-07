import { useEffect } from 'react';
import { Plus, FileText, Network, Workflow, ClipboardCopy } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useContextMenu } from '@/components/ui/ContextMenu';
import { InputModal } from '@/components/ui/InputModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { FileTreeItem } from './components/FileTreeItem';
import { FolderItem } from './components/FolderItem';
import { IMATree } from './components/IMATree';
import { useFileTreeContextMenu } from './hooks/useFileTreeContextMenu';
import { useTranslation } from 'react-i18next';

export interface FileTreeProps {
    onNavigate: (page: 'canvas' | 'all-canvases') => void;
    isCreatingFolder?: boolean;
    onFolderCreate?: () => void;
    onCancelCreate?: () => void;
    expandedFolders: Set<string>;
    toggleFolder: (folderId: string, force?: boolean) => void;
}

export const FileTree = ({ onNavigate, isCreatingFolder, onFolderCreate, onCancelCreate, expandedFolders, toggleFolder }: FileTreeProps) => {
    const { t } = useTranslation();
    const {
        folders,
        canvases,
        loadFolders,
        loadCanvases,
    } = useCanvasStore();

    const { showMenu } = useContextMenu();

    const {
        modalConfig,
        setModalConfig,
        newFolderName,
        setNewFolderName,
        handleCreateFolder,
        handleModalConfirm,
        handleContextMenu,
        handleRootDrop,
        confirmConfig,
        setConfirmConfig,
        handleDeleteConfirm
    } = useFileTreeContextMenu(toggleFolder, onNavigate, onFolderCreate);

    useEffect(() => {
        loadFolders();
        loadCanvases();
    }, [loadFolders, loadCanvases]);

    useEffect(() => {
        if (!isCreatingFolder) {
            setNewFolderName('');
        }
    }, [isCreatingFolder, setNewFolderName]);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.add('bg-gray-100');
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove('bg-gray-100');
    };

    const rootCanvases = canvases.filter(c => !c.folderId).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const rootFolders = folders.filter(f => !f.parent_id).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        const isMod = e.metaKey || e.ctrlKey;
        const {
            clipboard,
            setClipboard,
            pasteItem,
            selectedItemId,
            selectedItemType,
            activeCanvasId,
            canvases
        } = useCanvasStore.getState();

        if (isMod && e.key === 'c') {
            // Priority 1: Explicitly selected item in the tree
            if (selectedItemId && selectedItemType) {
                setClipboard({ id: selectedItemId, type: selectedItemType });
            }
            // Priority 2: Fallback to active canvas if it exists in current tree
            else if (activeCanvasId) {
                const activeCanvas = canvases.find(c => c.id === activeCanvasId);
                if (activeCanvas) {
                    setClipboard({ id: activeCanvasId, type: 'canvas' });
                }
            }
        } else if (isMod && e.key === 'v') {
            const { vaultPath } = useCanvasStore.getState();
            if (clipboard || vaultPath) {
                // Paste into selected folder, or root if nothing selected
                const targetFolderId = selectedItemType === 'folder' ? selectedItemId : undefined;
                await pasteItem(targetFolderId || undefined);
            }
        }
    };

    return (
        <div
            className="flex flex-col h-full font-[Inter] outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
        >
            <div
                className="flex-1 overflow-y-auto px-2 pt-1 pb-4"
                onDragOver={handleDragOver}
                onDrop={handleRootDrop}
                onDragLeave={handleDragLeave}
                onContextMenu={(e) => {
                    e.preventDefault();
                    showMenu({ x: e.clientX, y: e.clientY }, [
                        {
                            label: t('app.newCanvas'),
                            icon: <Workflow className="w-4 h-4" />, // We need Workflow icon import or assume it exists, let's check imports
                            onClick: async () => {
                                await useCanvasStore.getState().createNewCanvas();
                                onNavigate('canvas');
                            }
                        },
                        {
                            label: t('app.newGraph'),
                            icon: <Network className="w-4 h-4" />,
                            onClick: async () => {
                                await useCanvasStore.getState().createNewGraph();
                                onNavigate('canvas');
                            }
                        },
                        {
                            label: t('app.newMarkdown'),
                            icon: <FileText className="w-4 h-4" />,
                            onClick: async () => {
                                await useCanvasStore.getState().createNewMarkdown();
                                onNavigate('canvas');
                            }
                        },
                        { divider: true },
                        {
                            label: t('sidebar.newFolder'),
                            icon: <Plus className="w-4 h-4" />,
                            onClick: () => {
                                onFolderCreate ? onFolderCreate() : setModalConfig({
                                    isOpen: true,
                                    title: t('sidebar.newFolder'),
                                    defaultValue: t('sidebar.newFolder'),
                                    mode: 'create-subfolder',
                                    targetId: undefined // Root
                                });
                            }
                        },
                        { divider: true },
                        {
                            label: t('sidebar.paste'),
                            icon: <ClipboardCopy className="w-4 h-4" />,
                            // In vault mode, we always enable paste because they might have OS files copied
                            disabled: !useCanvasStore.getState().clipboard && !useCanvasStore.getState().vaultPath,
                            onClick: async () => {
                                const { pasteItem } = useCanvasStore.getState();
                                await pasteItem(undefined);
                            }
                        }
                    ]);
                }}
            >
                {isCreatingFolder && (
                    <div className="px-2 py-1">
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onBlur={handleCreateFolder}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateFolder();
                                if (e.key === 'Escape') onCancelCreate?.();
                            }}
                            className="w-full bg-white border border-primary-300 rounded px-2 py-1 text-sm focus:outline-none"
                            autoFocus
                            placeholder="New Folder..."
                        />
                    </div>
                )}

                {/* Root Folders (Recursively Rendered) */}
                {rootFolders.map(folder => (
                    <FolderItem
                        key={folder.id}
                        folder={folder}
                        level={0}
                        onNavigate={onNavigate}
                        expandedFolders={expandedFolders}
                        toggleFolder={toggleFolder}
                        onContextMenu={handleContextMenu}
                        siblingIds={[...rootFolders.map(f => f.id), ...rootCanvases.map(c => c.id)]}
                    />
                ))}

                {/* Root Canvases */}
                {rootCanvases.map(canvas => (
                    <FileTreeItem
                        key={canvas.id}
                        item={canvas}
                        type="canvas"
                        level={0}
                        onNavigate={onNavigate}
                        onContextMenu={handleContextMenu}
                        siblingIds={[...rootFolders.map(f => f.id), ...rootCanvases.map(c => c.id)]}
                    />
                ))}

                {rootFolders.length === 0 && rootCanvases.length === 0 && !isCreatingFolder && (
                    <div className="py-8 text-center text-xs text-gray-400">
                        {t('sidebar.noFiles')}
                    </div>
                )}
                
                {/* IMA Knowledge Base Node */}
                <IMATree />
            </div>

            <InputModal
                isOpen={modalConfig.isOpen}
                title={modalConfig.title}
                defaultValue={modalConfig.defaultValue}
                onConfirm={handleModalConfirm}
                onCancel={() => setModalConfig({ ...modalConfig, isOpen: false })}
            />

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                title={confirmConfig.title}
                message={confirmConfig.message}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
            />
        </div>
    );
};
