import { useState } from 'react';
import {
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { ScreenshotHistoryItem } from '../types/screenshot';

interface HistoryViewProps {
  items: ScreenshotHistoryItem[];
  onCopyItem: (item: ScreenshotHistoryItem) => void;
  onDownloadItem: (item: ScreenshotHistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onOpenFolder: () => void;
  onRecapture: () => void;
}

export function HistoryView({
  items,
  onCopyItem,
  onDownloadItem,
  onDeleteItem,
  onOpenFolder,
  onRecapture,
}: HistoryViewProps) {
  const [query, setQuery] = useState('');
  const [lightboxItem, setLightboxItem] = useState<ScreenshotHistoryItem | null>(null);

  const filtered = items.filter(
    (item) =>
      item.filename.toLowerCase().includes(query.toLowerCase()) ||
      item.appName.toLowerCase().includes(query.toLowerCase()) ||
      item.mode.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Screenshot History</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {items.length} captured {items.length === 1 ? 'artwork' : 'artworks'} · Stored locally
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by filename or app..."
              className="w-60 rounded-lg border border-slate-800 bg-[#121722] py-2 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={onOpenFolder}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-[#121722] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            <FolderOpen className="h-3.5 w-3.5" /> Open Folder
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-[#121722] px-6 py-16 text-center">
          <p className="text-sm font-semibold text-slate-200">
            {items.length === 0 ? 'No captured artworks yet' : 'No matching screenshots'}
          </p>
          <p className="mt-1.5 max-w-md text-xs text-slate-400">
            Run Smart Capture or Manual Selection on any design canvas to automatically crop, copy to
            your clipboard, and log the artwork here.
          </p>
          <button
            type="button"
            onClick={onRecapture}
            className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Capture First Artwork
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#121722]"
            >
              <button
                type="button"
                onClick={() => setLightboxItem(item)}
                className="group relative flex h-44 w-full items-center justify-center bg-[#07090E] p-3"
              >
                <img
                  src={item.dataUrl}
                  alt={item.filename}
                  className="max-h-full max-w-full rounded object-contain transition-transform duration-150 group-hover:scale-[1.02]"
                />
              </button>

              <div className="flex flex-1 flex-col justify-between p-4">
                <div>
                  <p className="truncate font-mono text-xs font-semibold text-slate-100">
                    {item.filename}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span>{item.appName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {item.width}×{item.height}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{item.createdAt}</span>
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-500">
                    {item.folderPath}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80 pt-3">
                  <button
                    type="button"
                    onClick={() => setLightboxItem(item)}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                  >
                    <ExternalLink className="h-3 w-3" /> Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyItem(item)}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-indigo-500/35 bg-indigo-500/15 px-2.5 py-1.5 text-[11px] font-medium text-indigo-200 hover:bg-indigo-500/25"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadItem(item)}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                  >
                    <Download className="h-3 w-3" /> Save
                  </button>
                  <button
                    type="button"
                    onClick={onRecapture}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                  >
                    <RefreshCw className="h-3 w-3" /> Recapture
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteItem(item.id)}
                    aria-label={`Delete ${item.filename}`}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxItem && (
        <div
          onClick={() => setLightboxItem(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-[#121722] p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-sm font-semibold text-slate-100">
                  {lightboxItem.filename}
                </p>
                <p className="text-xs text-slate-400">
                  {lightboxItem.appName} · {lightboxItem.width}×{lightboxItem.height} px ·{' '}
                  {lightboxItem.createdAt}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
            <img
              src={lightboxItem.dataUrl}
              alt={lightboxItem.filename}
              className="max-h-[72vh] rounded bg-[#07090E] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
