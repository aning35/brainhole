import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Trash2, CheckCircle2, HardDrive, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModelStatus {
    installed: boolean;
    size: number; // in bytes
    path: string;
}

interface AllModelsStatus {
    funasr: ModelStatus;
    mineru: ModelStatus;
    docling: ModelStatus;
}

export function ModelManagementPanel() {
    const { t } = useTranslation();
    const [status, setStatus] = useState<AllModelsStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState<Record<string, { progress: number, message: string }>>({});
    const [sources, setSources] = useState<Record<string, 'huggingface' | 'hf-mirror' | 'modelscope'>>({
        funasr: 'modelscope',
        mineru: 'modelscope',
        docling: 'hf-mirror'
    });

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const fetchStatus = async () => {
        try {
            const result = await window.electronAPI.models.getStatus();
            setStatus(result);
        } catch (e) {
            console.error('Failed to fetch model status', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();

        const cleanup = window.electronAPI.models.onDownloadProgress((data) => {
            const { target, progress, message } = data;
            
            if (progress === 100 || progress < 0) {
                // Done or Error
                setDownloading(prev => {
                    const next = { ...prev };
                    delete next[target];
                    return next;
                });
                if (progress === 100) {
                    fetchStatus();
                } else if (progress < 0) {
                    alert(`下载失败: ${message}`);
                }
            } else {
                setDownloading(prev => ({
                    ...prev,
                    [target]: { progress, message }
                }));
            }
        });

        return cleanup;
    }, []);

    const handleDownload = async (target: string) => {
        if (downloading[target]) return;
        
        setDownloading(prev => ({
            ...prev,
            [target]: { progress: 0, message: 'Starting...' }
        }));
        
        try {
            await window.electronAPI.models.download({
                target,
                source: sources[target],
                taskId: `download_${target}_${Date.now()}`
            });
            // Fetch status again just in case
            fetchStatus();
        } catch (e) {
            console.error('Download failed', e);
            setDownloading(prev => {
                const next = { ...prev };
                delete next[target];
                return next;
            });
        }
    };

    const handleDelete = async (target: 'funasr' | 'mineru' | 'docling') => {
        if (!confirm(t('settings.localModels.deleteConfirm'))) return;
        
        setLoading(true);
        try {
            const result = await window.electronAPI.models.delete(target);
            setStatus(result);
        } catch (e) {
            console.error('Failed to delete model', e);
        } finally {
            setLoading(false);
        }
    };

    const renderModelCard = (id: 'funasr' | 'mineru' | 'docling') => {
        const modelStatus = status?.[id] || { installed: false, size: 0, path: '' };
        const isDownloading = downloading[id];
        
        return (
            <div key={id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                {isDownloading && (
                    <div 
                        className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 ease-out" 
                        style={{ width: `${isDownloading.progress}%` }} 
                    />
                )}
                
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h3 className="text-sm font-bold text-gray-800">{t(`settings.localModels.models.${id}.name`)}</h3>
                        <p className="text-xs text-gray-500 mt-1">{t(`settings.localModels.models.${id}.desc`)}</p>
                    </div>
                    <div className="flex-shrink-0 ml-4">
                        {modelStatus.installed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-[10px] font-medium rounded-full border border-green-200">
                                <CheckCircle2 className="w-3 h-3" />
                                {t('settings.localModels.installed', { size: formatBytes(modelStatus.size) })}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-medium rounded-full border border-gray-200">
                                <HardDrive className="w-3 h-3" />
                                {t('settings.localModels.notInstalled')}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">{t('settings.localModels.source')}:</label>
                        <select 
                            value={sources[id]} 
                            onChange={(e) => setSources(prev => ({ ...prev, [id]: e.target.value as any }))}
                            disabled={!!isDownloading}
                            className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-500 disabled:opacity-50"
                        >
                            {id !== 'mineru' && <option value="huggingface">HuggingFace</option>}
                            {id !== 'mineru' && <option value="hf-mirror">HF-Mirror</option>}
                            <option value="modelscope">ModelScope</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        {isDownloading ? (
                            <div className="flex items-center gap-2 text-xs text-blue-600 font-medium">
                                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                {isDownloading.progress}% - {isDownloading.message}
                            </div>
                        ) : (
                            <>
                                {modelStatus.installed && (
                                    <button 
                                        onClick={() => handleDelete(id)}
                                        className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        {t('settings.localModels.delete')}
                                    </button>
                                )}
                                <button 
                                    onClick={() => handleDownload(id)}
                                    className={cn(
                                        "text-xs px-4 py-1.5 rounded font-medium transition-colors flex items-center gap-1",
                                        modelStatus.installed 
                                            ? "text-blue-600 bg-blue-50 hover:bg-blue-100" 
                                            : "text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
                                    )}
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    {t('settings.localModels.download')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    if (loading && !status) {
        return (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
                {t('app.loading')}
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-12">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                <HardDrive className="w-3.5 h-3.5" />
                <span>{t('settings.localModels.title')}</span>
            </div>
            
            <p className="text-xs text-gray-500 leading-relaxed bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-2">
                <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                {t('settings.localModels.desc')}
            </p>

            <div className="grid gap-4 mt-6">
                {renderModelCard('funasr')}
                {renderModelCard('mineru')}
                {renderModelCard('docling')}
            </div>
        </div>
    );
}
