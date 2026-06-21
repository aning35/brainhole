import { t } from 'i18next';
import { useState } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useContextMenu } from '@/components/ui/ContextMenu';
import { Folder, CanvasMetadata } from '@/services/storageService';
import { Edit2, Trash2, FileText, Workflow, FolderPlus, RefreshCw, FolderOpen, Copy, Network, ClipboardCopy } from 'lucide-react';

interface ModalConfig {
    isOpen: boolean;
    title: string;
    defaultValue: string;
    mode: 'rename' | 'create-subfolder';
    targetId?: string;
    targetType?: 'folder' | 'canvas';
}

export function useFileTreeContextMenu(
    toggleFolder: (folderId: string, force?: boolean) => void,
    onNavigate?: (page: 'canvas' | 'all-canvases') => void,
    onFolderCreate?: () => void
) {
    const {
        createFolder,
        deleteFolder,
        deleteCanvas,
        updateFolder,
        createNewCanvas,
        createNewGraph,
        createNewMarkdown,
        renameCanvas,
        moveCanvasToFolder,
        moveFolderToParent,
        vaultPath,
        loadFolders,
        loadCanvases
    } = useCanvasStore();

    const { showMenu } = useContextMenu();

    const [newFolderName, setNewFolderName] = useState('');
    const [modalConfig, setModalConfig] = useState<ModalConfig>({
        isOpen: false,
        title: '',
        defaultValue: '',
        mode: 'rename'
    });

    const [confirmConfig, setConfirmConfig] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    const handleCreateFolder = async () => {
        if (newFolderName.trim()) {
            await createFolder(newFolderName.trim());
            setNewFolderName('');
        }
        onFolderCreate?.();
    };

    const handleModalConfirm = async (value: string) => {
        if (modalConfig.mode === 'rename' && modalConfig.targetId) {
            if (modalConfig.targetType === 'folder') {
                await updateFolder(modalConfig.targetId, value);
            } else {
                await renameCanvas(modalConfig.targetId, value);
            }
        } else if (modalConfig.mode === 'create-subfolder' && modalConfig.targetId) {
            await createFolder(value, modalConfig.targetId);
        }
        setModalConfig({ ...modalConfig, isOpen: false });
    };

    const handleDeleteConfirm = () => {
        confirmConfig.onConfirm();
        setConfirmConfig({ ...confirmConfig, isOpen: false });
    };

    const handleContextMenu = (e: React.MouseEvent, item: Folder | CanvasMetadata, type: 'folder' | 'canvas') => {
        e.preventDefault();
        e.stopPropagation();

        // Update unified selection on right click as well
        useCanvasStore.getState().setSelection(item.id, type);
        if (type === 'folder') {
            useCanvasStore.getState().setSelectedFolder(item.id);
        }

        const getExtension = () => {
            const lastDotIndex = item.id.lastIndexOf('.');
            return lastDotIndex !== -1 ? item.id.substring(lastDotIndex).toLowerCase() : '';
        };

        const extension = getExtension();
        const isMarkdown = type === 'canvas' && extension === '.md';
        const isText = type === 'canvas' && (extension === '.txt' || extension === '.log');
        const isSpreadsheet = type === 'canvas' && (extension === '.csv' || extension === '.xlsx' || extension === '.xls');
        const isWord = type === 'canvas' && (extension === '.docx' || extension === '.doc');
        const isPdf = type === 'canvas' && extension === '.pdf';
        const isCode = type === 'canvas' && (extension === '.yaml' || extension === '.yml');
        const isJson = type === 'canvas' && extension === '.json';
        const isCanvas = type === 'canvas' && extension === '.canvas';
        const isGraph = type === 'canvas' && extension === '.graph';
        const isImage = type === 'canvas' && ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(extension);
        const isAudio = type === 'canvas' && ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.wma', '.webm'].includes(extension);
        const isVideo = type === 'canvas' && ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm'].includes(extension);

        const isSupported = type === 'folder' || isMarkdown || isText || isSpreadsheet || isWord || isPdf || isCode || isJson || isCanvas || isGraph || isImage || isAudio || isVideo;

        const menuItems = [
            ...(type === 'folder' ? [
                {
                    label: t('sidebar.newCanvas'),
                    icon: <Workflow className="w-4 h-4" />,
                    onClick: async () => {
                        await createNewCanvas(undefined, item.id);
                        toggleFolder(item.id, true);
                        onNavigate?.('canvas');
                    }
                },
                {
                    label: t('sidebar.newGraph'),
                    icon: <Network className="w-4 h-4" />,
                    onClick: async () => {
                        await createNewGraph(undefined, item.id);
                        toggleFolder(item.id, true);
                        onNavigate?.('canvas');
                    }
                },
                {
                    label: t('sidebar.newMd'),
                    icon: <FileText className="w-4 h-4" />,
                    onClick: async () => {
                        await createNewMarkdown(undefined, item.id);
                        toggleFolder(item.id, true);
                        onNavigate?.('canvas');
                    }
                },
                { divider: true },
                {
                    label: t('sidebar.newFolder'),
                    icon: <FolderPlus className="w-4 h-4" />,
                    onClick: () => {
                        setModalConfig({
                            isOpen: true,
                            title: t('sidebar.newFolder'),
                            defaultValue: t('sidebar.newFolder'),
                            mode: 'create-subfolder',
                            targetId: item.id
                        });
                        toggleFolder(item.id, true);
                    }
                },
                {
                    label: t('sidebar.refresh'),
                    icon: <RefreshCw className="w-4 h-4" />,
                    onClick: async () => {
                        await loadFolders();
                        await loadCanvases();
                    }
                },
                { divider: true },
            ] : []),

            ...(vaultPath ? [{
                label: type === 'folder' ? t('sidebar.openFolder') : t('sidebar.openFile'),
                icon: <FolderOpen className="w-4 h-4" />,
                onClick: async () => {
                    await window.electronAPI.vault.revealInExplorer(item.id);
                }
            }] : []),
            {
                label: t('sidebar.copyPath'),
                icon: <ClipboardCopy className="w-4 h-4" />,
                onClick: () => navigator.clipboard.writeText(item.id)
            },
            ...(isSupported ? [
                {
                    label: t('sidebar.rename'),
                    icon: <Edit2 className="w-4 h-4" />,
                    onClick: () => {
                        setModalConfig({
                            isOpen: true,
                            title: type === 'folder' ? t('sidebar.renameFolder') : t('sidebar.renameFile'),
                            defaultValue: item.name,
                            mode: 'rename',
                            targetId: item.id,
                            targetType: type
                        });
                    }
                }
            ] : []),

            { divider: true },

            ...(isSupported ? [{
                label: t('sidebar.copy'),
                icon: <Copy className="w-4 h-4" />,
                onClick: () => {
                    const { setClipboard } = useCanvasStore.getState();
                    setClipboard({ id: item.id, type });
                }
            }] : []),
            ...(type === 'folder' ? [
                {
                    label: t('sidebar.paste'),
                    icon: <ClipboardCopy className="w-4 h-4" />,
                    disabled: !useCanvasStore.getState().clipboard && !useCanvasStore.getState().vaultPath,
                    onClick: async () => {
                        const { pasteItem } = useCanvasStore.getState();
                        await pasteItem(item.id);
                    }
                }
            ] : []),

            { divider: true },

            {
                label: t('sidebar.delete'),
                icon: <Trash2 className="w-4 h-4 text-red-500" />,
                className: "text-red-500 hover:text-red-600 hover:bg-red-50",
                onClick: () => {
                    const multiSelectedIds = useCanvasStore.getState().multiSelectedIds;
                    const toDelete = multiSelectedIds.includes(item.id) && multiSelectedIds.length > 1
                        ? multiSelectedIds
                        : [item.id];

                    setConfirmConfig({
                        isOpen: true,
                        title: t('sidebar.confirmDelete'),
                        message: toDelete.length > 1
                            ? t('sidebar.deleteMultipleMsg', { count: toDelete.length }, `Are you sure you want to delete ${toDelete.length} items? This action cannot be undone.`)
                            : t('sidebar.deleteMsg', { type: type === 'folder' ? t('sidebar.typeFolder') : t('sidebar.typeFile'), name: item.name }),
                        onConfirm: async () => {
                            const { folders } = useCanvasStore.getState();
                            for (const id of toDelete) {
                                const isFolder = folders.some((f: any) => f.id === id);
                                if (isFolder) {
                                    await deleteFolder(id);
                                } else {
                                    await deleteCanvas(id);
                                }
                            }
                        }
                    });
                }
            }
        ];

        showMenu({ x: e.clientX, y: e.clientY }, menuItems);
    };

    // Root related handlers
    const handleRootDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).classList.remove('bg-gray-100');

        // Check for OS files drop
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const dataStr = e.dataTransfer.getData('application/json');
            if (!dataStr) { // If it has application/json, it's an internal drag
                const filePaths = Array.from(e.dataTransfer.files)
                    // Electron adds a path property to File objects
                    .map((f: any) => f.path)
                    .filter(Boolean);

                if (filePaths.length > 0) {
                    const { copyExternalFilesToVault } = useCanvasStore.getState();
                    await copyExternalFilesToVault(filePaths, undefined);
                }
                return;
            }
        }

        const dataStr = e.dataTransfer.getData('application/json');
        if (!dataStr) return;
        const data = JSON.parse(dataStr);
        if (data.type === 'canvas' && data.folderId) {
            await moveCanvasToFolder(data.id, null);
        } else if (data.type === 'folder' && data.parentId) {
            await moveFolderToParent(data.id, null);
        }
    };

    return {
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
    };
}
