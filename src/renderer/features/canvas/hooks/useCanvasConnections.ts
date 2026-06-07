import { useCallback } from 'react';
import { useReactFlow, Connection } from '@xyflow/react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';

export function useCanvasConnections() {
    const { t } = useTranslation();
    const { screenToFlowPosition } = useReactFlow();
    const { showToast } = useToast();
    const {
        createNode,
        setConnecting,
        isValidConnection,
        onConnect,
    } = useCanvasStore();

    const handleConnectStart = useCallback((_: any, { nodeId, handleId, handleType }: any) => {
        setConnecting(true, { nodeId, handleId, handleType });
    }, [setConnecting]);

    const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: any) => {
        setConnecting(false);

        const fromHandleId = connectionState.fromHandle?.id;
        const isSupportedOutput = fromHandleId === 'output' || fromHandleId?.startsWith('list-item-');

        if (!connectionState.isValid && isSupportedOutput) {
            const target = event.target as HTMLElement;

            // Check if dropped on a node card (anywhere on the card, not just the handle)
            const nodeElement = target.closest('.react-flow__node');
            if (nodeElement && connectionState.fromNode) {
                const targetNodeId = nodeElement.getAttribute('data-id');
                if (targetNodeId && targetNodeId !== connectionState.fromNode.id) {
                    const connection = {
                        source: connectionState.fromNode.id,
                        target: targetNodeId,
                        sourceHandle: fromHandleId,
                        targetHandle: 'input',
                    };
                    if (isValidConnection(connection)) {
                        onConnect(connection);
                        showToast(t('canvas.toast.connected'), 'success');
                        return;
                    }
                }
            }

            // Dropped on empty pane -> create a new node
            if (
                target.classList.contains('react-flow__pane') ||
                target.classList.contains('react-flow__pane-wrapper') ||
                target.classList.contains('react-flow__background')
            ) {
                const position = screenToFlowPosition({
                    x: 'clientX' in event ? event.clientX : event.touches[0].clientX,
                    y: 'clientY' in event ? event.clientY : event.touches[0].clientY,
                });

                let newNodeType: 'data' | 'prompt' | 'output' = 'prompt';

                if (connectionState.fromNode) {
                    const sourceType = connectionState.fromNode.type;
                    if (sourceType === 'data') {
                        newNodeType = 'prompt';
                    } else if (sourceType === 'prompt') {
                        newNodeType = 'output';
                    } else if (sourceType === 'output') {
                        newNodeType = 'prompt';
                    } else {
                        return;
                    }
                }

                const nodeId = createNode(newNodeType, position);

                if (connectionState.fromNode) {
                    const connection = {
                        source: connectionState.fromNode.id,
                        target: nodeId,
                        sourceHandle: fromHandleId,
                        targetHandle: 'input',
                    };

                    onConnect(connection);
                    showToast(newNodeType === 'prompt' ? t('canvas.toast.createdPromptConnected') : t('canvas.toast.createdOutputConnected'), 'success');
                } else {
                    showToast(newNodeType === 'prompt' ? t('canvas.toast.createdPrompt') : t('canvas.toast.createdOutput'), 'success');
                }
            }
        }
    }, [screenToFlowPosition, createNode, onConnect, showToast, setConnecting]);

    const handleConnect = useCallback((connection: Connection) => {
        setConnecting(false);

        if (isValidConnection(connection)) {
            onConnect(connection);
            showToast(t('canvas.toast.connected'), 'success');
        } else {
            let errorMessage = t('canvas.toast.connectFailed');
            if (connection.source === connection.target) {
                errorMessage += t('canvas.toast.connectSelf');
            } else if (connection.sourceHandle !== 'output' && !connection.sourceHandle?.startsWith('list-item-')) {
                errorMessage += t('canvas.toast.connectFromOutput');
            } else if (connection.targetHandle && connection.targetHandle !== 'input') {
                errorMessage += t('canvas.toast.connectToInput');
            } else {
                errorMessage += t('canvas.toast.connectUnsupported');
            }
            showToast(errorMessage, 'warning');
        }
    }, [onConnect, isValidConnection, showToast, setConnecting]);

    return { handleConnectStart, onConnectEnd, handleConnect };
}
