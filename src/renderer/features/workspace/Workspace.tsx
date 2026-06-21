import { t } from 'i18next';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useTaskStore } from '@/stores/taskStore';
import { Canvas } from '../canvas/Canvas';
import { MarkdownEditor } from '../editor/MarkdownEditor';
import { TextEditor } from '../editor/TextEditor';
import { GraphEditor } from '../knowledge-graph/GraphEditor';

import { useToast } from '@/hooks/useToast';
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, Maximize } from 'lucide-react';

import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
// Import the correct nested pdfjs worker (version-matched to react-pdf's internal pdfjs-dist)
import pdfWorkerUrl from 'react-pdf/node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url';

// The Web Worker runs in its own thread with NO access to the main thread's window polyfills.
// We wrap the real pdfjs worker in a blob that first injects polyfills into the worker scope,
// then dynamically imports the real worker module.
const absoluteWorkerUrl = new URL(pdfWorkerUrl, window.location.href).href;
const workerPolyfillBlob = new Blob([`
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
if (typeof URL.parse === 'undefined') {
  URL.parse = function(url, base) {
    try { return new URL(url, base); } catch(e) { return null; }
  };
}
// Polyfill document for Vite HMR client inside Web Worker during development
if (typeof document === 'undefined') {
  self.document = { querySelectorAll: function() { return []; } };
}
// Suppress noisy but harmless "Worker task was terminated" warnings when closing a PDF tab early
const originalWarn = console.warn;
console.warn = function(...args) {
    if (typeof args[0] === 'string' && args[0].includes('Worker task was terminated')) return;
    originalWarn.apply(console, args);
};
import(${JSON.stringify(absoluteWorkerUrl)});
`], { type: 'text/javascript' });
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerPolyfillBlob);

const PdfViewer = ({ filePath }: { filePath: string }) => {
    let fileName = filePath.substring(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
    if (filePath.startsWith('http')) {
        try {
            const urlObj = new URL(filePath);
            fileName = urlObj.searchParams.get('media_title') || urlObj.pathname.split('/').pop() || fileName;
        } catch (e) {}
    }
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [numPages, setNumPages] = useState<number>();
    const { showToast } = useToast();
    const { addTask, removeTask, updateTask, isFileRunning } = useTaskStore.getState();
    const mineruParsing = useTaskStore(state => state.isFileRunning(filePath));
    const taskId = `mineru:${filePath}`;

    const handleMineruParse = async () => {
        if (isFileRunning(filePath)) return;

        const engine = useCanvasStore.getState().docParserEngine || 'docling';
        const envStatus = await window.electronAPI.vault.mineruCheckEnv();
        const modelsStatus = await window.electronAPI.models.getStatus();
        
        const isEngineReady = engine === 'docling' 
            ? modelsStatus.docling?.installed 
            : modelsStatus.mineru?.installed;

        if (!envStatus.ready || !isEngineReady) {
            showToast(t('workspace.toast.envNotReady', '环境或模型未初始化，请前往设置下载'), 'warning');
            window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'docs' } }));
            return;
        }

        const doRun = async () => {
            addTask({
                id: taskId,
                type: 'mineru',
                label: t('workspace.convertToMdTask', { name: fileName }),
                filePath,
                retryFn: doRun,
            });
            try {
                const result = await window.electronAPI.vault.mineruParse(filePath);
                if (result.success) {
                    removeTask(taskId);
                    showToast(t('workspace.toast.mdGenerated', { name: result.outputPath.split(/[/\\]/).pop() }), 'success');
                    await useCanvasStore.getState().loadCanvases();
                } else {
                    updateTask(taskId, { status: 'failed', errorMessage: result.error || t('workspace.unknownError') });
                    showToast(t('workspace.toast.parseFailed', { error: result.error || t('workspace.toast.unknownError') }), 'error');
                }
            } catch (error: any) {
                updateTask(taskId, { status: 'failed', errorMessage: error.message });
                showToast(t('workspace.toast.mineruFailed', { error: error.message }), 'error');
            }
        };
        doRun();
    };

    useEffect(() => {
        let active = true;

        const loadPdf = async () => {
            setLoading(true);
            try {
                if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                    // Fetch URL via IPC to bypass CORS
                    const base64Str = await (window as any).electronAPI.vault.readUrlBase64(filePath);
                    if (!active || !base64Str) return;

                    const binStr = atob(base64Str);
                    const len = binStr.length;
                    const arr = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        arr[i] = binStr.charCodeAt(i);
                    }
                    const blob = new Blob([arr], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);
                    
                    if (active) {
                        setBlobUrl(url);
                    } else {
                        URL.revokeObjectURL(url);
                    }
                } else {
                    // Read PDF file as Base64 via IPC
                    const base64Str = await window.electronAPI.vault.readFileBase64(filePath);
                    if (!active || !base64Str) return;

                    // Convert Base64 to Blob URL to prevent "ArrayBuffer is already detached" Web Worker error
                    const binStr = atob(base64Str);
                    const len = binStr.length;
                    const arr = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        arr[i] = binStr.charCodeAt(i);
                    }
                    const blob = new Blob([arr], { type: 'application/pdf' });
                    const url = URL.createObjectURL(blob);

                    if (active) {
                        setBlobUrl(url);
                    } else {
                        URL.revokeObjectURL(url);
                    }
                }
            } catch (err) {
                console.error('Failed to load PDF data:', err, filePath);
            } finally {
                if (active) setLoading(false);
            }
        };

        loadPdf();

        return () => {
            active = false;
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
            }
        };
    }, [filePath]);

    // Memoize the file prop to prevent react-pdf from unnecessary reloads
    const fileProp = useMemo(() => blobUrl, [blobUrl]);

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-red-500" fill="currentColor">
                            <path d="M14,2H6A2,2,0,0,0,4,4V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8ZM9.5,16h-1a.5.5,0,0,1-.5-.5v-4a.5.5,0,0,1-.5-.5h1A1.5,1.5,0,0,1,11,12.5v1A1.5,1.5,0,0,1,9.5,16Zm0-1a.5.5,0,0,0,.5-.5v-1a.5.5,0,0,0-.5-.5H9v2Zm5,1h-2V11h2a1.5,1.5,0,0,1,1.5,1.5v2A1.5,1.5,0,0,1,14.5,16Zm-.5-4v3h.5a.5.5,0,0,0,.5-.5v-2a.5.5,0,0,0-.5-.5Zm-7.5-1v5H5V11ZM13,9H11V3l6,6Z" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 truncate">{fileName}</span>
                    {numPages && <span className="text-xs text-gray-400 ml-2">{t('workspace.pages', { num: numPages })}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!filePath.startsWith('http') && (
                        <>
                            <button
                                className={`ml-2 px-3 py-1.5 text-xs border rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 ${
                                    mineruParsing
                                        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-wait'
                                        : 'border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 text-violet-600 hover:from-violet-100 hover:to-blue-100 hover:border-violet-300 hover:shadow-sm'
                                }`}
                                onClick={handleMineruParse}
                                disabled={mineruParsing}
                            >
                                {mineruParsing ? (
                                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                ) : (
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                        <line x1="10" y1="9" x2="8" y2="9" />
                                    </svg>
                                )}
                                {mineruParsing ? t('workspace.parsing') : t('workspace.convertToMd')}
                            </button>
                            <button
                                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
                                onClick={() => window.electronAPI.vault.revealInExplorer(filePath)}
                            >
                                {t('workspace.openInExplorer')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Document body */}
            <div className="flex-1 overflow-y-auto bg-gray-100 flex flex-col items-center py-8">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent"></div>
                    </div>
                ) : fileProp ? (
                    <Document
                        file={fileProp}
                        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                        loading={
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent mt-10"></div>
                        }
                        onLoadError={(err) => console.error('react-pdf load error:', err)}
                        error={
                            <div className="text-red-500 mt-10">{t('workspace.pdfLoadFailed')}</div>
                        }
                    >
                        {numPages && Array.from(new Array(numPages), (el, index) => (
                            <Page
                                key={`page_${index + 1}`}
                                pageNumber={index + 1}
                                width={800}
                                className="mb-6 shadow-md"
                                renderTextLayer={true}
                                renderAnnotationLayer={true}
                            />
                        ))}
                    </Document>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                        <p>{t('workspace.docEmpty')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const ImageViewer = ({ filePath }: { filePath: string }) => {
    let fileName = filePath.substring(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
    if (filePath.startsWith('http')) {
        try {
            const urlObj = new URL(filePath);
            fileName = urlObj.searchParams.get('media_title') || urlObj.pathname.split('/').pop() || fileName;
        } catch (e) {}
    }
    const { showToast } = useToast();
    const { addTask, removeTask, updateTask, isFileRunning } = useTaskStore.getState();
    const mineruParsing = useTaskStore(state => state.isFileRunning(filePath));
    const taskId = `mineru:${filePath}`;

    // Unified View State
    const [viewState, setViewState] = useState({ scale: 1, x: 0, y: 0, rotation: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [isAnimating, setIsAnimating] = useState(false);
    const animationTimeoutRef = useRef<NodeJS.Timeout>();

    const withAnimation = (action: () => void) => {
        setIsAnimating(true);
        action();
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = setTimeout(() => setIsAnimating(false), 200);
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (e.metaKey || e.ctrlKey) {
            // Zoom (Cmd+Scroll)
            const delta = e.deltaY * -0.01;
            
            // Compute coordinate targets BEFORE state callback to prevent null reference
            const rect = e.currentTarget.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            
            setViewState(prev => {
                const newScale = Math.min(Math.max(0.1, prev.scale + prev.scale * delta), 10);
                if (newScale === prev.scale) return prev;
                
                const ratio = newScale / prev.scale;
                return {
                    ...prev,
                    scale: newScale,
                    x: prev.x - (dx - prev.x) * (ratio - 1),
                    y: prev.y - (dy - prev.y) * (ratio - 1)
                };
            });
        } else {
            // Pan (Scroll)
            setViewState(prev => ({
                ...prev,
                x: prev.x - e.deltaX,
                y: prev.y - e.deltaY
            }));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Only trigger drag on the background container or if the image itself is clicked
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setViewState(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleReset = () => {
        withAnimation(() => {
            setViewState({ scale: 1, x: 0, y: 0, rotation: 0 });
        });
    };

    const handleMineruParse = async () => {
        if (isFileRunning(filePath)) return;

        const engine = useCanvasStore.getState().docParserEngine || 'docling';
        const envStatus = await window.electronAPI.vault.mineruCheckEnv();
        const modelsStatus = await window.electronAPI.models.getStatus();
        
        const isEngineReady = engine === 'docling' 
            ? modelsStatus.docling?.installed 
            : modelsStatus.mineru?.installed;

        if (!envStatus.ready || !isEngineReady) {
            showToast(t('workspace.toast.envNotReady', '环境或模型未初始化，请前往设置下载'), 'warning');
            window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'docs' } }));
            return;
        }

        const doRun = async () => {
            addTask({
                id: taskId,
                type: 'mineru',
                label: t('workspace.convertToMdTask', { name: fileName }),
                filePath,
                retryFn: doRun,
            });
            try {
                const result = await window.electronAPI.vault.mineruParse(filePath);
                if (result.success) {
                    removeTask(taskId);
                    showToast(t('workspace.toast.mdGenerated', { name: result.outputPath.split(/[/\\]/).pop() }), 'success');
                    await useCanvasStore.getState().loadCanvases();
                } else {
                    updateTask(taskId, { status: 'failed', errorMessage: result.error || t('workspace.unknownError') });
                    showToast(t('workspace.toast.parseFailed', { error: result.error || t('workspace.toast.unknownError') }), 'error');
                }
            } catch (error: any) {
                updateTask(taskId, { status: 'failed', errorMessage: error.message });
                showToast(t('workspace.toast.mineruFailed', { error: error.message }), 'error');
            }
        };
        doRun();
    };

    // Use effects to attach passive mouse event so we can prevent scrolling natively
    useEffect(() => {
        const preventDefaultWheel = (e: WheelEvent) => {
            if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
            }
        };
        const el = document.getElementById('image-viewer-container');
        if (el) {
            el.addEventListener('wheel', preventDefaultWheel, { passive: false });
        }
        return () => {
            if (el) {
                el.removeEventListener('wheel', preventDefaultWheel);
            }
        };
    }, []);

    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-focus container on mount so key bindings work immediately without clicking
    useEffect(() => {
        // Use a short timeout to ensure the DOM is ready for focus to take effect
        const timeout = setTimeout(() => {
            containerRef.current?.focus();
        }, 100);
        return () => clearTimeout(timeout);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            handleReset();
            e.preventDefault();
        }
    };

    return (
        <div 
            ref={containerRef}
            className="flex flex-col h-full bg-gray-50 overflow-hidden select-none outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400/50 transition-shadow"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onClick={() => containerRef.current?.focus()}
        >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-pink-50 rounded-lg flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 truncate" title={fileName}>{fileName}</span>
                </div>
                <div className="flex items-center shrink-0">
                    <div className="flex items-center gap-1 border-r border-gray-200 pr-2 mr-2">
                        <button title={t('workspace.zoomIn')} onClick={() => withAnimation(() => setViewState(s => ({...s, scale: Math.min(s.scale * 1.2, 10)})))} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                        <button title={t('workspace.zoomOut')} onClick={() => withAnimation(() => setViewState(s => ({...s, scale: Math.max(s.scale / 1.2, 0.1)})))} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <button title={t('workspace.rotateLeft')} onClick={() => withAnimation(() => setViewState(s => ({...s, rotation: s.rotation - 90})))} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors">
                            <RotateCcw className="w-4 h-4" />
                        </button>
                        <button title={t('workspace.rotateRight')} onClick={() => withAnimation(() => setViewState(s => ({...s, rotation: s.rotation + 90})))} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors">
                            <RotateCw className="w-4 h-4" />
                        </button>
                        <button title={t('workspace.resetView')} onClick={handleReset} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors">
                            <Maximize className="w-4 h-4" />
                        </button>
                    </div>
                    {!filePath.startsWith('http') && (
                        <>
                            <button
                                className={`px-3 py-1.5 border rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 ${
                                    mineruParsing
                                        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-wait'
                                        : 'border-violet-200 bg-gradient-to-r from-violet-50 to-blue-50 text-violet-600 hover:from-violet-100 hover:to-blue-100 hover:border-violet-300 hover:shadow-sm'
                                }`}
                                onClick={handleMineruParse}
                                disabled={mineruParsing}
                            >
                                {mineruParsing ? (
                                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                ) : (
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                        <line x1="10" y1="9" x2="8" y2="9" />
                                    </svg>
                                )}
                                {mineruParsing ? t('workspace.parsing') : t('workspace.convertToMd')}
                            </button>
                            <button
                                className="ml-2 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
                                onClick={() => window.electronAPI.vault.revealInExplorer(filePath)}
                            >
                                {t('workspace.openInExplorer')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Document body */}
            <div 
                id="image-viewer-container"
                className={`flex-1 overflow-hidden bg-gray-100 flex items-center justify-center relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ touchAction: 'none' }}
            >
                <img 
                    src={filePath.startsWith('http') ? filePath : `local-asset://${encodeURIComponent(filePath)}`} 
                    alt={fileName}
                    className="max-w-none shadow-sm bg-white pointer-events-none transition-transform"
                    style={{ 
                        transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale}) rotate(${viewState.rotation}deg)`,
                        transitionDuration: isAnimating ? '200ms' : '0ms',
                        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                        maxHeight: '80%',
                        maxWidth: '80%',
                        backgroundImage: 'conic-gradient(#eee 25%, white 25%, white 50%, #eee 50%, #eee 75%, white 75%, white)',
                        backgroundSize: '16px 16px'
                    }}
                    draggable={false}
                />
            </div>
        </div>
    );
};

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.wma', '.webm'];

const AudioViewer = ({ filePath }: { filePath: string }) => {
    let fileName = filePath.substring(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
    if (filePath.startsWith('http')) {
        try {
            const urlObj = new URL(filePath);
            fileName = urlObj.searchParams.get('media_title') || urlObj.pathname.split('/').pop() || fileName;
        } catch (e) {}
    }
    const { showToast } = useToast();
    const { addTask, removeTask, updateTask, isFileRunning } = useTaskStore.getState();
    const transcribing = useTaskStore(state => state.isFileRunning(filePath));
    const taskId = `funasr:${filePath}`;

    const handleTranscribe = async () => {
        if (isFileRunning(filePath)) return;

        const envStatus = await window.electronAPI.vault.funasrCheckEnv();
        const modelsStatus = await window.electronAPI.models.getStatus();
        if (!envStatus.ready || !modelsStatus.funasr?.installed) {
            showToast(t('workspace.toast.envNotReady', '环境或模型未初始化，请前往设置下载'), 'warning');
            window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'docs' } }));
            return;
        }

        const doRun = async () => {
            addTask({
                id: taskId,
                type: 'funasr',
                label: t('workspace.audioTranscribeTask', { name: fileName }),
                filePath,
                retryFn: doRun,
            });
            try {
                const result = await window.electronAPI.vault.funasrTranscribe(filePath);
                if (result.success) {
                    removeTask(taskId);
                    showToast(t('workspace.toast.transcribeComplete', { name: result.outputPath.split(/[/\\]/).pop() }), 'success');
                    await useCanvasStore.getState().loadCanvases();
                } else {
                    updateTask(taskId, { status: 'failed', errorMessage: result.error || t('workspace.unknownError') });
                    showToast(t('workspace.toast.transcribeFailed', { error: result.error || t('workspace.toast.unknownError') }), 'error');
                }
            } catch (error: any) {
                updateTask(taskId, { status: 'failed', errorMessage: error.message });
                showToast(t('workspace.toast.funasrFailed', { error: error.message }), 'error');
            }
        };
        doRun();
    };

    // Get the file extension for MIME type hint
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.aac': 'audio/aac',
        '.wma': 'audio/x-ms-wma',
        '.webm': 'audio/webm',
    };
    const mimeType = mimeMap[ext] || 'audio/mpeg';

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 truncate" title={fileName}>{fileName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!filePath.startsWith('http') && (
                        <>
                            <button
                                className={`px-3 py-1.5 border rounded-lg transition-all text-sm font-medium flex items-center gap-1.5 ${
                                    transcribing
                                        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-wait'
                                        : 'border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 text-orange-600 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:shadow-sm'
                                }`}
                                onClick={handleTranscribe}
                                disabled={transcribing}
                            >
                                {transcribing ? (
                                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                ) : (
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                        <line x1="10" y1="9" x2="8" y2="9" />
                                    </svg>
                                )}
                                {transcribing ? t('workspace.transcribing') : t('workspace.convertToMd')}
                            </button>
                            <button
                                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
                                onClick={() => window.electronAPI.vault.revealInExplorer(filePath)}
                            >
                                {t('workspace.openInExplorer')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Audio Player Area */}
            <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 px-8">
                {/* Visual decoration */}
                <div className="mb-8 relative">
                    <div className="w-32 h-32 bg-gradient-to-br from-orange-400 to-amber-500 rounded-3xl shadow-lg flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-16 h-16 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18V5l12-2v13" />
                            <circle cx="6" cy="18" r="3" />
                            <circle cx="18" cy="16" r="3" />
                        </svg>
                    </div>
                    <div className="absolute -inset-4 bg-orange-200/20 rounded-[2rem] blur-xl -z-10" />
                </div>

                {/* File name */}
                <h2 className="text-lg font-semibold text-gray-800 mb-2 text-center max-w-md truncate" title={fileName}>
                    {fileName.replace(/\.[^.]+$/, '')}
                </h2>
                <p className="text-xs text-gray-400 mb-6 uppercase tracking-wider">{ext.replace('.', '')} Audio</p>

                {/* Native HTML5 Audio Player */}
                <div className="w-full max-w-lg">
                    <audio controls className="w-full mt-4" key={filePath}>
                        <source src={filePath.startsWith('http') ? filePath : `local-asset://${encodeURIComponent(filePath)}`} type={mimeType} />
                        {t('workspace.audioNotSupported')}
                    </audio>
                </div>

                {/* Hint */}
                <p className="mt-6 text-xs text-gray-400">
                    {t('workspace.audioTranscribeTip')}
                </p>
            </div>
        </div>
    );
};

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm'];

const VideoViewer = ({ filePath }: { filePath: string }) => {
    let fileName = filePath.substring(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
    if (filePath.startsWith('http')) {
        try {
            const urlObj = new URL(filePath);
            fileName = urlObj.searchParams.get('media_title') || urlObj.pathname.split('/').pop() || fileName;
        } catch (e) {}
    }
    const { showToast } = useToast();
    const { addTask, removeTask, updateTask, isFileRunning } = useTaskStore.getState();
    const extracting = useTaskStore(state => state.isFileRunning(filePath));
    const taskId = `ffmpeg-extract:${filePath}`;

    const handleExtractAudio = async () => {
        if (isFileRunning(filePath)) return;
        const doRun = async () => {
            addTask({
                id: taskId,
                type: 'ffmpeg-extract',
                label: t('workspace.extractAudioTask', { name: fileName }),
                filePath,
                retryFn: doRun,
            });
            try {
                const result = await window.electronAPI.vault.extractAudio(filePath);
                if (result.success) {
                    removeTask(taskId);
                    showToast(t('workspace.toast.audioExtractComplete', { name: result.outputPath.split(/[/\\]/).pop() }), 'success');
                    await useCanvasStore.getState().loadCanvases();
                } else {
                    updateTask(taskId, { status: 'failed', errorMessage: result.error || t('workspace.unknownError') });
                    showToast(t('workspace.toast.extractFailed', { error: result.error || t('workspace.toast.unknownError') }), 'error');
                }
            } catch (error: any) {
                updateTask(taskId, { status: 'failed', errorMessage: error.message });
                showToast(t('workspace.toast.extractFailed', { error: error.message }), 'error');
            }
        };
        doRun();
    };

    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.webm': 'video/webm',
    };
    const mimeType = mimeMap[ext] || 'video/mp4';

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
            {/* Toolbar - same light style as AudioViewer / PdfViewer */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-cyan-50 rounded-lg flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-cyan-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7" />
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                    </div>
                    <span className="text-sm font-medium text-gray-700 truncate" title={fileName}>{fileName}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {!filePath.startsWith('http') && (
                        <>
                            <button
                                className={`px-3 py-1.5 border rounded-lg transition-all text-xs font-medium flex items-center gap-1.5 ${
                                    extracting
                                        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-wait'
                                        : 'border-cyan-200 bg-gradient-to-r from-cyan-50 to-teal-50 text-cyan-600 hover:from-cyan-100 hover:to-teal-100 hover:border-cyan-300 hover:shadow-sm'
                                }`}
                                onClick={handleExtractAudio}
                                disabled={extracting}
                            >
                                {extracting ? (
                                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                    </svg>
                                ) : (
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 18V5l12-2v13" />
                                        <circle cx="6" cy="18" r="3" />
                                        <circle cx="18" cy="16" r="3" />
                                    </svg>
                                )}
                                {extracting ? t('workspace.extracting') : t('workspace.extractAudio')}
                            </button>
                            <button
                                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-600"
                                onClick={() => window.electronAPI.vault.revealInExplorer(filePath)}
                            >
                                {t('workspace.openInExplorer')}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Video Player Area - constrained with padding */}
            <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200 p-6 overflow-hidden">
                <video controls className="w-full max-h-full rounded shadow-sm bg-black" key={filePath}>
                    <source src={filePath.startsWith('http') ? filePath : `local-asset://${encodeURIComponent(filePath)}`} type={mimeType} />
                    {t('workspace.videoNotSupported')}
                </video>
            </div>

            {/* Hint */}
            <div className="px-4 py-2 bg-white border-t border-gray-100 text-center shrink-0">
                <p className="text-xs text-gray-400">
                    {t('workspace.videoExtractTip')}
                </p>
            </div>
        </div>
    );
};
export const Workspace = () => {
    const {
        openCanvasIds,
        activeCanvasId,
        createNewCanvas,
    } = useCanvasStore();

    // Track which tabs have been visited to lazily mount them and save memory
    const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(activeCanvasId ? [activeCanvasId] : []));

    useEffect(() => {
        if (activeCanvasId) {
            setVisitedTabs(prev => {
                if (prev.has(activeCanvasId)) return prev;
                const next = new Set(prev);
                next.add(activeCanvasId);
                return next;
            });
            
            // Auto-load missing session state on startup
            const store = useCanvasStore.getState();
            if (!store.canvasSessionStates[activeCanvasId]) {
                store.setActiveCanvas(activeCanvasId).catch(console.error);
            }
        }
    }, [activeCanvasId]);

    // Auto-save mechanism
    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        let lastSavedNodes: any = null;
        let lastSavedEdges: any = null;

        const unsubscribe = useCanvasStore.subscribe((state) => {
            if (!state.activeCanvasId) return;

            // Simple reference check to see if nodes or edges have changed
            if (state.nodes !== lastSavedNodes || state.edges !== lastSavedEdges) {
                lastSavedNodes = state.nodes;
                lastSavedEdges = state.edges;

                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    const currentState = useCanvasStore.getState();
                    if (currentState.activeCanvasId) {
                        currentState.saveCanvasById(currentState.activeCanvasId).catch(err => {
                            console.error("Auto-save failed:", err);
                        });
                    }
                }, 1500); // Decrease to 1.5s debounce
            }
        });

        // Intercept actual window close/refresh events to perform last-minute save
        const handleBeforeUnload = () => {
            const currentState = useCanvasStore.getState();
            if (currentState.activeCanvasId) {
                // IPC sends are usually intercepted by Electron, direct invoke might fail, but we try our best to send sync or async save command
                currentState.saveCanvasById(currentState.activeCanvasId).catch(() => {});
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            unsubscribe();
            clearTimeout(timeoutId);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Trigger a final save on unmount if needed
            const currentState = useCanvasStore.getState();
            if (currentState.activeCanvasId) {
                currentState.saveCanvasById(currentState.activeCanvasId).catch((err) => {
                    console.error("Auto-save failed on unmount:", err);
                });
            }
        };
    }, []);

    const handleNewCanvas = () => {
        createNewCanvas();
    };


    if (!activeCanvasId && openCanvasIds.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50/50 relative overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl mix-blend-multiply animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl mix-blend-multiply animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
                
                <div className="relative z-10 flex flex-col items-center p-8 sm:p-12 bg-white/60 backdrop-blur-2xl rounded-[2.5rem] border border-white shadow-[0_8px_40px_rgb(0,0,0,0.04)] max-w-lg w-full text-center group">
                    <div className="w-24 h-24 mb-8 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center border border-white shadow-sm relative overflow-hidden group-hover:scale-110 group-hover:shadow-md transition-all duration-500 ease-out">
                        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <svg className="w-10 h-10 text-indigo-400 group-hover:text-indigo-500 transition-colors duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    
                    <h2 className="text-xl font-semibold text-slate-800 mb-3">{t('workspace.noCanvasOpened')}</h2>
                    <p className="text-slate-500 text-sm mb-10 leading-relaxed px-2">
                        创建新画布开始知识整理，或从侧边栏打开已有文档。拖拽文件到这里也可以快速导入。
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('switch-to-all-canvases'))}
                            className="relative group/btn2 inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white text-slate-700 font-medium rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 w-full sm:w-auto"
                        >
                            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                            <span className="whitespace-nowrap">查看所有文件</span>
                        </button>

                        <button
                            onClick={handleNewCanvas}
                            className="relative group/btn inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-2xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 active:shadow-indigo-500/20 transition-all duration-300 overflow-hidden w-full sm:w-auto"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 ease-out" />
                            <svg className="w-5 h-5 relative z-10 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="relative z-10 tracking-wide whitespace-nowrap">{t('workspace.newCanvas')}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const renderAllTabs = () => {
        return openCanvasIds.map(id => {
            let ext = id.substring(id.lastIndexOf('.')).toLowerCase() || '';
            if (id.startsWith('ima-note://')) {
                ext = '.md';
            } else if (id.startsWith('http')) {
                try {
                    const urlObj = new URL(id);
                    const mediaTitle = urlObj.searchParams.get('media_title') || '';
                    if (mediaTitle.includes('.')) {
                        ext = mediaTitle.substring(mediaTitle.lastIndexOf('.')).toLowerCase();
                    } else {
                        const pathname = urlObj.pathname;
                        if (pathname.includes('.')) {
                            ext = pathname.substring(pathname.lastIndexOf('.')).toLowerCase();
                        } else {
                            ext = '';
                        }
                    }
                } catch (e) {}
            }
            const isMarkdown = ext === '.md';
            const isText = ext === '.txt' || ext === '.log' || ext === '.json' || ext === '.yaml' || ext === '.yml';
            const isCanvas = ext === '.canvas';
            const isGraph = ext === '.graph';
            const isPdf = ext === '.pdf';
            const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext);
            const isAudio = AUDIO_EXTENSIONS.includes(ext);
            const isVideo = VIDEO_EXTENSIONS.includes(ext);
            const isActive = id === activeCanvasId;

            // SPECIAL RULE: The visual node Canvas tightly loops with useCanvasStore() global nodes/edges list.
            // Since it loads extremely fast, we ONLY render it when active to avoid two canvases fighting over global ReactFlow state.
            if (isCanvas && !isActive) return null;

            // LAZY MOUNTING: Don't mount heavy components like Graph or MDXEditor if the user hasn't looked at them yet.
            const hasVisited = visitedTabs.has(id);
            if (!isActive && !hasVisited) return null;

            let tabContent = null;
            if (isMarkdown) {
                tabContent = <MarkdownEditor canvasId={id} />;
            } else if (isText) {
                tabContent = <TextEditor canvasId={id} />;
            } else if (isCanvas) {
                tabContent = <Canvas key={id} />;
            } else if (isGraph) {
                tabContent = <GraphEditor canvasId={id} />;
            } else if (isPdf) {
                tabContent = <PdfViewer filePath={id} />;
            } else if (isImage) {
                tabContent = <ImageViewer filePath={id} />;
            } else if (isAudio) {
                tabContent = <AudioViewer filePath={id} />;
            } else if (isVideo) {
                tabContent = <VideoViewer filePath={id} />;
            } else {
                // Generic File Viewer
                tabContent = (
                    <div className="flex flex-col items-center justify-center h-full bg-white p-8 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                            <span className="text-2xl font-bold text-gray-400 uppercase">{ext.replace('.', '')}</span>
                        </div>
                        <h2 className="text-xl font-medium text-gray-900 mb-2 truncate max-w-md">
                            {id.substring(Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\')) + 1)}
                        </h2>
                        <p className="text-gray-500 mb-6 max-w-sm">
                            {t('workspace.unsupportedFormat')}
                        </p>
                        <div className="flex gap-3">
                            {id.startsWith('http') ? (
                                <button
                                    className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                                    onClick={() => window.open(id, '_blank')}
                                >
                                    {t('workspace.downloadFile', '在浏览器中下载/打开')}
                                </button>
                            ) : (
                                <button
                                    className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                                    onClick={() => window.electronAPI.vault.revealInExplorer(id)}
                                >
                                    {t('workspace.showInExplorer')}
                                </button>
                            )}
                        </div>
                    </div>
                );
            }

            return (
                <div 
                    key={id} 
                    className="absolute inset-0 w-full h-full bg-white"
                    style={{ display: isActive ? 'block' : 'none' }}
                >
                    {tabContent}
                </div>
            );
        });
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 relative z-10 min-h-0">
            {/* Canvas / Editor Content */}
            <div className="flex-1 relative overflow-hidden bg-white workspace-content-container min-h-0 h-full">
                {renderAllTabs()}
            </div>
        </div>
    );
};
