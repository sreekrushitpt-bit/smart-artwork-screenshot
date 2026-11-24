import { AppSettings, HotkeyBindings, OutputFormat } from '../types/screenshot';
import { ElectronDisplayInfo } from '../types/electron';

interface SettingsViewProps {
  settings: AppSettings;
  displays?: ElectronDisplayInfo[];
  onBrowseFolder?: () => void;
  onChange: (next: AppSettings) => void;
  onResetDefaults: () => void;
}

export function SettingsView({
  settings,
  displays = [],
  onBrowseFolder,
  onChange,
  onResetDefaults,
}: SettingsViewProps) {
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  const updateHotkey = (key: keyof HotkeyBindings, value: string) => {
    onChange({
      ...settings,
      hotkeys: {
        ...settings.hotkeys,
        [key]: value,
      },
    });
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Settings & Capture Preferences</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Default workflow: Auto Capture → Smart Crop → Copy to Clipboard → Ready to Paste
          </p>
        </div>
        <button
          type="button"
          onClick={onResetDefaults}
          className="whitespace-nowrap rounded-lg border border-slate-700 bg-[#121722] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
        >
          Reset Defaults
        </button>
      </div>

      {/* Mandatory Clipboard & Workflow Options */}
      <section className="rounded-xl border border-slate-800 bg-[#121722] p-6">
        <h3 className="text-sm font-semibold text-slate-100">
          Automatic Clipboard & Capture Workflow
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            {
              key: 'autoCopyClipboard' as const,
              label: 'Automatically copy screenshot to clipboard',
              hint: 'Copies raw image pixels immediately after smart crop for Ctrl+V',
            },
            {
              key: 'autoSave' as const,
              label: 'Automatically save screenshot',
              hint: 'Saves directly to your configured output folder',
            },
            {
              key: 'showNotification' as const,
              label: 'Show capture notification',
              hint: 'Displays non-intrusive corner toast on capture',
            },
            {
              key: 'captureWithoutNotification' as const,
              label: 'Capture without notification',
              hint: 'Suppresses toast popups for silent continuous workflow',
            },
            {
              key: 'startWithWindows' as const,
              label: 'Start with Windows',
              hint: 'Launches tray listener automatically on Windows login',
            },
          ].map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800/80 bg-[#0B0E14] p-3.5 hover:border-slate-700"
            >
              <input
                type="checkbox"
                checked={settings[item.key]}
                onChange={(e) => update(item.key, e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <p className="text-xs font-semibold text-slate-100">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.hint}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Detection & Output Parameters */}
      <section className="rounded-xl border border-slate-800 bg-[#121722] p-6">
        <h3 className="text-sm font-semibold text-slate-100">
          Detection Engine & Output Format
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="sensitivity-range" className="font-medium text-slate-300">
                Automatic Detection Sensitivity
              </label>
              <span className="font-mono tabular-nums text-indigo-300">
                {settings.detectionSensitivity}%
              </span>
            </div>
            <input
              id="sensitivity-range"
              type="range"
              min={15}
              max={95}
              value={settings.detectionSensitivity}
              onChange={(e) => update('detectionSensitivity', Number(e.target.value))}
              className="mt-2 w-full accent-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="padding-range" className="font-medium text-slate-300">
                Smart Crop Padding
              </label>
              <span className="font-mono tabular-nums text-indigo-300">
                {settings.smartCropPadding} px
              </span>
            </div>
            <input
              id="padding-range"
              type="range"
              min={-16}
              max={32}
              value={settings.smartCropPadding}
              onChange={(e) => update('smartCropPadding', Number(e.target.value))}
              className="mt-2 w-full accent-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="default-format" className="block text-xs font-medium text-slate-300">
              Default Output Format
            </label>
            <select
              id="default-format"
              value={settings.defaultFormat}
              onChange={(e) => update('defaultFormat', e.target.value as OutputFormat)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="PNG">PNG (Lossless — Recommended for Print/Design)</option>
              <option value="JPG">JPG (High Quality)</option>
              <option value="BMP">BMP (Uncompressed Bitmap)</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="jpg-quality" className="font-medium text-slate-300">
                Screenshot JPG Quality
              </label>
              <span className="font-mono tabular-nums text-indigo-300">{settings.jpgQuality}%</span>
            </div>
            <input
              id="jpg-quality"
              type="range"
              min={60}
              max={100}
              value={settings.jpgQuality}
              onChange={(e) => update('jpgQuality', Number(e.target.value))}
              className="mt-2 w-full accent-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="save-folder" className="block text-xs font-medium text-slate-300">
              Save Folder Path
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="save-folder"
                type="text"
                value={settings.saveFolderLabel}
                onChange={(e) => update('saveFolderLabel', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
              {onBrowseFolder && (
                <button
                  type="button"
                  onClick={onBrowseFolder}
                  className="whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  Browse
                </button>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="filename-template" className="block text-xs font-medium text-slate-300">
              Filename Format Template
            </label>
            <input
              id="filename-template"
              type="text"
              value={settings.filenameTemplate}
              onChange={(e) => update('filenameTemplate', e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="monitor-select" className="block text-xs font-medium text-slate-300">
              Multi-Monitor Target
            </label>
            <select
              id="monitor-select"
              value={settings.selectedMonitor}
              onChange={(e) => update('selectedMonitor', e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="active">Auto-Detect Active Design Monitor</option>
              {displays.length > 0 ? (
                displays.map((d, idx) => (
                  <option key={d.id} value={idx === 0 ? 'mon1' : idx === 1 ? 'mon2' : `mon${idx + 1}`}>
                    {d.label}
                  </option>
                ))
              ) : (
                <>
                  <option value="mon1">Monitor 1 · Primary 2560×1440 (DisplayPort)</option>
                  <option value="mon2">Monitor 2 · Secondary 1920×1080 (HDMI)</option>
                </>
              )}
              <option value="all">All Monitors (Virtual Desktop Span)</option>
            </select>
          </div>

          <div className="flex flex-col justify-end gap-2.5">
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={settings.appDetectionEnabled}
                onChange={(e) => update('appDetectionEnabled', e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-600"
              />
              Enable Active Design Application Detection
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-200">
              <input
                type="checkbox"
                checked={settings.aiDetectionEnabled}
                onChange={(e) => update('aiDetectionEnabled', e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-600"
              />
              Enable Optional AI Boundary Detection (Gemini Vision)
            </label>
          </div>
        </div>
      </section>

      {/* Customizable Shortcuts */}
      <section className="rounded-xl border border-slate-800 bg-[#121722] p-6">
        <h3 className="text-sm font-semibold text-slate-100">
          Global Windows Shortcuts
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Non-conflicting defaults chosen to avoid CorelDRAW, Photoshop, and Illustrator shortcuts.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { key: 'smartCapture' as const, label: 'Smart Capture' },
            { key: 'manualCapture' as const, label: 'Manual Capture' },
            { key: 'activeWindow' as const, label: 'Capture Active Window' },
            { key: 'selectedArtwork' as const, label: 'Capture Selected Artwork' },
            { key: 'quickSave' as const, label: 'Quick Save' },
            { key: 'openFolder' as const, label: 'Open Screenshot Folder' },
          ].map((hk) => (
            <div key={hk.key}>
              <label className="block text-xs font-medium text-slate-300">{hk.label}</label>
              <input
                type="text"
                value={settings.hotkeys[hk.key]}
                onChange={(e) => updateHotkey(hk.key, e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 font-mono text-xs text-indigo-300 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
