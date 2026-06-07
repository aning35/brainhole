import { useCallback, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

export function useCanvasSelection(isDeletingRef: React.MutableRefObject<boolean>) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const selectionRef = useRef({ nodeCount: 0, edgeCount: 0 });

    const handleSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[], edges: Edge[] }) => {
        const nodeCount = selectedNodes.length;
        const edgeCount = selectedEdges.length;
        const prevCount = selectionRef.current;

        selectionRef.current = { nodeCount, edgeCount };

        if (nodeCount !== prevCount.nodeCount || edgeCount !== prevCount.edgeCount) {
            const totalSelected = nodeCount + edgeCount;
            const prevTotalSelected = prevCount.nodeCount + prevCount.edgeCount;

                if (totalSelected > 1) {
                let message = '';
                if (nodeCount > 0 && edgeCount > 0) {
                    message = t('canvas.toast.selectedBoth', { nodeCount, edgeCount });
                } else if (nodeCount > 1) {
                    message = t('canvas.toast.selectedNodes', { count: nodeCount });
                } else if (edgeCount > 1) {
                    message = t('canvas.toast.selectedEdges', { count: edgeCount });
                }

                if (message) {
                    showToast(message, 'info', 1500);
                }
            } else if (prevTotalSelected > 1 && totalSelected === 0 && !isDeletingRef.current) {
                showToast(t('canvas.toast.selectionCleared'), 'info', 1000);
            }
        }
    }, [showToast, isDeletingRef]);

    return { handleSelectionChange };
}
