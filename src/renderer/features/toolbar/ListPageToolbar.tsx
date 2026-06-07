import { Search, Clock, SortAsc, Grid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ListPageToolbarProps {
  title: string;
  searchQuery?: string;
  sortBy?: 'time' | 'name';
  viewMode?: 'list' | 'grid';
  onSearch?: (query: string) => void;
  onSortChange?: (sortBy: 'time' | 'name') => void;
  onViewModeChange?: (mode: 'list' | 'grid') => void;
}

export function ListPageToolbar({
  title,
  searchQuery = '',
  sortBy = 'time',
  viewMode = 'list',
  onSearch,
  onSortChange,
  onViewModeChange
}: ListPageToolbarProps) {
  const { t } = useTranslation();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    onSearch?.(query);
  };

  const handleSortChange = (newSort: 'time' | 'name') => {
    onSortChange?.(newSort);
  };

  const handleViewModeChange = (newMode: 'list' | 'grid') => {
    onViewModeChange?.(newMode);
  };

  return (
    <div className={`flex items-center w-full h-full ${title ? 'justify-between' : 'justify-end'}`}>
      {/* Page title */}
      {title && (
        <div className="flex items-center min-w-0 flex-1">
          <h1 className="text-sm font-medium text-gray-800">{title}</h1>
        </div>
      )}

      {/* Toolbar area */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Search box */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder={t('toolbar.searchPlaceholder')}
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-8 pr-3 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white/50"
            style={{ width: '180px' }}
          />
        </div>

        {/* Divider */}
        <div className="w-px h-3.5 bg-gray-300 mx-1" />

        {/* Sort options */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleSortChange('time')}
            className={`
              p-1 rounded hover:bg-gray-100 transition-colors
              ${sortBy === 'time' ? 'bg-gray-100 text-primary-600' : 'text-gray-600'}
            `}
            title={t('toolbar.sortByTime')}
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleSortChange('name')}
            className={`
              p-1 rounded hover:bg-gray-100 transition-colors
              ${sortBy === 'name' ? 'bg-gray-100 text-primary-600' : 'text-gray-600'}
            `}
            title={t('toolbar.sortByName')}
          >
            <SortAsc className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-3.5 bg-gray-300 mx-1" />

        {/* View mode toggle */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleViewModeChange('list')}
            className={`
              p-1 rounded hover:bg-gray-100 transition-colors
              ${viewMode === 'list' ? 'bg-gray-100 text-primary-600' : 'text-gray-600'}
            `}
            title={t('toolbar.listView')}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleViewModeChange('grid')}
            className={`
              p-1 rounded hover:bg-gray-100 transition-colors
              ${viewMode === 'grid' ? 'bg-gray-100 text-primary-600' : 'text-gray-600'}
            `}
            title={t('toolbar.gridView')}
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
} 