import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { DataNodeData } from '@/stores/canvasStore';
import { useCanvasStore } from '@/stores/canvasStore';
import {
  FileUp,
  ChevronLeft,
  Type,
  Upload,
  FileIcon,
  Save,
  Eye,
  Code,
  Trash2,
  FileText,
  Loader2,
  Database
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { useScrollPropagation } from '@/hooks/useScrollPropagation';
import { FolderSelectModal } from '@/components/ui/FolderSelectModal';
import { useTaskStore } from '@/stores/taskStore';

interface DataNodeContentProps {
  nodeId: string;
  data: DataNodeData;
  isFullscreen?: boolean;
}

type DataType = 'text' | 'table' | 'document' | 'image' | 'video';
type SourceType = 'text' | 'file';

export function DataNodeContent({ nodeId, data, isFullscreen = false }: DataNodeContentProps) {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore(state => state.updateNodeData);
  const { showToast } = useToast();
  const { handleWheel } = useScrollPropagation();

  // Self-heal legacy nodes with massive data to instantly fix laggy canvases
  useEffect(() => {
    if (data.dataType === 'table' && Array.isArray(data.data) && data.data.length > 2000) {
      console.log(`[Self-Heal] Truncating legacy huge table data for node ${nodeId} from ${data.data.length} to 2000 rows.`);
      updateNodeData(nodeId, {
        data: data.data.slice(0, 2000)
      }, true);
    }
  }, [data.dataType, data.data, nodeId, updateNodeData]);

  // Local state for text input
  const [localText, setLocalText] = useState(data.textContent || '');
  const [isFocused, setIsFocused] = useState(false);

  // Sync state when data from store updates
  useEffect(() => {
    if (!isFocused && data.textContent !== undefined && data.textContent !== localText) {
      setLocalText(data.textContent);
    }
  }, [data.textContent, isFocused, localText]);
  const [isFolderSelectOpen, setIsFolderSelectOpen] = useState(false);
  const vaultPath = useCanvasStore(state => state.vaultPath);
  const activeCanvasId = useCanvasStore(state => state.activeCanvasId);
  const canvases = useCanvasStore(state => state.canvases);
  const currentCanvas = canvases.find(c => c.id === activeCanvasId);
  const currentFolderId = currentCanvas?.folderId;

  // Task store for persistent async state
  const { addTask, removeTask, updateTask, isFileRunning } = useTaskStore.getState();
  const mineruParsing = useTaskStore(state => {
    if (!data.fileUrl?.startsWith('local-file://')) return false;
    const fp = decodeURIComponent(data.fileUrl.replace('local-file://', ''));
    return state.isFileRunning(fp);
  });

  // Excel legacy state
  const [, setShowSheetSelector] = useState(false);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);
  const currentFileNameRef = useRef<string>('');

  // Sync local text with store on blur or delay
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalText(e.target.value);
  };

  const handleTextBlur = () => {
    setIsFocused(false);
    if (localText !== data.textContent) {
      updateNodeData(nodeId, { textContent: localText });
    }
  };

  const handleTextFocus = () => {
    setIsFocused(true);
  };

  // Switch Source Type
  const handleSourceTypeSelect = (type: SourceType) => {
    // Clear existing data when switching
    updateNodeData(nodeId, {
      sourceType: type,
      // Default subtypes
      dataType: type === 'text' ? 'text' : 'table',
      // Clear data but maybe keep title? No, reset for clarity. 
      // Actually keeping title is fine if user set it custom.
      // Reset content fields
      textContent: undefined,
      fileName: undefined,
      data: undefined,
      fileUrl: undefined,
      status: 'empty'
    });
    setLocalText('');
  };

  const handleReset = () => {
    const shouldResetTitle = !data.isCustomTitle;
    const resetTitle = data.initialTitle || t('nodes.data.defaultTitle');

    updateNodeData(nodeId, {
      sourceType: undefined,
      dataType: undefined,
      textContent: undefined,
      fileName: undefined,
      fileSize: undefined,
      data: undefined,
      previewData: undefined,
      columns: undefined,
      selectedSheet: undefined,
      fileUrl: undefined,
      error: undefined,
      status: 'empty',
      ...(shouldResetTitle && { title: resetTitle })
    });
    setLocalText('');
    currentFileNameRef.current = '';
  };

  const handleSaveToVaultClick = () => {
    if (!vaultPath) {
      showToast(t('nodes.data.selectVaultDirFirst'), 'warning');
      return;
    }
    setIsFolderSelectOpen(true);
  };

  const handleSaveToVaultConfirm = async (folderId: string | null) => {
    setIsFolderSelectOpen(false);
    const targetFolder = folderId || vaultPath;
    if (!targetFolder) return;

    try {
      if (data.sourceType === 'text') {
        const text = data.textContent || localText || '';
        if (!text.trim()) {
          showToast(t('nodes.data.contentEmpty'), 'warning');
          return;
        }
        const rawName = data.fileName || 'data-node-content';
        const fileName = rawName.toLowerCase().endsWith('.md') ? rawName : `${rawName}.md`;
        await window.electronAPI.vault.saveFile({
          filePath: targetFolder,
          name: fileName,
          text: text
        });
        showToast(t('nodes.data.savedToDir'), 'success');
        // Refresh sidebar
        await useCanvasStore.getState().loadCanvases();
        await useCanvasStore.getState().loadFolders();
      } else if (data.fileUrl && data.fileName) {
        const finalPath = `${targetFolder}/${data.fileName}`;

        const exists = await window.electronAPI.vault.checkFileExists(finalPath);
        if (exists) {
          const confirmOverwrite = window.confirm(t('nodes.data.overwriteConfirm', { fileName: data.fileName }));
          if (!confirmOverwrite) return;
        }

        // If it's a local-file path, use copyItem instead of fetch
        if (data.fileUrl.startsWith('local-file://')) {
          // Decode URL and remove protocol
          const sourcePath = decodeURIComponent(data.fileUrl.replace('local-file://', ''));
          await window.electronAPI.vault.copyItem({
            oldPath: sourcePath,
            newPath: finalPath
          });
        } else {
          // Fetch the file from the URL to get its buffer
          const response = await fetch(data.fileUrl);
          const arrayBuffer = await response.arrayBuffer();
          await window.electronAPI.vault.saveFile({
            filePath: targetFolder,
            name: data.fileName,
            buffer: arrayBuffer
          });
        }

        showToast(t('nodes.data.savedToDir'), 'success');
        // Refresh sidebar
        await useCanvasStore.getState().loadCanvases();
        await useCanvasStore.getState().loadFolders();
      } else {
        showToast(t('nodes.data.noContentToSave'), 'warning');
      }
    } catch (error) {
      console.error(error);
      showToast(t('nodes.data.saveFailed'), 'error');
    }
  };

  // --- MinerU Advanced PDF Parsing ---
  const handleMineruParse = async () => {
    if (!data.fileUrl || mineruParsing) return;

    // Extract the local file path from the fileUrl
    let filePath = '';
    if (data.fileUrl.startsWith('local-file://')) {
      filePath = decodeURIComponent(data.fileUrl.replace('local-file://', ''));
    }
    if (!filePath) {
      showToast(t('nodes.data.onlyLocalPdf'), 'warning');
      return;
    }
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

    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const taskId = `mineru:${filePath}`;
    const doRun = async () => {
      addTask({
        id: taskId,
        type: 'mineru',
        label: t('nodes.data.convertToMd', { fileName }),
        filePath,
        retryFn: doRun,
      });
      try {
        const result = await window.electronAPI.vault.mineruParse(filePath);
        if (result.success) {
          removeTask(taskId);
          showToast(t('nodes.data.mdGenerated', { fileName: result.outputPath.split(/[/\\]/).pop() }), 'success');
        } else {
          updateTask(taskId, { status: 'failed', errorMessage: result.error || t('nodes.data.parseFailed', { error: 'Unknown error' }) });
          showToast(t('nodes.data.parseFailed', { error: result.error || '未知错误' }), 'error');
        }
      } catch (error: any) {
        updateTask(taskId, { status: 'failed', errorMessage: error.message });
        showToast(t('nodes.data.mineruFailed', { error: error.message }), 'error');
      }
    };
    doRun();
  };

  // --- File Upload Handlers ---

  const processTableFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/)) {
      showToast(t('nodes.data.onlyExcelCsv'), 'error');
      return;
    }

    currentFileNameRef.current = file.name;
    const shouldUpdateTitle = !data.isCustomTitle;
    const path = (file as any).path;
    const fileUrl = path ? `local-file://${encodeURIComponent(path)}` : URL.createObjectURL(file);

    updateNodeData(nodeId, {
      status: 'loading',
      fileName: file.name,
      fileSize: file.size,
      fileUrl: fileUrl,
      fileMimeType: file.type,
      ...(shouldUpdateTitle && { title: file.name })
    });

    try {
      const arrayBuffer = await file.arrayBuffer();
      let workbook: XLSX.WorkBook;

      if (file.name.toLowerCase().endsWith('.csv')) {
        try {
          // Try UTF-8 first with fatal: true to catch encoding issues
          const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
          const text = utf8Decoder.decode(arrayBuffer);
          workbook = XLSX.read(text, { type: 'string' });
        } catch (e) {
          // Fallback to GBK for CSV files that likely use Excel's default Chinese encoding
          const gbkDecoder = new TextDecoder('gbk');
          const text = gbkDecoder.decode(arrayBuffer);
          workbook = XLSX.read(text, { type: 'string' });
        }
      } else {
        workbook = XLSX.read(arrayBuffer, { type: 'array' });
      }

      workbookRef.current = workbook;
      const sheets = workbook.SheetNames;

      if (sheets.length > 1) {
        updateNodeData(nodeId, { sheets, status: 'ready' });
        setShowSheetSelector(true);
      } else {
        loadSheetData(workbook, sheets[0], file.name);
      }
    } catch (error) {
      console.error(error);
      updateNodeData(nodeId, { status: 'error' });
      showToast(t('nodes.data.fileParseFailed'), 'error');
    }
  };

  const loadSheetData = (workbook: XLSX.WorkBook, sheetName: string, fileName?: string) => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) {
      showToast(t('nodes.data.sheetEmpty'), 'warning');
      return;
    }

    const columns = (jsonData[0] as any[]).map(col => String(col));
    const rows = jsonData.slice(1).map(row => {
      const obj: any = {};
      columns.forEach((col, idx) => {
        obj[col] = (row as any[])[idx] || null;
      });
      return obj;
    });

    const previewData = rows.slice(0, 10);
    const shouldUpdateTitle = !data.isCustomTitle;
    const newTitle = fileName || currentFileNameRef.current || data.fileName || t('nodes.data.defaultTitle');

    updateNodeData(nodeId, {
      selectedSheet: sheetName,
      columns,
      data: previewData, // Only save a tiny preview snapshot for rendering, keeping the canvas JSON ultra-lightweight
      previewData,
      status: 'ready',
      ...(shouldUpdateTitle && { title: newTitle }),
    });
    setShowSheetSelector(false);
  };

  const processGeneralFile = async (file: File) => {
    const shouldUpdateTitle = !data.isCustomTitle;
    const path = (file as any).path;
    const fileUrl = path ? `local-file://${encodeURIComponent(path)}` : URL.createObjectURL(file);

    // Auto-detect type
    let newDataType: DataType = 'document';
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (file.type.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
      newDataType = 'image';
    } else if (file.type.startsWith('video/') || ['.mp4', '.webm', '.ogg'].includes(ext)) {
      newDataType = 'video';
    } else if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      newDataType = 'table';
    }

    if (newDataType === 'table') {
      processTableFile(file);
      return;
    }

    // Set loading state
    updateNodeData(nodeId, {
      status: 'loading',
      fileName: file.name,
      fileSize: file.size,
      dataType: newDataType,
      ...(shouldUpdateTitle && { title: file.name })
    });

    try {
      let textContent = '';
      if (newDataType === 'document') {
        if (path) {
          // Call backend parser for docx, pdf, etc.
          textContent = await window.electronAPI.vault.parseFile(path);
        } else {
          // It's a blob url (in memory)
          textContent = await window.electronAPI.vault.parseUrl(fileUrl, ext) || '';
        }
      }

      const previewText = textContent ? (textContent.length > 2000 ? textContent.substring(0, 2000) + '\n... (Preview Truncated)' : textContent) : undefined;

      updateNodeData(nodeId, {
        status: 'ready',
        fileUrl: fileUrl,
        fileMimeType: file.type,
        textContent: previewText,
        // If it's a document, we might want to default to preview mode if there's text
        ...(previewText && { displayMode: 'preview' })
      });
    } catch (error) {
      console.error('Failed to parse file:', error);
      updateNodeData(nodeId, {
        status: 'ready',
        fileUrl: fileUrl,
        fileMimeType: file.type
      });
      showToast(t('nodes.data.fileParseFailedAttach'), 'warning');
    }
  };

  const onDrop = async (acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      const error = fileRejections[0].errors[0];
      if (error.code === 'too-many-files') {
        showToast(t('nodes.data.oneFileAtATime'), 'warning');
      } else if (error.code === 'file-invalid-type') {
        showToast(t('nodes.data.unsupportedFormat'), 'error');
      } else {
        showToast(t('nodes.data.uploadFailed', { error: error.message }), 'error');
      }
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    // Auto-detect type and process
    if (file.name.match(/\.(xlsx|xls|csv)$/)) {
      updateNodeData(nodeId, { dataType: 'table' });
      processTableFile(file);
    } else {
      await processGeneralFile(file);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt', '.log', '.json', '.yaml', '.yml'],
      'text/markdown': ['.md'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
      'video/*': ['.mp4', '.webm', '.ogg']
    },
    noClick: false,
    noKeyboard: true,
    multiple: false,
    maxFiles: 1,
    disabled: !!data.fileName || (!!data.data && data.dataType === 'table')
  });

  // --- Render Sections ---

  // 1. Initial State: Source Selection (Matches Prototype)
  if (!data.sourceType) {
    return (
      <div className={cn("flex flex-col h-full bg-white relative rounded-b-xl", isFullscreen ? "items-center justify-center p-8" : "p-4")}>
        <div className="flex flex-col items-center justify-center h-full gap-5 w-full">
          {/* Header Text */}
          <div className="text-center space-y-1">
            <h4 className="text-base font-semibold text-gray-800">{t('nodes.data.selectSource')}</h4>
            <p className="text-xs text-gray-500 max-w-[300px] mx-auto leading-relaxed">
              {t('nodes.data.selectSourceDesc')}
            </p>
          </div>

          {/* Selection Cards */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-[280px]">
            <button
              onClick={() => handleSourceTypeSelect('text')}
              className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-blue-400 hover:ring-2 hover:ring-blue-50 transition-all group h-[110px]"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                <Type size={20} className="text-gray-500 group-hover:text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-600 group-hover:text-blue-700">{t('nodes.data.manualInput')}</span>
            </button>

            <button
              onClick={() => handleSourceTypeSelect('file')}
              className="flex flex-col items-center justify-center gap-3 p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-blue-400 hover:ring-2 hover:ring-blue-50 transition-all group h-[110px]"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                <FileUp size={20} className="text-gray-500 group-hover:text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-600 group-hover:text-blue-700">{t('nodes.data.uploadFile')}</span>
            </button>
          </div>
        </div>

      </div>
    );
  }

  // 2. Text Input Mode
  if (data.sourceType === 'text') {
    const hasText = !!localText.trim() || !!data.textContent;
    return (
      <>
        <div className="flex flex-col h-full w-full relative group/container bg-white rounded-b-xl">
          {/* Toolbar / Reset */}
          <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/container:opacity-100 transition-opacity flex items-center gap-1">
            {/* Display Mode Toggle */}
            {localText.trim() && (
              <button
                onClick={() => {
                  if (localText !== data.textContent) {
                    updateNodeData(nodeId, { textContent: localText });
                  }
                  updateNodeData(nodeId, { displayMode: data.displayMode === 'preview' ? 'source' : 'preview' });
                }}
                className="p-1.5 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-gray-100 text-gray-600 transition-all"
                title={data.displayMode === 'preview' ? t('nodes.data.viewSource') : t('nodes.data.previewMd')}
              >
                {data.displayMode === 'preview' ? <Code size={14} /> : <Eye size={14} />}
              </button>
            )}

            <button
              onClick={handleSaveToVaultClick}
              className="p-1.5 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-gray-100 text-gray-600 transition-all"
              title={t('nodes.data.saveToDir')}
            >
              <Save size={14} />
            </button>

            {!hasText && (
              <button
                onClick={handleReset}
                className="p-1.5 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-gray-100 text-gray-600 transition-all"
                title={t('nodes.data.back')}
              >
                <ChevronLeft size={14} />
              </button>
            )}
          </div>

          {data.displayMode === 'preview' ? (
            <div
              className={cn(
                "flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar px-6 py-5 bg-white rounded-b-xl leading-relaxed text-slate-700 min-h-0 text-left",
                isFocused ? "nowheel nodrag" : "",
                isFullscreen ? "text-base" : "text-sm"
              )}
              onWheel={isFocused ? handleWheel : undefined}
            >
              <div className={cn(
                "prose prose-slate max-w-none w-full",
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
                  components={{
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4 border border-slate-200 rounded-lg">
                        <table className="w-full border-collapse">
                          {children}
                        </table>
                      </div>
                    ),
                    th: ({ children }) => <th className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-left font-semibold text-slate-700">{children}</th>,
                    td: ({ children }) => <td className="px-4 py-2 border-b border-slate-100 text-slate-600">{children}</td>
                  }}
                >
                  {localText}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <textarea
              className={cn(
                "w-full h-full flex-1 p-3 text-sm resize-none focus:outline-none bg-transparent font-mono leading-relaxed text-gray-800 placeholder:text-gray-300",
                isFocused ? "nowheel nodrag nopan" : "",
                isFullscreen ? "text-base p-8 w-full h-full" : ""
              )}
              placeholder={t('nodes.data.placeholder')}
              value={localText}
              onChange={handleTextChange}
              onFocus={handleTextFocus}
              onBlur={handleTextBlur}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  e.currentTarget.blur();
                } else {
                  e.stopPropagation();
                }
              }}
              onWheel={isFocused ? handleWheel : undefined}
            />
          )}

          {/* Character count floating over textarea */}
          <div className="absolute bottom-12 right-3 text-[10px] text-gray-400 bg-white/80 px-1 rounded pointer-events-none fade-in">
            {localText.length} {t('nodes.data.chars')}
          </div>
        </div>
        <FolderSelectModal
          isOpen={isFolderSelectOpen}
          title={t('nodes.data.selectSaveDir')}
          initialFolderId={currentFolderId}
          onConfirm={handleSaveToVaultConfirm}
          onCancel={() => setIsFolderSelectOpen(false)}
        />
      </>
    );
  }

  // IMA Knowledge Base Mode
  if (data.dataType === 'ima_knowledge_base') {
    return (
      <div className="flex flex-col h-full w-full relative group/container bg-white rounded-b-xl overflow-hidden">
        <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/container:opacity-100 transition-opacity p-1">
          <button
            onClick={handleReset}
            className="p-1.5 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-red-50 hover:text-red-500 transition-all"
            title={t('nodes.data.removeData')}
          >
            <Trash2 size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden p-3 flex flex-col items-center justify-center">
          <div className={cn("flex-1 flex flex-col w-full h-full p-1 min-h-0", isFullscreen ? "gap-4" : "gap-2")}>
            {/* Header */}
            <div className={cn("flex items-center px-1", isFullscreen ? "gap-4 px-4 pt-2" : "gap-3")}>
              <div className={cn(
                "flex items-center justify-center shrink-0 overflow-hidden",
                data.coverUrl 
                  ? "" // no extra border/bg for actual images
                  : "bg-gradient-to-br from-indigo-50 to-purple-50/30 border border-indigo-100/50 text-indigo-600 shadow-sm",
                isFullscreen ? "w-12 h-12 rounded-2xl" : "w-9 h-9 rounded-xl"
              )}>
                {data.coverUrl ? (
                    <img src={data.coverUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                    <Database size={isFullscreen ? 22 : 16} strokeWidth={2} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("flex items-center mb-0.5", isFullscreen ? "gap-2.5" : "gap-1.5")}>
                  <span className={cn(
                    "bg-indigo-100/50 text-indigo-600 font-black rounded-md uppercase tracking-widest shrink-0",
                    isFullscreen ? "px-2.5 py-1 text-[10px]" : "px-1.5 py-0.5 text-[8px]"
                  )}>
                    IMA KB
                  </span>
                  <h4 className={cn(
                    "font-bold text-gray-800 truncate",
                    isFullscreen ? "text-base" : "text-[11px]"
                  )} title={data.title}>
                    {data.title || 'IMA 知识库'}
                  </h4>
                </div>
                <div className={cn(
                  "flex items-center gap-2 font-medium text-gray-400",
                  isFullscreen ? "text-sm" : "text-[10px]"
                )}>
                  <span>{data.imaFolderName ? `目录: ${data.imaFolderName}` : '完整知识库搜索'}</span>
                </div>
              </div>
            </div>

            {/* Content preview */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-[120px] border border-indigo-100/50 rounded-2xl overflow-hidden relative bg-indigo-50/10 flex flex-col items-center justify-center text-center p-4">
                 <div className="w-12 h-12 rounded-full bg-indigo-100/50 flex items-center justify-center mb-3 text-indigo-400">
                    <Database size={20} strokeWidth={1.5} />
                 </div>
                 <h5 className="text-sm font-semibold text-slate-700 mb-1">已连接 IMA 知识库</h5>
                 <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed">
                    当此节点连接到提示节点时，AI 会自动在知识库中检索相关内容。
                 </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. File Upload Mode
  const hasFile = !!data.fileName || !!data.data;
  return (
    <>
      <div className="flex flex-col h-full w-full relative group/container bg-white rounded-b-xl overflow-hidden">
        {!hasFile && (
          <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/container:opacity-100 transition-opacity p-1">
            <button
              onClick={handleReset}
              className="p-1.5 bg-white shadow-sm border border-gray-200 rounded-md hover:bg-gray-100 text-gray-600 transition-all"
              title={t('nodes.data.back')}
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden p-3 flex flex-col items-center justify-center">
          {/* Empty State: Upload Area */}
          {!data.fileName && !data.data ? (
            <div
              {...getRootProps()}
              className={cn(
                "w-full h-full border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all",
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50/50'
              )}
            >
              <input {...getInputProps()} />
              <div className="p-3.5 rounded-2xl bg-gray-50 mb-3 text-gray-400 group-hover:text-blue-500 group-hover:bg-blue-100 transition-all">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-[11px] font-bold text-gray-600 tracking-tight">{t('nodes.data.dragToUpload')}</p>
              <p className="text-[9px] text-gray-400 mt-2 text-center px-6 leading-relaxed">{t('nodes.data.supportedFormats')}</p>
            </div>
          ) : (
            /* Filled State: Integrated File Layout (Seamless Redesign) */
            <div className="w-full h-full flex flex-col p-1">
              {data.status === 'loading' ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-gray-50/30 rounded-2xl p-8 border border-gray-100/30">
                  <div className="relative">
                    <div className="w-10 h-10 border-[3px] border-blue-100/50 rounded-full" />
                    <div className="w-10 h-10 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-gray-500 tracking-tight">{t('nodes.data.parsingData')}</p>
                    <p className="text-[9px] text-gray-400 mt-1 uppercase tracking-widest font-semibold">Please wait</p>
                  </div>
                </div>
              ) : (
                <div className={cn("flex-1 flex flex-col min-h-0", isFullscreen ? "gap-4" : "gap-2")}>
                  {/* Integrated Header with inline actions */}
                  <div className={cn("flex items-center px-1", isFullscreen ? "gap-4 px-4 pt-2" : "gap-3")}>
                    <div className={cn(
                      "bg-gradient-to-br from-blue-50 to-indigo-50/30 border border-blue-100/50 flex items-center justify-center text-blue-600 shadow-sm shrink-0",
                      isFullscreen ? "w-12 h-12 rounded-2xl" : "w-9 h-9 rounded-xl"
                    )}>
                      <FileIcon size={isFullscreen ? 22 : 16} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn("flex items-center mb-0.5", isFullscreen ? "gap-2.5" : "gap-1.5")}>
                        <span className={cn(
                          "bg-blue-100/50 text-blue-600 font-black rounded-md uppercase tracking-widest shrink-0",
                          isFullscreen ? "px-2.5 py-1 text-[10px]" : "px-1.5 py-0.5 text-[8px]"
                        )}>
                          {(data.fileName || '').split('.').pop() || 'FILE'}
                        </span>
                        <h4 className={cn(
                          "font-bold text-gray-800 truncate",
                          isFullscreen ? "text-base" : "text-[11px]"
                        )} title={data.fileName}>
                          {data.fileName || t('nodes.data.unnamedData')}
                        </h4>
                      </div>
                      <div className={cn(
                        "flex items-center gap-2 font-medium text-gray-400",
                        isFullscreen ? "text-sm" : "text-[10px]"
                      )}>
                        <span>{data.fileSize ? (data.fileSize >= 1048576 ? `${(data.fileSize / 1048576).toFixed(1)} MB` : `${(data.fileSize / 1024).toFixed(1)} KB`) : ''}</span>
                        {data.dataType === 'table' && (
                          <>
                            <div className="w-0.5 h-0.5 bg-gray-200 rounded-full" />
                            <span className={cn(
                              "text-blue-500/80 font-bold uppercase tracking-tighter",
                              isFullscreen ? "text-xs" : "text-[9px]"
                            )}>{t('nodes.data.tableData', '表格数据')}</span>
                            <div className="w-0.5 h-0.5 bg-gray-200 rounded-full" />
                            <span className={cn(
                              "text-gray-400 font-medium whitespace-nowrap",
                              isFullscreen ? "text-[11px]" : "text-[8px]"
                            )} title={t('nodes.data.maxRowsLimitTip', '为避免超出大模型上下文限制，最多仅取前 2000 行参与 AI 对话')}>{t('nodes.data.maxRowsLimit', '最多前2000行参与AI对话')}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Inline actions */}
                    <div className={cn("flex items-center shrink-0", isFullscreen ? "gap-1.5" : "gap-1")}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSaveToVaultClick(); }}
                        className={cn(
                          "flex items-center justify-center text-gray-400 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-all",
                          isFullscreen ? "w-9 h-9" : "w-7 h-7"
                        )}
                        title={t('nodes.data.saveToDir')}
                      >
                        <Save size={isFullscreen ? 16 : 13} strokeWidth={2} />
                      </button>

                      <button
                        onClick={(e) => { e.stopPropagation(); handleReset(); }}
                        className={cn(
                          "flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all",
                          isFullscreen ? "w-9 h-9" : "w-7 h-7"
                        )}
                        title={t('nodes.data.removeData')}
                      >
                        <Trash2 size={isFullscreen ? 16 : 13} strokeWidth={2} />
                      </button>
                    </div>
                  </div>


                  {/* Integrated Preview Section */}
                  {!isFullscreen && (data.data || data.textContent || data.fileUrl) && (
                    <div className="flex-1 min-h-0 flex flex-col group/preview">

                      <div className="flex-1 min-h-[120px] border border-gray-100/50 rounded-2xl overflow-hidden relative bg-slate-50/30 transition-all group-hover/preview:border-gray-200/50">
                        {data.dataType === 'table' ? (
                          <div className="h-full overflow-hidden text-left">
                            <table className="w-full text-[9px] text-left border-collapse">
                              <thead className="bg-gray-50/80">
                                <tr>
                                  {data.columns?.slice(0, 4).map(col => (
                                    <th key={col} className="p-2 border-b border-gray-100 font-bold text-gray-500 truncate max-w-[60px]">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {(data.previewData || data.data || []).slice(0, 4).map((row: any, i: number) => (
                                  <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/30">
                                    {data.columns?.slice(0, 4).map(col => (
                                      <td key={`${i}-${col}`} className="p-2 truncate max-w-[60px] text-gray-400 font-medium">
                                        {String(row[col] || '')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (data.dataType === 'image' && data.fileUrl) ? (
                          <div className="h-full w-full flex items-center justify-center p-2 bg-white/50">
                            <img
                              src={data.fileUrl}
                              alt={data.fileName}
                              className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                            />
                          </div>
                        ) : (data.dataType === 'video' && data.fileUrl) ? (
                          <div className="h-full w-full flex items-center justify-center p-2 bg-white/50">
                            <video
                              src={data.fileUrl}
                              controls
                              className="max-w-full max-h-full rounded-lg shadow-sm"
                            />
                          </div>
                        ) : (
                          <div className="p-3 h-full overflow-hidden">
                            <div className="text-[10px] leading-relaxed text-gray-400 font-medium line-clamp-[8] whitespace-pre-wrap text-left">
                              {data.textContent || (data.previewData ? JSON.stringify(data.previewData, null, 2) : '')}
                            </div>
                          </div>
                        )}
                        {/* Smooth bottom fade (only for text/tables) */}
                        {data.dataType !== 'image' && data.dataType !== 'video' && (
                          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Preview content for Fullscreen */}
                  {isFullscreen && (data.data || data.textContent || data.fileUrl) && (
                    <div className="w-full flex-1 flex flex-col min-h-0 bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                      {data.dataType === 'table' ? (
                        <div className="flex-1 overflow-auto custom-scrollbar text-left">
                          <table className="w-full text-xs text-left border-collapse min-w-full">
                            <thead className="bg-gray-50/80 backdrop-blur-sm sticky top-0 z-10">
                              <tr>
                                {data.columns?.map(col => (
                                  <th key={col} className="p-3 border-b border-gray-100 font-bold text-gray-600 truncate max-w-[200px]">{col}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(data.data || []).map((row: any, i: number) => (
                                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30 transition-colors">
                                  {data.columns?.map(col => (
                                    <td key={`${i}-${col}`} className="p-3 truncate max-w-[200px] text-gray-500 font-medium whitespace-nowrap">
                                      {String(row[col] || '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (data.dataType === 'image' && data.fileUrl) ? (
                        <div className="flex-1 flex items-center justify-center p-8 bg-gray-50/30">
                          <img
                            src={data.fileUrl}
                            alt={data.fileName}
                            className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-gray-200"
                          />
                        </div>
                      ) : (data.dataType === 'video' && data.fileUrl) ? (
                        <div className="flex-1 flex items-center justify-center p-8 bg-gray-100">
                          <video
                            src={data.fileUrl}
                            controls
                            className="max-w-full max-h-full rounded-xl shadow-lg"
                          />
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto px-10 py-8 custom-scrollbar bg-white text-left">
                          <div className="prose prose-slate max-w-none w-full prose-sm md:prose-base
                            prose-headings:font-bold prose-headings:text-slate-800
                            prose-p:leading-relaxed prose-p:text-slate-600
                            prose-table:border prose-table:border-slate-100 prose-table:rounded-xl 
                            prose-th:bg-slate-50 prose-th:px-4 prose-th:py-2 
                            prose-td:px-4 prose-td:py-2
                            prose-code:text-teal-700 prose-code:bg-teal-50 prose-code:px-1 prose-code:rounded
                            prose-pre:bg-slate-900 prose-pre:text-gray-100 prose-pre:p-0 prose-pre:rounded-xl">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeRaw]}
                              components={{
                                table: ({ children }) => (
                                  <div className="overflow-x-auto my-6 border border-slate-100 rounded-xl shadow-sm">
                                    <table className="w-full border-collapse">
                                      {children}
                                    </table>
                                  </div>
                                ),
                                th: ({ children }) => <th className="bg-slate-50 px-4 py-3 border-b border-slate-100 text-left font-bold text-slate-700 uppercase tracking-wider text-[11px]">{children}</th>,
                                td: ({ children }) => <td className="px-4 py-3 border-b border-slate-50 text-slate-600 font-medium">{children}</td>
                              }}
                            >
                              {data.textContent || (data.previewData ? JSON.stringify(data.previewData, null, 2) : '')}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <FolderSelectModal
        isOpen={isFolderSelectOpen}
        title={t('nodes.data.selectSaveDir')}
        initialFolderId={currentFolderId}
        onConfirm={handleSaveToVaultConfirm}
        onCancel={() => setIsFolderSelectOpen(false)}
      />
    </>
  );
}