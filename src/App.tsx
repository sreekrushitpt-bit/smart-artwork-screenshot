import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  Camera,
  Check,
  ClipboardPaste,
  Crop,
  Download,
  FolderOpen,
  History,
  Layers,
  Monitor,
  Scan,
  Settings as SettingsIcon,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ArtboardCandidate, ArtboardPickerModal } from './components/ArtboardPickerModal';
import { HistoryView } from './components/HistoryView';
import { ManualSelectionOverlay } from './components/ManualSelectionOverlay';
import { SettingsView } from './components/SettingsView';
import { ToastNotification } from './components/ToastNotification';
import { WindowsDesktopPackageView } from './components/WindowsDesktopPackageView';
import { detectArtworkRegions } from './engine/artworkDetector';
import {
  blobToBase64,
  copyCanvasImageToClipboard,
  cropCanvas,
  exportCanvasToBlob,
  generateArtworkFilename,
  triggerBlobDownload,
} from './engine/clipboardAndExport';
import { WORKSPACE_PRESETS, renderDesignWorkspaceScene } from './engine/workspaceRenderer';
import {
  CaptureDiagnostics,
  ElectronActiveAppInfo,
  ElectronCapturePayload,
  ElectronDisplayInfo,
} from './types/electron';
import {
  AppSettings,
  CaptureMode,
  DesignAppId,
  DetectedBox,
  OutputFormat,
  ScreenshotHistoryItem,
  ToastState,
} from './types/screenshot';

type NavTab = 'studio' | 'history' | 'settings' | 'windows';

const DEFAULT_SETTINGS: AppSettings = {
  autoCopyClipboard: true,
  autoSave: false,
  showNotification: true,
  captureWithoutNotification: false,
  defaultFormat: 'PNG',
  jpgQuality: 95,
  saveFolderLabel: 'C:\\Users\\Designer\\Pictures\\SmartArtworkScreenshots',
  filenameTemplate: 'Artwork_{date}_{time}',
  detectionSensitivity: 75,
  smartCropPadding: 0,
  appDetectionEnabled: true,
  aiDetectionEnabled: false,
  selectedMonitor: 'active',
  startWithWindows: false,
  hotkeys: {
    smartCapture: 'Ctrl+Shift+S',
    manualCapture: 'Ctrl+Shift+M',
    activeWindow: 'Ctrl+Shift+W',
    selectedArtwork: 'Ctrl+Shift+A',
    quickSave: 'Ctrl+Shift+Q',
    openFolder: 'Ctrl+Shift+O',
  },
};

const STORAGE_SETTINGS_KEY = 'smart_artwork_settings_v1';
const STORAGE_HISTORY_KEY = 'smart_artwork_history_v1';

const isDesktopApp = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('studio');
  const [activeAppId, setActiveAppId] = useState<DesignAppId>('coreldraw');
  const [detectedAppLabel, setDetectedAppLabel] = useState<string>('CorelDRAW');
  const [detectionStatus, setDetectionStatus] = useState<string>('Ready');
  const [captureMode, setCaptureMode] = useState<CaptureMode>('smart');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [electronDisplays, setElectronDisplays] = useState<ElectronDisplayInfo[]>([]);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  const [history, setHistory] = useState<ScreenshotHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_HISTORY_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return [];
  });

  const [sourceDimensions, setSourceDimensions] = useState({ width: 1440, height: 860 });
  const [detectedBoxes, setDetectedBoxes] = useState<DetectedBox[]>([]);
  const [showManualOverlay, setShowManualOverlay] = useState(false);
  const [manualSeedBox, setManualSeedBox] = useState<DetectedBox | null>(null);

  const [artboardCandidates, setArtboardCandidates] = useState<ArtboardCandidate[] | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pastedPreviewUrl, setPastedPreviewUrl] = useState<string | null>(null);
  const [pastedMeta, setPastedMeta] = useState<string>('');

  const workspaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastCroppedRef = useRef<{ canvas: HTMLCanvasElement; appName: string } | null>(null);
  const sourceKindRef = useRef<'preset' | 'live' | 'upload'>('preset');
  const lastWindowLocalRectRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const lastDiagnosticsRef = useRef<CaptureDiagnostics | null>(null);

  const getBufferCanvas = useCallback((): HTMLCanvasElement => {
    if (!bufferCanvasRef.current) {
      bufferCanvasRef.current = document.createElement('canvas');
    }
    return bufferCanvasRef.current;
  }, []);

  const syncBufferToViewport = useCallback(() => {
    const buf = bufferCanvasRef.current;
    const view = workspaceCanvasRef.current;
    if (!buf || !view || buf.width === 0 || buf.height === 0) return;
    if (view.width !== buf.width) view.width = buf.width;
    if (view.height !== buf.height) view.height = buf.height;
    const ctx = view.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.drawImage(buf, 0, 0);
    }
  }, []);

  // Hydrate real Windows Electron settings, default folder, displays, and history
  useEffect(() => {
    if (!isDesktopApp || !window.electronAPI) return;
    const api = window.electronAPI;

    (async () => {
      try {
        const [displays, defaultFolder, diskSettings, diskHistory] = await Promise.all([
          api.getDisplays(),
          api.getDefaultOutputFolder(),
          api.loadSettings(),
          api.loadHistory(),
        ]);

        if (Array.isArray(displays)) setElectronDisplays(displays);
        if (diskSettings) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...diskSettings,
            saveFolderLabel: diskSettings.saveFolderLabel || defaultFolder,
          });
        } else if (defaultFolder) {
          setSettings((prev) => ({ ...prev, saveFolderLabel: defaultFolder }));
        }
        if (Array.isArray(diskHistory) && diskHistory.length > 0) {
          setHistory(diskHistory);
        }
      } catch {
        // ignore startup hydration error
      }
    })();
  }, []);

  // Poll foreground Windows application in Electron
  useEffect(() => {
    if (!isDesktopApp || !window.electronAPI || !settings.appDetectionEnabled) return;
    const api = window.electronAPI;

    const poll = async () => {
      try {
        const info = await api.getActiveDesignApp();
        if (info && info.appName) {
          setDetectedAppLabel(info.appName);
        }
      } catch {
        // ignore poll error
      }
    };

    poll();
    const timer = window.setInterval(poll, 1400);
    return () => window.clearInterval(timer);
  }, [settings.appDetectionEnabled]);

  // Persist settings & history (both localStorage and Electron userData JSON)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
    if (isDesktopApp && window.electronAPI) {
      window.electronAPI.saveSettings(settings).catch(() => {});
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history.slice(0, 40)));
    } catch {
      // ignore
    }
    if (isDesktopApp && window.electronAPI) {
      window.electronAPI.saveHistory(history.slice(0, 60)).catch(() => {});
    }
  }, [history]);

  const showToast = useCallback(
    (title: string, subtitle: string, meta?: string) => {
      if (!settings.showNotification || settings.captureWithoutNotification) return;

      if (isDesktopApp && window.electronAPI) {
        window.electronAPI.showToastNotification({ title, subtitle, meta }).catch(() => {});
        return;
      }

      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      setToast({ id: Date.now(), title, subtitle, meta });
      toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
    },
    [settings.showNotification, settings.captureWithoutNotification]
  );

  const runLiveDetection = useCallback(
    (
      canvas: HTMLCanvasElement,
      appId: DesignAppId,
      multi: boolean,
      windowLocalRectOverride?: { x: number; y: number; width: number; height: number } | null
    ) => {
      setDetectionStatus('Analyzing Boundaries...');
      const windowLocalRect =
        windowLocalRectOverride !== undefined
          ? windowLocalRectOverride
          : lastWindowLocalRectRef.current;

      const boxes = detectArtworkRegions(canvas, {
        appId,
        sensitivity: settings.detectionSensitivity,
        multiArtboard: multi,
        padding: settings.smartCropPadding,
        appDetectionEnabled: settings.appDetectionEnabled,
        windowLocalRect,
      });
      setDetectedBoxes(boxes);
      setDetectionStatus('Ready');
      return boxes;
    },
    [
      settings.detectionSensitivity,
      settings.smartCropPadding,
      settings.appDetectionEnabled,
    ]
  );

  const emitCaptureDiagnostics = useCallback(
    (
      sourceBox: DetectedBox | null,
      croppedCanvas: HTMLCanvasElement,
      modeLabel: string,
      appName: string
    ) => {
      const base = lastDiagnosticsRef.current;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const buf = bufferCanvasRef.current;
      const payload: CaptureDiagnostics = {
        monitorIndex: base?.monitorIndex ?? 0,
        monitorResolutionLogical:
          base?.monitorResolutionLogical ??
          (typeof window !== 'undefined' ? `${window.screen.width}×${window.screen.height}` : undefined),
        monitorResolutionPhysical:
          base?.monitorResolutionPhysical ??
          (buf && buf.width > 0 ? `${buf.width}×${buf.height}` : undefined),
        monitorOriginLogical: base?.monitorOriginLogical ?? '0,0',
        monitorOriginPhysical: base?.monitorOriginPhysical ?? '0,0',
        scaleFactor: base?.scaleFactor ?? dpr,
        windowsDpi: base?.windowsDpi ?? Math.round(dpr * 96),
        captureBitmapDimensions:
          base?.captureBitmapDimensions ??
          (buf && buf.width > 0 ? `${buf.width}×${buf.height}` : undefined),
        windowRectPhysical: base?.windowRectPhysical ?? null,
        windowLocalRect: base?.windowLocalRect ?? lastWindowLocalRectRef.current,
        detectedArtworkBox: sourceBox
          ? {
              x: sourceBox.x,
              y: sourceBox.y,
              width: sourceBox.width,
              height: sourceBox.height,
              confidence: Number(sourceBox.confidence.toFixed(3)),
              strategy: sourceBox.strategy,
            }
          : null,
        finalCropBox: sourceBox
          ? {
              x: sourceBox.x,
              y: sourceBox.y,
              width: sourceBox.width,
              height: sourceBox.height,
            }
          : {
              x: 0,
              y: 0,
              width: croppedCanvas.width,
              height: croppedCanvas.height,
            },
        finalCapturedDimensions: `${croppedCanvas.width}×${croppedCanvas.height}`,
      };

      console.info(
        `[SmartCapture Diagnostics] (${appName} · ${modeLabel}):`,
        payload
      );
      if (isDesktopApp && window.electronAPI?.logDiagnostics) {
        window.electronAPI.logDiagnostics(payload).catch(() => {});
      }
    },
    []
  );

  const loadCaptureDataUrlOntoCanvas = useCallback(
    (
      capture: ElectronCapturePayload,
      appInfo: ElectronActiveAppInfo | null,
      multi: boolean
    ): Promise<{ canvas: HTMLCanvasElement; boxes: DetectedBox[]; appName: string }> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const target = getBufferCanvas();
          target.width = img.width;
          target.height = img.height;
          const ctx = target.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0);
          }

          sourceKindRef.current = 'live';
          lastWindowLocalRectRef.current = capture.windowLocalRect ?? null;
          lastDiagnosticsRef.current = capture.diagnostics ?? {
            monitorIndex: capture.monitorIndex,
            scaleFactor: capture.scaleFactor,
            windowsDpi: capture.dpi,
            captureBitmapDimensions: `${img.width}×${img.height}`,
            windowLocalRect: capture.windowLocalRect ?? null,
          };

          syncBufferToViewport();

          const appId: DesignAppId = appInfo?.appId || 'live';
          const appName = appInfo?.appName || 'Windows Screen';
          setActiveAppId(appId);
          setDetectedAppLabel(appName);
          setSourceDimensions({ width: img.width, height: img.height });

          const boxes = runLiveDetection(
            target,
            appId,
            multi,
            capture.windowLocalRect ?? null
          );
          resolve({ canvas: target, boxes, appName });
        };
        img.onerror = () => reject(new Error('Failed to decode captured screen image'));
        img.src = capture.dataUrl;
      });
    },
    [getBufferCanvas, syncBufferToViewport, runLiveDetection]
  );

  // Load & render workspace preset
  const loadPresetScene = useCallback(
    async (presetId: DesignAppId) => {
      setErrorBanner(null);
      sourceKindRef.current = 'preset';
      lastWindowLocalRectRef.current = null;
      lastDiagnosticsRef.current = null;
      setActiveAppId(presetId);
      const preset = WORKSPACE_PRESETS.find((p) => p.id === presetId);
      setDetectedAppLabel(preset ? preset.appName : 'Design Workspace');
      setDetectionStatus('Rendering Scene...');

      const rendered = await renderDesignWorkspaceScene(presetId);
      const target = getBufferCanvas();
      target.width = rendered.width;
      target.height = rendered.height;
      const ctx = target.getContext('2d');
      if (ctx) ctx.drawImage(rendered, 0, 0);
      syncBufferToViewport();
      setSourceDimensions({ width: rendered.width, height: rendered.height });
      runLiveDetection(
        target,
        presetId,
        captureMode === 'multi' || presetId === 'illustrator',
        null
      );
    },
    [captureMode, getBufferCanvas, syncBufferToViewport, runLiveDetection]
  );

  useEffect(() => {
    if (sourceKindRef.current === 'preset' && activeAppId !== 'custom' && activeAppId !== 'live') {
      loadPresetScene(activeAppId);
    }
  }, [activeAppId, loadPresetScene]);

  // Re-draw viewport canvas when returning to Studio tab
  useEffect(() => {
    if (activeTab === 'studio') {
      syncBufferToViewport();
    }
  }, [activeTab, syncBufferToViewport]);

  // Re-run CV detection smoothly when sensitivity/padding or mode changes
  useEffect(() => {
    const target = bufferCanvasRef.current;
    if (target && target.width > 0) {
      runLiveDetection(target, activeAppId, captureMode === 'multi');
    }
  }, [
    captureMode,
    activeAppId,
    settings.detectionSensitivity,
    settings.smartCropPadding,
    settings.appDetectionEnabled,
    runLiveDetection,
  ]);

  const saveCanvasToHistoryAndDisk = useCallback(
    async (
      croppedCanvas: HTMLCanvasElement,
      filename: string,
      format: OutputFormat,
      appName: string,
      modeLabel: string,
      copied: boolean,
      saveToDisk: boolean
    ) => {
      const dataUrl = croppedCanvas.toDataURL('image/png');
      const now = new Date();
      const timestamp = now.toLocaleString();
      let finalFolderPath = `${settings.saveFolderLabel}\\${filename}`;

      if (saveToDisk) {
        const blob = await exportCanvasToBlob(croppedCanvas, format, settings.jpgQuality);
        if (isDesktopApp && window.electronAPI) {
          const base64Data = await blobToBase64(blob);
          const res = await window.electronAPI.saveFile({
            base64Data,
            filename,
            folderPath: settings.saveFolderLabel,
          });
          if (res?.filePath) finalFolderPath = res.filePath;
        } else {
          triggerBlobDownload(blob, filename);
        }
      }

      const item: ScreenshotHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        filename,
        format,
        width: croppedCanvas.width,
        height: croppedCanvas.height,
        appName,
        mode: modeLabel,
        folderPath: finalFolderPath,
        dataUrl,
        createdAt: timestamp,
        copiedToClipboard: copied,
      };
      setHistory((prev) => [item, ...prev]);
    },
    [settings.saveFolderLabel, settings.jpgQuality]
  );

  const finalizeCroppedCapture = useCallback(
    async (
      croppedCanvas: HTMLCanvasElement,
      modeLabel: string,
      sourceBox: DetectedBox | null,
      appNameOverride?: string
    ) => {
      const appName = appNameOverride || detectedAppLabel;
      emitCaptureDiagnostics(sourceBox, croppedCanvas, modeLabel, appName);
      lastCroppedRef.current = { canvas: croppedCanvas, appName };

      // MANDATORY CORE FEATURE: Immediate Native Windows Bitmap Clipboard Copy
      let copied = false;
      if (settings.autoCopyClipboard) {
        copied = await copyCanvasImageToClipboard(croppedCanvas);
      }

      const filename = generateArtworkFilename(
        settings.filenameTemplate,
        settings.defaultFormat,
        appName
      );

      // Record capture in history and write to disk only when Automatic Save is enabled
      await saveCanvasToHistoryAndDisk(
        croppedCanvas,
        filename,
        settings.defaultFormat,
        appName,
        modeLabel,
        copied,
        settings.autoSave
      );

      showToast(
        copied ? 'Artwork Captured & Copied to Clipboard' : 'Artwork Captured',
        settings.autoSave
          ? `Saved ${filename}${copied ? ' · Ready for Ctrl+V' : ''}`
          : copied
          ? 'Ready to paste with Ctrl+V'
          : 'Added to Capture History',
        `${appName} · ${croppedCanvas.width}×${croppedCanvas.height} px`
      );
    },
    [
      detectedAppLabel,
      emitCaptureDiagnostics,
      settings.autoCopyClipboard,
      settings.filenameTemplate,
      settings.defaultFormat,
      settings.autoSave,
      saveCanvasToHistoryAndDisk,
      showToast,
    ]
  );

  const runSmartCapture = useCallback(
    async (modeOverride?: CaptureMode, liveElectronPayload?: { capture: ElectronCapturePayload; appInfo: ElectronActiveAppInfo | null }) => {
      setErrorBanner(null);
      const effectiveMode = modeOverride || captureMode;

      if (effectiveMode === 'manual') {
        if (isDesktopApp && window.electronAPI) {
          await window.electronAPI.openManualOverlay({ initialBox: detectedBoxes[0] || null });
          return;
        }
        setManualSeedBox(detectedBoxes[0] || null);
        setShowManualOverlay(true);
        return;
      }

      let canvas = bufferCanvasRef.current;
      let currentAppId = activeAppId;
      let currentAppName = detectedAppLabel;
      let precomputedBoxes: DetectedBox[] | null = null;

      // In Electron desktop mode, capture the live Windows monitor automatically
      if (isDesktopApp && window.electronAPI) {
        try {
          const payload =
            liveElectronPayload ||
            (await window.electronAPI.captureScreen({ selectedMonitor: settings.selectedMonitor }));
          const loaded = await loadCaptureDataUrlOntoCanvas(
            payload.capture,
            payload.appInfo,
            effectiveMode === 'multi'
          );
          canvas = loaded.canvas;
          precomputedBoxes = loaded.boxes;
          currentAppId = payload.appInfo?.appId || 'live';
          currentAppName = loaded.appName;
        } catch (err) {
          setErrorBanner(err instanceof Error ? err.message : 'Failed to capture Windows screen.');
          return;
        }
      }

      if (!canvas || canvas.width === 0) return;

      // Optional Gemini AI Boundary Detection when enabled
      if (settings.aiDetectionEnabled) {
        setDetectionStatus('AI Analyzing Boundaries...');
        try {
          const jpegBase64 = canvas.toDataURL('image/jpeg', 0.85);
          const resp = await fetch('/api/detect-artwork', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: jpegBase64,
              mimeType: 'image/jpeg',
              appName: currentAppName,
              multiArtboard: effectiveMode === 'multi',
            }),
          });
          const data = await resp.json();
          if (!resp.ok) {
            setDetectionStatus('Ready');
            setErrorBanner(data.error || 'AI boundary detection returned an error.');
            return;
          }
          const aiBoxes: DetectedBox[] = (data.regions || []).map(
            (
              r: { label: string; ymin: number; xmin: number; ymax: number; xmax: number },
              idx: number
            ) => {
              const x = Math.max(0, Math.round((r.xmin / 1000) * canvas!.width) - settings.smartCropPadding);
              const y = Math.max(0, Math.round((r.ymin / 1000) * canvas!.height) - settings.smartCropPadding);
              const x2 = Math.min(canvas!.width, Math.round((r.xmax / 1000) * canvas!.width) + settings.smartCropPadding);
              const y2 = Math.min(canvas!.height, Math.round((r.ymax / 1000) * canvas!.height) + settings.smartCropPadding);
              return {
                id: `ai-${idx + 1}`,
                x,
                y,
                width: Math.max(20, x2 - x),
                height: Math.max(20, y2 - y),
                confidence: 0.96,
                label: r.label || `AI Artwork ${idx + 1}`,
                strategy: 'gemini-vision',
              };
            }
          );

          setDetectionStatus('Ready');
          if (aiBoxes.length > 0) {
            setDetectedBoxes(aiBoxes);
            if (effectiveMode === 'multi' && aiBoxes.length > 1) {
              const cands = aiBoxes.map((b) => ({
                box: b,
                previewUrl: cropCanvas(canvas!, b).toDataURL('image/png'),
              }));
              if (isDesktopApp && window.electronAPI) {
                window.electronAPI.setMainWindowVisible(true).catch(() => {});
              }
              setArtboardCandidates(cands);
              return;
            }
            const cropped = cropCanvas(canvas, aiBoxes[0]);
            await finalizeCroppedCapture(cropped, 'AI Smart Capture', aiBoxes[0], currentAppName);
            return;
          }
        } catch (err) {
          setDetectionStatus('Ready');
          setErrorBanner(
            err instanceof Error ? err.message : 'Failed to connect to AI detection endpoint.'
          );
          return;
        }
      }

      // Standard Offline Computer Vision Smart Detection
      const boxes =
        precomputedBoxes ||
        runLiveDetection(canvas, currentAppId, effectiveMode === 'multi');
      if (effectiveMode === 'multi' && boxes.length > 1) {
        const cands: ArtboardCandidate[] = boxes.map((b) => ({
          box: b,
          previewUrl: cropCanvas(canvas!, b).toDataURL('image/png'),
        }));
        if (isDesktopApp && window.electronAPI) {
          window.electronAPI.setMainWindowVisible(true).catch(() => {});
        }
        setArtboardCandidates(cands);
        return;
      }

      const best = boxes[0];
      if (best) {
        const cropped = cropCanvas(canvas, best);
        const label = effectiveMode === 'page' ? 'Page / Artboard' : 'Smart Auto';
        await finalizeCroppedCapture(cropped, label, best, currentAppName);
      }
    },
    [
      captureMode,
      detectedBoxes,
      activeAppId,
      detectedAppLabel,
      settings.selectedMonitor,
      settings.aiDetectionEnabled,
      settings.smartCropPadding,
      loadCaptureDataUrlOntoCanvas,
      runLiveDetection,
      finalizeCroppedCapture,
    ]
  );

  const runActiveWindowCapture = useCallback(
    async (liveElectronPayload?: { capture: ElectronCapturePayload; appInfo: ElectronActiveAppInfo | null }) => {
      if (isDesktopApp && window.electronAPI) {
        try {
          const payload = liveElectronPayload || (await window.electronAPI.captureActiveWindow());
          const loaded = await loadCaptureDataUrlOntoCanvas(payload.capture, payload.appInfo, false);
          const winRect = payload.capture.windowLocalRect;
          let outCanvas = loaded.canvas;
          let outBox: DetectedBox | null = null;
          if (
            winRect &&
            winRect.width > 80 &&
            winRect.height > 80 &&
            (winRect.width < loaded.canvas.width || winRect.height < loaded.canvas.height)
          ) {
            outBox = {
              id: 'active-window',
              x: winRect.x,
              y: winRect.y,
              width: winRect.width,
              height: winRect.height,
              confidence: 1,
              label: `${loaded.appName} Window`,
              strategy: 'active-window-rect',
            };
            outCanvas = cropCanvas(loaded.canvas, outBox);
          }
          await finalizeCroppedCapture(outCanvas, 'Active Window', outBox, loaded.appName);
          return;
        } catch (err) {
          setErrorBanner(err instanceof Error ? err.message : 'Active window capture failed.');
          return;
        }
      }

      const canvas = bufferCanvasRef.current;
      if (!canvas || canvas.width === 0) return;
      const fullBox: DetectedBox = {
        id: 'active-window',
        x: 0,
        y: 0,
        width: canvas.width,
        height: Math.max(100, canvas.height - 42),
        confidence: 1,
        label: `${detectedAppLabel} Window`,
        strategy: 'active-window',
      };
      const cropped = cropCanvas(canvas, fullBox);
      await finalizeCroppedCapture(cropped, 'Active Window', fullBox);
    },
    [detectedAppLabel, loadCaptureDataUrlOntoCanvas, finalizeCroppedCapture]
  );

  const handleQuickSave = useCallback(async () => {
    const last = lastCroppedRef.current;
    if (!last) {
      await runSmartCapture('smart');
      return;
    }
    const fname = generateArtworkFilename(
      settings.filenameTemplate,
      settings.defaultFormat,
      last.appName
    );
    await saveCanvasToHistoryAndDisk(
      last.canvas,
      fname,
      settings.defaultFormat,
      last.appName,
      'Quick Save',
      true,
      true
    );
    showToast('✓ Quick Saved', fname, settings.saveFolderLabel);
  }, [
    runSmartCapture,
    settings.filenameTemplate,
    settings.defaultFormat,
    settings.saveFolderLabel,
    saveCanvasToHistoryAndDisk,
    showToast,
  ]);

  // Listen to Electron global hotkeys & native fullscreen manual overlay confirmation
  useEffect(() => {
    if (!isDesktopApp || !window.electronAPI) return;
    const api = window.electronAPI;

    const unsubHotkey = api.onHotkeyCapture(async (payload) => {
      if (payload.mode === 'quickSave') {
        await handleQuickSave();
      } else if (payload.mode === 'activeWindow' && payload.capture) {
        await runActiveWindowCapture({
          capture: payload.capture,
          appInfo: payload.appInfo || null,
        });
      } else if (payload.mode === 'multi' && payload.capture) {
        setCaptureMode('multi');
        await runSmartCapture('multi', {
          capture: payload.capture,
          appInfo: payload.appInfo || null,
        });
      } else if (payload.capture) {
        setCaptureMode('smart');
        await runSmartCapture('smart', {
          capture: payload.capture,
          appInfo: payload.appInfo || null,
        });
      }
    });

    const unsubOverlay = api.onManualOverlayResult(async (payload) => {
      if (payload.cancelled) return;
      const loaded = await loadCaptureDataUrlOntoCanvas(payload.capture, payload.appInfo, false);
      const box: DetectedBox = {
        id: 'manual-overlay',
        x: payload.box.x,
        y: payload.box.y,
        width: payload.box.width,
        height: payload.box.height,
        confidence: 1,
        label: 'Manual Selection',
        strategy: 'manual',
      };
      const cropped = cropCanvas(loaded.canvas, box);
      await finalizeCroppedCapture(cropped, 'Manual Selection', box, loaded.appName);
    });

    return () => {
      unsubHotkey();
      unsubOverlay();
    };
  }, [
    handleQuickSave,
    runActiveWindowCapture,
    runSmartCapture,
    loadCaptureDataUrlOntoCanvas,
    finalizeCroppedCapture,
  ]);

  // Browser Keyboard Shortcuts & Paste Verification Handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showManualOverlay || isDesktopApp) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.ctrlKey && e.shiftKey) {
        const k = e.key.toLowerCase();
        if (k === 's') {
          e.preventDefault();
          runSmartCapture('smart');
        } else if (k === 'm') {
          e.preventDefault();
          setCaptureMode('manual');
          setManualSeedBox(detectedBoxes[0] || null);
          setShowManualOverlay(true);
        } else if (k === 'w') {
          e.preventDefault();
          runActiveWindowCapture();
        } else if (k === 'a') {
          e.preventDefault();
          setCaptureMode('multi');
          runSmartCapture('multi');
        } else if (k === 'q') {
          e.preventDefault();
          handleQuickSave();
        } else if (k === 'o') {
          e.preventDefault();
          setActiveTab('history');
        }
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              setPastedPreviewUrl(reader.result);
              setPastedMeta(
                `Pasted from OS Clipboard (${(blob.size / 1024).toFixed(1)} KB · ${blob.type})`
              );
            }
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [
    showManualOverlay,
    detectedBoxes,
    runSmartCapture,
    runActiveWindowCapture,
    handleQuickSave,
  ]);

  const handleUploadScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorBanner(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const target = getBufferCanvas();
        target.width = img.width;
        target.height = img.height;
        const ctx = target.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0);
        }
        sourceKindRef.current = 'upload';
        lastWindowLocalRectRef.current = null;
        lastDiagnosticsRef.current = {
          captureBitmapDimensions: `${img.width}×${img.height}`,
        };
        syncBufferToViewport();
        setActiveAppId('custom');
        setDetectedAppLabel(file.name.replace(/\.[^.]+$/, ''));
        setSourceDimensions({ width: img.width, height: img.height });
        runLiveDetection(target, 'custom', captureMode === 'multi', null);
      };
      if (typeof reader.result === 'string') img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLiveScreenCapture = async () => {
    setErrorBanner(null);
    if (isDesktopApp && window.electronAPI) {
      try {
        const payload = await window.electronAPI.captureScreen({
          selectedMonitor: settings.selectedMonitor,
        });
        await loadCaptureDataUrlOntoCanvas(
          payload.capture,
          payload.appInfo,
          captureMode === 'multi'
        );
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Screen capture failed.');
      }
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErrorBanner('Screen capture API is not available in this browser context.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'window' } as MediaTrackConstraints,
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const target = getBufferCanvas();
      target.width = video.videoWidth || 1440;
      target.height = video.videoHeight || 900;
      const ctx = target.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(video, 0, 0, target.width, target.height);
      }
      sourceKindRef.current = 'live';
      lastWindowLocalRectRef.current = null;
      lastDiagnosticsRef.current = {
        captureBitmapDimensions: `${target.width}×${target.height}`,
      };
      syncBufferToViewport();
      setActiveAppId('live');
      setDetectedAppLabel('Live Monitor Capture');
      setSourceDimensions({ width: target.width, height: target.height });
      runLiveDetection(target, 'live', captureMode === 'multi', null);
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // User cancelled display share dialog
    }
  };

  const handleBatchAllArtboards = async () => {
    const canvas = bufferCanvasRef.current;
    if (!artboardCandidates || !canvas || canvas.width === 0) return;
    for (let i = 0; i < artboardCandidates.length; i++) {
      const cand = artboardCandidates[i];
      const cropped = cropCanvas(canvas, cand.box);
      const fname = generateArtworkFilename(
        settings.filenameTemplate,
        settings.defaultFormat,
        detectedAppLabel,
        `_Artboard${i + 1}`
      );
      await saveCanvasToHistoryAndDisk(
        cropped,
        fname,
        settings.defaultFormat,
        detectedAppLabel,
        `Batch Artboard ${i + 1}`,
        false,
        true
      );
    }
    setArtboardCandidates(null);
    showToast(
      `✓ Captured ${artboardCandidates.length} Artboards`,
      'Batch exported all visible pages',
      settings.saveFolderLabel
    );
  };

  const handleOpenFolder = async () => {
    if (isDesktopApp && window.electronAPI) {
      await window.electronAPI.openOutputFolder(settings.saveFolderLabel);
      return;
    }
    setActiveTab('history');
  };

  return (
    <div className="flex min-h-screen bg-[#0B0E14] text-slate-100">
      {/* Left Navigation Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800/90 bg-[#0E121B] px-4 py-5 lg:flex">
        <div className="px-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Crop className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-slate-100">
              Smart Artwork Screenshot
            </span>
          </div>
          <p className="mt-2 px-0.5 text-xs text-slate-400">
            {isDesktopApp
              ? 'Windows Desktop · Background Tray & Native Clipboard Active'
              : 'Precision design canvas capture & auto-clipboard engine'}
          </p>
        </div>

        <nav className="mt-7 flex-1 space-y-1">
          {[
            { id: 'studio' as const, label: 'Capture Studio', icon: Scan },
            { id: 'history' as const, label: `Screenshot History (${history.length})`, icon: History },
            { id: 'settings' as const, label: 'Settings & Hotkeys', icon: SettingsIcon },
            { id: 'windows' as const, label: 'Windows App (.exe)', icon: AppWindow },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#1A2130] font-semibold text-white'
                    : 'text-slate-400 hover:bg-[#141A26] hover:text-slate-200'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-slate-800/90 pt-4">
          <button
            type="button"
            onClick={handleOpenFolder}
            className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-[#121722] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            <FolderOpen className="h-3.5 w-3.5 text-slate-400" />
            <span className="truncate">Output Folder</span>
          </button>
          {!isDesktopApp && (
            <a
              href="/api/download-electron-app"
              download="SmartArtworkScreenshot-Electron-Windows.zip"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600/15 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/25"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Electron .EXE Src</span>
            </a>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: 3 Clean Zones */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/90 bg-[#0E121B]/80 px-6 py-3.5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="font-semibold text-slate-100 whitespace-nowrap shrink-0">
              Detected Application: {detectedAppLabel}
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="font-medium text-indigo-300 whitespace-nowrap shrink-0">
              Artwork Detection: {detectionStatus}
            </span>
          </div>

          <div className="flex items-center gap-4 lg:hidden">
            {(['studio', 'history', 'settings', 'windows'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`text-xs font-medium capitalize whitespace-nowrap shrink-0 ${
                  activeTab === tab ? 'text-white underline underline-offset-4' : 'text-slate-400'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-[#121722] px-2.5 py-1.5 text-xs text-slate-300 sm:flex">
              <Monitor className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={settings.selectedMonitor}
                onChange={(e) => setSettings({ ...settings, selectedMonitor: e.target.value })}
                aria-label="Select monitor"
                className="bg-transparent text-xs text-slate-200 focus:outline-none"
              >
                <option value="active" className="bg-[#121722]">
                  Active Monitor
                </option>
                {electronDisplays.length > 0 ? (
                  electronDisplays.map((d, idx) => (
                    <option
                      key={d.id}
                      value={idx === 0 ? 'mon1' : idx === 1 ? 'mon2' : `mon${idx + 1}`}
                      className="bg-[#121722]"
                    >
                      {d.label}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="mon1" className="bg-[#121722]">
                      Monitor 1 · 2560×1440
                    </option>
                    <option value="mon2" className="bg-[#121722]">
                      Monitor 2 · 1920×1080
                    </option>
                  </>
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={() => runSmartCapture()}
              className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Smart Capture ({settings.hotkeys.smartCapture})</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {errorBanner && (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
              <span>{errorBanner}</span>
              <button
                type="button"
                onClick={() => setErrorBanner(null)}
                className="font-semibold text-red-100 hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeTab === 'studio' && (
            <div className="space-y-5">
              {/* Workspace Source & Mode Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#121722] p-4">
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-[#0B0E14] p-1">
                  {WORKSPACE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => loadPresetScene(preset.id)}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeAppId === preset.id
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {preset.appName}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadScreenshot}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <Upload className="h-3.5 w-3.5 text-slate-400" /> Upload Design Screen
                  </button>
                  <button
                    type="button"
                    onClick={handleLiveScreenCapture}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    <Monitor className="h-3.5 w-3.5 text-slate-400" /> Capture Real Screen
                  </button>
                </div>
              </div>

              {/* Capture Modes Action Strip */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    id: 'smart' as const,
                    title: 'Mode 1 · Smart Auto Capture',
                    desc: 'Auto-crops only artwork, removes menus, toolbars, rulers & taskbar',
                    icon: Scan,
                    action: () => {
                      setCaptureMode('smart');
                      runSmartCapture('smart');
                    },
                  },
                  {
                    id: 'manual' as const,
                    title: 'Mode 2 · Manual Selection',
                    desc: 'Drag, resize, move, arrow-nudge 1px, Enter to capture',
                    icon: Crop,
                    action: () => {
                      setCaptureMode('manual');
                      if (isDesktopApp && window.electronAPI) {
                        window.electronAPI.openManualOverlay({
                          initialBox: detectedBoxes[0] || null,
                        });
                      } else {
                        setManualSeedBox(detectedBoxes[0] || null);
                        setShowManualOverlay(true);
                      }
                    },
                  },
                  {
                    id: 'page' as const,
                    title: 'Mode 3 · Page / Artboard',
                    desc: 'Targets CorelDRAW page, Illustrator artboard, or Photoshop canvas',
                    icon: AppWindow,
                    action: () => {
                      setCaptureMode('page');
                      runSmartCapture('page');
                    },
                  },
                  {
                    id: 'multi' as const,
                    title: 'Mode 4 · Multi-Artboard',
                    desc: 'Detects all visible artboards and batch-exports pages',
                    icon: Layers,
                    action: () => {
                      setCaptureMode('multi');
                      runSmartCapture('multi');
                    },
                  },
                ].map((m) => {
                  const Icon = m.icon;
                  const active = captureMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={m.action}
                      className={`flex flex-col items-start rounded-xl border p-4 text-left transition-colors ${
                        active
                          ? 'border-indigo-500/70 bg-[#161D2C]'
                          : 'border-slate-800 bg-[#121722] hover:border-slate-700'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-xs font-semibold text-slate-100">{m.title}</span>
                        <Icon
                          className={`h-4 w-4 ${active ? 'text-indigo-400' : 'text-slate-500'}`}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{m.desc}</p>
                    </button>
                  );
                })}
              </div>

              {/* Main Interactive Monitor Canvas + Right Workflow Panel */}
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
                <div className="xl:col-span-9">
                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#07090E]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#101520] px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="font-semibold text-slate-100">Monitor Viewport</span>
                        <span className="text-slate-600" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono tabular-nums text-slate-400">
                          {sourceDimensions.width} × {sourceDimensions.height} px
                        </span>
                        {detectedBoxes[0] && (
                          <>
                            <span className="text-slate-600" aria-hidden="true">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-indigo-300">
                              Detected Artwork: {detectedBoxes[0].width} × {detectedBoxes[0].height} px
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => runActiveWindowCapture()}
                          className="whitespace-nowrap rounded-md border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                        >
                          Active Window
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSettings({
                              ...settings,
                              aiDetectionEnabled: !settings.aiDetectionEnabled,
                            })
                          }
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-[11px] font-medium ${
                            settings.aiDetectionEnabled
                              ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200'
                              : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          <Sparkles className="h-3 w-3" />
                          {settings.aiDetectionEnabled ? 'AI Detection: On' : 'AI Detection: Off'}
                        </button>
                      </div>
                    </div>

                    {/* Full Application Screen Canvas with Live Detected Bounding Overlay */}
                    <div className="relative w-full bg-[#07090E]">
                      <canvas
                        ref={workspaceCanvasRef}
                        className="block h-auto w-full select-none"
                      />

                      {/* Live Detected Artwork Boundary Highlight(s) */}
                      {!showManualOverlay &&
                        detectedBoxes.map((box) => (
                          <button
                            key={box.id}
                            type="button"
                            onClick={async () => {
                              const canvas = bufferCanvasRef.current;
                              if (!canvas || canvas.width === 0) return;
                              const cropped = cropCanvas(canvas, box);
                              await finalizeCroppedCapture(cropped, box.label, box);
                            }}
                            title="Click to capture and copy this detected artwork"
                            style={{
                              left: `${(box.x / sourceDimensions.width) * 100}%`,
                              top: `${(box.y / sourceDimensions.height) * 100}%`,
                              width: `${(box.width / sourceDimensions.width) * 100}%`,
                              height: `${(box.height / sourceDimensions.height) * 100}%`,
                            }}
                            className="group absolute border-2 border-indigo-400 bg-indigo-500/5 transition-colors hover:bg-indigo-500/10"
                          >
                            <span className="pointer-events-none absolute -top-7 left-0 whitespace-nowrap rounded bg-indigo-600 px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white shadow">
                              {box.label} · {box.width}×{box.height}
                            </span>
                          </button>
                        ))}

                      {showManualOverlay && (
                        <ManualSelectionOverlay
                          canvasWidth={sourceDimensions.width}
                          canvasHeight={sourceDimensions.height}
                          initialBox={manualSeedBox}
                          onConfirm={async (box) => {
                            setShowManualOverlay(false);
                            const canvas = bufferCanvasRef.current;
                            if (!canvas || canvas.width === 0) return;
                            const cropped = cropCanvas(canvas, box);
                            await finalizeCroppedCapture(cropped, 'Manual Selection', box);
                          }}
                          onCancel={() => setShowManualOverlay(false)}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Auto-Copy Settings & Ctrl+V Paste Verification */}
                <div className="space-y-4 xl:col-span-3">
                  <div className="rounded-xl border border-slate-800 bg-[#121722] p-4">
                    <h3 className="text-xs font-semibold text-slate-100">
                      Automatic Clipboard Workflow
                    </h3>
                    <div className="mt-3 space-y-2.5">
                      {[
                        {
                          key: 'autoCopyClipboard' as const,
                          label: 'Automatically copy screenshot to clipboard',
                        },
                        {
                          key: 'autoSave' as const,
                          label: 'Automatically save screenshot',
                        },
                        {
                          key: 'showNotification' as const,
                          label: 'Show capture notification',
                        },
                      ].map((opt) => (
                        <label
                          key={opt.key}
                          className="flex cursor-pointer items-start gap-2.5 text-xs text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={settings[opt.key]}
                            onChange={(e) =>
                              setSettings({ ...settings, [opt.key]: e.target.checked })
                            }
                            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-indigo-600"
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Ctrl+V Paste Target Check */}
                  <div className="rounded-xl border border-slate-800 bg-[#121722] p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-100">
                        Paste Verification Target
                      </h3>
                      <ClipboardPaste className="h-3.5 w-3.5 text-indigo-400" />
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      After capturing, press <span className="font-mono text-slate-200">Ctrl+V</span>{' '}
                      here (or in PowerPoint, WhatsApp, Word, Photoshop) to verify the bitmap
                      clipboard image.
                    </p>

                    <div
                      tabIndex={0}
                      className="mt-3 flex min-h-[168px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-[#07090E] p-3 text-center focus:border-indigo-500 focus:outline-none"
                    >
                      {pastedPreviewUrl ? (
                        <div className="space-y-2">
                          <img
                            src={pastedPreviewUrl}
                            alt="Pasted clipboard verification"
                            className="mx-auto max-h-36 rounded object-contain"
                          />
                          <p className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300">
                            <Check className="h-3 w-3" /> {pastedMeta}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          Click here and press Ctrl+V after capture
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <HistoryView
              items={history}
              onCopyItem={async (item) => {
                const img = new Image();
                img.onload = async () => {
                  const c = document.createElement('canvas');
                  c.width = img.width;
                  c.height = img.height;
                  c.getContext('2d')?.drawImage(img, 0, 0);
                  const ok = await copyCanvasImageToClipboard(c);
                  if (ok) {
                    showToast('✓ Copied to Clipboard', item.filename, `${item.width}×${item.height} px`);
                  }
                };
                img.src = item.dataUrl;
              }}
              onDownloadItem={async (item) => {
                const img = new Image();
                img.onload = async () => {
                  const c = document.createElement('canvas');
                  c.width = img.width;
                  c.height = img.height;
                  c.getContext('2d')?.drawImage(img, 0, 0);
                  const blob = await exportCanvasToBlob(c, item.format, settings.jpgQuality);
                  if (isDesktopApp && window.electronAPI) {
                    const base64Data = await blobToBase64(blob);
                    await window.electronAPI.saveFileAs({
                      base64Data,
                      defaultFilename: item.filename,
                      format: item.format,
                      defaultFolder: settings.saveFolderLabel,
                    });
                  } else {
                    triggerBlobDownload(blob, item.filename);
                  }
                };
                img.src = item.dataUrl;
              }}
              onDeleteItem={(id) => setHistory((prev) => prev.filter((x) => x.id !== id))}
              onOpenFolder={handleOpenFolder}
              onRecapture={() => {
                setActiveTab('studio');
                runSmartCapture('smart');
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              displays={electronDisplays}
              onBrowseFolder={
                isDesktopApp && window.electronAPI
                  ? async () => {
                      const chosen = await window.electronAPI!.chooseOutputFolder(
                        settings.saveFolderLabel
                      );
                      if (chosen) {
                        setSettings({ ...settings, saveFolderLabel: chosen });
                      }
                    }
                  : undefined
              }
              onChange={setSettings}
              onResetDefaults={() => setSettings(DEFAULT_SETTINGS)}
            />
          )}

          {activeTab === 'windows' && <WindowsDesktopPackageView />}
        </main>
      </div>

      {/* Multi-Artboard Picker Modal */}
      {artboardCandidates && (
        <ArtboardPickerModal
          candidates={artboardCandidates}
          appName={detectedAppLabel}
          onSelectOne={async (cand) => {
            setArtboardCandidates(null);
            const canvas = bufferCanvasRef.current;
            if (!canvas || canvas.width === 0) return;
            const cropped = cropCanvas(canvas, cand.box);
            await finalizeCroppedCapture(cropped, cand.box.label, cand.box);
          }}
          onBatchAll={handleBatchAllArtboards}
          onClose={() => setArtboardCandidates(null)}
        />
      )}

      {/* Compact Capture Notification Toast */}
      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
