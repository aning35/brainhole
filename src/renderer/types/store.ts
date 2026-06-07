import { Node, Edge, Viewport } from '@xyflow/react';
import { Patch } from 'immer';

export interface HistoryItem {
    patches: Patch[];
    inversePatches: Patch[];
}

export interface History {
    past: HistoryItem[];
    future: HistoryItem[];
}

export interface CanvasSessionState {
    canvasId: string;
    canvasName: string;
    nodes: Node[];
    edges: Edge[];
    history: History;
    viewport?: Viewport;
    textContent?: string;
    graphData?: {
        file_paths: string[];
        status: 'idle' | 'indexing' | 'ready' | 'error';
        last_error?: string;
    };
}
