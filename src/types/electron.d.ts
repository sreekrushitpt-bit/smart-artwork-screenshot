import { AppSettings, DesignAppId, DetectedBox, ScreenshotHistoryItem } from './screenshot';

export interface ElectronDisplayInfo {
  index: number;
  id: string;
  isPrimary: boolean;
  scaleFactor: number;
  dpi?: number;
  physicalWidth: number;
  physicalHeight: number;
  bounds?: { x: number; y: number; width: number; height: number };
  physicalBounds?: { x: number; y: number; width: number; height: number };
  label: string;
}

export interface ElectronRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ElectronActiveAppInfo {
  hwnd?: number;
  pid?: number;
  processName?: string;
  windowTitle?: string;
  appId: DesignAppId;
  appName: string;
  isDesignApp: boolean;
  monitorIndex: number;
  dpi?: number;
  rect?: ElectronRect | null;
  monitorPhysicalBounds?: ElectronRect | null;
  workPhysicalBounds?: ElectronRect | null;
}

export interface CaptureDiagnostics {
  monitorIndex?: number;
  monitorResolutionLogical?: string;
  monitorResolutionPhysical?: string;
  monitorOriginLogical?: string;
  monitorOriginPhysical?: string;
  scaleFactor?: number;
  windowsDpi?: number;
  captureBitmapDimensions?: string;
  windowRectPhysical?: ElectronRect | null;
  windowLocalRect?: { x: number; y: number; width: number; height: number } | null;
  detectedArtworkBox?: { x: number; y: number; width: number; height: number; confidence: number; strategy: string } | null;
  finalCropBox?: { x: number; y: number; width: number; height: number } | null;
  finalCapturedDimensions?: string;
}

export interface ElectronCapturePayload {
  dataUrl: string;
  width: number;
  height: number;
  monitorIndex: number;
  displayId?: string;
  scaleFactor?: number;
  dpi?: number;
  bounds?: { x: number; y: number; width: number; height: number };
  physicalBounds?: { x: number; y: number; width: number; height: number };
  windowLocalRect?: { x: number; y: number; width: number; height: number } | null;
  windowTitle?: string;
  diagnostics?: CaptureDiagnostics;
}

export interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  getDisplays: () => Promise<ElectronDisplayInfo[]>;
  getActiveDesignApp: () => Promise<ElectronActiveAppInfo | null>;
  captureScreen: (options?: {
    monitorIndex?: number;
    selectedMonitor?: string;
  }) => Promise<{ capture: ElectronCapturePayload; appInfo: ElectronActiveAppInfo | null }>;
  captureActiveWindow: () => Promise<{
    capture: ElectronCapturePayload;
    appInfo: ElectronActiveAppInfo | null;
  }>;
  openManualOverlay: (options?: {
    monitorIndex?: number;
    initialBox?: DetectedBox | null;
  }) => Promise<boolean>;
  copyImageToClipboard: (
    pngDataUrl: string
  ) => Promise<{ ok: boolean; width?: number; height?: number; error?: string }>;
  saveFile: (payload: {
    base64Data: string;
    filename: string;
    folderPath?: string;
  }) => Promise<{ ok: boolean; filePath: string; folderPath: string }>;
  saveFileAs: (payload: {
    base64Data: string;
    defaultFilename: string;
    format: string;
    defaultFolder?: string;
  }) => Promise<{
    canceled: boolean;
    ok?: boolean;
    filePath?: string;
    filename?: string;
    folderPath?: string;
  }>;
  chooseOutputFolder: (currentFolder?: string) => Promise<string | null>;
  openOutputFolder: (folderPath?: string) => Promise<string>;
  getDefaultOutputFolder: () => Promise<string>;
  loadSettings: () => Promise<AppSettings | null>;
  saveSettings: (settings: AppSettings) => Promise<boolean>;
  loadHistory: () => Promise<ScreenshotHistoryItem[]>;
  saveHistory: (items: ScreenshotHistoryItem[]) => Promise<boolean>;
  registerHotkeys: (hotkeys: AppSettings['hotkeys']) => Promise<boolean>;
  showToastNotification: (payload: {
    title: string;
    subtitle: string;
    meta?: string;
  }) => Promise<boolean>;
  setMainWindowVisible: (visible: boolean) => Promise<boolean>;
  logDiagnostics: (payload: CaptureDiagnostics) => Promise<boolean>;
  onHotkeyCapture: (
    callback: (payload: {
      mode: string;
      capture?: ElectronCapturePayload;
      appInfo?: ElectronActiveAppInfo | null;
    }) => void
  ) => () => void;
  onManualOverlayResult: (
    callback: (payload: {
      cancelled: boolean;
      box: { x: number; y: number; width: number; height: number };
      capture: ElectronCapturePayload;
      appInfo: ElectronActiveAppInfo | null;
    }) => void
  ) => () => void;
  onNavigateTab: (callback: (tab: string) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
