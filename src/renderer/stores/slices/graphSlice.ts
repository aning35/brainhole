import { StateCreator } from 'zustand';
import { produceWithPatches, applyPatches, enablePatches } from 'immer';
import { Node, Edge, Connection, addEdge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from '@xyflow/react';

enablePatches();
import { CanvasState, OutputNodeData } from '../canvasStore';
import { History } from '../../types/store';
import { aiService, AIContextItem } from '../../services/aiService';
import dagre from 'dagre';

export interface GraphSlice {
    nodes: Node[];
    edges: Edge[];
    history: History;

    isConnecting: boolean;
    connectingFrom: { nodeId: string; handleId: string; handleType: string } | null;
    preDragNodes: Node[] | null;
    preResizeNodes: Node[] | null;

    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    addNode: (node: Node) => void;
    createNode: (type: string, position: { x: number; y: number }) => string;
    updateNodeData: (id: string, data: any, skipSnapshot?: boolean) => void;
    updateNode: (id: string, updates: Partial<Node>) => void;

    onResizeStart: () => void;
    onResizeEnd: () => void;

    undo: () => void;
    redo: () => void;
    // takeSnapshot is removed as we use produceWithPatches in each mutator

    setConnecting: (isConnecting: boolean, from?: { nodeId: string; handleId: string; handleType: string } | null) => void;
    detectCycle: (sourceId: string, targetId: string) => boolean;
    getNodeDependencies: (nodeId: string) => string[];
    getConnectedContextNodes: (nodeId: string) => Node[];
    getNode: (nodeId: string) => Node | undefined;
    removeNode: (id: string) => void;
    isValidConnection: (connection: Connection) => boolean;
    saveOutputAsDataNode: (nodeId: string, customContent?: string, customTitle?: string) => void;
    generateOutput: (nodeId: string) => Promise<void>;

    duplicateNodes: (nodeIds: string[]) => void;
    autoLayout: (direction?: 'TB' | 'LR') => void;

    // Click-to-connect
    pendingClickConnection: { nodeId: string; handleId: string; handleType: 'source' | 'target' } | null;
    setPendingClickConnection: (pending: { nodeId: string; handleId: string; handleType: 'source' | 'target' } | null) => void;
}

export const createGraphSlice: StateCreator<
    CanvasState,
    [],
    [],
    GraphSlice
> = (set, get) => ({
    nodes: [],
    edges: [],
    history: { past: [], future: [] },
    isConnecting: false,
    connectingFrom: null,
    preDragNodes: null,
    preResizeNodes: null,
    pendingClickConnection: null,

    autoLayout: (direction = 'LR') => {
        const { nodes, edges } = get();
        if (nodes.length === 0) return;

        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 200 });

        nodes.forEach((node) => {
            const width = (node as any).measured?.width || (node.style?.width as number) || 400;
            const height = (node as any).measured?.height || (node.style?.height as number) || 300;
            dagreGraph.setNode(node.id, { width, height });
        });

        edges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        const [nextNodes, patches, inversePatches] = produceWithPatches(nodes, (draft) => {
            draft.forEach((node) => {
                const nodeWithPosition = dagreGraph.node(node.id);
                if (nodeWithPosition) {
                    const width = (node as any).measured?.width || (node.style?.width as number) || 400;
                    const height = (node as any).measured?.height || (node.style?.height as number) || 300;
                    node.position = {
                        x: nodeWithPosition.x - width / 2,
                        y: nodeWithPosition.y - height / 2,
                    };
                }
            });
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                nodes: nextNodes,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        }
    },

    onResizeStart: () => {
        set({ preResizeNodes: get().nodes });
    },

    onResizeEnd: () => {
        const { nodes, preResizeNodes } = get();
        if (!preResizeNodes) return;

        // Final snapshot of the resize operation
        const [_, patches, inversePatches] = produceWithPatches(preResizeNodes, () => {
            return nodes;
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                preResizeNodes: null,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ preResizeNodes: null });
        }
    },

    undo: () => {
        const { past, future } = get().history;
        if (past.length === 0) return;

        const lastItem = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        set(state => {
            const nextNodes = applyPatches(state.nodes, lastItem.inversePatches.filter(p => p.path[0] === 'nodes').map(p => ({ ...p, path: p.path.slice(1) })));
            const nextEdges = applyPatches(state.edges, lastItem.inversePatches.filter(p => p.path[0] === 'edges').map(p => ({ ...p, path: p.path.slice(1) })));

            return {
                nodes: nextNodes,
                edges: nextEdges,
                history: {
                    past: newPast,
                    future: [lastItem, ...future]
                }
            };
        });
    },

    redo: () => {
        const { past, future } = get().history;
        if (future.length === 0) return;

        const nextItem = future[0];
        const newFuture = future.slice(1);

        set(state => {
            const nextNodes = applyPatches(state.nodes, nextItem.patches.filter(p => p.path[0] === 'nodes').map(p => ({ ...p, path: p.path.slice(1) })));
            const nextEdges = applyPatches(state.edges, nextItem.patches.filter(p => p.path[0] === 'edges').map(p => ({ ...p, path: p.path.slice(1) })));

            return {
                nodes: nextNodes,
                edges: nextEdges,
                history: {
                    past: [...past, nextItem],
                    future: newFuture
                }
            };
        });
    },

    onNodesChange: (changes) => {
        const { nodes, preDragNodes, preResizeNodes } = get();

        // 1. Identify live resize
        const isResizing = !!preResizeNodes;

        // 2. Track drag start
        const isDragStart = changes.some(c => c.type === 'position' && (c as any).dragging);
        if (isDragStart && !preDragNodes) {
            set({ preDragNodes: nodes });
        }

        // 3. Track drag end
        const isDragEnd = changes.some(c => c.type === 'position' && !(c as any).dragging) && !!preDragNodes;

        // 4. Safe apply for React Flow (it sometimes mutates for performance, which crashes with frozen Immer objects)
        const nodesToApply = nodes.map(node => {
            const hasChange = changes.some(c => ('id' in c ? (c as any).id === node.id : false));
            if (hasChange) {
                // Return a fresh clone if it's likely to be mutated
                return {
                    ...node,
                    style: node.style ? { ...node.style } : undefined,
                    measured: (node as any).measured ? { ...(node as any).measured } : undefined
                };
            }
            return node;
        });

        // 5. Check for other meaningful changes
        const isImmediateMove = changes.some(c => c.type === 'position' && !(c as any).dragging && !preDragNodes);
        const isOtherMeaningful = changes.some(c => ['remove', 'add', 'dimensions', 'data'].includes(c.type));

        if (isResizing) {
            // During live resize, we just apply the changes to state without recording history
            // History is recorded in onResizeEnd
            set({ nodes: applyNodeChanges(changes, nodesToApply) });
        } else if (isDragEnd) {
            const nextNodes = applyNodeChanges(changes, nodesToApply);
            const [_, patches, inversePatches] = produceWithPatches(preDragNodes!, () => {
                return nextNodes;
            });

            const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
            const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

            if (patches.length > 0) {
                set(state => ({
                    nodes: nextNodes,
                    preDragNodes: null,
                    history: {
                        past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                        future: []
                    }
                }));
            } else {
                set({ nodes: nextNodes, preDragNodes: null });
            }
        } else if (isImmediateMove || isOtherMeaningful) {
            const [nextNodes, patches, inversePatches] = produceWithPatches(nodes, () => {
                return applyNodeChanges(changes, nodesToApply);
            });

            const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
            const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

            if (patches.length > 0) {
                set(state => ({
                    nodes: nextNodes,
                    history: {
                        past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                        future: []
                    }
                }));
            } else {
                set({ nodes: nextNodes });
            }
        } else {
            set({ nodes: applyNodeChanges(changes, nodesToApply) });
        }
    },

    onEdgesChange: (changes) => {
        const { edges } = get();
        const nextChanges = changes.filter(change => {
            if (change.type === 'remove') {
                const edge = edges.find(e => e.id === change.id);
                if (edge && edge.deletable === false) return false;
            }
            return true;
        });

        if (nextChanges.length === 0) return;

        const isMeaningful = nextChanges.some(c => ['remove', 'add', 'reset'].includes(c.type));

        if (isMeaningful) {
            const [nextEdges, patches, inversePatches] = produceWithPatches(edges, () => {
                return applyEdgeChanges(nextChanges, edges);
            });

            const prefixedPatches = patches.map(p => ({ ...p, path: ['edges', ...p.path] }));
            const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['edges', ...p.path] }));

            if (patches.length > 0) {
                set(state => ({
                    edges: nextEdges,
                    history: {
                        past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                        future: []
                    }
                }));
            } else {
                set({ edges: nextEdges });
            }
        } else {
            set({
                edges: applyEdgeChanges(nextChanges, edges),
            });
        }
    },

    onConnect: (connection) => {
        if (get().detectCycle(connection.source || '', connection.target || '')) {
            alert('Circular dependency detected!');
            return;
        }

        const [nextEdges, patches, inversePatches] = produceWithPatches(get().edges, () => {
            return addEdge(connection, get().edges);
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['edges', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['edges', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                edges: nextEdges,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ edges: nextEdges });
        }
    },

    addNode: (node) => {
        const [nextNodes, patches, inversePatches] = produceWithPatches(get().nodes, (draft) => {
            draft.push(node);
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                nodes: nextNodes,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ nodes: nextNodes });
        }
    },

    createNode: (type, position) => {
        const id = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        // Auto-increment title
        const existingNodes = get().nodes.filter(n => n.type === type);
        let maxIndex = 0;
        existingNodes.forEach(n => {
            const title = (n.data as any).title || '';
            const match = title.match(/(\d+)$/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxIndex) maxIndex = num;
            }
        });
        const nextIndex = maxIndex + 1;
        const typeLabel = type === 'data' ? '数据节点' : type === 'prompt' ? '提示节点' : type === 'output' ? '输出节点' : '未命名节点';
        const title = `${typeLabel} ${nextIndex}`;

        const newNode: Node = {
            id,
            type,
            position,
            data: { label: title, title: title, initialTitle: title },
            style: { width: 400, height: type === 'prompt' ? 500 : 300 },
        };

        const [nextNodes, patches, inversePatches] = produceWithPatches(get().nodes, (draft) => {
            draft.push(newNode);
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                nodes: nextNodes,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ nodes: nextNodes });
        }
        return id;
    },

    updateNodeData: (id, data, skipSnapshot) => {
        const { nodes } = get();
        if (skipSnapshot) {
            set({
                nodes: nodes.map((node) => {
                    if (node.id === id) {
                        return { ...node, data: { ...node.data, ...data } };
                    }
                    return node;
                }),
            });
            return;
        }

        const [nextNodes, patches, inversePatches] = produceWithPatches(nodes, (draft) => {
            const node = draft.find(n => n.id === id);
            if (node) {
                node.data = { ...node.data, ...data };
            }
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                nodes: nextNodes,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ nodes: nextNodes });
        }
    },

    updateNode: (id, updates) => {
        const [nextNodes, patches, inversePatches] = produceWithPatches(get().nodes, (draft) => {
            const node = draft.find(n => n.id === id);
            if (node) {
                Object.assign(node, updates);
            }
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                nodes: nextNodes,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ nodes: nextNodes });
        }
    },

    setConnecting: (isConnecting, from) => {
        set({ isConnecting, connectingFrom: from || null });
    },

    setPendingClickConnection: (pending) => {
        set({ pendingClickConnection: pending });
    },

    getNode: (nodeId) => {
        return get().nodes.find(n => n.id === nodeId);
    },

    getConnectedContextNodes: (nodeId) => {
        const { edges, nodes } = get();

        // Return structured connection information instead of just physical nodes
        // so that generateOutput can extract specific list items if needed.
        const connections = edges
            .filter(edge => edge.target === nodeId)
            .map(edge => ({
                sourceId: edge.source,
                sourceHandle: edge.sourceHandle
            }));

        return connections.map(conn => {
            const node = nodes.find(n => n.id === conn.sourceId);
            if (!node) return null;

            // If it's an output node in list mode, we need to extract the specific item
            // but for simplicity and backwards compatibility of this function's return type (Node[]),
            // let's clone the node and override its content with the specific list item content.
            if (node.type === 'output' && node.data?.isListMode && conn.sourceHandle?.startsWith('list-item-')) {
                const outData = node.data as OutputNodeData;
                const specificItem = outData.parsedListItems?.find(item => item.id === conn.sourceHandle);

                if (specificItem) {
                    // Create a modified clone of the node that ONLY contains this item's content
                    return {
                        ...node,
                        data: {
                            ...node.data,
                            content: specificItem.content,
                            title: `${node.data.title} (${conn.sourceHandle})`
                        }
                    };
                }
            }

            return node;
        }).filter(Boolean) as Node[];
    },

    getNodeDependencies: (nodeId) => {
        const dependencies: string[] = [];
        const { edges } = get();

        edges.forEach(edge => {
            if (edge.target === nodeId) {
                dependencies.push(edge.source);
            }
        });

        return dependencies;
    },

    detectCycle: (sourceId, targetId) => {
        const { edges } = get();
        const visited = new Set<string>();

        const hasCycle = (nodeId: string, searchTargetId: string): boolean => {
            if (nodeId === searchTargetId) return true;
            if (visited.has(nodeId)) return false;

            visited.add(nodeId);

            const outgoingEdges = edges.filter(e => e.source === nodeId);
            for (const edge of outgoingEdges) {
                if (hasCycle(edge.target, searchTargetId)) return true;
            }

            return false;
        };

        // If the target can already reach the source, adding source -> target creates a cycle
        return hasCycle(targetId, sourceId);
    },

    removeNode: (id) => {
        const { nodes, edges } = get();

        const [nextNodes, nodePatches, inverseNodePatches] = produceWithPatches(nodes, (draft) => {
            const index = draft.findIndex(n => n.id === id);
            if (index !== -1) draft.splice(index, 1);
        });

        const [nextEdges, edgePatches, inverseEdgePatches] = produceWithPatches(edges, () => {
            return edges.filter(edge => edge.source !== id && edge.target !== id);
        });

        const prefixedPatches = [
            ...nodePatches.map(p => ({ ...p, path: ['nodes', ...p.path] })),
            ...edgePatches.map(p => ({ ...p, path: ['edges', ...p.path] }))
        ];
        const prefixedInversePatches = [
            ...inverseNodePatches.map(p => ({ ...p, path: ['nodes', ...p.path] })),
            ...inverseEdgePatches.map(p => ({ ...p, path: ['edges', ...p.path] }))
        ];

        if (prefixedPatches.length > 0) {
            set(state => ({
                nodes: nextNodes,
                edges: nextEdges,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ nodes: nextNodes, edges: nextEdges });
        }
    },

    isValidConnection: (connection) => {
        const { source, target } = connection;
        if (source === target) return false;
        if (get().detectCycle(source || '', target || '')) return false;
        return true;
    },

    saveOutputAsDataNode: (nodeId: string, customContent?: string, customTitle?: string) => {
        const node = get().nodes.find(n => n.id === nodeId);
        if (!node || node.type !== 'output') return;

        const contentToSave = customContent || node.data?.content;
        if (!contentToSave) return;

        const position = {
            x: node.position.x + 550, // Increased spacing
            y: node.position.y + 50,  // Slight offset to avoid perfect overlap if multiple generated
        };

        const sourceTitle = customTitle || (node.data.title as string) || '输出结果';
        const finalTitle = customTitle ? sourceTitle : `来自 ${sourceTitle}`;

        const newDataNodeId = `data-${Date.now()}`;
        const newDataNode: Node = {
            id: newDataNodeId,
            type: 'data',
            position,
            style: { width: 400, height: 400 },
            data: {
                label: finalTitle,
                title: finalTitle,
                sourceType: 'text',
                textContent: contentToSave,
                status: 'ready',
                isCustomTitle: true,
            },
        };

        const [nextNodes, patches, inversePatches] = produceWithPatches(get().nodes, (draft) => {
            draft.push(newDataNode);
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                nodes: nextNodes,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ nodes: nextNodes });
        }
    },

    generateOutput: async (nodeId: string) => {
        const node = get().nodes.find(n => n.id === nodeId);
        if (!node || node.type !== 'prompt') return;

        // 1. Update status to generating
        get().updateNodeData(nodeId, { status: 'generating', error: undefined }, true);

        let outputNodeId: string | undefined;

        try {
            // 2. Prepare Context and Prompt
            let promptText = (node.data.promptText as string) || '';
            const connectedInputNodes = get().getConnectedContextNodes(nodeId);

            const requiresListOutput = !!node.data.requiresListOutput;

            if (requiresListOutput) {
                promptText += `

【系统指令 - 必须执行】：
请将结果拆分为多个独立的块，并使用 \`-=-=-\` 作为**块与块之间的分隔符**。
注意：
1. 分隔符仅用于“中间”，不要在全文最开头或最末尾添加分隔符。
2. 每个块内可以使用完整的 Markdown 格式。
3. **语义拆分**：如果你的输出包含总标题、前言或结尾提示（如“温馨提示”），请务必也将它们作为独立的块并使用分隔符分开。不要把标题和第一项混在一起，也不要把结尾提示和最后一项混在一起。
4. 示例格式：
总标题/前言
-=-=-
内容块 A
-=-=-
内容块 B
-=-=-
结尾提示/总结`;
            }

            const aiContext: AIContextItem[] = connectedInputNodes.map(n => ({
                nodeId: n.id,
                title: (n.data.title as string) || (n.type === 'output' ? '输出节点' : '未命名'),
                dataType: (n.data.dataType as 'text' | 'table' | 'document' | 'image' | 'video' | 'knowledge_graph' | 'ima_knowledge_base') || 'text',
                content: n.type === 'output' ? (n.data as any).content : (n.data as any).textContent,
                data: n.data.data as any[] | undefined,
                columns: n.data.columns as string[] | undefined,
                fileUrl: n.data.fileUrl as string | undefined,
                fileName: n.data.fileName as string | undefined,
                selectedSheet: (n.data as any).selectedSheet as string | undefined,
                imaKbId: (n.data as any).imaKbId,
                imaKbName: (n.data as any).imaKbName,
                imaFolderId: (n.data as any).imaFolderId,
                imaFolderName: (n.data as any).imaFolderName,
            }));

            // 3. Find or Create Output Node
            const { edges } = get();

            const existingEdge = edges.find(e => e.source === nodeId);
            if (existingEdge) {
                outputNodeId = existingEdge.target;
            }

            let nextVersionId = 'v1';

            if (!outputNodeId) {
                // Create new Output Node
                const sourceTitle = (node.data.title as string) || 'Prompt';
                const titlePrefix = `输出结果 ${sourceTitle}`;

                // Find the next available index
                const existingTitles = get().nodes.map(n => n.data.title as string);
                let finalTitle = titlePrefix;
                if (existingTitles.includes(titlePrefix)) {
                    let index = 2;
                    while (existingTitles.includes(`${titlePrefix} ${index}`)) {
                        index++;
                    }
                    finalTitle = `${titlePrefix} ${index}`;
                }

                outputNodeId = `output-${Date.now()}`;
                const newOutputNode: Node = {
                    id: outputNodeId,
                    type: 'output',
                    position: { x: node.position.x + 450, y: node.position.y }, // Increased x spacing
                    style: { width: 400, height: 400 },
                    data: {
                        label: finalTitle,
                        title: finalTitle,
                        content: '',
                        currentVersionId: 'v1',
                        versions: [{ id: 'v1', content: '', createdAt: Date.now() }],
                        isListMode: false,
                        parsedListItems: undefined
                    }
                };

                const newEdge: Edge = {
                    id: `e-${nodeId}-${outputNodeId}`,
                    source: nodeId,
                    target: outputNodeId,
                    sourceHandle: 'output',
                    targetHandle: 'input',
                    deletable: false,
                };

                const [nextNodes, nodePatches, inverseNodePatches] = produceWithPatches(get().nodes, (draft) => {
                    draft.push(newOutputNode);
                });

                const [nextEdges, edgePatches, inverseEdgePatches] = produceWithPatches(get().edges, (draft) => {
                    draft.push(newEdge);
                });

                const prefixedPatches = [
                    ...nodePatches.map(p => ({ ...p, path: ['nodes', ...p.path] })),
                    ...edgePatches.map(p => ({ ...p, path: ['edges', ...p.path] }))
                ];
                const prefixedInversePatches = [
                    ...inverseNodePatches.map(p => ({ ...p, path: ['nodes', ...p.path] })),
                    ...inverseEdgePatches.map(p => ({ ...p, path: ['edges', ...p.path] }))
                ];

                if (prefixedPatches.length > 0) {
                    set(state => ({
                        nodes: nextNodes,
                        edges: nextEdges,
                        history: {
                            past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                            future: []
                        }
                    }));
                } else {
                    set({ nodes: nextNodes, edges: nextEdges });
                }
            } else {
                const outNode = get().nodes.find(n => n.id === outputNodeId);
                const outData = outNode?.data as OutputNodeData;

                let versions = outData?.versions || [];
                // If it already has content but no versions, migrate it to v1
                if (versions.length === 0 && outData?.content) {
                    versions = [{
                        id: 'v1',
                        content: outData.content,
                        snapshot: outData.snapshot,
                        usage: outData.usage,
                        createdAt: outData.snapshot?.generatedAt || Date.now()
                    }];
                }

                const nextVersionNumber = versions.length + 1;
                nextVersionId = `v${nextVersionNumber}`;

                versions = [...versions, {
                    id: nextVersionId,
                    content: '',
                    createdAt: Date.now()
                }];
                // Reset parsed list items and switch mode if needed
                get().updateNodeData(outputNodeId, {
                    content: '',
                    currentVersionId: nextVersionId,
                    versions,
                    isListMode: false,
                    parsedListItems: undefined
                }, true);
            }

            // 4. Call AI Service and stream result
            const finalOutputId = outputNodeId;
            const { aiModel, aiApiKey, aiBaseUrl, systemPrompt: storeSystemPrompt, imaClientId, imaApiKey } = get();

            const thinkingMode = !!node.data.thinkingMode;
            const thinkingLevel = node.data.thinkingLevel;

            let lastStreamUpdateTime = 0;

            const aiResponse = await aiService.generateContent({
                prompt: promptText,
                context: aiContext,
                temperature: node.data.temperature as number | undefined,
                maxTokens: node.data.maxTokens as number | undefined,
                settings: {
                    aiModel,
                    aiApiKey,
                    aiBaseUrl,
                    systemPrompt: storeSystemPrompt,
                    thinkingMode,
                    reasoningEffort: thinkingLevel,
                    imaClientId,
                    imaApiKey
                }
            }, undefined, (partialContent) => {
                const now = Date.now();
                // Throttle React Flow node tree updates to max 10 FPS to prevent canvas lag
                if (now - lastStreamUpdateTime < 100) return; 
                lastStreamUpdateTime = now;

                const currentOutNode = get().nodes.find(n => n.id === finalOutputId);
                const outData = currentOutNode?.data as OutputNodeData;

                let newVersions = outData?.versions;
                if (newVersions) {
                    newVersions = newVersions.map(v =>
                        v.id === nextVersionId ? { ...v, content: partialContent } : v
                    );
                }

                const updates: Partial<OutputNodeData> = {};
                if (newVersions) updates.versions = newVersions;

                if (outData?.currentVersionId === nextVersionId) {
                    updates.content = partialContent;
                }

                // Update the output node with streaming text
                get().updateNodeData(finalOutputId, updates, true);
            });

            // 5. Update Output Node Data Snapshot
            // Construct the full prompt string for metadata display
            const contextStr = aiContext.map((c, index) => {
                let content = '';
                if (c.dataType === 'text') content = c.content || '';
                else if (c.dataType === 'table') content = JSON.stringify(c.data?.slice(0, 10)) + '... (truncated)';
                else content = `[${c.dataType} file: ${c.fileName}]`;
                return `Context #${index + 1} (${c.dataType}): ${c.title}\n${content}`;
            }).join('\n\n');

            const fullPrompt = `SYSTEM: ${storeSystemPrompt}\n\nUSER:\nContext Data:\n${contextStr}\n\nQuestion: ${promptText}`;

            const snapshot = {
                generatedAt: Date.now(),
                inputNodes: connectedInputNodes.map(n => ({ id: n.id, data: n.data })),
                prompt: promptText,
                fullPrompt: fullPrompt,
                temperature: node.data.temperature as number | undefined,
                maxTokens: node.data.maxTokens as number | undefined,
                requiresListOutput,
            };

            const outNodeEnd = get().nodes.find(n => n.id === finalOutputId);
            const outDataEnd = outNodeEnd?.data as OutputNodeData;

            let finalVersions = outDataEnd?.versions || [];
            finalVersions = finalVersions.map(v =>
                v.id === nextVersionId ? {
                    ...v,
                    content: aiResponse.content || v.content || '',
                    snapshot,
                    usage: aiResponse.usage,
                } : v
            );

            const finalUpdates: Partial<OutputNodeData> = {
                versions: finalVersions,
                savedAsDataNode: false,
            };

            if (outDataEnd?.currentVersionId === nextVersionId) {
                finalUpdates.snapshot = snapshot;
                finalUpdates.usage = aiResponse.usage;
                finalUpdates.content = aiResponse.content || outDataEnd?.content;
            }

            // Save snapshot right before the final status change so that undo reverts to the generation start or previous state
            get().updateNodeData(finalOutputId, finalUpdates, false);

            // 7. Handle List Parsing if required
            if (requiresListOutput) {
                const finalContent = aiResponse.content || '';
                // Split by the specific delimiter -=-=- (allowing for whitespace/newlines around it)
                const splitRegex = /\n?\s*-=-=-\s*\n?/;
                const rawItems = finalContent.split(splitRegex);
                const items = rawItems
                    .map(item => item.trim())
                    .filter(item => item.length > 0)
                    .map((content, index) => ({
                        id: `list-item-${index}`,
                        content
                    }));

                get().updateNodeData(finalOutputId, {
                    parsedListItems: items,
                    isListMode: true
                }, true);
            }

            // 8. Update Prompt Node Status
            get().updateNodeData(nodeId, { status: 'completed' }, true);
        } catch (error) {
            console.error("Error generating output:", error);
            const errMsg = (error as Error).message || String(error);
            get().updateNodeData(nodeId, { status: 'error', error: errMsg }, false);
            
            if (outputNodeId) {
                const currentOutNode = get().nodes.find(n => n.id === outputNodeId);
                const outData = currentOutNode?.data as OutputNodeData;
                let errorVersions = outData?.versions || [];
                errorVersions = errorVersions.map(v => 
                    v.id === outData?.currentVersionId ? { ...v, content: `**[生成错误 / Generation Error]**\n\n${errMsg}` } : v
                );
                
                get().updateNodeData(outputNodeId, { 
                    content: `**[生成错误 / Generation Error]**\n\n${errMsg}`,
                    versions: errorVersions
                }, false);
            }
        }
    },

    duplicateNodes: (nodeIds) => {
        const { nodes } = get();
        const selectedNodes = nodes.filter(n => nodeIds.includes(n.id));
        if (selectedNodes.length === 0) return;

        const newNodes = selectedNodes.map(node => {
            const id = `${node.type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            return {
                ...node,
                id,
                selected: true,
                position: {
                    x: node.position.x + 40,
                    y: node.position.y + 40,
                },
            };
        });

        const deselectedNodes = nodes.map(n => ({
            ...n,
            selected: nodeIds.includes(n.id) ? false : n.selected
        }));

        const [nextNodes, patches, inversePatches] = produceWithPatches(deselectedNodes, (draft) => {
            newNodes.forEach(node => draft.push(node));
        });

        const prefixedPatches = patches.map(p => ({ ...p, path: ['nodes', ...p.path] }));
        const prefixedInversePatches = inversePatches.map(p => ({ ...p, path: ['nodes', ...p.path] }));

        if (patches.length > 0) {
            set(state => ({
                nodes: nextNodes,
                history: {
                    past: [...state.history.past, { patches: prefixedPatches, inversePatches: prefixedInversePatches }],
                    future: []
                }
            }));
        } else {
            set({ nodes: nextNodes });
        }
    }
});
