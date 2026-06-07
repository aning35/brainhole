import { useCallback } from 'react';
import { useReactFlow, Node, Edge } from '@xyflow/react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useToast } from '@/hooks/useToast';
import { useContextMenu } from '@/components/ui/ContextMenu';
import { Database, BarChart3, Plus, Copy, Trash2, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function useCanvasContextMenu() {
    const { t } = useTranslation();
    const { screenToFlowPosition } = useReactFlow();
    const { showToast } = useToast();
    const { showMenu } = useContextMenu();
    const { createNode, removeNode, onEdgesChange, autoLayout } = useCanvasStore();

    const onPaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
        event.preventDefault();

        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        const menuItems = [
            {
                label: t('canvas.menu.createDataNode'),
                icon: <Database className="w-4 h-4" />,
                onClick: () => {
                    createNode('data', position);
                    showToast(t('canvas.toast.createdDataNode'), 'success');
                },
            },
            {
                label: t('canvas.menu.createPromptNode'),
                icon: <BarChart3 className="w-4 h-4" />,
                onClick: () => {
                    createNode('prompt', position);
                    showToast(t('canvas.toast.createdPromptNode'), 'success');
                },
            },
            { divider: true, label: '', onClick: () => undefined },
            {
                label: t('canvas.menu.autoLayout'),
                icon: <Plus className="w-4 h-4" />,
                onClick: () => {
                    autoLayout('LR');
                    showToast(t('canvas.toast.autoLayoutDone'), 'success');
                },
            },
        ];

        showMenu({ x: event.clientX, y: event.clientY }, menuItems);
    }, [screenToFlowPosition, createNode, autoLayout, showMenu, showToast]);

    const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
        event.preventDefault();

        const menuItems = [
            ...(node.type !== 'output' ? [{
                label: t('canvas.menu.copyNode'),
                icon: <Copy className="w-4 h-4" />,
                onClick: () => {
                    showToast(t('canvas.toast.copyDev'), 'info');
                },
            }] : []),
            {
                label: t('canvas.menu.deleteNode'),
                icon: <Trash2 className="w-4 h-4" />,
                onClick: () => {
                    removeNode(node.id);
                    showToast(t('canvas.toast.nodeDeleted'), 'success');
                },
            },
        ];

        showMenu({ x: event.clientX, y: event.clientY }, menuItems);
    }, [removeNode, showMenu, showToast]);

    const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.preventDefault();

        // Prevent context menu on edges between prompt and output nodes (these edges cannot be deleted independently)
        if (edge.deletable === false) {
            return;
        }

        const menuItems = [
            {
                label: t('canvas.menu.deleteEdge'),
                icon: <Trash2 className="w-4 h-4" />,
                onClick: () => {
                    onEdgesChange([{ type: 'remove', id: edge.id }]);
                    showToast(t('canvas.toast.edgeDeleted'), 'success');
                },
            },
        ];

        showMenu({ x: event.clientX, y: event.clientY }, menuItems);
    }, [onEdgesChange, showMenu, showToast]);

    return { onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu };
}
