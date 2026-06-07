import { useState, useEffect, useRef, useCallback } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ReactFlowProvider } from '@xyflow/react';
import { Sidebar } from './features/sidebar/Sidebar';
import { Workspace } from './features/workspace/Workspace';
import { AllCanvases } from './features/canvas-list/AllCanvases';
// Toolbar moved to Canvas.tsx
import { ListPageToolbar } from './features/toolbar/ListPageToolbar';
import { useCanvasStore } from './stores/canvasStore';
import { Toaster } from './components/ui/Toaster';
import { useContextMenu } from './components/ui/ContextMenu';
import { InputModal } from './components/ui/InputModal';
import { ShortcutHelpModal } from './components/ui/ShortcutHelp';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeft, X, Plus, Edit3, MinusSquare, Square, ArrowRightToLine, Link2, ClipboardCopy, Trash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useTranslation } from 'react-i18next';

export default function App() {
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const initialOpenCount = useCanvasStore.getState().openCanvasIds.length;
  const [currentPage, setCurrentPage] = useState<'canvas' | 'all-canvases'>(initialOpenCount > 0 ? 'canvas' : 'all-canvases');

  const startResizing = useCallback(() => {
    isResizingRef.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;

      const newWidth = e.clientX;
      if (newWidth >= 240 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    const handleSwitchToCanvas = () => setCurrentPage('canvas');
    const handleSwitchToAllCanvases = () => setCurrentPage('all-canvases');
    
    window.addEventListener('switch-to-canvas', handleSwitchToCanvas);
    window.addEventListener('switch-to-all-canvases', handleSwitchToAllCanvases);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('switch-to-canvas', handleSwitchToCanvas);
      window.removeEventListener('switch-to-all-canvases', handleSwitchToAllCanvases);
    };
  }, []);

  // Sync configuration to backend on startup
  useEffect(() => {
    const { docParserEngine, maxConcurrentTasks } = useCanvasStore.getState();
    if (window.electronAPI && window.electronAPI.vault && window.electronAPI.vault.updateSettings) {
      window.electronAPI.vault.updateSettings({
        docParserEngine,
        maxConcurrentTasks
      });
    }
  }, []);

  // List page state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'time' | 'name'>('time');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Rename state
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDefaultValue, setRenameDefaultValue] = useState('');

  const {
    openCanvasIds,
    activeCanvasId,
    canvasSessionStates,
    setActiveCanvas,
    closeCanvas,
    createNewCanvas,
    renameCanvas,
    deleteCanvas,
    expandFoldersForPath,
    isShortcutHelpOpen,
    setShortcutHelpOpen
  } = useCanvasStore();

  const { showMenu } = useContextMenu();

  // Detect platform
  const isDarwin = navigator.userAgent.includes('Mac');
  const isWindows = navigator.userAgent.includes('Win');

  const handleNavigate = (page: 'canvas' | 'all-canvases') => {
    setCurrentPage(page);
  };

  useGlobalShortcuts({
    onToggleSidebar: () => setSidebarCollapsed(!sidebarCollapsed),
    onNavigate: handleNavigate,
    onFocusSearch: () => {
      window.dispatchEvent(new CustomEvent('focus-search'));
    }
  });

  const handleCloseCanvas = async (e: React.MouseEvent | React.KeyboardEvent | null, id: string) => {
    e?.stopPropagation();

    // If we are closing the last canvas, switch to all-canvases view
    if (openCanvasIds.length === 1 && openCanvasIds.includes(id)) {
      setCurrentPage('all-canvases');
    }

    await closeCanvas(id);
  };

  const handleCloseOthers = async (id: string) => {
    const others = openCanvasIds.filter(oid => oid !== id);
    for (const oid of others) {
      await closeCanvas(oid);
    }
    setActiveCanvas(id);
  };

  const handleCloseRight = async (id: string) => {
    const index = openCanvasIds.indexOf(id);
    if (index === -1) return;

    const rights = openCanvasIds.slice(index + 1);
    for (const oid of rights) {
      await closeCanvas(oid);
    }

    // If active canvas was among the closed ones, set active to the one we right-clicked
    if (rights.includes(activeCanvasId || '')) {
      setActiveCanvas(id);
    }
  };

  const handleCloseAll = async () => {
    setCurrentPage('all-canvases');
    const all = [...openCanvasIds];
    for (const id of all) {
      await closeCanvas(id);
    }
  };

  const handleTabContextMenu = (e: React.MouseEvent, id: string, name: string) => {
    e.preventDefault();
    e.stopPropagation();

    const currentIndex = openCanvasIds.indexOf(id);
    const hasRightTabs = currentIndex !== -1 && currentIndex < openCanvasIds.length - 1;

    showMenu({ x: e.clientX, y: e.clientY }, [
      {
        label: t('common.close'),
        icon: <X className="w-4 h-4" />,
        onClick: () => handleCloseCanvas(null, id)
      },
      {
        label: t('app.closeRight'),
        icon: <ArrowRightToLine className="w-4 h-4" />,
        onClick: () => handleCloseRight(id),
        disabled: !hasRightTabs
      },
      {
        label: t('app.closeOthers'),
        icon: <MinusSquare className="w-4 h-4" />,
        onClick: () => handleCloseOthers(id),
        disabled: openCanvasIds.length <= 1
      },
      {
        label: t('app.closeAll'),
        icon: <Square className="w-4 h-4" />,
        onClick: () => handleCloseAll()
      },
      { divider: true },
      {
        label: t('app.showInTree'),
        icon: <Link2 className="w-4 h-4" />,
        onClick: () => {
          setActiveCanvas(id);
          expandFoldersForPath(id);
        }
      },
      {
        label: t('app.copyPath'),
        icon: <ClipboardCopy className="w-4 h-4" />,
        onClick: () => {
          navigator.clipboard.writeText(id).then(() => {
            // Optional: show toast
          });
        }
      },
      {
        label: t('common.rename'),
        icon: <Edit3 className="w-4 h-4" />,
        onClick: () => {
          setRenameId(id);
          setRenameDefaultValue(name);
        }
      },
      {
        label: t('common.delete'),
        icon: <Trash className="w-4 h-4 text-red-500" />,
        onClick: () => {
          if (confirm(t('app.deleteConfirm', { name }))) {
            deleteCanvas(id);
          }
        }
      }
    ]);
  };

  const handleRenameConfirm = async (newName: string) => {
    if (renameId) {
      await renameCanvas(renameId, newName);
      setRenameId(null);
    }
  };

  const handleNewCanvas = () => {
    createNewCanvas();
    setCurrentPage('canvas');
  };

  return (
    <ErrorBoundary>
      <DndProvider backend={HTML5Backend}>
        <ReactFlowProvider>
          <div className="relative h-screen overflow-hidden bg-gray-50 flex flex-row">
            {/* Sidebar */}
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.div
                  initial={{ width: sidebarWidth, opacity: 1 }}
                  animate={{ width: sidebarWidth, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={isResizing ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
                  className="h-full border-r border-gray-200 bg-gray-50 flex-shrink-0 overflow-hidden relative group/sidebar"
                >
                  <Sidebar
                    onNavigate={handleNavigate}
                    currentPage={currentPage}
                    onCollapse={() => setSidebarCollapsed(true)}
                  />
                  {/* Drag Handle */}
                  <div
                    onMouseDown={startResizing}
                    className={cn(
                      "absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400 transition-colors z-10",
                      isResizing && "bg-blue-500"
                    )}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main content area (Tabs + Workspace) */}
            <div className="flex-1 flex flex-col min-w-0 h-full bg-white relative">
              {/* Top bar (Tabs & Toolbar area) */}
              <div
                className="flex-shrink-0 bg-gray-200 border-b border-gray-300 flex items-center gap-1 overflow-x-auto no-scrollbar relative z-0"
                style={{
                  height: '40px', // Match Sidebar header height to prevent layout jump
                  paddingLeft: isDarwin ? (!sidebarCollapsed ? '16px' : '84px') : '16px',
                  paddingRight: isWindows ? '140px' : '16px', // Pre-allocate top right area for Windows window controls
                  paddingTop: '0px',
                  WebkitAppRegion: 'drag'
                } as React.CSSProperties}
              >
                {/* Expand sidebar button (shows in top bar when sidebar is collapsed) - Vertically centered */}
                {sidebarCollapsed && (
                  <div className="flex items-center self-center mr-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <button
                      onClick={() => setSidebarCollapsed(false)}
                      className="p-1.5 hover:bg-gray-300 rounded-md transition-colors flex items-center justify-center text-gray-600"
                      title={t('app.expandSidebar')}
                    >
                      <PanelLeft className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Tabs / Toolbar Content */}
                <div className="flex-1 flex items-center h-full px-2 gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
                  {currentPage === 'canvas' ? (
                    <div className="flex items-end h-full gap-1">
                      {/* Tabs */}
                      {openCanvasIds.map(id => {
                        const session = canvasSessionStates[id];
                        const name = session?.canvasName || t('app.loading');
                        const isActive = id === activeCanvasId;
                        const normalizedKey = id.replace(/\\/g, '/');

                        return (
                          <div
                            key={normalizedKey}
                            className={cn(
                              "group relative flex items-center gap-2 pl-3 pr-2 py-1.5 min-w-[120px] max-w-[200px] rounded-t-lg cursor-pointer select-none transition-all text-sm border-t border-l border-r leading-none h-[32px] self-end",
                              isActive
                                ? "bg-white text-gray-800 border-gray-300 border-b-0 shadow-[0_-1px_2px_rgba(0,0,0,0.03)] z-10 -mb-[1px] font-medium"
                                : "bg-transparent hover:bg-gray-300/50 text-gray-600 border-transparent border-b-transparent mb-0"
                            )}
                            onClick={() => setActiveCanvas(id)}
                            onContextMenu={(e) => handleTabContextMenu(e, id, name)}
                            title={name}
                          >
                            <span className="flex-1 truncate translate-y-[1px]">{name}</span>
                            <button
                              className={cn(
                                "p-0.5 rounded-md hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-all",
                                isActive && "opacity-100"
                              )}
                              onClick={(e) => handleCloseCanvas(e, id)}
                            >
                              <X className="w-3.5 h-3.5 text-gray-500" />
                            </button>

                            {/* Separator for inactive tabs (only right side) */}
                            {!isActive && (
                              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[1px] h-3.5 bg-gray-300 group-hover:hidden" />
                            )}
                          </div>
                        );
                      })}

                      <button
                        onClick={handleNewCanvas}
                        className="p-1.5 ml-1 mb-1 rounded-md hover:bg-gray-300/80 text-gray-600 transition-colors"
                        title={t('app.newCanvas')}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-full flex items-center h-full">
                      <ListPageToolbar
                        title={t('app.allFiles')}
                        searchQuery={searchQuery}
                        sortBy={sortBy}
                        viewMode={viewMode}
                        onSearch={setSearchQuery}
                        onSortChange={setSortBy}
                        onViewModeChange={setViewMode}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Main Workspace Area */}
              <div className="flex-1 relative overflow-hidden bg-white z-20 min-h-0 h-full">
                {currentPage === 'canvas' && <Workspace />}
                {currentPage === 'all-canvases' && (
                  <AllCanvases
                    searchQuery={searchQuery}
                    sortBy={sortBy}
                    viewMode={viewMode}
                    onNavigateToCanvas={() => setCurrentPage('canvas')}
                  />
                )}
              </div>
            </div>

            {/* Toast notification */}
            <Toaster />

            {/* Shortcut help modal */}
            <ShortcutHelpModal
              isOpen={isShortcutHelpOpen}
              onClose={() => setShortcutHelpOpen(false)}
            />

            {/* Rename modal */}
            <InputModal
              isOpen={!!renameId}
              title={t('app.renameCanvas')}
              defaultValue={renameDefaultValue}
              onConfirm={handleRenameConfirm}
              onCancel={() => setRenameId(null)}
            />
          </div>
        </ReactFlowProvider>
      </DndProvider>
    </ErrorBoundary >
  );
}