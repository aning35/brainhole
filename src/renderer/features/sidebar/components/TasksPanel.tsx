import { Loader2, X, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTaskStore, Task, TaskType } from '@/stores/taskStore';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';

// Use a function or getter so translation responds to language changes
const getTypeLabels = (): Record<TaskType, string> => ({
    mineru: i18n.t('tasks.typeMineru'),
    funasr: i18n.t('tasks.typeFunasr'),
    'ffmpeg-extract': i18n.t('tasks.typeExtract'),
    graphrag: i18n.t('tasks.typeGraphrag'),
});

const TYPE_COLORS: Record<TaskType, { bg: string; text: string; border: string }> = {
    mineru: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' },
    funasr: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
    'ffmpeg-extract': { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200' },
    graphrag: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
};

function TaskCard({ task }: { task: Task }) {
    const { t } = useTranslation();
    const { removeTask, updateTask } = useTaskStore();
    const color = TYPE_COLORS[task.type];
    const typeLabel = getTypeLabels()[task.type];
    const isRunning = task.status === 'running';
    const fileName = task.filePath.split(/[/\\]/).pop() || task.filePath;

    const handleRetry = async () => {
        if (!task.retryFn) return;
        updateTask(task.id, { status: 'running', errorMessage: undefined });
        try {
            await task.retryFn();
        } catch {
            // retryFn manages its own error handling
        }
    };

    return (
        <div className={`
            relative flex flex-col gap-2 p-3 rounded-xl border transition-all
            ${isRunning
                ? 'bg-white border-gray-100 shadow-sm'
                : 'bg-red-50/60 border-red-100'
            }
        `}>
            {/* Header row */}
            <div className="flex items-center gap-2 min-w-0">
                {/* Type badge */}
                <span className={`
                    shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border
                    ${color.bg} ${color.text} ${color.border}
                `}>
                    {typeLabel}
                </span>

                {/* Status icon */}
                {isRunning ? (
                    <Loader2 className="shrink-0 w-3.5 h-3.5 text-blue-500 animate-spin" />
                ) : (
                    <AlertCircle className="shrink-0 w-3.5 h-3.5 text-red-500" />
                )}

                {/* Spacer */}
                <div className="flex-1 min-w-0" />

                {/* Action buttons */}
                {!isRunning && task.retryFn && (
                    <button
                        onClick={handleRetry}
                        className="shrink-0 p-1 rounded-md hover:bg-orange-100 text-orange-500 transition-colors"
                        title={t('tasks.retry')}
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                )}
                {!isRunning && (
                    <button
                        onClick={() => removeTask(task.id)}
                        className="shrink-0 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                        title={t('common.close')}
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* File name */}
            <p className="text-xs text-gray-600 font-medium truncate" title={fileName}>
                {fileName}
            </p>

            {/* Error message */}
            {!isRunning && task.errorMessage && (
                <p className="text-[10px] text-red-500 leading-relaxed break-words line-clamp-3">
                    {task.errorMessage}
                </p>
            )}

            {/* Running progress bar */}
            {isRunning && (
                <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full animate-pulse w-3/4" />
                </div>
            )}
        </div>
    );
}

export function TasksPanel() {
    const { t } = useTranslation();
    const tasks = useTaskStore(state => state.tasks);
    const running = tasks.filter(t => t.status === 'running');
    const failed = tasks.filter(t => t.status === 'failed');

    return (
        <div className="flex-1 flex flex-col min-h-0 p-4">
            <div className="px-1 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                {t('sidebar.tabTasks')}
                {tasks.length > 0 && (
                    <span className={`
                        px-1.5 py-0.5 rounded-full text-[10px] font-bold
                        ${failed.length > 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}
                    `}>
                        {tasks.length}
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
                {tasks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-gray-300" />
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            {t('tasks.emptyTitle')}
                            <br />
                            <span className="text-[10px]">{t('tasks.emptyDesc')}</span>
                        </p>
                    </div>
                )}

                {/* Running tasks first */}
                {running.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                            {t('tasks.running')} ({running.length})
                        </p>
                        {running.map(task => <TaskCard key={task.id} task={task} />)}
                    </div>
                )}

                {/* Failed tasks */}
                {failed.length > 0 && (
                    <div className="space-y-2 mt-3">
                        <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider px-1">
                            {t('tasks.failed')} ({failed.length})
                        </p>
                        {failed.map(task => <TaskCard key={task.id} task={task} />)}
                    </div>
                )}
            </div>
        </div>
    );
}
