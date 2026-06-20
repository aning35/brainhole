import { app, BrowserWindow, Menu, shell, ipcMain, protocol, net } from 'electron';
import path from 'path';
import { initDB, getCanvases, getCanvas, saveCanvas, deleteCanvas, getFolders, createFolder, deleteFolder, updateFolder, updateCanvasFolder, updateFolderOrder, updateCanvasOrder, moveFolderToParent, reorderItem } from './database';
import { initVaultHandlers } from './vault';
import { initGraphHandlers } from './graph';
import { getQueueStatus } from './services/taskQueue';
import { getModelsStatus, deleteModel, downloadModel } from './services/modelManager';
import { interceptConsole, getLogs, clearLogs } from './services/logService';
import { t, setLang } from './i18n';

// interceptConsole() is called inside app.whenReady()

// Check for development environment
// const isDev = process.env.NODE_ENV === 'development';

// Register custom protocol scheme before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-asset', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
]);

let mainWindow: BrowserWindow | null = null;

// Create main window
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,  // Required for <webview> PDF preview
      plugins: true,     // Required to enable Chromium PDF Viewer plugin
    },
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'hidden',
    titleBarOverlay: process.platform !== 'darwin' ? {
      color: '#ffffff',
      symbolColor: '#333333',
      height: 32
    } : undefined,
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 14 } : undefined,
    vibrancy: process.platform === 'darwin' ? 'window' : undefined,
    show: false,
  });

  // Show window when ready to avoid visual flashing
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load application
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// Network fetch bypass CORS
ipcMain.handle('net:fetch', async (_, url: string, options?: any) => {
  try {
    const response = await require('axios')({
      url,
      method: options?.method || 'GET',
      headers: options?.headers,
      data: options?.body ? JSON.parse(options.body) : undefined,
    });
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      text: JSON.stringify(response.data)
    };
  } catch (error: any) {
    console.error('[net:fetch] Axios error details:', error.response?.status, error.response?.data);
    return {
      ok: false,
      status: error.response?.status,
      statusText: error.response?.statusText,
      error: error.message,
      text: error.response?.data ? JSON.stringify(error.response.data) : undefined
    };
  }
});

// Set application menu
const createMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.newCanvas'),
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('menu-new-canvas');
          },
        },
        {
          label: t('menu.open'),
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('menu-open');
          },
        },
        {
          label: t('menu.save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('menu-save');
          },
        },
        {
          label: t('menu.saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow?.webContents.send('menu-save-as');
          },
        },
        { type: 'separator' },
        {
          label: t('menu.quit'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo') },
        { role: 'redo', label: t('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        { role: 'delete', label: t('menu.delete') },
        { role: 'selectAll', label: t('menu.selectAll') },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.zoomIn'),
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            mainWindow?.webContents.send('menu-zoom-in');
          },
        },
        {
          label: t('menu.zoomOut'),
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            mainWindow?.webContents.send('menu-zoom-out');
          },
        },
        {
          label: t('menu.fitScreen'),
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            mainWindow?.webContents.send('menu-fit-view');
          },
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: t('menu.devTools') },
      ],
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.about'),
          click: () => {
            mainWindow?.webContents.send('menu-about');
          },
        },
        {
          label: t('menu.docs'),
          click: async () => {
            await shell.openExternal('https://github.com/aning35/brainhole');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// Application event handling
app.whenReady().then(() => {
  // Intercept console to capture all main process logs
  interceptConsole();

  // Register logs IPC handlers
  ipcMain.handle('logs:get', () => {
    return getLogs();
  });
  ipcMain.handle('logs:clear', () => {
    clearLogs();
    return true;
  });

  // Register custom protocol to serve local files (images in markdown, etc.)
  protocol.handle('local-asset', (request) => {
    let filePath = request.url.replace(/^local-asset:\/\/local\/?/, '');
    filePath = decodeURIComponent(filePath);
    if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
      filePath = filePath.slice(1);
    }
    // Normalize mixed separators (forward + back slashes) for Windows
    if (process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\');
    }
    console.log('[local-asset] Resolved path:', filePath);
    const { pathToFileURL } = require('url');
    try {
      return net.fetch(pathToFileURL(filePath).href).catch(err => {
        console.error('[local-asset] fetch error:', err, 'path:', filePath);
        return new Response('File not found', { status: 404 });
      });
    } catch (err) {
      console.error('[local-asset] path error:', err, 'path:', filePath);
      return new Response('Invalid path', { status: 400 });
    }
  });

  initDB();
  initVaultHandlers();
  initGraphHandlers();
  createWindow();
  createMenu();

  // Handle language change from renderer
  ipcMain.on('set-language', (_, lang: string) => {
    setLang(lang);
    createMenu(); // Rebuild menu with new language
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC communication handling
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('dialog:open', async (_, options) => {
  const { dialog } = require('electron');
  return await dialog.showOpenDialog(mainWindow as any, options);
});

ipcMain.handle('dialog:save', async (_, options) => {
  const { dialog } = require('electron');
  return await dialog.showSaveDialog(mainWindow as any, options);
});

// Database operations
ipcMain.handle('db:get-all', () => {
  return getCanvases();
});

ipcMain.handle('db:get-one', (_, id: string) => {
  return getCanvas(id);
});

ipcMain.handle('db:save', (_, canvas: any) => {
  return saveCanvas(canvas);
});

ipcMain.handle('db:delete', (_, id: string) => {
  return deleteCanvas(id);
});

// Folder operations
ipcMain.handle('db:get-folders', () => {
  return getFolders();
});

ipcMain.handle('db:create-folder', (_, folder) => {
  return createFolder(folder);
});

ipcMain.handle('db:delete-folder', (_, id) => {
  return deleteFolder(id);
});

ipcMain.handle('db:update-folder', (_, { id, name }) => {
  return updateFolder(id, name);
});

ipcMain.handle('db:update-canvas-folder', (_, { canvasId, folderId, displayOrder }) => {
  return updateCanvasFolder(canvasId, folderId, displayOrder);
});

// New handlers for folder ordering
ipcMain.handle('db:update-folder-order', (_, { id, order }) => {
  return updateFolderOrder(id, order);
});

ipcMain.handle('db:update-canvas-order', (_, { id, order }) => {
  return updateCanvasOrder(id, order);
});

ipcMain.handle('db:reorderItem', (_, { type, id, targetId, position }) => {
  return reorderItem(type, id, targetId, position);
});

ipcMain.handle('db:move-folder-to-parent', (_, { folderId, newParentId, displayOrder }) => {
  return moveFolderToParent(folderId, newParentId, displayOrder);
});

// Full screen control
ipcMain.handle('window:set-fullscreen', (_, fullscreen: boolean) => {
  if (mainWindow) {
    mainWindow.setFullScreen(fullscreen);
    return true;
  }
  return false;
});

ipcMain.handle('window:is-fullscreen', () => {
  return mainWindow?.isFullScreen() || false;
});

// Window buttons control
ipcMain.handle('window:hide-traffic-lights', () => {
  if (mainWindow && process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false);
    return true;
  }
  return false;
});

ipcMain.handle('window:show-traffic-lights', () => {
  if (mainWindow && process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(true);
    return true;
  }
  return false;
});

// Prevent opening new windows and add context menu
app.on('web-contents-created', (_, contents) => {
  contents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (params.isEditable) {
      template.push({ role: 'cut', label: t('serviceMain.contextCut') });
      template.push({ role: 'copy', label: t('serviceMain.contextCopy') });
      template.push({ role: 'paste', label: t('serviceMain.contextPaste') });
      template.push({ role: 'selectAll', label: t('serviceMain.contextSelectAll') });
    } else if (params.selectionText && params.selectionText.trim().length > 0) {
      template.push({ role: 'copy', label: t('serviceMain.contextCopy') });
      template.push({ type: 'separator' });
      template.push({ role: 'selectAll', label: t('serviceMain.contextSelectAll') });
    }

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup();
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
});

// Task Queue status query
ipcMain.handle('taskQueue:get-status', () => {
  return getQueueStatus();
});

// Models Management
ipcMain.handle('models:get-status', async () => {
  return await getModelsStatus();
});

ipcMain.handle('models:delete', async (_, target: 'funasr' | 'mineru' | 'docling') => {
  return await deleteModel(target);
});

ipcMain.handle('models:download', async (event, { target, source, taskId }) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win) {
    await downloadModel(target, source, taskId, win);
  }
});

// Logs IPC handlers are registered inside app.whenReady()