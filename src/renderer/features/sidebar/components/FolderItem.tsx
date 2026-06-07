import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { Folder, CanvasMetadata } from '@/services/storageService';
import { FileTreeItem } from './FileTreeItem';

export const FolderItem = ({
    folder,
    level,
    onNavigate,
    expandedFolders,
    toggleFolder,
    onContextMenu,
    siblingIds
}: {
    folder: Folder;
    level: number;
    onNavigate: (page: 'canvas' | 'all-canvases') => void;
    expandedFolders: Set<string>;
    toggleFolder: (id: string, force?: boolean) => void;
    onContextMenu: (e: React.MouseEvent, item: Folder | CanvasMetadata, type: 'folder' | 'canvas') => void;
    siblingIds?: string[];
}) => {
    const { folders, canvases } = useCanvasStore();
    const isExpanded = expandedFolders.has(folder.id);

    // Get children
    const childFolders = folders.filter(f => f.parent_id === folder.id).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const childCanvases = canvases.filter(c => c.folderId === folder.id).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const hasChildren = childFolders.length > 0 || childCanvases.length > 0;
    
    // Calculate current children IDs for Shift-click selection logic
    const currentChildrenIds = [...childFolders.map(f => f.id), ...childCanvases.map(c => c.id)];

    return (
        <>
            <FileTreeItem
                item={folder}
                type="folder"
                level={level}
                onNavigate={onNavigate}
                expanded={isExpanded}
                onToggle={() => toggleFolder(folder.id)}
                onContextMenu={onContextMenu}
                hasChildren={hasChildren}
                siblingIds={siblingIds}
            />
            {isExpanded && (
                <div className="relative group/folder">
                    {/* Vertical guide line */}
                    <div 
                        className="absolute top-0 bottom-0 w-px bg-gray-200 group-hover/folder:bg-gray-400 transition-colors pointer-events-none z-10"
                        style={{ left: `${level * 20 + 17.5}px` }} 
                    />
                    {/* Render Subfolders */}
                    {childFolders.map(childFolder => (
                        <FolderItem
                            key={childFolder.id}
                            folder={childFolder}
                            level={level + 1}
                            onNavigate={onNavigate}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            onContextMenu={onContextMenu}
                            siblingIds={currentChildrenIds}
                        />
                    ))}
                    {/* Render Canvases in this folder */}
                    {childCanvases.map(canvas => (
                        <FileTreeItem
                            key={canvas.id}
                            item={canvas}
                            type="canvas"
                            level={level + 1}
                            onNavigate={onNavigate}
                            onContextMenu={onContextMenu}
                            siblingIds={currentChildrenIds}
                        />
                    ))}
                </div>
            )}
        </>
    );
};
