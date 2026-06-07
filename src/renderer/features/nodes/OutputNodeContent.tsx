import { useTranslation } from 'react-i18next';
import { t } from 'i18next';
import { useState, useDeferredValue, useRef, useEffect, useCallback } from 'react';
import { useCanvasStore, OutputNodeData } from '@/stores/canvasStore';
import { Copy, Save, Check, Bot, Info, ChevronDown, Scissors } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { Handle, Position } from '@xyflow/react';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { useScrollPropagation } from '@/hooks/useScrollPropagation';

const processGraphTags = (text: string | undefined | null) => {
    if (!text) return text;
    // Replace [Data: Entities (x); Relationships (y); ...] with markdown links
    return text.replace(/\[Data:\s*(.*?)\]/g, (match, inner) => {
        const sections = inner.split(';');
        let mdLinks = '';
        
        sections.forEach((sec: string) => {
            const secTrim = sec.trim();
            const m = secTrim.match(/([a-zA-Z]+)\s*\((.*?)\)/i);
            
            if (m) {
                const type = m[1].trim(); // "Entities" or "Relationships"
                const ids = m[2].split(',').map((id: string) => id.trim());
                const isRel = type.toLowerCase() === 'relationships';
                const icon = isRel ? '🔗' : '🎯';
                const displayType = isRel ? t('nodes.output.relationship') : t('nodes.output.entity');
                
                ids.forEach((id: string) => {
                    const cleanType = type.toLowerCase();
                    const rawTagUrl = `${cleanType}:${id}`;
                    // Important: Using Markdown link syntax mapping to #graph-search: prefix
                    mdLinks += `[${icon} ${displayType} ${id}](#graph-search:${rawTagUrl}) `;
                });
            } else {
                mdLinks += `[📎 ${secTrim}](#graph-search:${encodeURIComponent(secTrim)}) `;
            }
        });
        
        return mdLinks.trim();
    });
};

interface OutputNodeContentProps {
    nodeId: string;
    data: OutputNodeData;
    isSelected: boolean;
    isFullscreen?: boolean;
    updateInternals?: () => void;
}

export function OutputNodeContent({ nodeId, data, isSelected, isFullscreen = false, updateInternals }: OutputNodeContentProps) {
    const { t: translation } = useTranslation();
    const saveOutputAsDataNode = useCanvasStore(state => state.saveOutputAsDataNode);
    const updateNodeData = useCanvasStore(state => state.updateNodeData);
    const edges = useCanvasStore(state => state.edges);
    const { showToast } = useToast();
    const [copied, setCopied] = useState(false);
    const { handleWheel } = useScrollPropagation();
    const [showMetadata, setShowMetadata] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [renderCount, setRenderCount] = useState(0);
    const deferredContent = useDeferredValue(data.content || '');

    const handleTagJump = useCallback((queryParam: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isRel = queryParam.startsWith('relationships:');
        const logName = isRel ? `${translation('nodes.output.relationship')} #${queryParam.split(':')[1]}` : `${translation('nodes.output.entity')} #${queryParam.split(':')[1] || queryParam}`;

        const inputNodes = data.snapshot?.inputNodes || [];
        const graphNode = inputNodes.find((n: any) => n.data?.fileUrl?.endsWith('.graph'));
        
        if (graphNode && graphNode.data.fileUrl) {
            let path = graphNode.data.fileUrl;
            if (path.startsWith('local-file://')) {
                path = decodeURIComponent(path.replace('local-file://', ''));
            } else if (path.startsWith('local-asset://')) {
                path = decodeURIComponent(path.replace('local-asset://', ''));
            }
            // Open graph file
            useCanvasStore.getState().openCanvas(path);
            
            // Allow the graph components a bit of time to mount/load before triggering the search event
            if (queryParam) {
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('graph-search', { detail: { filePath: path, query: queryParam } }));
                }, 300);
            }
            showToast(translation('nodes.output.jumpingAndSearching', { name: logName }), 'success');
        } else {
            showToast(translation('nodes.output.failedToLocateGraph'), 'warning');
        }
    }, [data.snapshot?.inputNodes, showToast]);

    const markdownComponents = {
        code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const codeContent = String(children).replace(/\n$/, '')

            return !inline && match ? (
                <div className="relative group my-4 rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                        <span className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-widest">
                            {match[1]}
                        </span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(codeContent);
                                showToast(translation('nodes.output.codeCopied'), 'success');
                            }}
                            className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white"
                            title="Copy Code"
                        >
                            <Copy size={14} />
                        </button>
                    </div>
                    <pre className="!m-0 !bg-transparent !p-4 overflow-x-auto custom-scrollbar">
                        <code className={`${className} !p-0 !text-[13px] !leading-relaxed`} {...props}>
                            {children}
                        </code>
                    </pre>
                </div>
            ) : (
                <code className={className} {...props}>
                    {children}
                </code>
            )
        },
        table: ({ children }: any) => (
            <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg">
                <table className="w-full border-collapse">
                    {children}
                </table>
            </div>
        ),
        th: ({ children }: any) => <th className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-left font-semibold text-slate-700">{children}</th>,
        td: ({ children }: any) => <td className="px-4 py-2 border-b border-slate-100 text-slate-600">{children}</td>,
        a: ({ href, children, ...props }: any) => {
            if (href?.startsWith('#graph-search:')) {
                const query = href.replace('#graph-search:', '');
                const isRel = query.startsWith('relationships:');
                const btnClass = isRel 
                    ? "inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-orange-50 border border-orange-200 text-orange-700 hover:text-orange-800 text-[10px] font-mono tracking-wide cursor-pointer hover:bg-orange-100 hover:shadow-sm hover:-translate-y-0.5 transition-all shadow-sm no-underline"
                    : "inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-700 hover:text-teal-800 text-[10px] font-mono tracking-wide cursor-pointer hover:bg-teal-100 hover:shadow-sm hover:-translate-y-0.5 transition-all shadow-sm no-underline";
                
                return (
                    <button 
                        onClick={(e) => handleTagJump(query, e)}
                        className={btnClass}
                        title={translation('nodes.output.clickToLocate', { type: isRel ? translation('nodes.output.relationship') : translation('nodes.output.entity') })}
                        type="button"
                    >
                        {children}
                    </button>
                );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" {...props} onClick={(e) => e.stopPropagation()}>{children}</a>;
        }
    };
    useEffect(() => {
        if (data.isListMode && data.parsedListItems?.length) {
            // Sequential re-renders to ensure DOM availability and React Flow registration
            const timers = [
                setTimeout(() => { setRenderCount(c => c + 1); updateInternals?.(); }, 50),
                setTimeout(() => { setRenderCount(c => c + 1); updateInternals?.(); }, 200),
                setTimeout(() => { setRenderCount(c => c + 1); updateInternals?.(); }, 600)
            ];
            return () => timers.forEach(clearTimeout);
        }
    }, [data.isListMode, data.parsedListItems?.length, updateInternals]);

    // Prefer actual usage from AI response if available
    const hasExactTokens = !!data.usage?.totalTokens;
    const countValue = data.usage?.totalTokens ?? (data.content ? data.content.length : 0);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(data.content || '');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            showToast(translation('nodes.output.copiedToClipboard'), 'success');
        } catch (err) {
            showToast(translation('nodes.output.copyFailed'), 'error');
        }
    };

    const handleSaveAsData = async () => {
        if (data.savedAsDataNode) {
            showToast(translation('nodes.output.savedAsDataNode'), 'info');
            return;
        }

        try {
            await saveOutputAsDataNode(nodeId);
            showToast(translation('nodes.output.savedAsDataNode'), 'success');
        } catch (error) {
            console.error(error);
            showToast(translation('nodes.output.saveFailed'), 'error');
        }
    };

    const handleToggleListMode = () => {
        if (!data.content) return;

        const willBeListMode = !data.isListMode;

        // Prevent toggling if there are active connections that would be broken
        if (willBeListMode) {
            // Turning ON list mode: check the main "output" handle
            const hasMainOutputConnections = edges.some(edge => edge.source === nodeId && edge.sourceHandle === 'output');
            if (hasMainOutputConnections) {
                showToast(translation('nodes.output.deleteOutputLinesFirst'), 'warning');
                return;
            }
        } else {
            // Turning OFF list mode: check all list item handles
            const listItemHandleIds = data.parsedListItems?.map(item => item.id) || [];
            const hasListItemConnections = edges.some(edge => edge.source === nodeId && listItemHandleIds.includes(edge.sourceHandle || ''));
            if (hasListItemConnections) {
                showToast(translation('nodes.output.deleteListLinesFirst'), 'warning');
                return;
            }
        }

        if (willBeListMode) {
            // Split by the specific delimiter -=-=- (allowing for whitespace/newlines around it)
            const splitRegex = /\n?\s*-=-=-\s*\n?/;
            const rawItems = data.content.split(splitRegex);
            const items = rawItems
                .map(item => item.trim())
                .filter(item => item.length > 0)
                .map((content, index) => ({
                    id: `list-item-${index}`,
                    content
                }));

            updateNodeData(nodeId, {
                isListMode: true,
                parsedListItems: items
            });
            showToast(translation('nodes.output.parsedBlocks', { count: items.length }), 'success');
        } else {
            updateNodeData(nodeId, {
                isListMode: false
            });
        }
    };

    return (
        <div className={cn("flex flex-col h-full bg-slate-50 rounded-xl", isFullscreen ? "w-full h-full" : "")}>
            {/* Action Toolbar (Top) */}
            <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs shrink-0 select-none">
                <div className="flex items-center gap-1.5 text-slate-500">
                    <span>{countValue} {hasExactTokens ? 'tokens' : t('nodes.prompt.chars')}</span>
                    {data.versions && data.versions.length > 1 && (
                        <>
                            <span className="mx-1 opacity-30">|</span>
                            <div className="relative">
                                <select
                                    className="appearance-none bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded px-2 py-0.5 pr-6 text-[10px] font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                                    value={data.currentVersionId || 'v1'}
                                    onChange={(e) => {
                                        const vid = e.target.value;
                                        const v = data.versions?.find(ver => ver.id === vid);
                                        if (v) {
                                            updateNodeData(nodeId, {
                                                currentVersionId: vid,
                                                content: v.content,
                                                snapshot: v.snapshot,
                                                usage: v.usage
                                            });
                                        }
                                    }}
                                >
                                    {data.versions.map(v => (
                                        <option key={v.id} value={v.id}>{v.id.toUpperCase()}</option>
                                    ))}
                                </select>
                                <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
                            </div>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowMetadata(!showMetadata)}
                        className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded border transition-all font-medium",
                            showMetadata ? "bg-blue-50 text-blue-600 border-blue-200" : "hover:bg-white border-transparent hover:border-slate-200 text-slate-600"
                        )}
                        title={showMetadata ? translation('nodes.output.hideMetadata') : translation('nodes.output.viewMetadata')}
                    >
                        <Info size={12} />
                        {isFullscreen && <span>{showMetadata ? translation('nodes.output.hideMetadata') : translation('nodes.output.metadata')}</span>}
                    </button>
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 px-2 py-1 hover:bg-white rounded border border-transparent hover:border-slate-200 text-slate-600 transition-all font-medium"
                        title={translation('nodes.output.copyContent')}
                    >
                        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                        {isFullscreen && <span>{translation('nodes.output.copy')}</span>}
                    </button>
                    {/* Only show split button if generation is complete AND the prompt requested split output */}
                    {data.content && data.snapshot?.requiresListOutput && (
                        <button
                            onClick={handleToggleListMode}
                            className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded border transition-all font-medium",
                                data.isListMode ? "bg-purple-50 text-purple-600 border-purple-200" : "hover:bg-white border-transparent hover:border-slate-200 text-slate-600"
                            )}
                            title={data.isListMode ? translation('nodes.output.cancelSplitResults') : translation('nodes.output.splitResultsDisplay')}
                        >
                            <Scissors size={12} />
                            {isFullscreen && <span>{data.isListMode ? translation('nodes.output.cancelSplit') : translation('nodes.output.collapseSplit')}</span>}
                        </button>
                    )}
                    <button
                        onClick={handleSaveAsData}
                        className="flex items-center gap-1 px-2 py-1 hover:bg-white rounded border border-transparent hover:border-slate-200 text-slate-600 transition-all font-medium"
                        title={translation('nodes.output.saveAsDataNode')}
                    >
                        <Save size={12} />
                        {isFullscreen && <span>{translation('nodes.output.saveAsData')}</span>}
                    </button>
                </div>
            </div>

            {/* Markdown Body Content - Relative container for Handles */}
            <div className="flex-1 relative min-h-0 overflow-visible">
                <div
                    ref={scrollRef}
                    className={cn(
                        "absolute inset-0 overflow-y-auto overflow-x-visible custom-scrollbar px-6 py-5 bg-white rounded-b-xl leading-relaxed text-slate-700",
                        isSelected ? "nowheel" : "",
                        isFullscreen ? "text-base" : "text-sm"
                    )}
                    onWheel={isSelected ? handleWheel : undefined}
                    onScroll={(e) => {
                        setScrollTop(e.currentTarget.scrollTop);
                        updateInternals?.();
                    }}
                >
                    {!data.content ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3 opacity-60">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                                <Bot className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-medium">{translation('nodes.output.waitingToGenerate')}</p>
                        </div>
                    ) : showMetadata ? (
                        <div className="flex flex-col gap-4 text-left">
                            <div className="flex flex-col gap-1">
                                <h4 className="text-xs font-semibold uppercase text-slate-500">{translation('nodes.output.generationTime')}</h4>
                                <div className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded-md border border-slate-100">
                                    {data.snapshot?.generatedAt ? new Date(data.snapshot.generatedAt).toLocaleString() : translation('nodes.output.none')}
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex flex-col gap-1 flex-1">
                                    <h4 className="text-xs font-semibold uppercase text-slate-500">Temperature</h4>
                                    <div className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded-md border border-slate-100">
                                        {(data.snapshot as any)?.temperature ?? 0.7}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 flex-1">
                                    <h4 className="text-xs font-semibold uppercase text-slate-500">Max Tokens</h4>
                                    <div className="text-sm font-mono text-slate-800 bg-slate-50 p-2 rounded-md border border-slate-100">
                                        {(data.snapshot as any)?.maxTokens ?? 6000}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <h4 className="text-xs font-semibold uppercase text-slate-500">{translation('nodes.output.fullPrompt')}</h4>
                                <div className="text-[11px] font-mono text-slate-700 bg-slate-50 p-3 rounded-md border border-slate-100 whitespace-pre-wrap break-words leading-relaxed max-h-[300px] overflow-y-auto">
                                    {(data.snapshot as any)?.fullPrompt || (data.snapshot as any)?.prompt || translation('nodes.output.noPromptProvided')}
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <h4 className="text-xs font-semibold uppercase text-slate-500">{translation('nodes.output.contextDataNodes')} ({data.snapshot?.inputNodes?.length || 0})</h4>
                                <div className="text-xs font-mono text-slate-600 bg-slate-800 p-3 rounded-md border border-slate-700 overflow-x-auto whitespace-pre">
                                    {JSON.stringify(data.snapshot?.inputNodes || [], null, 2)}
                                </div>
                            </div>
                        </div>
                    ) : data.isListMode && data.parsedListItems ? (
                        <div className="flex flex-col gap-3 pb-6 relative w-full overflow-visible">
                            {data.parsedListItems.map((item, index) => (
                                <div
                                    key={item.id}
                                    id={`${nodeId}-item-${index}`}
                                    className="relative group border border-slate-200 bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                                >
                                    <div className="absolute top-2 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mr-1">
                                            Port {index + 1}
                                        </span>
                                        <button
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                    await navigator.clipboard.writeText(item.content);
                                                    showToast(translation('nodes.output.itemContentCopied'), 'success');
                                                } catch (err) {
                                                    showToast(translation('nodes.output.copyFailed'), 'error');
                                                }
                                            }}
                                            className="p-1 px-1.5 bg-slate-50 hover:bg-white rounded border border-slate-200 text-slate-500 hover:text-blue-600 transition-colors"
                                            title={translation('nodes.output.copyThisItem')}
                                        >
                                            <Copy size={10} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                saveOutputAsDataNode(nodeId, item.content, translation('nodes.output.fromOutputItem', { index: index + 1 }));
                                                showToast(translation('nodes.output.itemSavedAsDataNode'), 'success');
                                            }}
                                            className="p-1 px-1.5 bg-slate-50 hover:bg-white rounded border border-slate-200 text-slate-500 hover:text-green-600 transition-colors"
                                            title={translation('nodes.output.saveThisItemAsDataNode')}
                                        >
                                            <Save size={10} />
                                        </button>
                                    </div>

                                    <div className={cn(
                                        "prose prose-slate max-w-none w-full text-left nodrag",
                                        "prose-headings:font-bold prose-headings:text-slate-800",
                                        "prose-p:leading-relaxed prose-p:text-slate-600",
                                        "prose-a:text-teal-600 hover:prose-a:text-teal-700",
                                        "prose-pre:bg-slate-900 prose-pre:text-gray-100 prose-pre:p-0 prose-pre:rounded-lg"
                                    )}>
                                        <ReactMarkdown 
                                            remarkPlugins={[remarkGfm]} 
                                            rehypePlugins={[rehypeRaw]}
                                            components={markdownComponents}
                                        >
                                            {processGraphTags(item.content)}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-left max-w-none relative z-0 w-full overflow-hidden">
                            <div className={cn(
                                "prose prose-slate max-w-none w-full nodrag",
                                "prose-headings:font-bold prose-headings:text-slate-800",
                                "prose-p:leading-relaxed prose-p:text-slate-600",
                                "prose-a:text-teal-600 hover:prose-a:text-teal-700",
                                "prose-table:border prose-table:border-slate-200 prose-table:rounded-lg prose-th:bg-slate-50 prose-th:px-4 prose-th:py-2 prose-td:px-4 prose-td:py-2",
                                "prose-code:text-teal-700 prose-code:bg-teal-50 prose-code:px-1 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
                                "prose-pre:bg-slate-900 prose-pre:text-gray-100 prose-pre:p-0 prose-pre:rounded-lg",
                                isFullscreen ? "prose-base" : "prose-sm"
                            )}>
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw]}
                                    components={markdownComponents}
                                >
                                    {processGraphTags(deferredContent)}
                                </ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>

                {/* Sticky Handles Overlay (Sibling) */}
                {data.isListMode && data.parsedListItems && (
                    <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none overflow-visible rounded-b-xl z-50">
                        {/* renderCount ensures we re-evaluate these handles after mount */}
                        <div className="hidden">{renderCount}</div>

                        {data.parsedListItems.map((item, index) => {
                            const itemEl = document.getElementById(`${nodeId}-item-${index}`);
                            const viewportHeight = scrollRef.current?.clientHeight || 0;

                            let clampedY = 24;

                            if (itemEl && scrollRef.current && viewportHeight > 0) {
                                const itemHeight = itemEl.offsetHeight;
                                const itemCenter = itemEl.offsetTop + itemHeight / 2;
                                const relativeCenter = itemCenter - scrollTop;
                                clampedY = Math.max(12, Math.min(viewportHeight - 12, relativeCenter));
                            } else if (data.isListMode) {
                                // Fallback while waiting for DOM
                                clampedY = 24 + (index * 60);
                            }

                            return (
                                <Handle
                                    key={item.id}
                                    type="source"
                                    position={Position.Right}
                                    id={item.id}
                                    className="!w-3.5 !h-3.5 !bg-purple-500 !border-2 !border-white !absolute !right-[-7px] pointer-events-auto shadow-sm transition-all duration-200"
                                    style={{
                                        top: 0,
                                        transform: `translateY(${clampedY - 7}px)`,
                                        cursor: 'crosshair',
                                        zIndex: 1000,
                                        opacity: viewportHeight > 0 ? 1 : 0
                                    }}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
