import React from 'react';
import {
    ChevronRight,
    ChevronDown,
    Folder as FolderIcon,
    FileText,
    Network,
    LayoutTemplate,
    FileSpreadsheet,
    File,
    FilePieChart,
    FileCode,
    FileJson,
    ScrollText,
    Image as ImageIcon,
    Music,
    Video,
} from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';
import { Folder, CanvasMetadata } from '@/services/storageService';
import { cn } from '@/lib/utils';
import { useFileTreeDragDrop } from '../hooks/useFileTreeDragDrop';
import { 
    TEXT_FILE_EXTENSIONS, 
    TABLE_FILE_EXTENSIONS, 
    IMAGE_FILE_EXTENSIONS, 
    VIDEO_FILE_EXTENSIONS,
    AUDIO_FILE_EXTENSIONS,
    ALL_KNOWN_EXTENSIONS_REGEX
} from '@/utils/fileTypes';

export interface FileTreeItemProps {
    item: Folder | CanvasMetadata;
    type: 'folder' | 'canvas';
    level: number;
    onNavigate: (page: 'canvas' | 'all-canvases') => void;
    expanded?: boolean;
    onToggle?: () => void;
    onContextMenu: (e: React.MouseEvent, item: Folder | CanvasMetadata, type: 'folder' | 'canvas') => void;
    hasChildren?: boolean;
    siblingIds?: string[];
}

export const FileTreeItem = ({
    item,
    type,
    level,
    onNavigate,
    expanded,
    onToggle,
    onContextMenu,
    hasChildren,
    siblingIds
}: FileTreeItemProps) => {
    const {
        openCanvas,
        activeCanvasId,
        openCanvasIds,
        setSelectedFolder,
        selectedFolderId,
    } = useCanvasStore();

    const {
        elementRef,
        dropPosition,
        handleDragStart,
        handleDragOver,
        handleDragLeave,
        handleDrop
    } = useFileTreeDragDrop(item, type);

    React.useEffect(() => {
        const checkScroll = (targetId: string | null) => {
            if (targetId === item.id) {
                // Ensure we only scroll after React has successfully mapped and mounted us in the active UI tree
                setTimeout(() => {
                    elementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Briefly flash the element to show it was targeted
                    if (elementRef.current) {
                        elementRef.current.classList.add('bg-blue-100');
                        setTimeout(() => elementRef.current?.classList.remove('bg-blue-100'), 1500);
                    }
                    useCanvasStore.getState().setScrollTargetId(null);
                }, 100);
            }
        };

        // Check immediately in case we were just mounted as a result of the folder being expanded
        checkScroll(useCanvasStore.getState().scrollTargetId);

        const unsubscribe = useCanvasStore.subscribe((state) => checkScroll(state.scrollTargetId));
        return () => unsubscribe();
    }, [item.id, elementRef]);

    const getExtension = () => {
        const lastDotIndex = item.id.lastIndexOf('.');
        return lastDotIndex !== -1 ? item.id.substring(lastDotIndex).toLowerCase() : '';
    };

    const extension = getExtension();
    const isMarkdown = type === 'canvas' && extension === '.md';
    const isText = type === 'canvas' && TEXT_FILE_EXTENSIONS.includes(extension.slice(1));
    const isSpreadsheet = type === 'canvas' && TABLE_FILE_EXTENSIONS.includes(extension.slice(1));
    const isWord = type === 'canvas' && (extension === '.docx' || extension === '.doc');
    const isPdf = type === 'canvas' && extension === '.pdf';
    const isCode = type === 'canvas' && (extension === '.yaml' || extension === '.yml');
    const isJson = type === 'canvas' && extension === '.json';
    const isCanvas = type === 'canvas' && extension === '.canvas';
    const isGraph = type === 'canvas' && extension === '.graph';
    const isImage = type === 'canvas' && IMAGE_FILE_EXTENSIONS.includes(extension.slice(1));
    const isAudio = type === 'canvas' && AUDIO_FILE_EXTENSIONS.includes(extension.slice(1));
    const isVideo = type === 'canvas' && VIDEO_FILE_EXTENSIONS.includes(extension.slice(1));

    const isSupported = (type === 'folder' && !item.id.endsWith('.graph_index')) || isMarkdown || isText || isSpreadsheet || isWord || isPdf || isCode || isJson || isCanvas || isGraph || isImage || isAudio || isVideo;

    const handleClick = async (e: React.MouseEvent) => {
        // Evaluate modifiers for selection logic
        const isCmd = e.metaKey || e.ctrlKey;
        const isShift = e.shiftKey;
        const modifier = type === 'canvas' ? (isCmd ? 'cmd' : (isShift ? 'shift' : undefined)) : undefined;

        // Update unified selection
        setSelectedFolder(type === 'folder' ? item.id : null);
        useCanvasStore.getState().setSelection(item.id, type, modifier, siblingIds);

        // Focus the tree container to enable keyboard shortcuts
        const treeContainer = (e.currentTarget as HTMLElement).closest('[tabindex="0"]');
        if (treeContainer) {
            (treeContainer as HTMLElement).focus();
        }

        if (!isSupported) {
            e.preventDefault();
            return;
        }

        if (type === 'folder' && onToggle) {
            onToggle();
        } else if (type === 'canvas') {
            const shouldReplace = !e.metaKey;
            await openCanvas(item.id, { replace: shouldReplace });
            onNavigate('canvas');
        }
    };

    const handleDoubleClick = async (e: React.MouseEvent) => {
        if (!isSupported) return;
        if (type === 'canvas') {
            await openCanvas(item.id, { replace: false });
            onNavigate('canvas');
        }
    };

    const isActive = type === 'canvas' && item.id === activeCanvasId;
    const isSelected = type === 'folder' && item.id === selectedFolderId;
    const isOpen = type === 'canvas' && openCanvasIds.includes(item.id);

    // Get the display name (strip extension if it somehow remained)
    const displayName = item.name.replace(ALL_KNOWN_EXTENSIONS_REGEX, '');
    const displayTitle = type === 'canvas' && !item.name.toLowerCase().endsWith(extension) ? `${item.name}${extension}` : item.name;

    return (
        <div
            ref={elementRef}
            title={displayTitle}
            className={cn(
                "group relative flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-colors",
                isSupported ? "hover:bg-gray-100" : "opacity-40 cursor-not-allowed hover:bg-gray-50",
                isActive && "bg-primary-50 text-primary-600",
                isSelected && "bg-gray-100",
                useCanvasStore.getState().multiSelectedIds?.includes(item.id) && "ring-1 ring-primary-300 bg-primary-50/30 z-10",
                dropPosition === 'inside' && "bg-primary-50 ring-1 ring-primary-300 z-10"
            )}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={(e) => onContextMenu(e, item, type)}
            draggable={isSupported}
            onDragStart={isSupported ? handleDragStart : undefined}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Horizontal tree connection line */}
            {level > 0 && (
                <div
                    className="absolute h-px bg-gray-200 group-hover:bg-gray-400 transition-colors pointer-events-none z-10"
                    style={{
                        left: `${(level - 1) * 20 + 17.5}px`,
                        width: '10px',
                        top: '50%'
                    }}
                />
            )}

            {type === 'folder' ? (
                <div
                    className={cn(
                        "w-5 h-5 flex items-center justify-center text-gray-400 group-hover:text-gray-600 transition-opacity flex-shrink-0 cursor-pointer",
                        !hasChildren && "opacity-0 pointer-events-none"
                    )}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isSupported && onToggle) {
                            onToggle();
                        }
                    }}
                >
                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </div>
            ) : (
                // Spacer for alignment if not a folder (to match chevron width)
                <div className="w-5 h-5 flex-shrink-0" />
            )}

            <div className={cn("text-gray-500", isActive && "text-primary-600")}>
                {type === 'folder' ? (
                    <FolderIcon className="w-4 h-4 fill-current opacity-20" />
                ) : isMarkdown || isText ? (
                    extension === '.log' ? <ScrollText className="w-4 h-4 text-orange-500" /> : <FileText className="w-4 h-4 text-blue-500" />
                ) : isSpreadsheet ? (
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                ) : isWord ? (
                    <File className="w-4 h-4 text-blue-600" />
                ) : isPdf ? (
                    <FilePieChart className="w-4 h-4 text-red-500" />
                ) : isJson ? (
                    <FileJson className="w-4 h-4 text-amber-500" />
                ) : isCode ? (
                    <FileCode className="w-4 h-4 text-purple-500" />
                ) : isImage ? (
                    <ImageIcon className="w-4 h-4 text-pink-500" />
                ) : isAudio ? (
                    <Music className="w-4 h-4 text-orange-500" />
                ) : isVideo ? (
                    <Video className="w-4 h-4 text-cyan-500" />
                ) : isCanvas || isGraph ? (
                    isGraph ? <Network className="w-4 h-4 text-teal-500" /> : <LayoutTemplate className="w-4 h-4 text-violet-500" />
                ) : (
                    <File className="w-4 h-4 text-gray-400" />
                )}
            </div>

            <span className={cn(
                "flex-1 min-w-0 truncate text-sm select-none",
                isOpen && "font-medium"
            )}>
                {displayName}
                {type === 'canvas' && (
                    <span className="ml-1 text-[10px] text-gray-400 opacity-60 font-normal">
                        {extension || '.canvas'}
                    </span>
                )}
            </span>
        </div>
    );
};
