import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import {
    Play,
    Trash2,
    FileText,
    AlertCircle,
    Loader2,
    LayoutList,
    Search,
    Network,
    Square,
    Zap,
    Activity,
    Tags,
    ChevronDown,
    Check
} from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useTaskStore } from '@/stores/taskStore';
import { ENTITY_TYPE_TEMPLATES } from '@/stores/slices/settingsSlice';
import { MultiFileSelector } from './components/MultiFileSelector';
import { cn } from '@/lib/utils';
import { GraphViewer } from './GraphViewer';

export const GraphEditor = ({ canvasId: filePath }: { canvasId: string }) => {
  const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'terminal' | 'graph' | 'documents'>('terminal');
    const [prevStatus, setPrevStatus] = useState<string | undefined>(undefined);
    const {
        canvasSessionStates,
        saveCanvasById,
        customEntityTemplates
    } = useCanvasStore();

    const session = filePath ? canvasSessionStates[filePath] : null;
    const graphData = session?.graphData;
    const [logs, setLogs] = useState<{ message: string, type?: string }[]>([]);
    const [showFileSelector, setShowFileSelector] = useState(false);

    // Token consumption stats parsed from real-time logs
    const [tokenStats, setTokenStats] = useState<{
        llmRequests: number;
        llmSuccessful: number;
        llmFailed: number;
        embeddingRequests: number;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        currentWorkflow: string;
        completedWorkflows: string[];
        retries: number;
        cacheHitRate: number;
    }>({
        llmRequests: 0,
        llmSuccessful: 0,
        llmFailed: 0,
        embeddingRequests: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        currentWorkflow: '',
        completedWorkflows: [],
        retries: 0,
        cacheHitRate: 0,
    });

    // Resizer State
    const [leftWidth, setLeftWidth] = useState(280);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const openCanvas = useCanvasStore(state => state.openCanvas);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); // Prevent text selection while dragging
        setIsDragging(true);
    };

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                // To avoid jumping, we calculate width relative to the container's left edge
                const newWidth = e.clientX - rect.left;
                // constrain between 200px and (total width - 300px)
                setLeftWidth(Math.max(200, Math.min(newWidth, rect.width - 300)));
            }
        };

        const handleGlobalMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isDragging]);

    useEffect(() => {
        if (!filePath) return;

        const removeStatusListener = window.electronAPI.graph.onStatusChanged((data) => {
            if (data.filePath === filePath) {
                useCanvasStore.setState(state => {
                    const session = state.canvasSessionStates[filePath];
                    if (!session || !session.graphData) return state;
                    return {
                        canvasSessionStates: {
                            ...state.canvasSessionStates,
                            [filePath]: {
                                ...session,
                                graphData: {
                                    ...session.graphData,
                                    status: data.status as any,
                                    last_error: data.message
                                }
                            }
                        }
                    };
                });

                // Sync with task store
                const taskId = `graphrag:${filePath}`;
                const { removeTask, updateTask, hasTask } = useTaskStore.getState();
                if (hasTask(taskId)) {
                    if (data.status === 'ready') {
                        removeTask(taskId);
                    } else if (data.status === 'error') {
                        updateTask(taskId, { status: 'failed', errorMessage: data.message || '索引失败' });
                    }
                }
            }
        });

        const removeLogListener = window.electronAPI.graph.onLog((data) => {
            if (data.filePath === filePath) {
                setLogs(prev => [...prev.slice(-99), { message: data.message, type: data.type }]);

                // Parse token metrics from log messages
                const msg = data.message;

                // Parse workflow progress
                const workflowStartMatch = msg.match(/Workflow started:\s*(\S+)/);
                if (workflowStartMatch) {
                    setTokenStats(prev => ({ ...prev, currentWorkflow: workflowStartMatch[1] }));
                }
                const workflowCompleteMatch = msg.match(/Workflow (\S+) completed successfully/);
                if (workflowCompleteMatch) {
                    setTokenStats(prev => ({
                        ...prev,
                        currentWorkflow: prev.currentWorkflow === workflowCompleteMatch[1] ? '' : prev.currentWorkflow,
                        completedWorkflows: prev.completedWorkflows.includes(workflowCompleteMatch[1])
                            ? prev.completedWorkflows
                            : [...prev.completedWorkflows, workflowCompleteMatch[1]]
                    }));
                }

                // Parse final metric summaries from graphrag_llm.metrics.log_metrics_writer
                if (msg.includes('log_metrics_writer') || msg.includes('Metrics for')) {
                    const isEmbedding = msg.includes('bge') || msg.includes('embedding') || msg.includes('embed');

                    const attemptedMatch = msg.match(/"attempted_request_count":\s*(\d+)/);
                    const successfulMatch = msg.match(/"successful_response_count":\s*(\d+)/);
                    const failedMatch = msg.match(/"failed_response_count":\s*(\d+)/);
                    const promptMatch = msg.match(/"prompt_tokens":\s*(\d+)/);
                    const completionMatch = msg.match(/"completion_tokens":\s*(\d+)/);
                    const totalMatch = msg.match(/"total_tokens":\s*(\d+)/);
                    const retriesMatch = msg.match(/"retries":\s*(\d+)/);
                    const cacheHitMatch = msg.match(/"cache_hit_rate":\s*([\d.]+)/);

                    setTokenStats(prev => {
                        const next = { ...prev };
                        if (isEmbedding) {
                            if (attemptedMatch) next.embeddingRequests += parseInt(attemptedMatch[1]);
                        } else {
                            if (attemptedMatch) next.llmRequests += parseInt(attemptedMatch[1]);
                            if (successfulMatch) next.llmSuccessful += parseInt(successfulMatch[1]);
                            if (failedMatch) next.llmFailed += parseInt(failedMatch[1]);
                        }
                        if (promptMatch) next.promptTokens += parseInt(promptMatch[1]);
                        if (completionMatch) next.completionTokens += parseInt(completionMatch[1]);
                        if (totalMatch) next.totalTokens += parseInt(totalMatch[1]);
                        if (retriesMatch) next.retries += parseInt(retriesMatch[1]);
                        if (cacheHitMatch) next.cacheHitRate = parseFloat(cacheHitMatch[1]);
                        return next;
                    });
                }

                // Track individual LLM request completions in real-time
                // graphrag_llm logs each successful response via with_logging middleware
                if (msg.includes('Request succeeded')) {
                    setTokenStats(prev => ({
                        ...prev,
                        llmRequests: prev.llmRequests + 1,
                        llmSuccessful: prev.llmSuccessful + 1,
                    }));
                }
                if (msg.includes('Request failed with exception')) {
                    setTokenStats(prev => ({
                        ...prev,
                        llmFailed: prev.llmFailed + 1,
                    }));
                }
            }
        });

        return () => {
            if (typeof removeStatusListener === 'function') removeStatusListener();
            if (typeof removeLogListener === 'function') removeLogListener();
        };
    }, [filePath]);

    const isIndexing = graphData?.status === 'indexing';
    const isReady = graphData?.status === 'ready';

    // Auto-switch to graph tab when status transitions to 'ready'
    useEffect(() => {
        if (graphData?.status === 'ready' && prevStatus !== 'ready') {
            setActiveTab('graph');
        } else if (graphData?.status !== 'ready' && prevStatus === 'ready') {
            setActiveTab('terminal');
        }
        setPrevStatus(graphData?.status);
    }, [graphData?.status]);

    // Safety fallback
    useEffect(() => {
        if (isReady && activeTab === 'terminal') {
            setActiveTab('graph');
        }
    }, [isReady, activeTab]);

    if (!filePath || !graphData) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                <p>无法加载图谱数据</p>
            </div>
        );
    }

    const handleToggleFile = (selectedPath: string) => {
        const currentFiles = graphData.file_paths || [];
        const newFiles = currentFiles.includes(selectedPath)
            ? currentFiles.filter(p => p !== selectedPath)
            : [...currentFiles, selectedPath];

        updateGraphData({ file_paths: newFiles });
    };

    const handleToggleMultipleFiles = (paths: string[], isSelect: boolean) => {
        const currentFiles = new Set(graphData.file_paths || []);
        if (isSelect) {
            paths.forEach(p => currentFiles.add(p));
        } else {
            paths.forEach(p => currentFiles.delete(p));
        }
        updateGraphData({ file_paths: Array.from(currentFiles) });
    };

    const updateGraphData = (updates: Partial<typeof graphData>) => {
        useCanvasStore.setState(state => {
            const session = state.canvasSessionStates[filePath];
            if (!session) return state;
            return {
                canvasSessionStates: {
                    ...state.canvasSessionStates,
                    [filePath]: {
                        ...session,
                        graphData: {
                            ...session.graphData!,
                            ...updates
                        }
                    }
                }
            };
        });
        saveCanvasById(filePath);
    };

    const handleStopIndexing = async () => {
        try {
            await window.electronAPI.graph.stop(filePath);
        } catch (error: any) {
            console.error('Failed to stop indexing', error);
            setLogs(prev => [...prev, { message: `停止失败: ${error?.message || '未知错误'}`, type: 'error' }]);
        }
    };

    const handleStartIndexing = async () => {
        setLogs([{ message: '开始索引过程...', type: 'info' }]);
        setActiveTab('terminal');

        const graphName = filePath.split(/[/\\]/).pop()?.replace('.graph', '') || filePath;
        const taskId = `graphrag:${filePath}`;
        const { addTask, updateTask } = useTaskStore.getState();

        try {
            const {
                aiApiKey,
                aiBaseUrl,
                aiModel,
                aiEmbeddingApiKey,
                aiEmbeddingBaseUrl,
                aiEmbeddingModel,
            } = useCanvasStore.getState();

            if (!aiApiKey || !aiEmbeddingApiKey) {
                setLogs([{ message: '未配置大模型 API Key，请前往设置页面配置。', type: 'error' }]);
                window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'ai' } }));
                return;
            }

            // Resolve entity types from graph's own template
            const templateId = graphData.entityTypeTemplateId || 'general';
            const allTemplates = [...ENTITY_TYPE_TEMPLATES, ...customEntityTemplates];
            const template = allTemplates.find(t => t.id === templateId);
            const entityTypes = template?.types || ENTITY_TYPE_TEMPLATES[0].types;

            const llmConfig = {
                apiKey: aiApiKey || '',
                baseUrl: aiBaseUrl || '',
                model: aiModel || 'deepseek-v4-flash'
            };
            const embeddingConfig = {
                apiKey: aiEmbeddingApiKey || aiApiKey || '',
                baseUrl: aiEmbeddingBaseUrl || aiBaseUrl || '',
                model: aiEmbeddingModel || 'BAAI/bge-m3'
            };

            // Register in task store so sidebar badge appears
            addTask({
                id: taskId,
                type: 'graphrag',
                label: `知识图谱索引 (${graphName})`,
                filePath,
                retryFn: handleStartIndexing,
            });

            await window.electronAPI.graph.index({ filePath, llmConfig, embeddingConfig, entityTypes });
            // Status is managed via onStatusChanged; remove task when ready
        } catch (error: any) {
            updateTask(taskId, { status: 'failed', errorMessage: error.message });
            setLogs(prev => [...prev, { message: `启动失败: ${error.message}`, type: 'error' }]);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                        <LayoutList className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                            {filePath.split(/[\\/]/).pop()?.replace('.graph', '')}
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shadow-sm",
                                graphData.status === 'ready' ? "bg-green-100 text-green-700" :
                                    graphData.status === 'indexing' ? "bg-blue-100 text-blue-700" :
                                        graphData.status === 'error' ? "bg-red-100 text-red-700" :
                                            "bg-gray-100 text-gray-600"
                            )}>
                                {isIndexing && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
                                {graphData.status}
                            </span>
                            <span className="text-[10px] text-gray-400">
                                {isReady ? `已索引 ${graphData.file_paths?.length || 0} 个文档` : `选中 ${graphData.file_paths?.length || 0} 个文档`}
                            </span>
                        </div>
                    </div>
                </div>

                {isReady ? (
                    <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('graph')}
                            className={cn(
                                "px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
                                activeTab === 'graph'
                                    ? "bg-white text-blue-700 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                            )}>
                            <Network className="w-4 h-4" />
                            图谱视图
                        </button>
                        <button
                            onClick={() => setActiveTab('documents')}
                            className={cn(
                                "px-4 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
                                activeTab === 'documents'
                                    ? "bg-white text-blue-700 shadow-sm"
                                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                            )}>
                            <FileText className="w-4 h-4" />
                            索引文档 ({graphData.file_paths?.length || 0})
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        {isIndexing && (
                            <button
                                onClick={handleStopIndexing}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all shadow-sm bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 active:scale-95"
                            >
                                <Square className="w-4 h-4 fill-current" />
                                停止构建
                            </button>
                        )}
                        <button
                            onClick={handleStartIndexing}
                            disabled={!graphData.file_paths?.length}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm",
                                isIndexing
                                    ? "bg-amber-500 text-white hover:bg-amber-600 active:scale-95"
                                    : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95",
                                (!graphData.file_paths?.length) && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            {isIndexing ? <Play className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4" />}
                            {isIndexing ? '强制重启构建' : '启动索引构建'}
                        </button>
                    </div>
                )}
            </div>

            <div
                ref={containerRef}
                className={cn("flex-1 flex overflow-hidden", isDragging && !isReady && "select-none cursor-col-resize")}
            >
                {/* Left Panel: File Selection (hidden in ready mode) */}
                {!isReady && (
                    <div style={{ width: leftWidth }} className="flex flex-col flex-shrink-0 bg-white z-10">
                        {/* Template Selector */}
                        <div className="p-4 border-b border-gray-100 bg-gradient-to-b from-indigo-50/50 to-white">
                            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                                <Tags className="w-4 h-4 text-indigo-500" />
                                实体类型模板
                            </h2>
                            <div className="relative group/template z-50">
                                {(()=>{
                                    const allTemplates = [...ENTITY_TYPE_TEMPLATES, ...customEntityTemplates];
                                    const currentTpl = allTemplates.find(t => t.id === (graphData.entityTypeTemplateId || 'general')) || ENTITY_TYPE_TEMPLATES[0];
                                    
                                    return (
                                        <>
                                            <button 
                                                disabled={isIndexing}
                                                className={cn(
                                                    "w-full flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border border-blue-100/50 rounded-xl text-sm text-gray-700 hover:border-blue-200 transition-all",
                                                    isIndexing && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span>{currentTpl.icon}</span>
                                                    <span>{currentTpl.name}</span>
                                                    <span className="text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded-md border border-gray-100">
                                                        ({currentTpl.types.length} 个类型)
                                                    </span>
                                                </div>
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            </button>

                                            <div className="absolute top-full left-0 right-0 mt-1 opacity-0 invisible group-hover/template:opacity-100 group-hover/template:visible transition-all bg-white border border-gray-100 shadow-xl rounded-xl py-1 transform origin-top max-h-60 overflow-y-auto">
                                                {allTemplates.map((tpl) => {
                                                    const isSelected = (graphData.entityTypeTemplateId || 'general') === tpl.id;
                                                    return (
                                                        <button
                                                            key={tpl.id}
                                                            onClick={() => {
                                                                updateGraphData({ entityTypeTemplateId: tpl.id });
                                                            }}
                                                            className={cn(
                                                                "w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors",
                                                                isSelected ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-gray-50"
                                                            )}
                                                        >
                                                            <span>{tpl.icon}</span>
                                                            <span className="flex-1 truncate">{tpl.name}</span>
                                                            <span className="text-[10px] text-gray-400">{tpl.types.length}</span>
                                                            {isSelected && <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 leading-normal">
                                选择适合本图谱文档领域的实体类型模板，不同图谱可选不同模板。
                            </p>
                        </div>

                        <div className="p-4 border-b border-gray-50 bg-white sticky top-0 z-10">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-blue-500" />
                                    待索引文档
                                </h2>
                                <button
                                    onClick={() => setShowFileSelector(!showFileSelector)}
                                    disabled={isIndexing}
                                    className={cn("text-xs font-medium", isIndexing ? "text-gray-400 cursor-not-allowed" : "text-blue-600 hover:text-blue-700")}
                                >
                                    {showFileSelector ? t('graph.editor.collapseSelector') : t('graph.editor.manageSelection')}
                                </button>
                            </div>
                            {!showFileSelector && (
                                <div className="text-xs text-gray-400 truncate">
                                    {t('graph.editor.docsSelected', { count: graphData.file_paths?.length || 0 })}
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto bg-gray-50/30">
                            {showFileSelector ? (
                                <div className="p-2">
                                    <MultiFileSelector
                                        selectedFiles={graphData.file_paths || []}
                                        onToggleFile={(path) => !isIndexing && handleToggleFile(path)}
                                        onToggleMultipleFiles={!isIndexing ? handleToggleMultipleFiles : undefined}
                                        onClose={() => setShowFileSelector(false)}
                                        currentGraphPath={filePath}
                                    />
                                </div>
                            ) : (
                                <div className="p-4 space-y-2">
                                    {graphData.file_paths?.length ? (
                                        graphData.file_paths.map(path => (
                                            <div
                                                key={path}
                                                onClick={() => openCanvas(path)}
                                                className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100 text-xs text-gray-600 shadow-sm cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors group"
                                            >
                                                <FileText className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                                <span className="flex-1 truncate">{path.split(/[\\/]/).pop()}</span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!isIndexing) handleToggleFile(path);
                                                    }}
                                                    className={cn("p-1 rounded-md transition-all", isIndexing ? "opacity-0 cursor-not-allowed" : "opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-500")}
                                                    title="Remove from index"
                                                    disabled={isIndexing}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                                            <Search className="w-10 h-10 mb-4 opacity-10" />
                                            <p className="text-sm">{t('graph.editor.noDocsSelected')}</p>
                                            <button
                                                onClick={() => setShowFileSelector(true)}
                                                disabled={isIndexing}
                                                className={cn("mt-4 text-xs bg-white border px-4 py-2 rounded-lg transition-colors shadow-sm", isIndexing ? "border-gray-100 text-gray-300 cursor-not-allowed" : "border-gray-200 hover:bg-gray-50 text-blue-600")}
                                            >
                                                立即添加文档
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Resizer Handle */}
                {!isReady && (
                    <div
                        className={cn("w-1 flex-shrink-0 transition-colors z-20", isDragging ? "bg-blue-500" : "bg-gray-200 hover:bg-blue-400 cursor-col-resize")}
                        onMouseDown={handleMouseDown}
                    />
                )}

                {/* Right Panel or Full Screen Tabs */}
                <div className={cn("flex-1 flex flex-col overflow-hidden relative", (!isReady && (isIndexing || logs.length > 0)) ? "bg-gray-900" : "bg-gray-50")}>
                    {/* Header Tabs Navigation (Only show when building/error) */}
                    {!isReady && (isIndexing || logs.length > 0) && (
                        <div className="flex px-4 py-2 gap-2 border-b bg-gray-900 border-gray-800">
                            <>
                                <button
                                    onClick={() => setActiveTab('terminal')}
                                    className={cn(
                                        "px-3 py-1.5 text-xs tracking-wider font-medium rounded-t transition-colors",
                                        activeTab === 'terminal'
                                            ? "bg-gray-800 text-gray-100 border-b-2 border-blue-500"
                                            : "text-gray-500 hover:text-gray-300"
                                    )}>
                                    构建日志
                                </button>
                                <div className="flex-1 flex items-center justify-end gap-3 mr-2">
                                    {/* Real-time Token Stats */}
                                    {(tokenStats.llmRequests > 0 || tokenStats.currentWorkflow || tokenStats.completedWorkflows.length > 0) && (
                                        <div className="flex items-center gap-3 text-[10px] font-mono">
                                            {tokenStats.currentWorkflow && (
                                                <div className="flex items-center gap-1.5 text-emerald-400">
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                    <span className="opacity-80">{tokenStats.currentWorkflow}</span>
                                                </div>
                                            )}
                                            {tokenStats.completedWorkflows.length > 0 && (
                                                <div className="flex items-center gap-1 text-gray-500">
                                                    <span>{t('graph.editor.steps')}</span>
                                                    <span className="text-emerald-500 font-bold">{tokenStats.completedWorkflows.length}</span>
                                                    <span>/10</span>
                                                </div>
                                            )}
                                            {tokenStats.llmRequests > 0 && (
                                                <div className="flex items-center gap-1 text-blue-400">
                                                    <Zap className="w-3 h-3" />
                                                    <span>{t('graph.editor.requests', { count: tokenStats.llmRequests.toLocaleString() })}</span>
                                                    {tokenStats.llmFailed > 0 && (
                                                        <span className="text-red-400">{t('graph.editor.failed', { count: tokenStats.llmFailed })}</span>
                                                    )}
                                                </div>
                                            )}
                                            {tokenStats.totalTokens > 0 && (
                                                <div className="flex items-center gap-1 text-amber-400">
                                                    <Activity className="w-3 h-3" />
                                                    <span>{(tokenStats.totalTokens / 1000).toFixed(0)}k tokens</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {activeTab === 'terminal' && (
                                    <button
                                        onClick={() => {
                                            setLogs([]);
                                            setTokenStats({
                                                llmRequests: 0, llmSuccessful: 0, llmFailed: 0,
                                                embeddingRequests: 0, promptTokens: 0, completionTokens: 0,
                                                totalTokens: 0, currentWorkflow: '', completedWorkflows: [],
                                                retries: 0, cacheHitRate: 0,
                                            });
                                        }}
                                        className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-widest px-2"
                                    >
                                        清空日志
                                    </button>
                                )}
                            </>
                        </div>
                    )}

                    {/* Tab Contents */}
                    <div className={cn("flex-1 overflow-hidden relative", (!isReady && (isIndexing || logs.length > 0)) ? "bg-gray-900" : "bg-white")}>

                        {/* State 1: Pre-indexing empty guidance */}
                        {!isReady && !isIndexing && logs.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-gray-50/50">
                                <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] border border-gray-100 text-center">
                                    <div className="w-16 h-16 bg-blue-50/50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-blue-100/50">
                                        <Network className="w-8 h-8" />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-800 mb-3">{t('graph.editor.notBuilt')}</h2>
                                    <p className="text-sm text-gray-500 mb-8 leading-relaxed">
                                        在左侧面板管理待索引文档，然后点击右上方的「启动索引构建」按钮，AI 将自动分析文档并提取实体知识网络。
                                    </p>

                                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 text-left">
                                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 pl-1">{t('graph.editor.workflowTitle')}</h3>
                                        <ul className="space-y-4 text-sm text-gray-600">
                                            <li className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-gray-500">1</div>
                                                <span className="pt-0.5 leading-snug">{t('graph.editor.step1')}</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-gray-500">2</div>
                                                <span className="pt-0.5 leading-snug">{t('graph.editor.step2')}</span>
                                            </li>
                                            <li className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-gray-500">3</div>
                                                <span className="pt-0.5 leading-snug">{t('graph.editor.step3')}</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* State 2: Indexing Terminal View */}
                        {activeTab === 'terminal' && !isReady && (isIndexing || logs.length > 0) && (
                            <div className="absolute inset-0 overflow-y-auto p-4 space-y-2 font-mono text-[12px] scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                                {logs.length ? (
                                    logs.map((log, i) => (
                                        <div key={i} className={cn(
                                            "break-all border-l-[3px] pl-3 py-1 flex",
                                            log.type === 'error' ? "text-red-400 border-red-500/50 bg-red-500/5" :
                                                log.type === 'warning' ? "text-yellow-400 border-yellow-500/50 bg-yellow-500/5" :
                                                    log.type === 'info' ? "text-blue-300 border-blue-500/50 bg-blue-500/5" :
                                                        "text-gray-300 border-gray-600 bg-gray-800/30"
                                        )}>
                                            <span className="opacity-50 mr-3 truncate w-[40px] shrink-0 text-right">{String(i + 1).padStart(2, '0')}</span>
                                            <span className="flex-1 whitespace-pre-wrap">{log.message}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-500 font-sans tracking-wide">
                                        系统正在准备环境...
                                    </div>
                                )}
                            </div>
                        )}

                        {/* State 3: Ready -> Graph Visualization View */}
                        {graphData.status === 'ready' && (
                            <div
                                className="absolute inset-0 bg-white"
                                style={{ display: activeTab === 'graph' ? 'block' : 'none' }}
                            >
                                <GraphViewer filePath={filePath} />
                            </div>
                        )}

                        {activeTab === 'documents' && isReady && (
                            <div className="absolute inset-0 bg-gray-50/30 overflow-y-auto p-8">
                                <div className="max-w-4xl mx-auto">
                                    <h2 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-blue-500" />
                                        已索引的文档列表
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {graphData.file_paths?.map(path => (
                                            <div
                                                key={path}
                                                onClick={() => openCanvas(path)}
                                                className="flex flex-col p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <FileText className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                                </div>
                                                <div className="font-medium text-gray-800 text-sm break-all line-clamp-2" title={path.split(/[\\/]/).pop()}>
                                                    {path.split(/[\\/]/).pop()}
                                                </div>
                                                <div className="text-xs text-gray-400 mt-2 truncate" title={path}>
                                                    {path}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {(!graphData.file_paths || graphData.file_paths.length === 0) && (
                                        <div className="text-center py-20 text-gray-400">
                                            暂无关联文档
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
