import React, { useEffect, useRef, useState } from 'react';
import { DetectedBox } from '../types/screenshot';

interface ManualSelectionOverlayProps {
  canvasWidth: number;
  canvasHeight: number;
  initialBox: DetectedBox | null;
  onConfirm: (box: DetectedBox) => void;
  onCancel: () => void;
}

type DragMode =
  | 'none'
  | 'create'
  | 'move'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

export function ManualSelectionOverlay({
  canvasWidth,
  canvasHeight,
  initialBox,
  onConfirm,
  onCancel,
}: ManualSelectionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<DetectedBox>(() => {
    if (initialBox) return { ...initialBox };
    return {
      id: 'manual',
      x: Math.round(canvasWidth * 0.18),
      y: Math.round(canvasHeight * 0.16),
      width: Math.round(canvasWidth * 0.54),
      height: Math.round(canvasHeight * 0.62),
      confidence: 1,
      label: 'Manual Selection',
      strategy: 'manual',
    };
  });

  const [dragMode, setDragMode] = useState<DragMode>('none');
  const dragStartRef = useRef<{ mx: number; my: number; orig: DetectedBox }>({
    mx: 0,
    my: 0,
    orig: box,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(box);
        return;
      }

      const step = e.shiftKey ? 10 : 1;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        setBox((prev) => {
          let nx = prev.x;
          let ny = prev.y;
          if (e.key === 'ArrowLeft') nx = Math.max(0, prev.x - step);
          if (e.key === 'ArrowRight') nx = Math.min(canvasWidth - prev.width, prev.x + step);
          if (e.key === 'ArrowUp') ny = Math.max(0, prev.y - step);
          if (e.key === 'ArrowDown') ny = Math.min(canvasHeight - prev.height, prev.y + step);
          return { ...prev, x: nx, y: ny };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [box, canvasWidth, canvasHeight, onCancel, onConfirm]);

  const clientToCanvas = (clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el) return { cx: 0, cy: 0 };
    const rect = el.getBoundingClientRect();
    const cx = Math.round(((clientX - rect.left) / rect.width) * canvasWidth);
    const cy = Math.round(((clientY - rect.top) / rect.height) * canvasHeight);
    return {
      cx: Math.max(0, Math.min(canvasWidth, cx)),
      cy: Math.max(0, Math.min(canvasHeight, cy)),
    };
  };

  const startDrag = (mode: DragMode, e: React.MouseEvent) => {
    e.stopPropagation();
    const { cx, cy } = clientToCanvas(e.clientX, e.clientY);
    setDragMode(mode);
    dragStartRef.current = {
      mx: cx,
      my: cy,
      orig: { ...box },
    };
    if (mode === 'create') {
      setBox({
        ...box,
        x: cx,
        y: cy,
        width: 4,
        height: 4,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragMode === 'none') return;
    const { cx, cy } = clientToCanvas(e.clientX, e.clientY);
    const { mx, my, orig } = dragStartRef.current;
    const dx = cx - mx;
    const dy = cy - my;

    if (dragMode === 'create') {
      const x1 = Math.min(mx, cx);
      const y1 = Math.min(my, cy);
      const w = Math.max(8, Math.abs(cx - mx));
      const h = Math.max(8, Math.abs(cy - my));
      setBox((prev) => ({ ...prev, x: x1, y: y1, width: w, height: h }));
      return;
    }

    if (dragMode === 'move') {
      const nx = Math.max(0, Math.min(canvasWidth - orig.width, orig.x + dx));
      const ny = Math.max(0, Math.min(canvasHeight - orig.height, orig.y + dy));
      setBox((prev) => ({ ...prev, x: nx, y: ny }));
      return;
    }

    let left = orig.x;
    let top = orig.y;
    let right = orig.x + orig.width;
    let bottom = orig.y + orig.height;

    if (dragMode.includes('w')) left = Math.min(right - 16, Math.max(0, orig.x + dx));
    if (dragMode.includes('e')) right = Math.max(left + 16, Math.min(canvasWidth, orig.x + orig.width + dx));
    if (dragMode.includes('n')) top = Math.min(bottom - 16, Math.max(0, orig.y + dy));
    if (dragMode.includes('s')) bottom = Math.max(top + 16, Math.min(canvasHeight, orig.y + orig.height + dy));

    setBox((prev) => ({
      ...prev,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    }));
  };

  const handleMouseUp = () => {
    if (dragMode !== 'none') setDragMode('none');
  };

  const pct = (val: number, total: number) => `${(val / total) * 100}%`;

  const handles: { id: DragMode; style: React.CSSProperties; cursor: string }[] = [
    { id: 'nw', style: { left: '-5px', top: '-5px' }, cursor: 'nwse-resize' },
    { id: 'n', style: { left: 'calc(50% - 5px)', top: '-5px' }, cursor: 'ns-resize' },
    { id: 'ne', style: { right: '-5px', top: '-5px' }, cursor: 'nesw-resize' },
    { id: 'e', style: { right: '-5px', top: 'calc(50% - 5px)' }, cursor: 'ew-resize' },
    { id: 'se', style: { right: '-5px', bottom: '-5px' }, cursor: 'nwse-resize' },
    { id: 's', style: { left: 'calc(50% - 5px)', bottom: '-5px' }, cursor: 'ns-resize' },
    { id: 'sw', style: { left: '-5px', bottom: '-5px' }, cursor: 'nesw-resize' },
    { id: 'w', style: { left: '-5px', top: 'calc(50% - 5px)' }, cursor: 'ew-resize' },
  ];

  return (
    <div
      ref={overlayRef}
      onMouseDown={(e) => startDrag('create', e)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className="absolute inset-0 z-20 cursor-crosshair select-none"
    >
      {/* Four darkened mask bands around selection */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 bg-slate-950/65"
        style={{ height: pct(box.y, canvasHeight) }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 bg-slate-950/65"
        style={{ top: pct(box.y + box.height, canvasHeight) }}
      />
      <div
        className="pointer-events-none absolute left-0 bg-slate-950/65"
        style={{
          top: pct(box.y, canvasHeight),
          height: pct(box.height, canvasHeight),
          width: pct(box.x, canvasWidth),
        }}
      />
      <div
        className="pointer-events-none absolute right-0 bg-slate-950/65"
        style={{
          top: pct(box.y, canvasHeight),
          height: pct(box.height, canvasHeight),
          left: pct(box.x + box.width, canvasWidth),
        }}
      />

      {/* Selection Box */}
      <div
        onMouseDown={(e) => startDrag('move', e)}
        style={{
          left: pct(box.x, canvasWidth),
          top: pct(box.y, canvasHeight),
          width: pct(box.width, canvasWidth),
          height: pct(box.height, canvasHeight),
        }}
        className="absolute cursor-move border-2 border-indigo-400 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]"
      >
        {/* Pixel HUD */}
        <div className="pointer-events-none absolute -top-9 left-0 flex items-center gap-3 whitespace-nowrap rounded-md border border-slate-700 bg-[#0F141F]/95 px-2.5 py-1 font-mono text-[11px] tabular-nums text-slate-100 shadow-lg">
          <span>
            {box.width} × {box.height} px
          </span>
          <span className="text-slate-500">·</span>
          <span className="text-indigo-300">Enter: Capture · Esc: Cancel · Arrows: 1px</span>
        </div>

        {/* 8 Resize Handles */}
        {handles.map((h) => (
          <div
            key={h.id}
            onMouseDown={(e) => startDrag(h.id, e)}
            style={{ ...h.style, cursor: h.cursor }}
            className="absolute h-2.5 w-2.5 rounded-[2px] border border-indigo-600 bg-white shadow"
          />
        ))}
      </div>

      {/* Bottom Floating Confirm / Cancel Controls */}
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-700 bg-[#111622]/95 px-3 py-2 shadow-2xl"
      >
        <span className="px-2 font-mono text-xs tabular-nums text-slate-300">
          Selection: {box.width} × {box.height}
        </span>
        <button
          type="button"
          onClick={() => onConfirm(box)}
          className="whitespace-nowrap rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          Capture Selection (Enter)
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
        >
          Cancel (Esc)
        </button>
      </div>
    </div>
  );
}
