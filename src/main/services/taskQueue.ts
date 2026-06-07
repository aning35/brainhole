/**
 * Centralized Task Queue for heavy background operations.
 *
 * Uses p-queue to limit concurrency of resource-intensive tasks
 * (GraphRAG indexing, MinerU parsing, FunASR transcription, ffmpeg, etc.)
 * so the desktop app doesn't overwhelm the system by spawning
 * too many CPU/memory-hungry child processes at once.
 */

import PQueue from 'p-queue';
import { BrowserWindow } from 'electron';

/** Maximum number of heavy tasks running simultaneously */
let maxConcurrency = 2;

/** The singleton task queue instance */
export const taskQueue = new PQueue({ concurrency: maxConcurrency });

export function setTaskConcurrency(limit: number) {
    if (limit > 0) {
        maxConcurrency = limit;
        taskQueue.concurrency = limit;
    }
}

/** Task metadata for UI display */
export interface QueuedTaskInfo {
    id: string;
    label: string;
    status: 'queued' | 'running' | 'done' | 'error';
    startedAt?: number;
    queuedAt: number;
}

/** In-memory task registry for status tracking */
const taskRegistry = new Map<string, QueuedTaskInfo>();
let taskCounter = 0;

/**
 * Broadcast queue status to all renderer windows via IPC.
 */
function broadcastQueueStatus() {
    const status = getQueueStatus();
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('taskQueue:status', status);
    }
}

/**
 * Get current queue status.
 */
export function getQueueStatus() {
    return {
        /** Number of tasks currently executing */
        running: taskQueue.pending,
        /** Number of tasks waiting in queue */
        waiting: taskQueue.size,
        /** Max concurrency */
        concurrency: maxConcurrency,
        /** All tracked tasks */
        tasks: Array.from(taskRegistry.values()),
    };
}

/**
 * Add a heavy task to the queue.
 *
 * @param label   Human-readable description (e.g. "GraphRAG index: report.pdf")
 * @param fn      The async function to execute when a slot opens
 * @returns       The result of fn()
 */
export async function enqueueTask<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const id = `task_${++taskCounter}_${Date.now()}`;

    const info: QueuedTaskInfo = {
        id,
        label,
        status: 'queued',
        queuedAt: Date.now(),
    };
    taskRegistry.set(id, info);
    broadcastQueueStatus();

    console.log(`[TaskQueue] Queued: "${label}" (id=${id}, waiting=${taskQueue.size}, running=${taskQueue.pending})`);

    try {
        const result = await taskQueue.add(async () => {
            info.status = 'running';
            info.startedAt = Date.now();
            broadcastQueueStatus();
            console.log(`[TaskQueue] Started: "${label}" (id=${id})`);

            return await fn();
        });

        info.status = 'done';
        broadcastQueueStatus();
        console.log(`[TaskQueue] Done: "${label}" (id=${id})`);

        // Clean up completed tasks after a short delay
        setTimeout(() => {
            taskRegistry.delete(id);
            broadcastQueueStatus();
        }, 5000);

        return result as T;
    } catch (err) {
        info.status = 'error';
        broadcastQueueStatus();
        console.error(`[TaskQueue] Error: "${label}" (id=${id})`, err);

        setTimeout(() => {
            taskRegistry.delete(id);
            broadcastQueueStatus();
        }, 10000);

        throw err;
    }
}

/**
 * Fire-and-forget version: adds a task to the queue but returns immediately.
 * Useful for long-running tasks like GraphRAG indexing where the IPC handler
 * should not block the renderer.
 *
 * @param label   Human-readable description
 * @param fn      The async function to execute
 * @returns       The task ID (can be used for status tracking)
 */
export function enqueueTaskAsync(label: string, fn: () => Promise<void>): string {
    const id = `task_${++taskCounter}_${Date.now()}`;

    const info: QueuedTaskInfo = {
        id,
        label,
        status: 'queued',
        queuedAt: Date.now(),
    };
    taskRegistry.set(id, info);
    broadcastQueueStatus();

    console.log(`[TaskQueue] Queued (async): "${label}" (id=${id}, waiting=${taskQueue.size}, running=${taskQueue.pending})`);

    taskQueue.add(async () => {
        info.status = 'running';
        info.startedAt = Date.now();
        broadcastQueueStatus();
        console.log(`[TaskQueue] Started: "${label}" (id=${id})`);

        try {
            await fn();
            info.status = 'done';
            console.log(`[TaskQueue] Done: "${label}" (id=${id})`);
        } catch (err) {
            info.status = 'error';
            console.error(`[TaskQueue] Error: "${label}" (id=${id})`, err);
        }

        broadcastQueueStatus();
        setTimeout(() => {
            taskRegistry.delete(id);
            broadcastQueueStatus();
        }, 5000);
    });

    return id;
}
