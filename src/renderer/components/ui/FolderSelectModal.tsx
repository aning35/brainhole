import { t } from 'i18next';
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';

interface FolderSelectModalProps {
    isOpen: boolean;
    title: string;
    initialFolderId?: string | null;
    onConfirm: (folderId: string | null) => void;
    onCancel: () => void;
}

export const FolderSelectModal: React.FC<FolderSelectModalProps> = ({
    isOpen,
    title,
    initialFolderId = null,
    onConfirm,
    onCancel,
}) => {
    const folders = useCanvasStore(state => state.folders);
    const vaultPath = useCanvasStore(state => state.vaultPath);
    const getFolderLevel = useCanvasStore(state => state.getFolderLevel);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen) {
            setSelectedFolderId(initialFolderId);
            
            if (initialFolderId) {
                const nextExpanded = new Set<string>();
                let currentId: string | null | undefined = initialFolderId;
                
                // Traverse up to find all parent folders to expand
                while (currentId) {
                    const folder = folders.find(f => f.id === currentId);
                    if (folder && folder.parent_id) {
                        nextExpanded.add(folder.parent_id);
                        currentId = folder.parent_id;
                    } else {
                        currentId = null;
                    }
                }
                setExpandedFolders(nextExpanded);
            }
        }
    }, [isOpen, initialFolderId, folders]);

    if (!isOpen) return null;

    const toggleExpand = (folderId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Set(expandedFolders);
        if (next.has(folderId)) next.delete(folderId);
        else next.add(folderId);
        setExpandedFolders(next);
    };

    // Helper to render tree
    const renderFolder = (parentId: string | null | undefined) => {
        const children = folders.filter(f => f.parent_id === (parentId === undefined ? null : parentId));
        if (children.length === 0) return null;

        return children.map(folder => {
            const isExpanded = expandedFolders.has(folder.id);
            const level = getFolderLevel(folder.id);
            const hasChildren = folders.some(f => f.parent_id === folder.id);
            const isSelected = selectedFolderId === folder.id;

            return (
                <div key={folder.id} className="w-full">
                    <div
                        className={`flex items-center w-full px-2 py-1.5 cursor-pointer rounded-md transition-colors ${
                            isSelected ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                        style={{ paddingLeft: `${level * 16 + 8}px` }}
                        onClick={() => setSelectedFolderId(folder.id)}
                    >
                        <div className="w-4 h-4 mr-1 flex items-center justify-center" onClick={(e) => { if (hasChildren) toggleExpand(folder.id, e); }}>
                            {hasChildren ? (
                                isExpanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />
                            ) : null}
                        </div>
                        <Folder size={16} className={`mr-2 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />
                        <span className="text-sm truncate font-medium">{folder.name}</span>
                    </div>
                    {isExpanded && renderFolder(folder.id)}
                </div>
            );
        });
    };

    const modalContent = (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
            onClick={onCancel}
        >
            <div
                className="bg-white rounded-lg shadow-xl p-6 w-[450px] max-w-[90vw] flex flex-col max-h-[80vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                    <button
                        onClick={onCancel}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50 min-h-[200px]">
                    <div
                        className={`flex items-center w-full px-2 py-2 cursor-pointer rounded-md transition-colors ${
                            selectedFolderId === null ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
                        }`}
                        onClick={() => setSelectedFolderId(null)}
                    >
                        <Folder size={16} className={`mr-2 ${selectedFolderId === null ? 'text-blue-500' : 'text-gray-400'}`} />
                        <span className="text-sm font-medium">{vaultPath ? t('ui.kbRoot') : t('ui.dbRoot')}</span>
                    </div>
                    {renderFolder(null)}
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    >
                        取消
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm(selectedFolderId)}
                        className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                    >
                        保存到此处
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
};
