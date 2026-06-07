import { useEffect } from 'react';
import {
  Clock,
  LayoutTemplate,
  Plus,
  Lightbulb,
  FileText,
  Network,
  FileSpreadsheet,
  File,
  FilePieChart,
  FileCode,
  FileJson,
  ScrollText,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useCanvasStore } from '../../stores/canvasStore';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import { CanvasMetadata } from '../../services/storageService';
import { IMAGE_FILE_EXTENSIONS } from '../../utils/fileTypes';
import { useTranslation } from 'react-i18next';

interface AllCanvasesProps {
  searchQuery: string;
  sortBy: 'time' | 'name';
  viewMode: 'list' | 'grid';
  onNavigateToCanvas?: () => void;
}

/** Extract file extension by file ID (path) */
function getExtension(id: string): string {
  const lastDot = id.lastIndexOf('.');
  const lastSep = Math.max(id.lastIndexOf('/'), id.lastIndexOf('\\'));
  if (lastDot === -1 || lastDot < lastSep) return '';
  return id.substring(lastDot).toLowerCase();
}

/** Return corresponding colored icon by extension */
function FileIcon({ ext, className = 'w-6 h-6' }: { ext: string; className?: string }) {
  switch (ext) {
    case '.md':
    case '.txt':
      return <FileText className={`${className} text-blue-500`} />;
    case '.log':
      return <ScrollText className={`${className} text-orange-500`} />;
    case '.csv':
    case '.xlsx':
    case '.xls':
      return <FileSpreadsheet className={`${className} text-emerald-500`} />;
    case '.docx':
    case '.doc':
      return <File className={`${className} text-blue-600`} />;
    case '.pdf':
      return <FilePieChart className={`${className} text-red-500`} />;
    case '.json':
      return <FileJson className={`${className} text-amber-500`} />;
    case '.yaml':
    case '.yml':
      return <FileCode className={`${className} text-purple-500`} />;
    case '.graph':
      return <Network className={`${className} text-teal-500`} />;
    case '.canvas':
      return <LayoutTemplate className={`${className} text-violet-500`} />;
    default:
      return <File className={`${className} text-gray-400`} />;
  }
}

/** Return icon background color by extension */
function getIconBg(ext: string): string {
  switch (ext) {
    case '.md':
    case '.txt':
      return 'bg-blue-50';
    case '.log':
      return 'bg-orange-50';
    case '.csv':
    case '.xlsx':
    case '.xls':
      return 'bg-emerald-50';
    case '.docx':
    case '.doc':
      return 'bg-blue-50';
    case '.pdf':
      return 'bg-red-50';
    case '.json':
      return 'bg-amber-50';
    case '.yaml':
    case '.yml':
      return 'bg-purple-50';
    case '.graph':
      return 'bg-teal-50';
    case '.canvas':
      return 'bg-violet-50';
    default:
      return 'bg-gray-100';
  }
}

export function AllCanvases({ searchQuery, sortBy, viewMode, onNavigateToCanvas }: AllCanvasesProps) {
  const { t, i18n } = useTranslation();
  const { canvases, loadCanvases, openCanvas, createNewCanvas } = useCanvasStore();

  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  const handleOpenCanvas = async (id: string, e: React.MouseEvent) => {
    const shouldReplace = !e.metaKey;
    await openCanvas(id, { replace: shouldReplace });
    onNavigateToCanvas?.();
  };

  const handleCreateCanvas = async () => {
    await createNewCanvas(t('allCanvases.unnamed'));
    onNavigateToCanvas?.();
  };

  // Filter and sort
  const filteredCanvases = canvases
    .filter(canvas => !IMAGE_FILE_EXTENSIONS.includes(getExtension(canvas.id).slice(1)))
    .filter(canvas => canvas.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      }
    });

  const totalCount = filteredCanvases.length;
  const displayedCanvases = filteredCanvases.slice(0, 100);

  const renderGridItem = (canvas: CanvasMetadata) => {
    const ext = getExtension(canvas.id);
    const bg = getIconBg(ext);
    return (
      <motion.div
        key={canvas.id}
        whileHover={{ scale: 1.02, y: -2 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        onClick={(e) => handleOpenCanvas(canvas.id, e)}
        className="bg-white rounded-xl p-4 border border-gray-100 hover:border-primary-300 hover:shadow-lg transition-all cursor-pointer group"
      >
        <div className={`flex items-center justify-center w-12 h-12 ${bg} rounded-xl mb-3 group-hover:scale-110 transition-transform`}>
          <FileIcon ext={ext} className="w-6 h-6" />
        </div>
        <h3 className="font-medium text-gray-900 mb-1 line-clamp-2 text-sm">{canvas.name}</h3>
        {ext && (
          <span className="inline-block text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded mb-1.5 font-mono">
            {ext}
          </span>
        )}
        <div className="flex items-center text-xs text-gray-400 mt-1">
          <Clock className="w-3 h-3 mr-1 flex-shrink-0" />
          <span className="truncate">
            {formatDistanceToNow(canvas.updatedAt, { addSuffix: true, locale: i18n.language === 'en' ? enUS : zhCN })}
          </span>
        </div>
        {canvas.tags && canvas.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {canvas.tags.slice(0, 2).map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-gray-100 text-xs rounded text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}
      </motion.div>
    );
  };

  const renderListItem = (canvas: CanvasMetadata, index: number, total: number) => {
    const ext = getExtension(canvas.id);
    const bg = getIconBg(ext);
    return (
      <div
        key={canvas.id}
        onClick={(e) => handleOpenCanvas(canvas.id, e)}
        className={`flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors group ${
          index !== total - 1 ? 'border-b border-gray-100' : ''
        }`}
      >
        <div className={`flex items-center justify-center w-9 h-9 ${bg} rounded-lg mr-3 flex-shrink-0 group-hover:scale-105 transition-transform`}>
          <FileIcon ext={ext} className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 text-sm truncate">{canvas.name}</h3>
            {ext && (
              <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
                {ext}
              </span>
            )}
          </div>
        </div>
        {canvas.tags && canvas.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mr-4">
            {canvas.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-gray-100 text-xs rounded text-gray-600">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0 ml-2">
          <Clock className="w-3.5 h-3.5" />
          {formatDistanceToNow(canvas.updatedAt, { addSuffix: true, locale: i18n.language === 'en' ? enUS : zhCN })}
        </div>
      </div>
    );
  };

  const renderGridView = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {displayedCanvases.map(canvas => renderGridItem(canvas))}
    </div>
  );

  const renderListView = () => (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      {displayedCanvases.map((canvas, index) => renderListItem(canvas, index, displayedCanvases.length))}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Content area - scrollable */}
      <div className="flex-1 min-h-0 p-6 overflow-y-auto">
        {filteredCanvases.length === 0 ? (
          <div className="text-center py-16">
            {searchQuery ? (
              // No search results
              <>
                <LayoutTemplate className="w-16 h-16 text-gray-300 mx-auto mb-6" />
                <h3 className="text-xl font-medium text-gray-900 mb-3">{t('allCanvases.noFilesFound')}</h3>
                <p className="text-gray-500 mb-6">
                  {t('allCanvases.tryAdjustSearch')}
                </p>
                <button
                  onClick={handleCreateCanvas}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  {t('allCanvases.createNewCanvas')}
                </button>
              </>
            ) : (
              // First time use, no files
              <div className="flex h-full items-center justify-center">
                <div className="text-center py-16 animate-in fade-in zoom-in duration-500">
                  <div className="max-w-md mx-auto relative px-4">
                    <div className="relative mb-8 inline-block">
                      <div className="w-24 h-24 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-white">
                        <Lightbulb className="w-12 h-12 text-indigo-500 opacity-80" />
                      </div>
                      <div className="absolute -top-3 -right-3 w-10 h-10 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform cursor-default">
                        <span className="text-xl">✨</span>
                      </div>
                    </div>

                    <h3 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">
                      {t('allCanvases.welcomeTo')}<span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-600">{t('allCanvases.brainhole')}</span>
                    </h3>

                    <p className="text-gray-600 mb-10 leading-relaxed text-lg">
                      {t('allCanvases.aiSpaceLine1')}<br />
                      {t('allCanvases.aiSpaceLine2')}
                    </p>

                    <button
                      onClick={handleCreateCanvas}
                      className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-lg font-medium rounded-xl transition-all shadow-xl hover:shadow-indigo-500/30 hover:-translate-y-1 overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"></div>
                      <Plus className="w-6 h-6" />
                      <span>{t('allCanvases.startFirstBrainhole')}</span>
                    </button>

                    <p className="text-sm text-gray-400 mt-8">
                      {t('allCanvases.tipSidebar')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {t('allCanvases.totalFiles', { count: totalCount })} {totalCount > 100 && <span className="text-gray-400 text-xs ml-1">{t('allCanvases.onlyShowRecent100')}</span>}
              </p>
            </div>
            {viewMode === 'grid' ? renderGridView() : renderListView()}
          </>
        )}
      </div>
    </div>
  );
}