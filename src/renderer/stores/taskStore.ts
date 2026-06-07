import { create } from 'zustand';

export type TaskType = 'mineru' | 'funasr' | 'ffmpeg-extract' | 'graphrag';

export type TaskStatus = 'running' | 'failed';

export interface Task {
    /** Unique ID: `${type}:${filePath}` — prevents duplicate submissions for same file */
    id: string;
    type: TaskType;
    /** Human-readable label shown in the Tasks panel */
    label: string;
    /** Absolute file path this task operates on */
    filePath: string;
    status: TaskStatus;
    errorMessage?: string;
    startedAt: number;
    /** Called when user clicks "Retry" */
    retryFn?: () => Promise<void>;
}

interface TaskState {
    tasks: Task[];

    /** Register a new running task. Returns the task ID. */
    addTask: (task: Omit<Task, 'startedAt' | 'status'>) => string;

    /** Patch an existing task (e.g. mark as failed) */
    updateTask: (id: string, patch: Partial<Pick<Task, 'status' | 'errorMessage'>>) => void;

    /** Remove a task (call on success — completed tasks disappear from the list) */
    removeTask: (id: string) => void;

    /** Check if a task for a specific file is currently running */
    isFileRunning: (filePath: string) => boolean;

    /** Check if a task ID already exists (any status) */
    hasTask: (id: string) => boolean;

    /** Running tasks count */
    runningCount: () => number;

    /** Failed tasks count */
    failedCount: () => number;
}

export const useTaskStore = create<TaskState>((set, get) => ({
    tasks: [],

    addTask: (task) => {
        const startedAt = Date.now();
        const newTask: Task = { ...task, status: 'running', startedAt };
        set(state => ({
            tasks: [
                // Replace if same ID already exists (e.g. re-trigger after manual cancel)
                ...state.tasks.filter(t => t.id !== task.id),
                newTask,
            ]
        }));
        return task.id;
    },

    updateTask: (id, patch) => {
        set(state => ({
            tasks: state.tasks.map(t => t.id === id ? { ...t, ...patch } : t)
        }));
    },

    removeTask: (id) => {
        set(state => ({ tasks: state.tasks.filter(t => t.id !== id) }));
    },

    isFileRunning: (filePath) => {
        return get().tasks.some(t => t.filePath === filePath && t.status === 'running');
    },

    hasTask: (id) => {
        return get().tasks.some(t => t.id === id);
    },

    runningCount: () => get().tasks.filter(t => t.status === 'running').length,

    failedCount: () => get().tasks.filter(t => t.status === 'failed').length,
}));
