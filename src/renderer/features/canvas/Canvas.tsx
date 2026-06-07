import { useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ConnectionMode,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCanvasStore } from '@/stores/canvasStore';
import { CustomNode } from '../nodes/CustomNode';
import { injectCanvasStyles } from './canvasStyles';
import { useCanvasDragDrop } from './hooks/useCanvasDragDrop';
import { CanvasToolbar } from './CanvasToolbar';

// Force Cursor Default
const cursorStyle = `
  .react-flow__pane {
    cursor: default !important;
  }
  .react-flow__pane.dragging {
    cursor: grab !important;
  }
`;

import { useCanvasHotkeys } from './hooks/useCanvasHotkeys';
import { useCanvasContextMenu } from './hooks/useCanvasContextMenu';
import { useCanvasConnections } from './hooks/useCanvasConnections';
import { useCanvasSelection } from './hooks/useCanvasSelection';
import { useTranslation } from 'react-i18next';

// Inject styles once
injectCanvasStyles();

// Custom node types
const nodeTypes = {
  custom: CustomNode,
  data: CustomNode,
  prompt: CustomNode,
  output: CustomNode,
};

// Canvas internal components
function CanvasContent() {
  const { t } = useTranslation();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { 
    nodes, edges, onNodesChange, onEdgesChange, isValidConnection,
    activeCanvasId, canvasSessionStates, updateCanvasViewport,
    setPendingClickConnection
  } = useCanvasStore();

  const session = activeCanvasId ? canvasSessionStates[activeCanvasId] : null;

  // Use Custom Hooks
  const { isDragOver } = useCanvasDragDrop(reactFlowWrapper);
  const { isDeletingRef } = useCanvasHotkeys(reactFlowWrapper);
  const { onPaneContextMenu, onNodeContextMenu, onEdgeContextMenu } = useCanvasContextMenu();
  const { handleConnectStart, onConnectEnd, handleConnect } = useCanvasConnections();
  const { handleSelectionChange } = useCanvasSelection(isDeletingRef);

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full"
      tabIndex={0}
      style={{
        backgroundColor: isDragOver ? '#f3f4f6' : undefined,
        transition: 'background-color 0.2s',
        outline: 'none',
      }}
    >
      <style>{cursorStyle}</style>

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 selection:bg-transparent">
          <div className="flex flex-col items-center gap-3 text-gray-400 transition-opacity">
            <div className="w-16 h-16 rounded-2xl bg-gray-100/80 flex items-center justify-center shadow-sm border border-gray-200/50">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
                <path d="M5 12h14"></path>
                <path d="M12 5v14"></path>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-gray-500 mb-1">{t('canvas.emptyTitle')}</p>
              <p className="text-sm">{t('canvas.emptyDesc')}</p>
            </div>
          </div>
        </div>
      )}

      <CanvasToolbar />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={() => setPendingClickConnection(null)}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onSelectionChange={handleSelectionChange}
        nodeTypes={nodeTypes as any}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection as any}
        fitView={!session?.viewport}
        className="react-flow-canvas"
        defaultViewport={session?.viewport || { x: 0, y: 0, zoom: 1 }}
        onMoveEnd={(e, viewport) => {
          if (activeCanvasId) {
             updateCanvasViewport(activeCanvasId, viewport);
          }
        }}
        minZoom={0.1}
        maxZoom={2}
        snapToGrid={true}
        snapGrid={[16, 16]}
        deleteKeyCode={null}
        multiSelectionKeyCode={'Shift' as any}
        selectionKeyCode={null}
        panActivationKeyCode={null}
        selectNodesOnDrag={false}
        disableKeyboardA11y={false}
        elementsSelectable={true}
        nodesDraggable={true}
        nodesConnectable={true}
        zoomOnDoubleClick={false}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={false}
        zoomActivationKeyCode="Meta"
        noPanClassName="nopan"
        onWheel={(e) => {
          // Check if the wheel event originated from within a node
          const target = e.target as HTMLElement;
          const isWithinNode = target.closest('.react-flow__node');

          if (isWithinNode) {
            // If scrolling within a node, prevent canvas panning
            e.stopPropagation();
          }
        }}
        onInit={(instance) => {
          console.log('[Canvas] ReactFlow initialized');
        }}
        defaultEdgeOptions={{
          type: 'default',
          style: {
            strokeWidth: 2,
            stroke: '#94a3b8', // Slightly softer color
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#94a3b8',
          },
        }}
        edgesFocusable={true}
      >
        <Background
          color="#e5e7eb"
          gap={16}
          variant={BackgroundVariant.Dots}
        />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          className="bg-white shadow-lg border border-gray-100 rounded-lg p-1"
        />
      </ReactFlow>
    </div>
  );
}

export function Canvas() {
  return (
    <div className="w-full h-full">
      <CanvasContent />
    </div>
  );
}