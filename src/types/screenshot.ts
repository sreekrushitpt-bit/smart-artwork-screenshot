export type CaptureMode = 'smart' | 'manual' | 'page' | 'multi';

export type OutputFormat = 'PNG' | 'JPG' | 'BMP';

export type DesignAppId =
  | 'coreldraw'
  | 'photoshop'
  | 'illustrator'
  | 'indesign'
  | 'custom'
  | 'live';

export interface ChromeMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DetectedBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label: string;
  strategy: string;
}

export interface HotkeyBindings {
  smartCapture: string;
  manualCapture: string;
  activeWindow: string;
  selectedArtwork: string;
  quickSave: string;
  openFolder: string;
}

export interface AppSettings {
  autoCopyClipboard: boolean;
  autoSave: boolean;
  showNotification: boolean;
  captureWithoutNotification: boolean;
  defaultFormat: OutputFormat;
  jpgQuality: number;
  saveFolderLabel: string;
  filenameTemplate: string;
  detectionSensitivity: number;
  smartCropPadding: number;
  appDetectionEnabled: boolean;
  aiDetectionEnabled: boolean;
  selectedMonitor: string;
  startWithWindows: boolean;
  hotkeys: HotkeyBindings;
}

export interface ScreenshotHistoryItem {
  id: string;
  filename: string;
  format: OutputFormat;
  width: number;
  height: number;
  appName: string;
  mode: string;
  folderPath: string;
  dataUrl: string;
  createdAt: string;
  copiedToClipboard: boolean;
}

export interface ToastState {
  id: number;
  title: string;
  subtitle: string;
  meta?: string;
}
