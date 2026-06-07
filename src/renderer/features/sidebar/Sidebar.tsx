import { useState, useEffect, useRef } from 'react';
import {
  FolderPlus,
  Search,
  Clock,
  Settings,
  PanelLeft,
  Files,
  Home,
  X,
  Plus,
  Workflow,
  ChevronsUpDown,
  ChevronsDownUp,
  Network,
  ListChecks,
  ScrollText
} from 'lucide-react';
import { useCanvasStore } from '@/stores/canvasStore';
import { useTaskStore } from '@/stores/taskStore';
import { FileTree } from './FileTree';
import { SettingsModal } from './components/SettingsPanel';
import { TasksPanel } from './components/TasksPanel';
import { LogsPanel } from './components/LogsPanel';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  onNavigate: (page: 'canvas' | 'all-canvases') => void;
  onCollapse: () => void;
}

export function Sidebar({ onNavigate, onCollapse }: SidebarProps) {
  const { t } = useTranslation();
  const {
    canvases,
    selectedFolderId,
    createNewCanvas,
    createNewGraph,
    openCanvas,
    vaultPath,
    setVaultPath,
    loadCanvases,
    loadFolders,
    folders,
    sidebarActiveTab: activeTab,
    setSidebarActiveTab: setActiveTab,
    expandedFolders,
    setExpandedFolders,
    toggleFolder
  } = useCanvasStore();
  const runningCount = useTaskStore(state => state.runningCount());
  const failedCount = useTaskStore(state => state.failedCount());
  const taskBadgeCount = runningCount + failedCount;
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [recentSnapshot, setRecentSnapshot] = useState<typeof canvases>([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (activeTab === 'recent') {
      setRecentSnapshot(canvases);
    }
  }, [activeTab, canvases.length]);

  useEffect(() => {
    const handleFocusSearch = () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    };
    window.addEventListener('focus-search', handleFocusSearch);
    return () => window.removeEventListener('focus-search', handleFocusSearch);
  }, []);

  const handleExpandAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(new Set(folders.map(f => f.id)));
  };

  const handleCollapseAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(new Set());
  };

  const isDarwin = navigator.userAgent.includes('Mac');
  const isWindows = navigator.userAgent.includes('Win');
  const headerHeight = '40px';

  const handleSelectVault = async () => {
    const path = await window.electronAPI.vault.select();
    if (path) {
      setVaultPath(path);
      await loadCanvases();
      await loadFolders();
    }
  };

  const handleCloseVault = () => {
    setVaultPath(null);
    loadCanvases();
    loadFolders();
  };

  const vaultName = vaultPath ? vaultPath.split(/[\\/]/).pop() : null;

  const handleNewCanvas = async () => {
    const newCanvasId = await createNewCanvas(undefined, selectedFolderId || undefined);
    await openCanvas(newCanvasId);
    onNavigate('canvas');
  };

  const handleNewGraph = async () => {
    const newGraphPath = await createNewGraph(undefined, selectedFolderId || undefined);
    await openCanvas(newGraphPath);
    onNavigate('canvas');
  };

  useEffect(() => {
    const loadData = async () => {
      await useCanvasStore.getState().loadFolders();
      await useCanvasStore.getState().loadCanvases();
    };
    loadData();
  }, []);

  const recentCanvases = [...(activeTab === 'recent' ? recentSnapshot : canvases)]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      name: c.name,
      lastAccess: new Date(c.updatedAt).toLocaleDateString()
    }));

  const filteredCanvases = searchQuery.trim() === ''
    ? []
    : canvases.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const renderFilesTab = () => {
    if (!vaultPath) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Home className="w-12 h-12 text-gray-300 mb-4" />
          <h3 className="text-sm font-medium text-gray-900 mb-2">{t('sidebar.noVault.title')}</h3>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            {t('sidebar.noVault.desc')}
          </p>
          <button
            onClick={handleSelectVault}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors shadow-sm font-medium"
          >
            {t('sidebar.noVault.button')}
          </button>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col min-h-0 p-3 pt-4">
        <div className="mb-2 px-2 flex items-center gap-1.5">
          <button
            onClick={handleNewCanvas}
            className="p-1.5 text-gray-500 bg-gray-50 border border-gray-200 rounded-md hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center shadow-sm"
            title={t('app.newCanvas')}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewGraph}
            className="p-1.5 text-gray-500 bg-gray-50 border border-gray-200 rounded-md hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center shadow-sm"
            title={t('app.newGraph')}
          >
            <Network className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="group flex items-center justify-between px-2 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 cursor-pointer transition-colors rounded-md hover:bg-gray-100"
            onClick={() => onNavigate('all-canvases')}
          >
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4" />
              <span className="uppercase tracking-wider">{t('app.allFiles')}</span>
            </div>
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1 rounded hover:bg-black/10 text-gray-400 hover:text-gray-600"
                onClick={handleCollapseAll}
                title={t('sidebar.collapseAll')}
              >
                <ChevronsDownUp className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-1 rounded hover:bg-black/10 text-gray-400 hover:text-gray-600"
                onClick={handleExpandAll}
                title={t('sidebar.expandAll')}
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
              </button>
              <button
                className="p-1 rounded hover:bg-black/10 text-gray-400 hover:text-gray-600"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCreatingFolder(true);
                }}
                title={t('sidebar.newFolder')}
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 pt-1">
            <FileTree
              onNavigate={onNavigate}
              isCreatingFolder={isCreatingFolder}
              onFolderCreate={() => setIsCreatingFolder(false)}
              onCancelCreate={() => setIsCreatingFolder(false)}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderSearchTab = () => (
    <div className="flex-1 flex flex-col min-h-0 p-4">
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('sidebar.searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
        />
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {searchQuery.trim() === '' ? (
          <div className="text-center text-xs text-gray-400 py-6">
            {t('sidebar.searchEmpty')}
          </div>
        ) : filteredCanvases.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-6">
            {t('sidebar.searchNoMatch')}
          </div>
        ) : (
          filteredCanvases.map(canvas => (
            <div
              key={canvas.id}
              className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-md cursor-pointer group transition-all duration-150 border border-transparent hover:border-gray-100"
              onClick={() => {
                useCanvasStore.getState().openCanvas(canvas.id);
                onNavigate('canvas');
              }}
            >
              <div className="flex flex-col min-w-0 flex-1">
                <h4 className="text-sm text-gray-700 group-hover:text-blue-600 truncate transition-colors font-medium">{canvas.name}</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">{t('sidebar.updatedAt')} {new Date(canvas.updatedAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderRecentTab = () => (
    <div className="flex-1 flex flex-col min-h-0 p-4">
      <div className="px-1 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
        {t('sidebar.recentRecords')}
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {recentCanvases.length === 0 && (
          <div className="py-6 text-xs text-gray-400 text-center">{t('sidebar.recentEmpty')}</div>
        )}
        {recentCanvases.map(canvas => (
          <div
            key={canvas.id}
            className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-md cursor-pointer group transition-all duration-150 border border-transparent hover:border-gray-100"
            onClick={() => {
              useCanvasStore.getState().openCanvas(canvas.id);
              onNavigate('canvas');
            }}
          >
            <div className="flex flex-col min-w-0 flex-1">
              <h4 className="text-sm text-gray-700 group-hover:text-blue-600 truncate transition-colors font-medium">{canvas.name}</h4>
              <p className="text-[10px] text-gray-400 mt-0.5">{canvas.lastAccess}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      <div
        className="relative flex items-center px-4 border-b border-gray-200 flex-shrink-0 bg-gray-50"
        style={{ height: headerHeight, WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          onClick={onCollapse}
          className="absolute p-1.5 hover:bg-gray-200 rounded-md transition-colors flex items-center justify-center"
          title={t('sidebar.collapse')}
          style={{
            left: isDarwin ? '84px' : '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            WebkitAppRegion: 'no-drag'
          } as React.CSSProperties}
        >
          <PanelLeft className="w-4 h-4 text-gray-600" />
        </button>

        <div
          className="font-medium text-sm text-gray-800 select-none flex items-center gap-2 flex-1 min-w-0 pr-4"
          style={{ marginLeft: isDarwin ? '100px' : '36px' }}
        >
          <div className="truncate flex-1 flex items-center gap-2">
            {activeTab === 'files' && (
              <>
                <span className="truncate">{vaultName || t('sidebar.tabFiles')}</span>
              </>
            )}
            {activeTab === 'search' && t('sidebar.tabSearch')}
            {activeTab === 'recent' && t('sidebar.tabRecent')}
            {activeTab === 'tasks' && t('sidebar.tabTasks')}
            {activeTab === 'logs' && t('sidebar.tabLogs')}
          </div>

          {activeTab === 'files' && vaultPath && (
            <button
              onClick={handleCloseVault}
              className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 transition-colors"
              title={t('sidebar.closeVault')}
              style={{ WebkitAppRegion: 'no-drag' } as any}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-14 h-full flex flex-col items-center border-r border-gray-200 bg-gray-50 flex-shrink-0 z-10 shadow-[1px_0_2px_rgba(0,0,0,0.02)]">
          <div className="flex flex-col gap-3 w-full px-2 mt-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button
              onClick={() => setActiveTab('files')}
              className={cn(
                "p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                activeTab === 'files' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              )}
              title={t('sidebar.tabFiles')}
            >
              {activeTab === 'files' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-600 rounded-r-full" />}
              <Files className="w-5 h-5" strokeWidth={activeTab === 'files' ? 2.5 : 2} />
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={cn(
                "p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                activeTab === 'search' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              )}
              title={t('sidebar.tabSearch')}
            >
              {activeTab === 'search' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-600 rounded-r-full" />}
              <Search className="w-5 h-5" strokeWidth={activeTab === 'search' ? 2.5 : 2} />
            </button>

            <button
              onClick={() => setActiveTab('recent')}
              className={cn(
                "p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                activeTab === 'recent' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              )}
              title={t('sidebar.tabRecent')}
            >
              {activeTab === 'recent' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-600 rounded-r-full" />}
              <Clock className="w-5 h-5" strokeWidth={activeTab === 'recent' ? 2.5 : 2} />
            </button>

            {/* Tasks tab */}
            <button
              onClick={() => setActiveTab('tasks')}
              className={cn(
                "p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                activeTab === 'tasks' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              )}
              title={t('sidebar.tabTasks')}
            >
              {activeTab === 'tasks' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-600 rounded-r-full" />}
              <ListChecks className="w-5 h-5" strokeWidth={activeTab === 'tasks' ? 2.5 : 2} />
              {/* Badge */}
              {taskBadgeCount > 0 && (
                <span className={cn(
                  "absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-[8px] font-bold text-white flex items-center justify-center px-0.5 shadow",
                  failedCount > 0 ? "bg-red-500" : "bg-blue-500"
                )}>
                  {taskBadgeCount > 9 ? '9+' : taskBadgeCount}
                </span>
              )}
            </button>

          </div>

          <div className="mt-auto mb-4 w-full px-2 flex flex-col gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button
              onClick={handleSelectVault}
              className={cn(
                "p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 group",
                vaultPath ? "text-gray-500 hover:bg-gray-200 hover:text-gray-800" : "text-blue-600 bg-blue-50"
              )}
              title={t('sidebar.switchVault')}
            >
              <Home className="w-5 h-5" />
            </button>

            {/* Logs tab */}
            <button
              onClick={() => setActiveTab('logs')}
              className={cn(
                "p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                activeTab === 'logs' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              )}
              title={t('sidebar.tabLogs')}
            >
              {activeTab === 'logs' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-600 rounded-r-full" />}
              <ScrollText className="w-5 h-5" strokeWidth={activeTab === 'logs' ? 2.5 : 2} />
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className={cn(
                "p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 relative group",
                "text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              )}
              title={t('sidebar.settings')}
            >
              <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <div className="flex-1 overflow-hidden flex flex-col relative" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className={cn("absolute inset-0 flex-col", activeTab === 'files' ? "flex z-10" : "hidden z-0")}>
              {renderFilesTab()}
            </div>
            <div className={cn("absolute inset-0 flex-col", activeTab === 'search' ? "flex z-10" : "hidden z-0")}>
              {renderSearchTab()}
            </div>
            <div className={cn("absolute inset-0 flex-col", activeTab === 'recent' ? "flex z-10" : "hidden z-0")}>
              {renderRecentTab()}
            </div>
            <div className={cn("absolute inset-0 flex-col bg-white", activeTab === 'tasks' ? "flex z-10" : "hidden z-0")}>
              <TasksPanel />
            </div>
            <div className={cn("absolute inset-0 flex-col bg-white", activeTab === 'logs' ? "flex z-10" : "hidden z-0")}>
              <LogsPanel />
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
