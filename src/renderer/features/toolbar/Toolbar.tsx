import { t } from 'i18next';
import { useRef } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import { Undo, Redo, Save, Upload, Download, Keyboard } from 'lucide-react';

interface ToolbarProps {
  canvasName: string;
}

export function Toolbar(_props: ToolbarProps) {
  const {
    undo,
    redo,
    exportCanvas,
    loadCanvas,
    saveCurrentCanvas,
    history,
    setShortcutHelpOpen
  } = useCanvasStore();

  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const handleSave = async () => {
    try {
      await saveCurrentCanvas();
      showToast('Canvas saved successfully', 'success');
    } catch (error) {
      showToast('Failed to save canvas', 'error');
    }
  };

  const handleExport = () => {
    try {
      const data = exportCanvas();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Canvas exported successfully', 'success');
    } catch (error) {
      showToast('Failed to export canvas', 'error');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        loadCanvas(data);
        showToast('Canvas imported successfully', 'success');
      } catch (error) {
        showToast('Failed to import canvas: Invalid file format', 'error');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="flex items-center gap-0.5">
        <button
          onClick={undo}
          disabled={!canUndo}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 transition-colors",
            !canUndo && "opacity-50 cursor-not-allowed"
          )}
          title={t('toolbar.undo')}
        >
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 transition-colors",
            !canRedo && "opacity-50 cursor-not-allowed"
          )}
          title={t('toolbar.redo')}
        >
          <Redo className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-300 mx-1"></div>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={handleSave}
          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          title={t('toolbar.save')}
        >
          <Save className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleImportClick}
          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          title={t('toolbar.import')}
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".json"
        />
        <button
          onClick={handleExport}
          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          title={t('toolbar.export')}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-300 mx-1"></div>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setShortcutHelpOpen(true)}
          className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          title={t('toolbar.shortcuts')}
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}