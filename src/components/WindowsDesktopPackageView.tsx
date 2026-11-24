import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileCode2, Terminal } from 'lucide-react';

interface SourceFileEntry {
  path: string;
  size: number;
  content: string;
}

export function WindowsDesktopPackageView() {
  const [files, setFiles] = useState<SourceFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>('electron/main.cjs');
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    fetch('/api/electron-files')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.files) && data.files.length > 0) {
          setFiles(data.files);
          const preferred = data.files.find((f: SourceFileEntry) => f.path === 'electron/main.cjs');
          if (preferred) setSelectedPath(preferred.path);
          else setSelectedPath(data.files[0].path);
        }
      })
      .catch(() => {});
  }, []);

  const activeFile = files.find((f) => f.path === selectedPath);
  const buildCommands = `npm install
npm run electron:dev

# Build standalone Windows 10/11 NSIS installer (.exe) & Portable .exe:
npm run dist:win`;

  const copyBuildCommands = async () => {
    try {
      await navigator.clipboard.writeText(buildCommands);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      {/* Download & Build Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#121722] p-6">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-100">
            Electron Windows 10 / 11 Desktop Application & .EXE Installer
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Complete Electron + React + Vite + Electron Builder desktop project featuring native
            Windows screen capture (<span className="font-mono">desktopCapturer</span>), Win32
            foreground app detection (CorelDRAW, Photoshop, Illustrator, InDesign), system-wide
            global hotkeys, native <span className="font-mono">CF_DIB</span> bitmap clipboard
            copying, fullscreen manual selection overlay, and NSIS Windows{' '}
            <span className="font-mono">.exe</span> installer packaging.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/download-windows-exe"
            download="SmartArtworkScreenshot-Win64-Executable.zip"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <Download className="h-4 w-4" /> Download Windows x64 Executable (.exe)
          </a>
          <a
            href="/api/download-electron-app"
            download="SmartArtworkScreenshot-Electron-Windows.zip"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <Download className="h-4 w-4" /> Download Full Source (.zip)
          </a>
        </div>
      </div>

      {/* Build & Clipboard Architecture Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-[#121722] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-100">
                Windows 10 / 11 Build & Installer Commands
              </h3>
            </div>
            <button
              type="button"
              onClick={copyBuildCommands}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
            >
              {copiedCmd ? <Check className="h-3 w-3 text-indigo-300" /> : <Copy className="h-3 w-3" />}
              {copiedCmd ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-[#07090E] p-3.5 font-mono text-xs leading-relaxed text-slate-300">
            {buildCommands}
          </pre>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#121722] p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            Electron Native Windows Modules ({files.length} files)
          </h3>
          <ul className="mt-3 space-y-2 text-xs text-slate-300">
            <li>
              <span className="font-mono text-indigo-300">electron/main.cjs</span> — Single-instance
              main process, Windows System Tray, global shortcuts (<span className="font-mono">Ctrl+Shift+S</span>),
              background operation, and startup login integration.
            </li>
            <li>
              <span className="font-mono text-indigo-300">electron/clipboardManager.cjs</span> — Writes
              actual bitmap pixel data (<span className="font-mono">clipboard.writeImage</span>) onto
              the Windows Clipboard for instant <span className="font-mono">Ctrl+V</span> pasting.
            </li>
            <li>
              <span className="font-mono text-indigo-300">electron/windowDetector.cjs</span> — Win32
              API foreground process detector for CorelDRAW, Photoshop, Illustrator, and InDesign.
            </li>
            <li>
              <span className="font-mono text-indigo-300">electron/overlay.html</span> &amp;{' '}
              <span className="font-mono text-indigo-300">electron-builder.yml</span> — Fullscreen
              manual crop overlay and NSIS Windows <span className="font-mono">.exe</span> installer
              configuration.
            </li>
          </ul>
        </div>
      </div>

      {/* Live Source Code Browser */}
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-slate-800 bg-[#121722] lg:grid-cols-12">
        <div className="border-b border-slate-800 bg-[#0E121B] p-3 lg:col-span-4 lg:border-b-0 lg:border-r">
          <p className="px-2 pb-2 text-xs font-semibold text-slate-400">Electron Source Tree</p>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setSelectedPath(f.path)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left font-mono text-xs transition-colors ${
                  selectedPath === f.path
                    ? 'bg-indigo-500/20 text-indigo-200'
                    : 'text-slate-300 hover:bg-slate-800/70'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{f.path}</span>
                </span>
                <span className="ml-2 shrink-0 text-[10px] tabular-nums text-slate-500">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="flex items-center justify-between border-b border-slate-800 bg-[#0B0E14] px-4 py-2.5">
            <span className="font-mono text-xs font-semibold text-slate-200">{selectedPath}</span>
          </div>
          <pre className="max-h-96 overflow-auto bg-[#07090E] p-4 font-mono text-xs leading-relaxed text-slate-300">
            {activeFile ? activeFile.content : 'Loading Electron source files...'}
          </pre>
        </div>
      </div>
    </div>
  );
}
