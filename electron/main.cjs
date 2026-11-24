const path = require('path');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} = require('electron');

const { getActiveDesignApp } = require('./windowDetector.cjs');
const { captureDisplay, captureWindowByInfo, listDisplays } = require('./screenCapture.cjs');
const { copyPngDataUrlToClipboard } = require('./clipboardManager.cjs');
const fileManager = require('./fileManager.cjs');

// Ensure single instance on Windows
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.smartartwork.screenshot');
}

let mainWindow = null;
let toastWindow = null;
let overlayWindow = null;
let tray = null;
let isQuitting = false;
let toastHideTimer = null;
let pendingOverlayCapture = null;

const isDev = process.env.ELECTRON_DEV === 'true';

function getIconPath(name = 'icon.png') {
  return path.join(__dirname, '..', 'build', name);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: 'Smart Artwork Screenshot',
    backgroundColor: '#0B0E14',
    icon: getIconPath('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Minimize to System Tray for background operation rather than terminating
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createToastWindow() {
  if (toastWindow && !toastWindow.isDestroyed()) return;
  toastWindow = new BrowserWindow({
    width: 380,
    height: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  toastWindow.loadFile(path.join(__dirname, 'toast.html'));
}

function showCornerToast(payload) {
  createToastWindow();
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const x = area.x + area.width - 400;
  const y = area.y + area.height - 120;
  toastWindow.setBounds({ x, y, width: 380, height: 100 });
  toastWindow.webContents.send('toast:update', payload);
  toastWindow.showInactive();

  if (toastHideTimer) clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    if (toastWindow && !toastWindow.isDestroyed()) {
      toastWindow.hide();
    }
  }, 2700);
}

async function openManualSelectionOverlay({ monitorIndex, initialBox } = {}) {
  const activeApp = await getActiveDesignApp();
  const targetMon =
    typeof monitorIndex === 'number'
      ? monitorIndex
      : activeApp && typeof activeApp.monitorIndex === 'number'
      ? activeApp.monitorIndex
      : 0;

  const displays = screen.getAllDisplays();
  const display = displays[targetMon] || screen.getPrimaryDisplay();
  const capture = await captureDisplay(targetMon, activeApp);

  pendingOverlayCapture = {
    capture,
    appInfo: activeApp,
  };

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }

  overlayWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    fullscreenable: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  overlayWindow.webContents.once('did-finish-load', () => {
    overlayWindow.webContents.send('overlay:init', {
      dataUrl: capture.dataUrl,
      width: capture.width,
      height: capture.height,
      initialBox: initialBox || null,
    });
    overlayWindow.focus();
  });
}

async function dispatchHotkeyCapture(mode) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mode === 'manual') {
    await openManualSelectionOverlay({});
    return;
  }

  if (mode === 'openFolder') {
    const saved = fileManager.loadSettings();
    await fileManager.openOutputFolder(saved && saved.saveFolderLabel);
    return;
  }

  const activeApp = await getActiveDesignApp();
  const savedSettings = fileManager.loadSettings() || {};
  let monIdx = activeApp ? activeApp.monitorIndex : 0;
  if (savedSettings.selectedMonitor === 'mon1') monIdx = 0;
  if (savedSettings.selectedMonitor === 'mon2') monIdx = 1;

  let capture;
  if (mode === 'activeWindow') {
    capture = await captureWindowByInfo(activeApp);
  } else {
    capture = await captureDisplay(monIdx, activeApp);
  }

  mainWindow.webContents.send('hotkey:capture-trigger', {
    mode,
    capture,
    appInfo: activeApp,
  });
}

function toElectronAccelerator(combo) {
  if (!combo || typeof combo !== 'string') return '';
  return combo
    .replace(/<ctrl>|ctrl/gi, 'CommandOrControl')
    .replace(/<shift>|shift/gi, 'Shift')
    .replace(/<alt>|alt/gi, 'Alt')
    .replace(/[<>]/g, '')
    .trim();
}

function registerGlobalHotkeys(hotkeys) {
  globalShortcut.unregisterAll();
  const cfg = hotkeys || {
    smartCapture: 'Ctrl+Shift+S',
    manualCapture: 'Ctrl+Shift+M',
    activeWindow: 'Ctrl+Shift+W',
    selectedArtwork: 'Ctrl+Shift+A',
    quickSave: 'Ctrl+Shift+Q',
    openFolder: 'Ctrl+Shift+O',
  };

  const map = [
    [cfg.smartCapture, () => dispatchHotkeyCapture('smart')],
    [cfg.manualCapture, () => dispatchHotkeyCapture('manual')],
    [cfg.activeWindow, () => dispatchHotkeyCapture('activeWindow')],
    [cfg.selectedArtwork, () => dispatchHotkeyCapture('multi')],
    [cfg.quickSave, () => mainWindow && mainWindow.webContents.send('hotkey:capture-trigger', { mode: 'quickSave' })],
    [cfg.openFolder, () => dispatchHotkeyCapture('openFolder')],
  ];

  for (const [rawCombo, handler] of map) {
    const accel = toElectronAccelerator(rawCombo);
    if (!accel) continue;
    try {
      globalShortcut.register(accel, handler);
    } catch {
      // Ignore invalid or conflicting OS shortcut
    }
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath('tray-icon.png'));
  tray = new Tray(icon.isEmpty() ? getIconPath('icon.png') : icon);
  tray.setToolTip('Smart Artwork Screenshot — Press Ctrl+Shift+S');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Smart Artwork Screenshot',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Smart Capture (Ctrl+Shift+S)',
      click: () => dispatchHotkeyCapture('smart'),
    },
    {
      label: 'Manual Selection (Ctrl+Shift+M)',
      click: () => dispatchHotkeyCapture('manual'),
    },
    {
      label: 'Active Window (Ctrl+Shift+W)',
      click: () => dispatchHotkeyCapture('activeWindow'),
    },
    {
      label: 'Multi-Artboard / Pages (Ctrl+Shift+A)',
      click: () => dispatchHotkeyCapture('multi'),
    },
    { type: 'separator' },
    {
      label: 'Open Output Folder',
      click: () => dispatchHotkeyCapture('openFolder'),
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function setupIPC() {
  ipcMain.handle('screen:get-displays', () => listDisplays());
  ipcMain.handle('window:get-active-app', () => getActiveDesignApp());

  ipcMain.handle('screen:capture', async (_e, opts = {}) => {
    const activeApp = await getActiveDesignApp();
    let monIdx = typeof opts.monitorIndex === 'number' ? opts.monitorIndex : 0;
    if (opts.selectedMonitor === 'active' && activeApp) monIdx = activeApp.monitorIndex;
    else if (opts.selectedMonitor === 'mon1') monIdx = 0;
    else if (opts.selectedMonitor === 'mon2') monIdx = 1;

    const capture = await captureDisplay(monIdx, activeApp);
    return { capture, appInfo: activeApp };
  });

  ipcMain.handle('diagnostics:log', (_e, payload) => {
    console.info('[SmartCapture Diagnostics] Final Crop:', JSON.stringify(payload));
    return true;
  });

  ipcMain.handle('screen:capture-active-window', async () => {
    const activeApp = await getActiveDesignApp();
    const capture = await captureWindowByInfo(activeApp);
    return { capture, appInfo: activeApp };
  });

  ipcMain.handle('overlay:open', async (_e, opts) => {
    await openManualSelectionOverlay(opts || {});
    return true;
  });

  ipcMain.on('overlay:confirm', (_e, box) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
    if (mainWindow && !mainWindow.isDestroyed() && pendingOverlayCapture) {
      mainWindow.webContents.send('overlay:result', {
        cancelled: false,
        box,
        capture: pendingOverlayCapture.capture,
        appInfo: pendingOverlayCapture.appInfo,
      });
    }
    pendingOverlayCapture = null;
  });

  ipcMain.on('overlay:cancel', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
    pendingOverlayCapture = null;
  });

  ipcMain.handle('clipboard:copy-image', (_e, pngDataUrl) => {
    return copyPngDataUrlToClipboard(pngDataUrl);
  });

  ipcMain.handle('file:save', (_e, payload) => fileManager.saveScreenshotToFolder(payload));
  ipcMain.handle('file:save-as', (_e, payload) =>
    fileManager.saveScreenshotAs({ parentWindow: mainWindow, ...payload })
  );
  ipcMain.handle('file:choose-folder', (_e, currentFolder) =>
    fileManager.chooseOutputFolder(mainWindow, currentFolder)
  );
  ipcMain.handle('file:open-folder', (_e, folderPath) =>
    fileManager.openOutputFolder(folderPath)
  );
  ipcMain.handle('file:default-folder', () => fileManager.getDefaultOutputFolder());

  ipcMain.handle('store:load-settings', () => fileManager.loadSettings());
  ipcMain.handle('store:save-settings', (_e, settings) => {
    fileManager.saveSettings(settings);
    if (settings && settings.hotkeys) {
      registerGlobalHotkeys(settings.hotkeys);
    }
    if (process.platform === 'win32' && settings) {
      app.setLoginItemSettings({
        openAtLogin: Boolean(settings.startWithWindows),
      });
    }
    return true;
  });

  ipcMain.handle('store:load-history', () => fileManager.loadHistory());
  ipcMain.handle('store:save-history', (_e, items) => fileManager.saveHistory(items));

  ipcMain.handle('hotkeys:register', (_e, hotkeys) => {
    registerGlobalHotkeys(hotkeys);
    return true;
  });

  ipcMain.handle('toast:show', (_e, payload) => {
    showCornerToast(payload);
    return true;
  });

  ipcMain.handle('window:set-visible', (_e, visible) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (visible) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow.hide();
    }
    return true;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  setupIPC();
  createMainWindow();
  createTray();
  const saved = fileManager.loadSettings();
  registerGlobalHotkeys(saved && saved.hotkeys);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Keep alive in system tray on Windows unless explicitly quit
  if (isQuitting) {
    app.quit();
  }
});
