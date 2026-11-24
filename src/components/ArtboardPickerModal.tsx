import { Copy, Layers, X } from 'lucide-react';
import { DetectedBox } from '../types/screenshot';

export interface ArtboardCandidate {
  box: DetectedBox;
  previewUrl: string;
}

interface ArtboardPickerModalProps {
  candidates: ArtboardCandidate[];
  appName: string;
  onSelectOne: (candidate: ArtboardCandidate) => void;
  onBatchAll: () => void;
  onClose: () => void;
}

export function ArtboardPickerModal({
  candidates,
  appName,
  onSelectOne,
  onBatchAll,
  onClose,
}: ArtboardPickerModalProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#121722] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Detected {candidates.length} Visible Artboards / Pages
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Source: {appName} · Select an individual artboard or batch-capture all pages
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBatchAll}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Layers className="h-3.5 w-3.5" /> Batch Capture All ({candidates.length})
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close artboard picker"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((cand) => (
            <div
              key={cand.box.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0B0E14]"
            >
              <div className="flex h-44 items-center justify-center bg-[#07090E] p-3">
                <img
                  src={cand.previewUrl}
                  alt={cand.box.label}
                  className="max-h-full max-w-full rounded object-contain"
                />
              </div>
              <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{cand.box.label}</p>
                  <p className="font-mono text-xs tabular-nums text-slate-400">
                    {cand.box.width} × {cand.box.height} px
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectOne(cand)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25"
                >
                  <Copy className="h-3.5 w-3.5" /> Capture
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
