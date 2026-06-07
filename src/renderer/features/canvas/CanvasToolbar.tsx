import { useRef } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { Undo, Redo, Save, Upload, Download } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

export function CanvasToolbar() {
    const { t } = useTranslation();
    const {
        undo,
        redo,
        history,
        saveCurrentCanvas,
        loadCanvas,
        exportCanvas,
        nodes,
        edges
    } = useCanvasStore();
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const content = JSON.parse(event.target?.result as string);
                if (content.nodes && content.edges) {
                    loadCanvas(content);
                    showToast(t('canvas.importSuccess'), 'success');
                } else {
                    showToast(t('canvas.importInvalid'), 'error');
                }
            } catch (err) {
                console.error(err);
                showToast(t('canvas.importFailed'), 'error');
            }
        };
        reader.readAsText(file);
        // Reset input
        e.target.value = '';
    };

    const handleSave = async () => {
        try {
            await saveCurrentCanvas();
            showToast(t('canvas.saveSuccess'), 'success');
        } catch (error) {
            showToast(t('canvas.saveFailed'), 'error');
        }
    };

    const handleExport = () => {
        const data = exportCanvas();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `canvas-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(t('canvas.exportSuccess'), 'success');
    };

    const canUndo = history.past.length > 0;
    const canRedo = history.future.length > 0;

    return (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
            <div className="flex items-center bg-white rounded-lg shadow-sm border border-slate-200 p-1">
                <button
                    onClick={undo}
                    disabled={!canUndo}
                    className={`p-2 rounded-md transition-colors ${canUndo
                            ? 'hover:bg-slate-100 text-slate-600'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                    title={t('canvas.undo')}
                >
                    <Undo size={18} />
                </button>
                <button
                    onClick={redo}
                    disabled={!canRedo}
                    className={`p-2 rounded-md transition-colors ${canRedo
                            ? 'hover:bg-slate-100 text-slate-600'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                    title={t('canvas.redo')}
                >
                    <Redo size={18} />
                </button>
            </div>

            <div className="flex items-center bg-white rounded-lg shadow-sm border border-slate-200 p-1">
                <button
                    onClick={handleSave}
                    className="p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
                    title={t('canvas.save')}
                >
                    <Save size={18} />
                </button>
                <div className="w-px h-6 bg-slate-200 mx-1" />
                <button
                    onClick={handleImportClick}
                    className="p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
                    title={t('canvas.import')}
                >
                    <Upload size={18} />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </button>
                <button
                    onClick={handleExport}
                    className="p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
                    title={t('canvas.export')}
                >
                    <Download size={18} />
                </button>
            </div>
        </div>
    );
}
