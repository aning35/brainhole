import { t } from 'i18next';
import { useCallback, useState, useEffect, RefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useToast } from '@/hooks/useToast';
import { 
    TEXT_FILE_EXTENSIONS, 
    TABLE_FILE_EXTENSIONS, 
    MEDIA_FILE_EXTENSIONS, 
    DOCUMENT_FILE_EXTENSIONS,
    GRAPH_FILE_EXTENSIONS
} from '@/utils/fileTypes';
import { useTranslation } from 'react-i18next';

export function useCanvasDragDrop(wrapperRef: RefObject<HTMLElement>) {
    const { t } = useTranslation();
    const { screenToFlowPosition } = useReactFlow();
    const { showToast } = useToast();
    const { updateNodeData, createNode } = useCanvasStore();

    const [isDragOver, setIsDragOver] = useState(false);

    // Handle file reading
    const handleFileRead = useCallback(async (file: File, nodeId: string) => {
        try {
            updateNodeData(nodeId, {
                status: 'loading',
                fileName: file.name,
            });

            const fileExtension = file.name.split('.').pop()?.toLowerCase();

            // 1. Handle table/data files (CSV, Excel)
            if (TABLE_FILE_EXTENSIONS.includes(fileExtension || '')) {
                let data: any[] = [];
                let columns: string[] = [];

                if (fileExtension === 'csv') {
                    const text = await file.text();
                    const lines = text.split('\n').filter(line => line.trim());

                    if (lines.length === 0) throw new Error(t('drag.emptyCsv'));

                    columns = lines[0].split(',').map(col => col.trim().replace(/"/g, ''));
                    data = lines.slice(1).map(line => {
                        const values = line.split(',').map(val => val.trim().replace(/"/g, ''));
                        const obj: any = {};
                        columns.forEach((col, idx) => {
                            obj[col] = values[idx] || null;
                        });
                        return obj;
                    });
                } else {
                    // Parse Excel files using xlsx library
                    const arrayBuffer = await file.arrayBuffer();
                    const XLSX = await import('xlsx');
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    data = XLSX.utils.sheet_to_json(worksheet, { defval: null }) as any[];
                    if (data.length > 0) {
                        columns = Object.keys(data[0]);
                    }
                }

                updateNodeData(nodeId, {
                    dataType: 'table',
                    status: 'ready',
                    data,
                    columns,
                    previewData: data.slice(0, 5),
                    title: file.name,
                    fileName: file.name,
                    fileSize: file.size,
                });

                showToast(t('canvas.toast.tableLoaded', { fileName: file.name, count: data.length }), 'success');
            }
            // 2. Handle image files (dragging disabled, kept temporarily to prevent external calls or can be deleted. Skipped directly here as only used in drag)
            // Currently dragging images and audio/video is not allowed, so skip processing

            // 4. Handle text documents
            else if (TEXT_FILE_EXTENSIONS.includes(fileExtension || '')) {
                const textContent = await file.text();
                updateNodeData(nodeId, {
                    dataType: 'text',
                    status: 'ready',
                    textContent,
                    title: file.name,
                });
                showToast(t('canvas.toast.textLoaded', { fileName: file.name }), 'success');
            }
            // 5. Handle knowledge graphs
            else if (GRAPH_FILE_EXTENSIONS.includes(fileExtension || '')) {
                const path = (file as any).path;
                const fileUrl = path ? `local-asset://${encodeURIComponent(path)}` : URL.createObjectURL(file);
                updateNodeData(nodeId, {
                    sourceType: 'file',
                    dataType: 'knowledge_graph',
                    status: 'ready',
                    fileUrl,
                    title: file.name.replace('.graph', ''),
                });
                showToast(t('canvas.toast.graphLoaded', { fileName: file.name }), 'success');
            }
            // 6. Other documents (PDF, DOCX, DOC, PPTX, RTF, EPUB, HTML, etc.)
            else {
                const path = (file as any).path;
                const fileUrl = path ? `local-asset://${encodeURIComponent(path)}` : URL.createObjectURL(file);
                const parsableExts = DOCUMENT_FILE_EXTENSIONS;

                updateNodeData(nodeId, {
                    sourceType: 'file',
                    dataType: 'document',
                    status: 'loading',
                    fileUrl,
                    fileSize: file.size,
                    title: file.name,
                    fileName: file.name,
                });

                if (path && parsableExts.includes(fileExtension || '')) {
                    try {
                        const textContent = await window.electronAPI.vault.parseFile(path);
                        updateNodeData(nodeId, {
                            status: 'ready',
                            textContent: textContent || undefined,
                            ...(textContent ? { displayMode: 'preview' } : {}),
                        });
                        showToast(t('canvas.toast.docParsed', { fileName: file.name }), 'success');
                    } catch (err) {
                        console.error('Document parse failed:', err);
                        updateNodeData(nodeId, { status: 'ready' });
                        showToast(t('canvas.toast.docParseFailed', { fileName: file.name }), 'warning');
                    }
                } else {
                    updateNodeData(nodeId, { status: 'ready' });
                    showToast(t('canvas.toast.docAdded', { fileName: file.name }), 'success');
                }
            }
        } catch (error) {
            console.error(t('drag.readErrorLog'), error);
            updateNodeData(nodeId, {
                status: 'error',
                fileName: file.name,
                title: t('drag.error', { name: file.name }),
            });
            showToast(error instanceof Error ? error.message : t('canvas.toast.readFailed'), 'error');
        }
    }, [updateNodeData, showToast]);

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('application/json')) {
            setIsDragOver(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = wrapperRef.current?.getBoundingClientRect();
        if (rect && (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
        )) {
            setIsDragOver(false);
        }
    }, [wrapperRef]);

    const handleDrop = useCallback(async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const position = screenToFlowPosition({
            x: e.clientX,
            y: e.clientY,
        });

        // 1. Handle files dragged from desktop/external
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length > 0) {
            let addedCount = 0;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
                
                // Intercept audio/video and image files
                if (file.type.startsWith('audio/') || file.type.startsWith('video/') || file.type.startsWith('image/') ||
                    MEDIA_FILE_EXTENSIONS.includes(fileExtension)) {
                    showToast(t('canvas.toast.mediaNotSupported', { fileName: file.name }), 'warning');
                    continue;
                }

                const nodePosition = {
                    x: position.x + (addedCount * 20),
                    y: position.y + (addedCount * 20),
                };

                const nodeId = createNode('data', nodePosition);
                handleFileRead(file, nodeId);
                addedCount++;
            }
            return;
        }

        // 2. Handle documents and internal items dragged from directory tree
        const jsonData = e.dataTransfer?.getData('application/json');
        if (jsonData) {
            try {
                const data = JSON.parse(jsonData);
                
                // Handle IMA file drop - fetch content and create text data node
                if (data.type === 'ima-file') {
                    const nodeId = createNode('data', position);
                    updateNodeData(nodeId, {
                        sourceType: 'file',
                        dataType: 'text',
                        status: 'loading',
                        title: data.title || 'IMA File',
                        fileName: data.title,
                    });

                    // Async fetch file content
                    (async () => {
                        try {
                            const { imaClientId, imaApiKey } = useCanvasStore.getState();
                            const { imaService } = await import('@/services/imaService');
                            const opts = { clientId: imaClientId, apiKey: imaApiKey };

                            if (data.media_type === 11 || data.media_type === 1) {
                                // Note type: extract notebook_id and fetch content directly
                                let notebookId = '';
                                const parts = (data.media_id || '').split('_');
                                const lastPart = parts[parts.length - 1] || '';
                                if (lastPart.length > 16 && /^\d+$/.test(lastPart)) {
                                    notebookId = lastPart.substring(0, 16);
                                }
                                if (!notebookId) {
                                    const infoRes = await imaService.getMediaInfo(opts, data.media_id);
                                    notebookId = infoRes.notebook_ext_info?.notebook_id || '';
                                }
                                if (notebookId) {
                                    const contentRes = await imaService.getNoteContent(opts, notebookId);
                                    if (contentRes?.content) {
                                        updateNodeData(nodeId, { status: 'ready', content: contentRes.content });
                                        showToast(t('canvas.toast.imaKbAdded', { name: data.title }), 'success');
                                        return;
                                    }
                                }
                            } else {
                                // PDF/Word/etc: get download URL via get_media_info, then parse locally
                                const infoRes = await imaService.getMediaInfo(opts, data.media_id);
                                const fileUrl = infoRes.url_info?.url;
                                if (fileUrl && window.electronAPI?.vault?.parseUrl) {
                                    // Determine extension from URL or title
                                    const mediaTypeExtMap: Record<number, string> = { 3: '.docx', 4: '.pdf', 5: '.pptx', 9: '.png' };
                                    let ext = mediaTypeExtMap[data.media_type] || '.pdf';
                                    try {
                                        const match = new URL(fileUrl).pathname.match(/\.([a-zA-Z0-9]+)$/);
                                        if (match) ext = match[0].toLowerCase();
                                    } catch (_) {}

                                    const parsed = await (window.electronAPI.vault as any).parseUrl(
                                        fileUrl, ext, infoRes.url_info?.headers
                                    );
                                    if (parsed) {
                                        updateNodeData(nodeId, { status: 'ready', content: parsed });
                                        showToast(t('canvas.toast.imaKbAdded', { name: data.title }), 'success');
                                        return;
                                    }
                                }
                            }
                            updateNodeData(nodeId, { status: 'error', content: '' });
                            showToast(t('ima.errorGetMedia', 'Failed to get file content'), 'error');
                        } catch (err: any) {
                            updateNodeData(nodeId, { status: 'error', content: '' });
                            showToast(err.message, 'error');
                        }
                    })();
                    return;
                }
                
                // canvas types other than .canvas are documents
                if (data.type === 'canvas' && !data.id.endsWith('.canvas')) {
                    const filePath = data.id;
                    const fileName = filePath.split(/[/\\]/).pop() || t('drag.unnamed');
                    const fileExtension = fileName.split('.').pop()?.toLowerCase();

                    // Intercept audio/video and image files
                    if (MEDIA_FILE_EXTENSIONS.includes(fileExtension || '')) {
                        showToast(t('canvas.toast.mediaNotSupported', { fileName: fileName }), 'warning');
                        return;
                    }

                    const nodeId = createNode('data', position);

                    // Mock File object to reuse handleFileRead
                    // For tables or other complex formats, calling API directly is safer
                    if (TEXT_FILE_EXTENSIONS.includes(fileExtension || '')) {
                        const fileData = await window.electronAPI.vault.readFile(filePath);
                        if (fileData) {
                            updateNodeData(nodeId, {
                                sourceType: 'text',
                                dataType: 'text',
                                status: 'ready',
                                textContent: fileData.content,
                                title: fileName,
                                fileName: fileName,
                            });
                            showToast(t('canvas.toast.textLoaded', { fileName: fileName }), 'success');
                        }
                    } else if (TABLE_FILE_EXTENSIONS.includes(fileExtension || '')) {
                        // Table files need to be converted to File objects to use existing handleFileRead logic (or read directly)
                        // We handle simply here, hint user can manually trigger

                        // Best practice is to get path and use fs to read, but renderer can only use API
                        // Assuming in Vault mode, we assume readFile can handle basic text
                        // For Excel, a specialized readBinary API might be needed

                        // For simplicity, handle text first, for tables we can create a virtual File or update API
                        // Considering processTableFile is in DataNodeContent, we can update node state to point to that path

                        updateNodeData(nodeId, {
                            sourceType: 'file',
                            dataType: 'table',
                            status: 'loading',
                            fileName: fileName,
                            title: fileName,
                        });

                        // Since handleFileRead currently relies on File object, call API and update directly
                        // Ideally, we should add a readTableData API in the main process
                        // For now try to reuse, if it's a local file we can construct a pseudo File
                        const response = await fetch(`local-asset://${encodeURIComponent(filePath)}`);
                        const blob = await response.blob();
                        const file = new File([blob], fileName, { type: 'application/octet-stream' });
                        handleFileRead(file, nodeId);

                    } else if (GRAPH_FILE_EXTENSIONS.includes(fileExtension || '')) {
                        updateNodeData(nodeId, {
                            sourceType: 'file',
                            dataType: 'knowledge_graph',
                            status: 'ready',
                            fileUrl: `local-asset://${encodeURIComponent(filePath)}`,
                            title: fileName.replace('.graph', ''),
                            fileName: fileName,
                        });
                        showToast(t('canvas.toast.graphLoaded', { fileName: fileName }), 'success');
                    } else {
                        // Other document files (PDF, DOCX, PPTX, etc.) - attempt to parse text
                        const parsableExts = DOCUMENT_FILE_EXTENSIONS;

                        updateNodeData(nodeId, {
                            sourceType: 'file',
                            dataType: 'document',
                            status: 'loading',
                            fileUrl: `local-asset://${encodeURIComponent(filePath)}`,
                            title: fileName,
                            fileName: fileName,
                        });

                        if (parsableExts.includes(fileExtension || '')) {
                            try {
                                const textContent = await window.electronAPI.vault.parseFile(filePath);
                                updateNodeData(nodeId, {
                                    status: 'ready',
                                    textContent: textContent || undefined,
                                    ...(textContent ? { displayMode: 'preview' } : {}),
                                });
                                showToast(t('canvas.toast.docParsed', { fileName: fileName }), 'success');
                            } catch (err) {
                                console.error('Document parse failed:', err);
                                updateNodeData(nodeId, { status: 'ready' });
                                showToast(t('canvas.toast.docParseFailed', { fileName: fileName }), 'warning');
                            }
                        } else {
                            updateNodeData(nodeId, { status: 'ready' });
                            showToast(t('canvas.toast.docAdded', { fileName: fileName }), 'success');
                        }
                    }
                }
            } catch (err) {
                console.error('Internal drop failed:', err);
            }
        }
    }, [screenToFlowPosition, createNode, handleFileRead, updateNodeData, showToast]);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        wrapper.addEventListener('dragover', handleDragOver);
        wrapper.addEventListener('dragleave', handleDragLeave);
        wrapper.addEventListener('drop', handleDrop);

        return () => {
            wrapper.removeEventListener('dragover', handleDragOver);
            wrapper.removeEventListener('dragleave', handleDragLeave);
            wrapper.removeEventListener('drop', handleDrop);
        };
    }, [wrapperRef, handleDragOver, handleDragLeave, handleDrop]);

    return { isDragOver };
}
