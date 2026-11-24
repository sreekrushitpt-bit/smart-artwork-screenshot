const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  getDisplays: () => ipcRenderer.invoke('screen:get-displays'),
  getActiveDesignApp: () => ipcRenderer.invoke('window:get-active-app'),
  captureScreen: (options) => ipcRenderer.invoke('screen:capture', options),
  captureActiveWindow: () => ipcRenderer.invoke('screen:capture-active-window'),
  openManualOverlay: (options) => ipcRenderer.invoke('overlay:open', options),

  copyImageToClipboard: (pngDataUrl) => ipcRenderer.invoke('clipboard:copy-image', pngDataUrl),

  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  saveFileAs: (payload) => ipcRenderer.invoke('file:save-as', payload),
  chooseOutputFolder: (currentFolder) => ipcRenderer.invoke('file:choose-folder', currentFolder),
  openOutputFolder: (folderPath) => ipcRenderer.invoke('file:open-folder', folderPath),
  getDefaultOutputFolder: () => ipcRenderer.invoke('file:default-folder'),

  loadSettings: () => ipcRenderer.invoke('store:load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('store:save-settings', settings),
  loadHistory: () => ipcRenderer.invoke('store:load-history'),
  saveHistory: (items) => ipcRenderer.invoke('store:save-history', items),

  registerHotkeys: (hotkeys) => ipcRenderer.invoke('hotkeys:register', hotkeys),
  showToastNotification: (payload) => ipcRenderer.invoke('toast:show', payload),
  setMainWindowVisible: (visible) => ipcRenderer.invoke('window:set-visible', visible),
  logDiagnostics: (payload) => ipcRenderer.invoke('diagnostics:log', payload),

  onHotkeyCapture: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('hotkey:capture-trigger', listener);
    return () => ipcRenderer.removeListener('hotkey:capture-trigger', listener);
  },
  onManualOverlayResult: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('overlay:result', listener);
    return () => ipcRenderer.removeListener('overlay:result', listener);
  },
  onNavigateTab: (callback) => {
    const listener = (_event, tab) => callback(tab);
    ipcRenderer.on('app:navigate-tab', listener);
    return () => ipcRenderer.removeListener('app:navigate-tab', listener);
  },
});

contextBridge.exposeInMainWorld('electronToastAPI', {
  onUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('toast:update', listener);
    return () => ipcRenderer.removeListener('toast:update', listener);
  },
});

contextBridge.exposeInMainWorld('electronOverlayAPI', {
  onInit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('overlay:init', listener);
    return () => ipcRenderer.removeListener('overlay:init', listener);
  },
  confirm: (box) => ipcRenderer.send('overlay:confirm', box),
  cancel: () => ipcRenderer.send('overlay:cancel'),
});
