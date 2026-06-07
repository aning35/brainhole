import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

export function useCanvasHotkeys(wrapperRef: React.RefObject<HTMLElement>) {
    const { t } = useTranslation();
    const { fitView, zoomIn, zoomOut } = useReactFlow();
    const { showToast } = useToast();
    const {
        nodes,
        edges,
        undo,
        redo,
        removeNode,
        onNodesChange,
        onEdgesChange,
        isShortcutHelpOpen,
        isConnecting,
        duplicateNodes,
    } = useCanvasStore();

    const isDeletingRef = useRef(false);

    const isInInputState = (target: HTMLElement): boolean => {
        const tagName = target.tagName.toLowerCase();
        if (['input', 'textarea', 'select'].includes(tagName)) return true;
        if (target.contentEditable === 'true') return true;
        if (target.closest('[contenteditable="true"]') || target.closest('input') || target.closest('textarea')) return true;
        return false;
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (isInInputState(target)) return;

            // Undo
            if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
                event.preventDefault();
                undo();
                showToast(t('canvas.toast.actionUndo'), 'info');
                return;
            }

            // Redo
            if ((event.metaKey || event.ctrlKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
                event.preventDefault();
                redo();
                showToast(t('canvas.toast.actionRedo'), 'info');
                return;
            }

            // Duplicate: Cmd + D
            if ((event.metaKey || event.ctrlKey) && event.key === 'd') {
                event.preventDefault();
                const selectedNodeIds = nodes.filter(node => node.selected).map(node => node.id);
                if (selectedNodeIds.length > 0) {
                    duplicateNodes(selectedNodeIds);
                    showToast(t('canvas.toast.nodesDuplicated', { count: selectedNodeIds.length }), 'success');
                } else {
                    showToast(t('canvas.toast.selectToDuplicate'), 'warning');
                }
                return;
            }

            // Select All
            if ((event.metaKey || event.ctrlKey) && event.key === 'a') {
                event.preventDefault();
                onNodesChange(nodes.map(node => ({ type: 'select', id: node.id, selected: true })));
                showToast(t('canvas.toast.nodesSelected', { count: nodes.length }), 'info');
                return;
            }

            // Escape
            if (event.key === 'Escape') {
                if (isShortcutHelpOpen) return;

                const hasSelected = nodes.some(node => node.selected) || edges.some(edge => edge.selected);
                if (hasSelected) {
                    onNodesChange(nodes.map(node => ({ type: 'select', id: node.id, selected: false })));
                    onEdgesChange(edges.map(edge => ({ type: 'select', id: edge.id, selected: false })));
                    showToast(t('canvas.toast.selectionCleared'), 'info');
                }
                return;
            }

            // Shift + Delete (Force Delete)
            if ((event.key === 'Delete' || event.key === 'Backspace') && event.shiftKey) {
                event.preventDefault();
                const selectedNodes = nodes.filter(node => node.selected);
                const selectedEdges = edges.filter(edge => edge.selected);

                if (selectedNodes.length === 0 && selectedEdges.length === 0) {
                    showToast(t('canvas.toast.selectToDelete'), 'warning');
                    return;
                }

                isDeletingRef.current = true;

                selectedNodes.forEach(node => removeNode(node.id));
                selectedEdges.forEach(edge => onEdgesChange([{ type: 'remove', id: edge.id }]));

                showToast(t('canvas.toast.itemsDeleted', { nodeCount: selectedNodes.length, edgeCount: selectedEdges.length }), 'success');
                setTimeout(() => { isDeletingRef.current = false; }, 100);
                return;
            }

            // Delete (Edges only)
            if (event.key === 'Delete' || event.key === 'Backspace') {
                const selectedEdges = edges.filter(edge => edge.selected);
                const selectedNodes = nodes.filter(node => node.selected);

                if (selectedNodes.length > 0) {
                    showToast(t('canvas.toast.deleteNodeHint'), 'warning');
                    return;
                }

                if (selectedEdges.length > 0) {
                    isDeletingRef.current = true;
                    selectedEdges.forEach(edge => onEdgesChange([{ type: 'remove', id: edge.id }]));
                    showToast(t('canvas.toast.edgesDeleted', { count: selectedEdges.length }), 'info');
                    setTimeout(() => { isDeletingRef.current = false; }, 100);
                }
                return;
            }

            // Space (Fit View)
            if (event.key === ' ' || event.code === 'Space') {
                event.preventDefault();
                if (nodes.length > 0) {
                    fitView({ padding: 0.1, duration: 800 });
                    showToast(t('canvas.toast.fitView'), 'info');
                } else {
                    showToast(t('canvas.toast.fitViewEmpty'), 'warning');
                }
                return;
            }

            // Zoom Out: [
            if (event.key === '[') {
                event.preventDefault();
                zoomOut({ duration: 300 });
                return;
            }

            // Zoom In: ]
            if (event.key === ']') {
                event.preventDefault();
                zoomIn({ duration: 300 });
                return;
            }

            // Arrow Keys Movement
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                const selectedNodes = nodes.filter(n => n.selected);
                if (selectedNodes.length > 0) {
                    event.preventDefault();
                    const step = event.shiftKey ? 50 : 10;
                    const delta = { x: 0, y: 0 };

                    if (event.key === 'ArrowUp') delta.y = -step;
                    if (event.key === 'ArrowDown') delta.y = step;
                    if (event.key === 'ArrowLeft') delta.x = -step;
                    if (event.key === 'ArrowRight') delta.x = step;

                    onNodesChange(selectedNodes.map(node => ({
                        id: node.id,
                        type: 'position',
                        position: {
                            x: node.position.x + delta.x,
                            y: node.position.y + delta.y
                        }
                    })));
                }
                return;
            }
        };

        const wrapper = wrapperRef.current;
        if (wrapper) {
            wrapper.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            if (wrapper) {
                wrapper.removeEventListener('keydown', handleKeyDown);
            }
        };
    }, [nodes, edges, undo, redo, removeNode, onNodesChange, onEdgesChange, showToast, isShortcutHelpOpen, isConnecting, fitView, wrapperRef]);

    return { isDeletingRef };
}
