import React, { useState, useEffect } from 'react';
import { Database, ChevronRight, ChevronDown, FileText, Folder as FolderIcon, Loader2, ExternalLink, RefreshCw, Copy } from 'lucide-react';
import { useContextMenu } from '@/components/ui/ContextMenu';
import { useCanvasStore } from '@/stores/canvasStore';
import { imaNoteContentCache } from '@/stores/slices/canvasSlice';
import { imaService, ImaApiError } from '@/services/imaService';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

interface IMAItem {
    id: string;
    name: string;
    type: 'kb' | 'folder' | 'file';
    media_type?: number;
    kb_id?: string;
    base_type?: string;
    cover_url?: string;
}

/**
 * Preprocess IMA note content for Markdown rendering.
 * 
 * The IMA `get_doc_content` API returns plain text with NO newlines:
 * - Code blocks are wrapped in <code>...</code> HTML tags
 * - Line breaks inside code use <br> tags  
 * - All other markdown formatting (headings, bold, lists) is stripped
 * 
 * This function reconstructs readable structure from the flat text.
 */
function preprocessImaNoteContent(text: string): string {
    if (!text) return text;

    let result = text;

    // Step 1: Extract <code>...</code> blocks → fenced code blocks
    // Use a placeholder to protect them from Step 3's text reformatting
    const codeBlocks: string[] = [];
    result = result.replace(/<code>([\s\S]*?)<\/code>/gi, (_match, codeContent: string) => {
        let code = codeContent;
        
        // Detect if it's a Mermaid diagram
        const mermaidStarters = [
            'sequenceDiagram', 'graph ', 'flowchart ', 'classDiagram',
            'stateDiagram', 'erDiagram', 'gantt', 'pie ', 'gitgraph',
            'mindmap', 'timeline', 'journey',
        ];
        const isMermaid = mermaidStarters.some(kw => code.trimStart().startsWith(kw));
        
        // Fix spacing FIRST (before <br> conversion):
        // IMA flattens mermaid with "    " (4+ spaces) as line separator
        if (isMermaid) {
            code = code.replace(/\s{4,}/g, '\n    ');
        }
        
        // Convert <br> tags:
        // In Mermaid: <br> appears inside message text — replace with space to avoid syntax errors
        // In other code: <br> represents real line breaks
        code = code.replace(/<br\s*\/?>/gi, isMermaid ? ' ' : '\n');
        
        const lang = isMermaid ? 'mermaid' : '';
        const fenced = `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
        const placeholder = `\x00CODEBLOCK_${codeBlocks.length}\x00`;
        codeBlocks.push(fenced);
        return placeholder;
    });

    // Step 2: Convert remaining <br> to newlines
    result = result.replace(/<br\s*\/?>/gi, '\n');

    // Step 3: No further text formatting — display content as IMA returns it

    // Step 4: Restore code blocks from placeholders
    for (let i = 0; i < codeBlocks.length; i++) {
        result = result.replace(`\x00CODEBLOCK_${i}\x00`, codeBlocks[i]);
    }

    // Step 5: Clean up
    result = result.replace(/\n{4,}/g, '\n\n\n');
    result = result.trim();

    return result;
}

export const IMATree = () => {
    const { t } = useTranslation();
    const { imaClientId, imaApiKey } = useCanvasStore();
    const { showToast } = useToast();
    const { showMenu } = useContextMenu();
    
    const [kbs, setKbs] = useState<IMAItem[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [childrenMap, setChildrenMap] = useState<Record<string, IMAItem[]>>({});
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
    const [cursorMap, setCursorMap] = useState<Record<string, string>>({});
    const [hasMoreMap, setHasMoreMap] = useState<Record<string, boolean>>({});
    const [isLoadingKbs, setIsLoadingKbs] = useState(false);
    const [kbCursor, setKbCursor] = useState<string>('');
    const [kbHasMore, setKbHasMore] = useState<boolean>(false);
    const [isRootExpanded, setIsRootExpanded] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['个人知识库', '共享知识库', '我加入的订阅知识库']));

    const getCategoryName = (cat: string) => {
        if (cat === '个人知识库') return t('ima.catPersonal', '个人知识库');
        if (cat === '共享知识库') return t('ima.catShared', '共享知识库');
        if (cat === '我加入的订阅知识库') return t('ima.catSubscribed', '订阅知识库');
        return cat === '其他知识库' ? t('ima.otherKbs', '其他知识库') : cat;
    };

    const toggleCategory = (cat: string) => {
        const newSet = new Set(expandedCategories);
        if (newSet.has(cat)) newSet.delete(cat);
        else newSet.add(cat);
        setExpandedCategories(newSet);
    };

    useEffect(() => {
        if (imaClientId && imaApiKey) {
            const timer = setTimeout(() => {
                loadKbs();
            }, 800);
            return () => clearTimeout(timer);
        } else {
            setKbs([]);
        }
    }, [imaClientId, imaApiKey]);

    const loadKbs = async (loadMore = false) => {
        setIsLoadingKbs(true);
        try {
            const currentCursor = loadMore ? kbCursor : '';
            const res = await imaService.searchKnowledgeBase({ clientId: imaClientId, apiKey: imaApiKey }, '', currentCursor, 20);
            const kbList = (res.info_list || []).map((kb: any) => ({
                id: kb.kb_id || kb.knowledge_base_id,
                name: kb.kb_name || kb.name,
                type: 'kb',
                kb_id: kb.kb_id || kb.knowledge_base_id,
                base_type: kb.base_type || '其他知识库',
                cover_url: kb.cover_url,
            }));
            
            if (loadMore) {
                setKbs(prev => [...prev, ...kbList]);
            } else {
                setKbs(kbList);
            }
            setKbCursor(res.next_cursor || '');
            setKbHasMore(!res.is_end);
        } catch (error: any) {
            showToast(`${t('ima.errorLoadKb')}${error.message}`, 'error');
        } finally {
            setIsLoadingKbs(false);
        }
    };

    const toggleExpand = async (item: IMAItem) => {
        if (item.type === 'file') return;
        
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(item.id)) {
            newExpanded.delete(item.id);
            setExpandedIds(newExpanded);
            return;
        }

        newExpanded.add(item.id);
        setExpandedIds(newExpanded);

        if (!childrenMap[item.id]) {
            await loadChildren(item);
        }
    };

    const loadChildren = async (item: IMAItem, loadMore = false) => {
        setLoadingIds(prev => new Set(prev).add(item.id));
        try {
            const currentCursor = loadMore ? (cursorMap[item.id] || '') : '';
            const res = await imaService.getKnowledgeList(
                { clientId: imaClientId, apiKey: imaApiKey },
                item.kb_id!,
                item.type === 'folder' ? item.id : undefined,
                currentCursor,
                20
            );

            const newChildren: IMAItem[] = [];
            (res.knowledge_list || []).forEach((itemData: any) => {
                const isFolder = itemData.media_type === 99 || itemData.media_id?.startsWith('folder_');
                newChildren.push({
                    id: itemData.media_id,
                    name: itemData.title,
                    type: isFolder ? 'folder' : 'file',
                    media_type: itemData.media_type,
                    kb_id: item.kb_id,
                });
            });

            setChildrenMap(prev => {
                const existing = loadMore ? (prev[item.id] || []) : [];
                return { ...prev, [item.id]: [...existing, ...newChildren] };
            });
            setCursorMap(prev => ({ ...prev, [item.id]: res.next_cursor || '' }));
            setHasMoreMap(prev => ({ ...prev, [item.id]: !res.is_end }));
        } catch (error: any) {
            showToast(`${t('ima.errorLoadContent')}${error.message}`, 'error');
            if (!loadMore) {
                const newExpanded = new Set(expandedIds);
                newExpanded.delete(item.id);
                setExpandedIds(newExpanded);
            }
        } finally {
            setLoadingIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
        }
    };

    const handleFileClick = async (item: IMAItem) => {
        if (item.type !== 'file') return;
        
        const mediaType: number = item.media_type ?? 0;

        // media_type=11 (note): try reading content directly via note API
        if (mediaType === 11) {
            showToast(t('ima.gettingFileInfo'), 'info');
            try {
                // Try with full media_id first, then extracted numeric part
                let content: string | null = null;
                const opts = { clientId: imaClientId, apiKey: imaApiKey };
                const docIdCandidates: string[] = [];
                // media_id format: note_{userHash}_{32digits}
                // The actual note_id is the FIRST 16 digits of the 32-digit suffix
                const parts = item.id.split('_');
                const lastPart = parts[parts.length - 1] || '';
                if (lastPart.length > 16 && /^\d+$/.test(lastPart)) {
                    docIdCandidates.push(lastPart.substring(0, 16)); // most likely: first 16 digits
                }
                docIdCandidates.push(item.id); // full media_id
                if (parts.length >= 3) docIdCandidates.push(parts.slice(2).join('_'));
                if (parts.length >= 2 && !docIdCandidates.includes(lastPart)) docIdCandidates.push(lastPart);

                for (const docId of docIdCandidates) {
                    try {
                        const res = await imaService.getNoteContent(opts, docId);
                        if (res?.content) {
                            content = res.content;
                            break;
                        }
                    } catch (_) { /* try next candidate */ }
                }

                if (content) {
                    const noteId = `ima-note://${encodeURIComponent(item.name)}`;
                    imaNoteContentCache.set(noteId, preprocessImaNoteContent(content));
                    await useCanvasStore.getState().openCanvas(noteId);
                    showToast(t('ima.openedInCanvas', '已在画布中打开'), 'success');
                } else {
                    window.open('imacopilot://', '_blank');
                    showToast(t('ima.jumpToClient', '已跳转至 IMA 客户端查看'), 'success');
                }
            } catch {
                window.open('imacopilot://', '_blank');
                showToast(t('ima.jumpToClient', '已跳转至 IMA 客户端查看'), 'success');
            }
            return;
        }

        // media_type=12 (AI session): no API available, jump to IMA client
        if (mediaType === 12) {
            window.open('imacopilot://', '_blank');
            showToast(t('ima.jumpToClient', '已跳转至 IMA 客户端查看'), 'success');
            return;
        }

        // All other types: call get_media_info for URL
        showToast(t('ima.gettingFileInfo'), 'info');
        try {
            const res = await imaService.getMediaInfo({ clientId: imaClientId, apiKey: imaApiKey }, item.id);
            const apiMediaType: number = res.media_type ?? mediaType;
            const url = res.url_info?.url;

            if (!url) {
                window.open('imacopilot://', '_blank');
                showToast(t('ima.jumpToClient', '已跳转至 IMA 客户端查看'), 'success');
                return;
            }

            // Route by media_type:
            //   1=PDF, 3=Word/Excel/PPT, 9=Image → open in canvas
            //   2=Web URL, 6=WeChat article → open in external browser
            switch (apiMediaType) {
                case 1:   // PDF
                case 3:   // Word/Office docs
                case 9: { // Image
                    let finalUrl = url;
                    if (!finalUrl.includes('media_title=') && item.name) {
                        finalUrl += (finalUrl.includes('?') ? '&' : '?') + `media_title=${encodeURIComponent(item.name)}`;
                    }
                    await useCanvasStore.getState().openCanvas(finalUrl);
                    showToast(t('ima.openedInCanvas', '已在画布中打开'), 'success');
                    break;
                }
                case 2:   // Web URL
                case 6: { // WeChat article
                    window.open(url, '_blank');
                    showToast(t('ima.openedInBrowser'), 'success');
                    break;
                }
                default: {
                    if (url.startsWith('chrome://')) {
                        window.open('imacopilot://', '_blank');
                        showToast(t('ima.jumpToClient', '已跳转至 IMA 客户端查看'), 'success');
                    } else {
                        let finalUrl = url;
                        if (!finalUrl.includes('media_title=') && item.name) {
                            finalUrl += (finalUrl.includes('?') ? '&' : '?') + `media_title=${encodeURIComponent(item.name)}`;
                        }
                        await useCanvasStore.getState().openCanvas(finalUrl);
                        showToast(t('ima.openedInCanvas', '已在画布中打开'), 'success');
                    }
                    break;
                }
            }
        } catch (error: any) {
            if (error instanceof ImaApiError && error.code === 200005) {
                showToast(error.message, 'warning');
            } else if (error.message?.includes('权限') || error.message?.includes('获取失败') || error.message?.includes('至ima内查看')) {
                window.open('imacopilot://', '_blank');
                showToast(t('ima.jumpToClient', '已跳转至 IMA 客户端查看'), 'success');
            } else {
                showToast(`${t('ima.errorGetMedia')}${error.message}`, 'error');
            }
        }
    };

    const renderItem = (item: IMAItem, level: number) => {
        const isExpanded = expandedIds.has(item.id);
        const isLoading = loadingIds.has(item.id);
        const children = childrenMap[item.id] || [];

        return (
            <div key={`${item.type}-${item.id}`}>
                <div 
                    className="group flex items-center px-2 py-1.5 text-sm text-gray-700 hover:bg-blue-50/50 hover:text-blue-700 cursor-pointer transition-colors rounded-md select-none"
                    style={{ paddingLeft: `${level * 16 + 8}px` }}
                    onClick={() => item.type === 'file' ? handleFileClick(item) : toggleExpand(item)}
                    draggable={item.type === 'file'}
                    onDragStart={(e) => {
                        if (item.type !== 'file') return;
                        e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'ima-file',
                            media_id: item.id,
                            media_type: item.media_type,
                            title: item.name,
                            kb_id: item.kb_id,
                        }));
                        e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const menuItems: any[] = [];
                        if (item.type === 'kb' || item.type === 'folder') {
                            menuItems.push({
                                label: t('sidebar.refresh'),
                                icon: <RefreshCw className="w-4 h-4" />,
                                onClick: () => {
                                    // Clear cached children and reload
                                    setChildrenMap(prev => {
                                        const next = { ...prev };
                                        delete next[item.id];
                                        return next;
                                    });
                                    setCursorMap(prev => {
                                        const next = { ...prev };
                                        delete next[item.id];
                                        return next;
                                    });
                                    setHasMoreMap(prev => {
                                        const next = { ...prev };
                                        delete next[item.id];
                                        return next;
                                    });
                                    loadChildren(item);
                                    if (!expandedIds.has(item.id)) {
                                        setExpandedIds(prev => new Set(prev).add(item.id));
                                    }
                                },
                            });
                        }
                        menuItems.push({
                            label: t('sidebar.copyPath'),
                            icon: <Copy className="w-4 h-4" />,
                            onClick: () => {
                                navigator.clipboard.writeText(item.id);
                                showToast(t('app.copyPath') + ': ' + item.id, 'success');
                            },
                        });
                        showMenu({ x: e.clientX, y: e.clientY }, menuItems);
                    }}
                >
                    <div className="w-4 h-4 mr-1 flex items-center justify-center shrink-0">
                        {isLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                        ) : item.type !== 'file' ? (
                            isExpanded ? <ChevronDown className="w-3.5 h-3.5 opacity-70" /> : <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                        ) : null}
                    </div>
                    
                    {item.type === 'kb' ? (
                        item.cover_url ? (
                            <img src={item.cover_url} className="w-4 h-4 mr-2 rounded-sm shrink-0 object-cover" alt="" />
                        ) : (
                            <Database className="w-4 h-4 mr-2 text-indigo-500 shrink-0" />
                        )
                    ) : item.type === 'folder' ? (
                        <FolderIcon className="w-4 h-4 mr-2 text-blue-400 shrink-0" />
                    ) : (
                        <FileText className="w-4 h-4 mr-2 text-gray-400 shrink-0" />
                    )}
                    
                    <span className="truncate flex-1 text-xs">{item.name}</span>
                    
                    {item.type === 'file' && (
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 text-gray-400 shrink-0" />
                    )}
                </div>
                
                {isExpanded && children.map(child => renderItem(child, level + 1))}
                {isExpanded && !isLoading && children.length === 0 && (
                    <div className="text-xs text-gray-400 py-1" style={{ paddingLeft: `${(level + 1) * 16 + 28}px` }}>
                        {t('ima.emptyFolder')}
                    </div>
                )}
                {isExpanded && !isLoading && hasMoreMap[item.id] && (
                    <div 
                        className="group flex items-center px-2 py-1 text-xs text-blue-500 hover:text-blue-700 cursor-pointer transition-colors select-none"
                        style={{ paddingLeft: `${(level + 1) * 16 + 28}px` }}
                        onClick={() => loadChildren(item, true)}
                    >
                        {t('ima.loadMore', '加载更多...')}
                    </div>
                )}
            </div>
        );
    };

    // Only show the IMA Knowledge Base section if credentials are configured
    if (!imaClientId || !imaApiKey) {
        return null;
    }

    return (
        <div 
            className="flex flex-col gap-0.5 mt-0.5"
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            {/* The root node masquerading as a top-level folder */}
            <div 
                className="group flex items-center px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors rounded-md select-none"
                onClick={() => setIsRootExpanded(!isRootExpanded)}
            >
                <div className="w-4 h-4 mr-1 flex items-center justify-center shrink-0">
                    {isRootExpanded ? <ChevronDown className="w-3.5 h-3.5 opacity-70" /> : <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
                </div>
                <Database className="w-4 h-4 mr-2 text-indigo-500 shrink-0" />
                <span className="truncate flex-1">{t('ima.title')}</span>
            </div>
            
            {/* The expanded children (Knowledge Bases) */}
            {isRootExpanded && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                    {isLoadingKbs ? (
                        <div className="flex items-center justify-center py-2 text-xs text-gray-400 gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('ima.loading')}
                        </div>
                    ) : kbs.length === 0 ? (
                        <div className="text-xs text-gray-400 py-1" style={{ paddingLeft: '32px' }}>
                            {t('ima.notFound')}
                        </div>
                    ) : (
                        <>
                            {Object.entries(
                                kbs.reduce((acc, kb) => {
                                    const type = kb.base_type || '其他知识库';
                                    if (!acc[type]) acc[type] = [];
                                    acc[type].push(kb);
                                    return acc;
                                }, {} as Record<string, IMAItem[]>)
                            ).sort(([a], [b]) => {
                                const order: Record<string, number> = { '个人知识库': 0, '共享知识库': 1, '我加入的订阅知识库': 2 };
                                return (order[a] ?? 99) - (order[b] ?? 99);
                            }).map(([category, items]) => (
                                <div key={category} className="flex flex-col gap-0.5">
                                    <div 
                                        className="group flex items-center px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 cursor-pointer transition-colors rounded-md select-none mt-1"
                                        style={{ paddingLeft: '24px' }}
                                        onClick={() => toggleCategory(category)}
                                    >
                                        <div className="w-3.5 h-3.5 mr-1 flex items-center justify-center shrink-0">
                                            {expandedCategories.has(category) ? <ChevronDown className="w-3 h-3 opacity-70" /> : <ChevronRight className="w-3 h-3 opacity-70" />}
                                        </div>
                                        <span className="truncate flex-1">{getCategoryName(category)}</span>
                                    </div>
                                    {expandedCategories.has(category) && items.map(kb => renderItem(kb, 2))}
                                </div>
                            ))}
                            {kbHasMore && !isLoadingKbs && (
                                <div 
                                    className="group flex items-center px-2 py-1 text-xs text-blue-500 hover:text-blue-700 cursor-pointer transition-colors select-none"
                                    style={{ paddingLeft: '44px' }}
                                    onClick={() => loadKbs(true)}
                                >
                                    {t('ima.loadMore', '加载更多...')}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
