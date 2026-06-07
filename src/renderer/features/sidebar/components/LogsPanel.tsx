import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Trash2, ArrowDown, Filter, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface LogEntry {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

type LevelFilter = 'all' | 'info' | 'warn' | 'error';

// Fixed row height for virtual scrolling (matches py-[3px] + line-height 18px + border)
const ROW_HEIGHT = 24;
const OVERSCAN = 10; // Extra rows rendered above/below viewport

export function LogsPanel() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LevelFilter>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Load existing logs on mount (with retry for HMR/restart timing)
  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const entries = await window.electronAPI.logs.get();
          if (!cancelled) setLogs(entries);
          return;
        } catch {
          if (i < retries - 1) await new Promise(r => setTimeout(r, 1000));
        }
      }
    };
    fetchLogs();
    return () => { cancelled = true; };
  }, []);

  // Subscribe to new log entries
  useEffect(() => {
    const unsub = window.electronAPI.logs.onNewEntry((entry: LogEntry) => {
      setLogs(prev => {
        const next = [...prev, entry];
        if (next.length > 2000) return next.slice(next.length - 2000);
        return next;
      });
    });
    return unsub;
  }, []);

  // Measure container height
  useEffect(() => {
    if (!scrollRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(scrollRef.current);
    setContainerHeight(scrollRef.current.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, filter]);

  // Handle scroll: update scrollTop + auto-scroll detection
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop: st, scrollHeight, clientHeight } = scrollRef.current;
    setScrollTop(st);
    const atBottom = scrollHeight - st - clientHeight < 40;
    if (atBottom && !autoScroll) setAutoScroll(true);
    if (!atBottom && autoScroll) setAutoScroll(false);
  }, [autoScroll]);

  const handleClear = async () => {
    await window.electronAPI.logs.clear();
    setLogs([]);
  };

  const handleScrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const handleCopyLine = (entry: LogEntry) => {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const text = `[${time}] [${entry.level.toUpperCase()}] [${entry.source}] ${entry.message}`;
    navigator.clipboard.writeText(text);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filteredLogs = useMemo(
    () => filter === 'all' ? logs : logs.filter(l => l.level === filter),
    [logs, filter]
  );

  const errorCount = useMemo(() => logs.filter(l => l.level === 'error').length, [logs]);
  const warnCount = useMemo(() => logs.filter(l => l.level === 'warn').length, [logs]);

  // Virtual scrolling calculations
  const totalHeight = filteredLogs.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filteredLogs.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const visibleLogs = filteredLogs.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  const levelColors: Record<string, string> = {
    info: 'text-gray-500',
    warn: 'text-amber-600',
    error: 'text-red-500',
  };

  const levelBg: Record<string, string> = {
    info: '',
    warn: 'bg-amber-50/50',
    error: 'bg-red-50/50',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 flex-shrink-0">
        {/* Filter buttons */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
          <button
            onClick={() => setFilter('all')}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded transition-colors",
              filter === 'all' ? "bg-white shadow-sm text-gray-800" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {t('logs.all')}
          </button>
          <button
            onClick={() => setFilter('error')}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded transition-colors flex items-center gap-1",
              filter === 'error' ? "bg-white shadow-sm text-red-600" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {t('logs.errors')}
            {errorCount > 0 && (
              <span className="bg-red-100 text-red-600 px-1 rounded text-[10px] min-w-[16px] text-center">
                {errorCount > 99 ? '99+' : errorCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilter('warn')}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded transition-colors flex items-center gap-1",
              filter === 'warn' ? "bg-white shadow-sm text-amber-600" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {t('logs.warnings')}
            {warnCount > 0 && (
              <span className="bg-amber-100 text-amber-600 px-1 rounded text-[10px] min-w-[16px] text-center">
                {warnCount > 99 ? '99+' : warnCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1" />

        {/* Scroll to bottom */}
        {!autoScroll && (
          <button
            onClick={handleScrollToBottom}
            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
            title={t('logs.scrollToBottom')}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Clear */}
        <button
          onClick={handleClear}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
          title={t('logs.clear')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Log entries - virtual scrolling */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-[11px] leading-[18px]"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Filter className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">{t('logs.empty')}</p>
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)`, position: 'absolute', left: 0, right: 0 }}>
              {visibleLogs.map(entry => (
                <div
                  key={entry.id}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    "group flex items-center gap-1.5 px-3 hover:bg-gray-50 border-b border-gray-100/50 cursor-default overflow-hidden",
                    levelBg[entry.level]
                  )}
                >
                  {/* Timestamp */}
                  <span className="text-gray-400 flex-shrink-0 select-none tabular-nums">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>

                  {/* Level badge */}
                  <span className={cn(
                    "flex-shrink-0 uppercase font-semibold w-[38px] text-center select-none",
                    levelColors[entry.level]
                  )}>
                    {entry.level === 'info' ? 'INF' : entry.level === 'warn' ? 'WRN' : 'ERR'}
                  </span>

                  {/* Source */}
                  <span className="text-blue-500/70 flex-shrink-0 select-none">
                    [{entry.source}]
                  </span>

                  {/* Message */}
                  <span className="text-gray-700 truncate flex-1 min-w-0 select-text">
                    {entry.message}
                  </span>

                  {/* Copy button */}
                  <button
                    onClick={() => handleCopyLine(entry)}
                    className="flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                    title={t('logs.copyLine')}
                  >
                    {copiedId === entry.id
                      ? <Check className="w-3 h-3 text-green-500" />
                      : <Copy className="w-3 h-3" />
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-gray-200 bg-gray-50 text-[10px] text-gray-400 flex-shrink-0">
        <span>{t('logs.totalEntries', { count: filteredLogs.length })}</span>
        {autoScroll && <span className="text-blue-400">{t('logs.autoScroll')}</span>}
      </div>
    </div>
  );
}
