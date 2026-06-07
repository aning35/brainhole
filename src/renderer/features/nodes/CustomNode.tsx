import React, { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, NodeResizeControl, useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import { DataNodeContent } from './DataNodeContent';
import { PromptNodeContent } from './PromptNodeContent';
import { OutputNodeContent } from './OutputNodeContent';
import { GraphNodeContent } from './GraphNodeContent';

import { Trash2, MoreVertical, Maximize2, Edit3, Database, Sparkles, FileText } from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';
import { FullscreenModal } from '@/components/ui/FullscreenModal';
import { useDropdownMenu } from '@/hooks/useDropdownMenu';

export const CustomNode = memo(({ id, data, selected, type }: any) => {
  const { t } = useTranslation();
  const removeNode = useCanvasStore(state => state.removeNode);
  const updateNodeData = useCanvasStore(state => state.updateNodeData);
  const onResizeStart = useCanvasStore(state => state.onResizeStart);
  const onResizeEnd = useCanvasStore(state => state.onResizeEnd);
  const pendingClickConnection = useCanvasStore(state => state.pendingClickConnection);
  const setPendingClickConnection = useCanvasStore(state => state.setPendingClickConnection);
  const onConnect = useCanvasStore(state => state.onConnect);
  const isValidConnection = useCanvasStore(state => state.isValidConnection);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.title);
  const editInputRef = useRef<HTMLInputElement>(null);
  const {
    isOpen: isDropdownOpen,
    triggerRef,
    menuRef,
    handleToggle,
    handleItemClick,
  } = useDropdownMenu();

  // Start editing title
  const startEditTitle = () => {
    setEditTitle(data.title);
    setIsEditingTitle(true);
  };

  // Save title
  const saveTitle = () => {
    const trimmedTitle = editTitle.trim();
    if (trimmedTitle && trimmedTitle !== data.title) {
      updateNodeData(id, {
        title: trimmedTitle,
        ...(type === 'data' ? { isCustomTitle: true } : {})
      });
    }
    setIsEditingTitle(false);
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditTitle(data.title);
    setIsEditingTitle(false);
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditingTitle]);

  const updateNodeInternals = useUpdateNodeInternals();
  // Update edit state when node title changes
  useEffect(() => {
    if (!isEditingTitle) {
      setEditTitle(data.title);
    }
  }, [data.title, isEditingTitle]);

  // Force update React Flow internal cache when handles count or mode changes
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, data.isListMode, data.parsedListItems?.length, updateNodeInternals]);

  // Determine if handle should be displayed
  const shouldShowHandle = (handleType: 'input' | 'output') => {
    // Input handles
    if (handleType === 'input') {
      if (type === 'prompt') return true;
      if (type === 'output') return true;
      return false;
    }

    // Output handles
    if (handleType === 'output') {
      if (type === 'data') return true;
      if (type === 'output') return true; // Always render handle to avoid React Flow errors for existing edges
      if (type === 'prompt') {
        return true; // Always render handle, control visibility via class
      }
      return false;
    }

    return false;
  };

  // Configuration based on Node Type
  const getNodeConfig = () => {
    switch (type) {
      case 'data':
        if (data.dataType === 'knowledge_graph') {
          return {
            headerBg: 'bg-indigo-50',
            headerBorder: 'border-indigo-100',
            iconColor: 'text-indigo-600',
            iconBg: 'bg-indigo-100',
            borderColor: 'border-indigo-200',
            label: t('nodes.custom.dynamicGraph'),
            icon: Database,
            containerBorder: 'border-2'
          };
        }
        return {
          headerBg: 'bg-blue-50',
          headerBorder: 'border-blue-100',
          iconColor: 'text-blue-600',
          iconBg: 'bg-blue-100',
          borderColor: 'border-blue-200',
          label: t('nodes.custom.dataSource'),
          icon: Database,
          containerBorder: 'border-2'
        };
      case 'prompt':
        return {
          headerBg: 'bg-purple-50',
          headerBorder: 'border-purple-100',
          iconColor: 'text-purple-600',
          iconBg: 'bg-purple-100',
          borderColor: 'border-purple-200',
          label: t('nodes.custom.prompt'),
          icon: Sparkles,
          containerBorder: 'border-2'
        };
      case 'output':
        return {
          headerBg: 'bg-gradient-to-r from-teal-50 to-white', // Gradient header
          headerBorder: 'border-white', // Subtle or no border
          iconColor: 'text-teal-600',
          iconBg: 'bg-teal-100',
          borderColor: 'border-transparent', // Handled by shadow
          label: 'Markdown Result', // Updated label
          icon: FileText,
          containerBorder: 'border-0', // No physical border
          shadowClass: 'shadow-[0_0_0_2px_#14b8a6,0_20px_25px_-5px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.05)]' // Teal Ring + Depth Shadow
        };
      default:
        return {
          headerBg: 'bg-gray-50',
          headerBorder: 'border-gray-100',
          iconColor: 'text-gray-600',
          iconBg: 'bg-gray-100',
          borderColor: 'border-gray-200',
          label: t('nodes.custom.node'),
          icon: 'Box',
          containerBorder: 'border-2'
        };
    }
  };

  const nodeConfig = getNodeConfig();

  const renderContent = (isFullscreenMode = false) => {
    switch (type) {
      case 'data':
        if (data.dataType === 'knowledge_graph') {
          return <GraphNodeContent data={data} isFullscreen={isFullscreenMode} />;
        }
        return <DataNodeContent nodeId={id} data={data} isFullscreen={isFullscreenMode} />;
      case 'prompt':
        return <PromptNodeContent nodeId={id} data={data} isFullscreen={isFullscreenMode} />;
      case 'output':
        return <OutputNodeContent nodeId={id} data={data} isFullscreen={isFullscreenMode} isSelected={selected} updateInternals={() => updateNodeInternals(id)} />;
      default:
        return <div>Unknown Node Type</div>;
    }
  };

  const isPromptCompleted = type === 'prompt' && data.status === 'completed';

  return (
    <div
      className={`
        nopan bg-white dark:bg-slate-800 rounded-xl flex flex-col group
        h-[inherit] min-h-[300px] ${nodeConfig.containerBorder}
        ${nodeConfig.borderColor}
        ${selected
          ? `shadow-[0_0_0_2px_#3b82f6,0_10px_15px_-3px_rgba(0,0,0,0.1)] z-10 scale-[1.002]`
          : (nodeConfig as any).shadowClass || 'shadow-sm hover:shadow-md'
        }
        transition-[shadow,border-color,transform,opacity] duration-200
        outline-none
      `}
    >
      {selected && (
        <NodeResizeControl
          position="bottom-right"
          minWidth={400}
          maxWidth={400}
          minHeight={200}
          maxHeight={1200}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
          className="!bg-transparent !border-0"
          style={{ width: 32, height: 32, right: 0, bottom: 0 }}
        >
          {/* Optional: Add a visual icon for resize if needed, otherwise it's invisible but functional */}
          <div className="absolute right-1.5 bottom-1.5 w-3 h-3 border-r-2 border-b-2 border-slate-300 dark:border-slate-500 rounded-sm opacity-60 group-hover:opacity-100 transition-opacity" />
        </NodeResizeControl>
      )}

      {/* Styled Node Header */}
      <div
        className={`
          flex items-center justify-between px-3 py-2 
          rounded-t-xl shrink-0 
          border-b ${nodeConfig.headerBorder} ${nodeConfig.headerBg}
        `}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Icon Box */}
          <div className={`p-1 rounded-md ${nodeConfig.iconBg} ${nodeConfig.iconColor}`}>
            {React.createElement(nodeConfig.icon as any, { size: 14 })}
          </div>

          {isEditingTitle ? (
            <input
              ref={editInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={saveTitle}
              className="flex-1 min-w-0 px-2 py-0.5 text-sm font-semibold text-gray-800 bg-white/50 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={t('nodes.custom.inputTitlePlaceholder')}
            />
          ) : (
            <h3
              className="font-semibold text-gray-700 truncate cursor-text text-xs uppercase tracking-wide select-none hover:text-gray-900 transition-colors"
              title={data.title || nodeConfig.label}
              onDoubleClick={startEditTitle}
            >
              {data.title || nodeConfig.label}
            </h3>
          )}
        </div>

        {/* Header Actions (Hover only) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative">
          <button
            onClick={() => setIsFullscreen(true)}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-md transition-colors"
            title="Full Screen"
          >
            <Maximize2 size={13} />
          </button>

          <button ref={triggerRef as React.RefObject<HTMLButtonElement>} onClick={handleToggle} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded-md transition-colors">
            <MoreVertical size={13} />
          </button>

          {isDropdownOpen && (
            <div ref={menuRef as React.RefObject<HTMLDivElement>} className="absolute top-full right-0 mt-1 min-w-[140px] bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 overflow-hidden">
              <button onClick={handleItemClick(startEditTitle)} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-gray-700 hover:bg-gray-50">
                <Edit3 className="w-3.5 h-3.5" /> <span>{t('nodes.custom.rename')}</span>
              </button>
              <div className="border-t border-gray-50 my-1" />
              <button onClick={handleItemClick(() => removeNode(id))} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-red-600 hover:bg-red-50">
                <Trash2 className="w-3.5 h-3.5" /> <span>{t('nodes.custom.delete')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Node content */}
      <div className="flex-1 min-h-0 overflow-visible relative rounded-b-xl">
        {renderContent()}
      </div>

      {/* Handle - Input */}
      {shouldShowHandle('input') && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className={`!w-3.5 !h-3.5 !bg-blue-500 !border-2 !border-white transition-all ${shouldShowHandle('input') ? 'opacity-100' : 'opacity-0'} ${
            pendingClickConnection && pendingClickConnection.handleType === 'source' ? '!w-4.5 !h-4.5 !bg-blue-400 ring-2 ring-blue-300 ring-offset-1 animate-pulse cursor-pointer' : ''
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (pendingClickConnection && pendingClickConnection.handleType === 'source') {
              // Complete the connection
              const connection = {
                source: pendingClickConnection.nodeId,
                target: id,
                sourceHandle: pendingClickConnection.handleId,
                targetHandle: 'input',
              };
              if (isValidConnection(connection)) {
                onConnect(connection);
              }
              setPendingClickConnection(null);
            }
          }}
        />
      )}

      {/* Handle - Output */}
      {shouldShowHandle('output') && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className={`
            !w-3.5 !h-3.5 !bg-purple-500 !border-2 !border-white transition-all
            ${(type === 'prompt' && !isPromptCompleted) || (type === 'output' && data.isListMode) ? 'opacity-0 pointer-events-none' : 'opacity-100'}
            ${pendingClickConnection?.nodeId === id && pendingClickConnection?.handleId === 'output' ? '!w-4.5 !h-4.5 ring-2 ring-purple-300 ring-offset-1 animate-pulse' : ''}
          `}
          onClick={(e) => {
            e.stopPropagation();
            if (pendingClickConnection?.nodeId === id && pendingClickConnection?.handleId === 'output') {
              // Clicked same handle again -> cancel
              setPendingClickConnection(null);
            } else {
              // Start a pending connection from this output
              setPendingClickConnection({ nodeId: id, handleId: 'output', handleType: 'source' });
            }
          }}
        />
      )}

      {/* Fullscreen modal */}
      <FullscreenModal
        isOpen={isFullscreen}
        onClose={() => setIsFullscreen(false)}
        title={data.title}
      >
        <div className="h-full bg-white rounded-lg shadow-sm border border-gray-200 p-0 overflow-hidden flex flex-col">
          {renderContent(true)}
        </div>
      </FullscreenModal>
    </div>
  );
});

CustomNode.displayName = 'CustomNode'; 