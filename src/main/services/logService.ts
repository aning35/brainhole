import { BrowserWindow } from 'electron';

export interface LogEntry {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

const MAX_LOGS = 2000;
let logBuffer: LogEntry[] = [];
let logIdCounter = 0;
let _intercepted = false;

/**
 * Safely stringify a value for log display.
 */
function safeStringify(val: any): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return val;
  if (val instanceof Error) return `${val.name}: ${val.message}`;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

/**
 * Add a log entry and broadcast it to all renderer windows.
 */
export function addLog(level: LogEntry['level'], source: string, message: string): LogEntry {
  const entry: LogEntry = {
    id: ++logIdCounter,
    timestamp: Date.now(),
    level,
    source,
    message,
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer = logBuffer.slice(logBuffer.length - MAX_LOGS);
  }

  // Broadcast to all renderer windows
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('logs:new-entry', entry);
        }
      } catch {
        // Window may have been destroyed
      }
    }
  } catch {
    // BrowserWindow might not be available yet during early startup
  }

  return entry;
}

/**
 * Get all buffered log entries, optionally filtered by level.
 */
export function getLogs(filter?: { level?: LogEntry['level'] }): LogEntry[] {
  if (filter?.level) {
    return logBuffer.filter(e => e.level === filter.level);
  }
  return [...logBuffer];
}

/**
 * Clear all buffered logs.
 */
export function clearLogs(): void {
  logBuffer = [];
  logIdCounter = 0;
}

/**
 * Intercept native console methods to capture main process logs.
 * Call this once at startup.
 */
export function interceptConsole(): void {
  if (_intercepted) return;
  _intercepted = true;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: any[]) => {
    origLog.apply(console, args);
    try {
      const msg = args.map(safeStringify).join(' ');
      addLog('info', 'main', msg);
    } catch { /* never break the caller */ }
  };

  console.warn = (...args: any[]) => {
    origWarn.apply(console, args);
    try {
      const msg = args.map(safeStringify).join(' ');
      addLog('warn', 'main', msg);
    } catch { /* never break the caller */ }
  };

  console.error = (...args: any[]) => {
    origError.apply(console, args);
    try {
      const msg = args.map(safeStringify).join(' ');
      addLog('error', 'main', msg);
    } catch { /* never break the caller */ }
  };

  // Emit a test entry so we know the service is working
  addLog('info', 'system', '🟢 Log service initialized');
}
