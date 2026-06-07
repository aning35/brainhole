import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useCanvasStore, PromptNodeData } from '@/stores/canvasStore';
import {
    Database,
    Cpu,
    Play,
    X,
    Sparkles,
    Loader2,
    Brain,
    Zap,
    ListOrdered,
    RotateCcw
} from 'lucide-react';
import { Node, useReactFlow } from '@xyflow/react';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { aiService, AIContextItem } from '@/services/aiService';
import { useScrollPropagation } from '@/hooks/useScrollPropagation';

interface PromptNodeContentProps {
    nodeId: string;
    data: PromptNodeData;
    isFullscreen?: boolean;
}

export function PromptNodeContent({ nodeId, data, isFullscreen = false }: PromptNodeContentProps) {
    const { t } = useTranslation();
    const updateNodeData = useCanvasStore(state => state.updateNodeData);
    const generateOutput = useCanvasStore(state => state.generateOutput);
    const getConnectedContextNodes = useCanvasStore(state => state.getConnectedContextNodes);
    const { showToast } = useToast();
    const { handleWheel } = useScrollPropagation();
    const { fitView } = useReactFlow();

    const [promptText, setPromptText] = useState(data.promptText || '');
    const [isFocused, setIsFocused] = useState(false);
    const [isGenerating, setIsGenerating] = useState(data.status === 'generating');
    const [connectedNodes, setConnectedNodes] = useState<Node<any>[]>([]);

    const [isSuggesting, setIsSuggesting] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>((data as any).suggestions || []);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        setPromptText(data.promptText || '');
    }, [data.promptText]);

    useEffect(() => {
        const updateNodes = () => {
            const currentNodes = getConnectedContextNodes(nodeId) as Node<any>[];
            setConnectedNodes(prev => {
                if (currentNodes.length !== prev.length ||
                    currentNodes.some((n, i) => n.id !== prev[i]?.id)) {
                    return currentNodes;
                }
                return prev;
            });
        };

        updateNodes();
        const interval = setInterval(updateNodes, 1000);
        return () => clearInterval(interval);
    }, [getConnectedContextNodes, nodeId]);

    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPromptText(e.target.value);
    };

    const handleBlur = () => {
        setIsFocused(false);
        if (promptText !== data.promptText) {
            updateNodeData(nodeId, { promptText });
        }
    };

    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleGenerate = async () => {
        if (!promptText.trim()) {
            showToast(t('nodes.prompt.enterPrompt'), 'warning');
            return;
        }

        try {
            setIsGenerating(true);
            updateNodeData(nodeId, { status: 'generating' });
            showToast(t('nodes.prompt.generating'), 'info');

            await generateOutput(nodeId);

            updateNodeData(nodeId, { status: 'completed' });
            showToast(t('nodes.prompt.success'), 'success');
        } catch (error) {
            console.error(error);
            updateNodeData(nodeId, { status: 'error', error: (error as Error).message });
            showToast(t('nodes.prompt.errorPrefix') + (error as Error).message, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateSuggestions = async (forceRefresh = false) => {
        if (connectedNodes.length === 0) {
            showToast(t('nodes.prompt.connectDataFirst'), 'warning');
            return;
        }

        if (!forceRefresh && (data as any).suggestions && (data as any).suggestions.length > 0) {
            setSuggestions((data as any).suggestions);
            setShowSuggestions((prev) => !prev);
            return;
        }

        setIsSuggesting(true);
        setShowSuggestions(false);
        try {
            const contextItems: AIContextItem[] = connectedNodes.map(n => ({
                nodeId: n.id,
                title: (n.data.title as string) || (n.type === 'output' ? t('nodes.prompt.outputNode') : t('nodes.prompt.unnamed')),
                dataType: (n.data.dataType as 'text' | 'table' | 'document' | 'image' | 'video') || 'text',
                content: n.type === 'output' ? n.data.content : n.data.textContent,
                data: n.data.data as any[] | undefined,
                columns: n.data.columns as string[] | undefined,
                fileUrl: n.data.fileUrl as string | undefined,
                fileName: n.data.fileName as string | undefined,
            }));

            const response = await aiService.generateContent({
                prompt: t('nodes.prompt.aiSuggestionPrompt'),
                context: contextItems,
                temperature: 0.8,
            });

            // Clean lines and filter empty strings
            const parsedSuggestions = response.content
                .split('\n')
                .map(line => line.replace(/^[\d\.\-\*\s]+/, '').trim())
                .filter(line => line.length > 0)
                .slice(0, 10);

            if (parsedSuggestions.length > 0) {
                setSuggestions(parsedSuggestions);
                updateNodeData(nodeId, { suggestions: parsedSuggestions });
                setShowSuggestions(true);
            } else {
                showToast(t('nodes.prompt.noValidSuggestions'), 'error');
            }
        } catch (error) {
            console.error('AI Suggestion error:', error);
            showToast(t('nodes.prompt.getSuggestionsFailed') + (error as Error).message, 'error');
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleApplySuggestion = (suggestion: string) => {
        setPromptText(suggestion);
        updateNodeData(nodeId, { promptText: suggestion });
        setShowSuggestions(false);
    };

    const edges = useCanvasStore(state => state.edges);
    const onEdgesChange = useCanvasStore(state => state.onEdgesChange);
    const onNodesChange = useCanvasStore(state => state.onNodesChange);
    const nodes = useCanvasStore(state => state.nodes);

    const handleContextClick = (e: React.MouseEvent, targetNodeId: string) => {
        e.stopPropagation(); // Prevent click from selecting the current prompt node

        // 1. Get all connected edges to this node to deselect them
        const connectedEdgeIds = edges
            .filter(e => e.source === nodeId || e.target === nodeId)
            .map(e => e.id);

        const edgeChanges = connectedEdgeIds.map(id => ({
            id,
            type: 'select' as const,
            selected: false
        }));

        // 2. Create changes to deselect ALL other nodes and select only the target
        // This ensures a clean single selection state
        const nodeChanges = nodes.map(n => ({
            id: n.id,
            type: 'select' as const,
            selected: n.id === targetNodeId
        }));

        onNodesChange(nodeChanges);

        if (edgeChanges.length > 0) {
            onEdgesChange(edgeChanges);
        }

        // Center canvas on the target node
        setTimeout(() => {
            fitView({
                nodes: [{ id: targetNodeId }],
                duration: 500,
                padding: 0.2
            });
        }, 50);
    };

    const handleContextDelete = (targetNodeId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const edgeToDelete = edges.find(edge =>
            (edge.source === targetNodeId && edge.target === nodeId) ||
            (edge.target === targetNodeId && edge.source === nodeId)
        );

        if (edgeToDelete) {
            onEdgesChange([{ id: edgeToDelete.id, type: 'remove' }]);
        }
    };

    const updateParams = (key: string, value: number) => {
        updateNodeData(nodeId, { [key]: value });
    };

    return (
        <div className={cn("flex flex-col h-full bg-white dark:bg-slate-800 relative font-sans rounded-xl", isFullscreen ? "w-full h-full" : "")}>

            {/* Header Area */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex-shrink-0">
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                        <Database size={18} />
                    </div>

                    {/* Context Pills (Scrollable) */}
                    <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-1.5 px-1">
                        {connectedNodes.length === 0 ? (
                            <span className="text-xs text-slate-400 whitespace-nowrap italic px-1">
                                {t('nodes.prompt.noContextConnected')}
                            </span>
                        ) : (
                            connectedNodes.map(node => (
                                <button
                                    key={node.id}
                                    onClick={(e) => handleContextClick(e, node.id)}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-orange-50 text-orange-700 rounded-md text-xs font-medium border border-orange-100 whitespace-nowrap hover:bg-orange-100 transition-colors group"
                                >
                                    <span className="max-w-[80px] truncate">{node.data.title || (node.type === 'output' ? t('nodes.prompt.outputNode') : 'Data')}</span>
                                    <div
                                        role="button"
                                        onClick={(e) => handleContextDelete(node.id, e)}
                                        className="text-orange-400 hover:text-orange-600 p-0.5 rounded-full hover:bg-orange-200/50"
                                    >
                                        <X size={10} strokeWidth={3} />
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Node Body - Scrollable content area */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4" onWheel={handleWheel}>
                {/* Editor Section */}
                <div className="flex flex-col gap-2 flex-1 min-h-[120px] relative">
                    <div className="flex justify-between items-end ml-1">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t('nodes.prompt.prompt')}</label>
                        <button
                            onClick={() => handleGenerateSuggestions(false)}
                            disabled={isSuggesting}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded bg-purple-50 hover:bg-purple-100 text-purple-600 border border-purple-200 text-[10px] font-medium transition-colors cursor-pointer",
                                isSuggesting && "opacity-70 cursor-wait bg-slate-50 text-slate-500 border-slate-200"
                            )}
                            title={t('nodes.prompt.generateSuggestionsTip')}
                        >
                            {isSuggesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            {isSuggesting ? t('nodes.prompt.generating') : t('nodes.prompt.aiSuggestion')}
                        </button>
                    </div>

                    {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-7 right-0 left-0 max-w-full z-50 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden shrink-0 flex flex-col">
                            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 bg-slate-50/80">
                                <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500">{t('nodes.prompt.autocomplete')} ({suggestions.length})</span>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleGenerateSuggestions(true); }} 
                                        className="text-purple-400 hover:text-purple-600 p-0.5 rounded cursor-pointer"
                                        title={t('nodes.prompt.regenerateSuggestions')}
                                    >
                                        <RotateCcw size={12} className={isSuggesting ? "animate-spin text-purple-600" : ""} />
                                    </button>
                                    <button onClick={() => setShowSuggestions(false)} className="text-slate-400 hover:text-slate-600 p-0.5 rounded">
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>
                            <div className="max-h-[250px] overflow-y-auto custom-scrollbar flex flex-col py-1 pointer-events-auto">
                                {suggestions.map((suggestion, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleApplySuggestion(suggestion)}
                                        className="text-left px-3 py-2 text-xs text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors border-l-2 border-transparent hover:border-purple-500 block w-full truncate"
                                        title={suggestion}
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="relative group flex-1">
                        <textarea
                            className={cn(
                                "w-full h-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-mono leading-relaxed resize-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all shadow-inner placeholder:text-slate-400",
                                isFocused ? "nowheel nodrag nopan" : "",
                                isFullscreen ? "min-h-[400px] text-base" : ""
                            )}
                            placeholder={t('nodes.prompt.placeholder')}
                            value={promptText}
                            onChange={handlePromptChange}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            onKeyDown={(e) => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                    e.preventDefault();
                                    handleGenerate();
                                } else if (e.key === 'Escape') {
                                    e.currentTarget.blur();
                                } else {
                                    e.stopPropagation();
                                }
                            }}
                            disabled={isGenerating}
                            onWheel={isFocused ? handleWheel : undefined}
                        />
                    </div>
                </div>

                {/* 3. Parameters (Interactive) */}
                <div className="flex gap-4 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                    <div className="flex flex-col gap-1 w-1/2">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{t('nodes.prompt.temperature')}</label>
                            <span className="text-[10px] text-slate-700 dark:text-slate-300 font-mono">{data.temperature ?? 0.7}</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            className="nodrag nopan w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            value={data.temperature ?? 0.7}
                            onChange={(e) => updateParams('temperature', parseFloat(e.target.value))}
                        />
                    </div>
                    <div className="flex flex-col gap-1 w-1/2">
                        <div className="flex justify-between">
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{t('nodes.prompt.maxTokens')}</label>
                            <span className="text-[10px] text-slate-700 dark:text-slate-300 font-mono">{data.maxTokens ?? 6000}</span>
                        </div>
                        <input
                            type="range"
                            min="100"
                            max="100000"
                            step="100"
                            className="nodrag nopan w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            value={data.maxTokens ?? 6000}
                            onChange={(e) => updateParams('maxTokens', parseInt(e.target.value))}
                        />
                    </div>
                </div>

                {/* 4. Thinking Mode Parameters (Conditional) */}
                {data.thinkingMode && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-tight">{t('nodes.prompt.reasoningEffort')}</label>
                            <div className="flex items-center gap-1">
                                {(['low', 'medium', 'high'] as const).map((level) => (
                                    <button
                                        key={level}
                                        onClick={() => updateNodeData(nodeId, { thinkingLevel: level })}
                                        className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-bold transition-all border uppercase",
                                            (data.thinkingLevel || 'high') === level
                                                ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                                                : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"
                                        )}
                                    >
                                        {level === 'low' ? t('nodes.prompt.fast') : level === 'medium' ? t('nodes.prompt.balanced') : t('nodes.prompt.deep')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 rounded-b-lg p-4 flex items-center justify-between shrink-0">
                {/* Stats */}
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 select-none">
                        <Cpu size={14} />
                        <span>{data.promptText?.length || 0} {t('nodes.prompt.chars')}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {/* Thinking Mode Toggle */}
                    <button
                        onClick={() => updateNodeData(nodeId, { thinkingMode: !(data.thinkingMode ?? false) })}
                        disabled={isGenerating}
                        title={(data.thinkingMode ?? false) ? t('nodes.prompt.thinkingEnabled') : t('nodes.prompt.normalMode')}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all",
                            (data.thinkingMode ?? false)
                                ? "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100 shadow-sm shadow-indigo-100"
                                : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200",
                            isGenerating && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        {(data.thinkingMode ?? false)
                            ? <><Brain size={13} className="shrink-0" /><span>{t('nodes.prompt.thinking')}</span></>
                            : <><Zap size={13} className="shrink-0" /><span>{t('nodes.prompt.fast')}</span></>
                        }
                    </button>

                    {/* Split as List Output Toggle */}
                    <label
                        title={t('nodes.prompt.splitTip')}
                        className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-pointer select-none",
                            data.requiresListOutput
                                ? "bg-purple-50 border-purple-200 text-purple-600 shadow-sm shadow-purple-100"
                                : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200",
                            isGenerating && "opacity-50 cursor-not-allowed pointer-events-none"
                        )}
                    >
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={!!data.requiresListOutput}
                            onChange={(e) => updateNodeData(nodeId, { requiresListOutput: e.target.checked })}
                            disabled={isGenerating}
                        />
                        <ListOrdered size={13} className={cn("shrink-0", data.requiresListOutput ? "text-purple-600" : "text-slate-400")} />
                        <span className="text-xs font-semibold">{t('nodes.prompt.split')}</span>
                    </label>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !promptText.trim()}
                        className={cn(
                            "flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all active:scale-95 disabled:opacity-50 disabled:shadow-none",
                            isGenerating ? "cursor-wait" : ""
                        )}
                    >
                        {isGenerating ? (
                            <span className="animate-spin mr-1">●</span>
                        ) : (
                            <Play size={14} className="fill-current" />
                        )}
                        <span>{isGenerating ? t('nodes.prompt.running') : t('nodes.prompt.runNode')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
