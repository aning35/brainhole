import { useState, useRef } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { Folder, CanvasMetadata } from '@/services/storageService';

export function useFileTreeDragDrop(
    item: Folder | CanvasMetadata,
    type: 'folder' | 'canvas'
) {
    const {
        moveCanvasToFolder,
        moveFolderToParent
    } = useCanvasStore();

    const [dropPosition, setDropPosition] = useState<'top' | 'bottom' | 'inside' | null>(null);
    const elementRef = useRef<HTMLDivElement>(null);

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('application/json', JSON.stringify({
            type,
            id: item.id,
            folderId: type === 'canvas' ? (item as CanvasMetadata).folderId : undefined,
            parentId: type === 'folder' ? (item as Folder).parent_id : undefined,
            order: type === 'folder' ? (item as Folder).display_order : (item as CanvasMetadata).displayOrder
        }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!elementRef.current) return;

        // Visual feedback: 'inside' means it will be placed in this folder or this canvas's parent folder
        setDropPosition('inside');
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Prevent flickering when dragging over child elements
        if (e.relatedTarget && elementRef.current?.contains(e.relatedTarget as Node)) {
            return;
        }

        setDropPosition(null);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropPosition(null);

        // Check for OS files drop
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const dataStr = e.dataTransfer.getData('application/json');
            if (!dataStr) { // If it has application/json, it's an internal drag
                const filePaths = Array.from(e.dataTransfer.files)
                    .map((f: any) => f.path)
                    .filter(Boolean);

                if (filePaths.length > 0) {
                    const targetFolderId = type === 'folder' ? item.id : (item as CanvasMetadata).folderId || undefined;
                    const { copyExternalFilesToVault } = useCanvasStore.getState();
                    await copyExternalFilesToVault(filePaths, targetFolderId);
                }
                return;
            }
        }

        const dataStr = e.dataTransfer.getData('application/json');
        if (!dataStr) return;
        const data = JSON.parse(dataStr);
        if (data.id === item.id) return; // Drop on self

        try {
            // Target folder is the item itself if it's a folder, or its parent if it's a canvas
            const targetFolderId = type === 'folder' ? item.id : (item as CanvasMetadata).folderId || null;

            if (data.type === 'canvas') {
                const { multiSelectedIds } = useCanvasStore.getState();
                if (multiSelectedIds.includes(data.id) && multiSelectedIds.length > 1) {
                    for (const id of multiSelectedIds) {
                        try {
                            await moveCanvasToFolder(id, targetFolderId);
                        } catch (err) {
                            console.error(`Failed to move ${id}:`, err);
                        }
                    }
                } else {
                    await moveCanvasToFolder(data.id, targetFolderId);
                }
            } else if (data.type === 'folder') {
                await moveFolderToParent(data.id, targetFolderId);
            }
        } catch (err) {
            console.error("Drop failed:", err);
        }
    };

    return {
        elementRef,
        dropPosition,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDrop
    };
}
