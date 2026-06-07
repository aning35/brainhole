import { useTranslation } from 'react-i18next';
import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronRight, ChevronDown, Folder, FileText, CheckSquare, Square, Search } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';
import { cn } from '@/lib/utils';
import { TEXT_FILE_EXTENSIONS, DOCUMENT_FILE_EXTENSIONS, TABLE_FILE_EXTENSIONS } from '@/utils/fileTypes';

/** Extensions allowed for graph indexing (all formats supported by backend DocumentParser) */
const TEXT_EXTENSIONS = new Set(
    [
        ...TEXT_FILE_EXTENSIONS, 
        ...DOCUMENT_FILE_EXTENSIONS, 
        ...TABLE_FILE_EXTENSIONS, 
        'markdown', 'mhtml'
    ].map(ext => `.${ext}`)
);

/** Extract the real file extension from a full path / canvas id */
function getExtension(id: string): string {
    const lastDot = id.lastIndexOf('.');
    const lastSep = Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\'));
    if (lastDot > lastSep && lastDot !== -1) {
        return id.substring(lastDot).toLowerCase();
    }
    return '';
}

/** Check whether a canvas represents a text-based file eligible for graph indexing */
function isTextFile(canvasId: string): boolean {
    return TEXT_EXTENSIONS.has(getExtension(canvasId));
}

interface MultiFileSelectorProps {
    selectedFiles: string[];
    onToggleFile: (path: string) => void;
    onToggleMultipleFiles?: (paths: string[], isSelect: boolean) => void;
    onClose: () => void;
    /** Path of the currently open graph file — will be excluded from the list */
    currentGraphPath?: string;
}

function getAllTextFilesInFolder(folderId: string, folders: any[], canvases: any[], currentGraphPath?: string): string[] {
    let result: string[] = [];
    const subCanvases = canvases.filter((c: any) => c.folderId === folderId && c.id !== currentGraphPath && isTextFile(c.id));
    result.push(...subCanvases.map((c: any) => c.id));

    const subFolders = folders.filter((f: any) => f.parent_id === folderId);
    for (const f of subFolders) {
        result.push(...getAllTextFilesInFolder(f.id, folders, canvases, currentGraphPath));
    }
    return result;
}

export function MultiFileSelector({
    selectedFiles, onToggleFile, onToggleMultipleFiles, onClose, currentGraphPath }: MultiFileSelectorProps) {
    const { t } = useTranslation();
    const { 
        folders,
        canvases
    } = useCanvasStore();

    const selectedFilesSet = useMemo(() => new Set(selectedFiles), [selectedFiles]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const toggleFolder = (id: string) => {
        const next = new Set(expandedFolders);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedFolders(next);
    };

    // Filter and build tree — sorted consistently with sidebar (zh-CN locale)
    const rootFolders = folders
        .filter(f => !f.parent_id)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    const rootCanvases = canvases
        .filter(f => !f.folderId && f.id !== currentGraphPath && isTextFile(f.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg h-[600px] flex flex-col overflow-hidden border border-gray-100">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{t('graph.selector.title')}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{t('graph.selector.subtitle')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-100">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={t('graph.selector.search')}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="space-y-1">
                        {rootFolders.map(folder => (
                            <FolderNode 
                                key={folder.id} 
                                folder={folder} 
                                level={0}
                                expandedFolders={expandedFolders}
                                toggleFolder={toggleFolder}
                                selectedFiles={selectedFilesSet}
                                toggleFile={onToggleFile}
                                toggleMultipleFiles={onToggleMultipleFiles}
                                searchQuery={searchQuery}
                                currentGraphPath={currentGraphPath}
                            />
                        ))}
                        {rootCanvases.map(canvas => (
                            <FileNode 
                                key={canvas.id} 
                                canvas={canvas} 
                                level={0}
                                selectedFiles={selectedFilesSet}
                                toggleFile={onToggleFile}
                                searchQuery={searchQuery}
                            />
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                        {t('graph.selector.selected')} <span className="font-bold text-blue-600">{selectedFiles.length}</span> {t('graph.selector.files')}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            取消
                        </button>
                        <button
                            onClick={onClose}
                            className="px-6 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
                        >
                            完成
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

function FolderNode({ folder, level, expandedFolders, toggleFolder, selectedFiles, toggleFile, toggleMultipleFiles, searchQuery, currentGraphPath }: any) {
    const { folders, canvases } = useCanvasStore();
    const isExpanded = expandedFolders.has(folder.id);
    
    const subFolders = folders
        .filter((f: any) => f.parent_id === folder.id)
        .sort((a: any, b: any) => a.name.localeCompare(b.name, 'zh-CN'));
    const subCanvases = canvases
        .filter((c: any) => c.folderId === folder.id && c.id !== currentGraphPath && isTextFile(c.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name, 'zh-CN'));

    // Basic visibility check for search
    const hasVisibleChildren = useMemo(() => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const checkChildren = (fId: string): boolean => {
            if (folders.some((f: any) => f.parent_id === fId && f.name.toLowerCase().includes(q))) return true;
            if (canvases.some((c: any) => c.folderId === fId && c.id !== currentGraphPath && isTextFile(c.id) && c.name.toLowerCase().includes(q))) return true;
            return folders.filter((f: any) => f.parent_id === fId).some((f: any) => checkChildren(f.id));
        };
        return folder.name.toLowerCase().includes(q) || checkChildren(folder.id);
    }, [folder, folders, canvases, searchQuery, currentGraphPath]);

    const allFiles = useMemo(() => getAllTextFilesInFolder(folder.id, folders, canvases, currentGraphPath), [folder.id, folders, canvases, currentGraphPath]);
    const selectedCount = allFiles.filter(id => selectedFiles.has(id)).length;
    const isAllSelected = allFiles.length > 0 && selectedCount === allFiles.length;
    const isPartiallySelected = selectedCount > 0 && selectedCount < allFiles.length;

    if (!hasVisibleChildren) return null;

    return (
        <div className="select-none">
            <div 
                className="flex items-center gap-2 py-1 px-2 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors group"
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={() => toggleFolder(folder.id)}
            >
                <div className="w-4 h-4 flex items-center justify-center text-gray-400">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {allFiles.length > 0 && (
                    <div 
                        className={cn(
                            "p-0.5 rounded transition-colors -ml-1",
                            isAllSelected ? "text-blue-600" : isPartiallySelected ? "text-blue-400" : "text-gray-300 group-hover:text-gray-400"
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (toggleMultipleFiles) {
                                toggleMultipleFiles(allFiles, !isAllSelected);
                            }
                        }}
                    >
                        {isAllSelected ? <CheckSquare size={16} /> : isPartiallySelected ? <CheckSquare size={16} className="opacity-50" /> : <Square size={16} />}
                    </div>
                )}
                <Folder size={16} className="text-amber-500 fill-amber-500/20" />
                <span className="text-sm text-gray-700 font-medium truncate">{folder.name}</span>
            </div>
            
            {isExpanded && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                    {subFolders.map((f: any) => (
                        <FolderNode 
                            key={f.id} 
                            folder={f} 
                            level={level + 1}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            selectedFiles={selectedFiles}
                            toggleFile={toggleFile}
                            toggleMultipleFiles={toggleMultipleFiles}
                            searchQuery={searchQuery}
                            currentGraphPath={currentGraphPath}
                        />
                    ))}
                    {subCanvases.map((c: any) => (
                        <FileNode 
                            key={c.id} 
                            canvas={c} 
                            level={level + 1}
                            selectedFiles={selectedFiles}
                            toggleFile={toggleFile}
                            searchQuery={searchQuery}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function FileNode({ canvas, level, selectedFiles, toggleFile, searchQuery }: any) {
    const isSelected = selectedFiles.has(canvas.id);
    
    if (searchQuery && !canvas.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return null;
    }

    // Extract real extension from the full path (canvas.id)
    const ext = getExtension(canvas.id);

    return (
        <div 
            className={cn(
                "flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-all group",
                isSelected ? "bg-blue-50/30" : ""
            )}
            style={{ paddingLeft: `${level * 16 + 24}px` }}
            onClick={() => toggleFile(canvas.id)}
        >
            <div className={cn(
                "p-0.5 rounded transition-colors",
                isSelected ? "text-blue-600" : "text-gray-300 group-hover:text-gray-400"
            )}>
                {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </div>
            <FileText size={16} className={cn(
                "transition-colors",
                isSelected ? "text-blue-500" : "text-gray-400"
            )} />
            <span className={cn(
                "text-sm truncate transition-colors",
                isSelected ? "text-blue-700 font-medium" : "text-gray-600"
            )}>
                {canvas.name}{ext}
            </span>
        </div>
    );
}
