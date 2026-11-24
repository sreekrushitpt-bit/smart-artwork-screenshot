import { ChromeMargins, DesignAppId, DetectedBox } from '../types/screenshot';

const MAX_APP_MARGINS: Record<DesignAppId, ChromeMargins> = {
  coreldraw: { top: 0.165, right: 0.16, bottom: 0.065, left: 0.055 },
  photoshop: { top: 0.135, right: 0.19, bottom: 0.065, left: 0.055 },
  illustrator: { top: 0.135, right: 0.185, bottom: 0.065, left: 0.055 },
  indesign: { top: 0.135, right: 0.185, bottom: 0.065, left: 0.055 },
  custom: { top: 0.04, right: 0.03, bottom: 0.04, left: 0.03 },
  live: { top: 0.065, right: 0.045, bottom: 0.055, left: 0.035 },
};

const MIN_APP_MARGINS: Record<DesignAppId, ChromeMargins> = {
  coreldraw: { top: 0.065, right: 0.015, bottom: 0.03, left: 0.02 },
  photoshop: { top: 0.055, right: 0.015, bottom: 0.03, left: 0.02 },
  illustrator: { top: 0.055, right: 0.015, bottom: 0.03, left: 0.02 },
  indesign: { top: 0.055, right: 0.015, bottom: 0.03, left: 0.02 },
  custom: { top: 0.0, right: 0.0, bottom: 0.0, left: 0.0 },
  live: { top: 0.015, right: 0.01, bottom: 0.02, left: 0.01 },
};

interface ComponentBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Picks the largest tight RGB cluster (medoid) instead of an unclustered median,
 * preventing bimodal samples (e.g. dark pasteboard + bright zoomed artwork) from averaging
 * into a nonexistent mid-gray color.
 */
function pickDominantColorCluster(
  samples: [number, number, number][],
  radius = 18
): [number, number, number] {
  if (samples.length === 0) return [40, 40, 40];
  let bestCluster: [number, number, number][] = [samples[0]];
  for (let i = 0; i < samples.length; i++) {
    const [r0, g0, b0] = samples[i];
    const cluster: [number, number, number][] = [];
    for (let j = 0; j < samples.length; j++) {
      const [r1, g1, b1] = samples[j];
      if (Math.hypot(r1 - r0, g1 - g0, b1 - b0) <= radius) {
        cluster.push(samples[j]);
      }
    }
    if (cluster.length > bestCluster.length) {
      bestCluster = cluster;
    }
  }
  return [
    median(bestCluster.map((c) => c[0])),
    median(bestCluster.map((c) => c[1])),
    median(bestCluster.map((c) => c[2])),
  ];
}

function iou(a: DetectedBox, b: DetectedBox): number {
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.width, b.x + b.width);
  const iy2 = Math.min(a.y + a.height, b.y + b.height);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Estimates whether horizontal/vertical bands inside the window are UI chrome
 * (high 2D edge density or panel borders) vs open workspace/pasteboard.
 * Scans outward from inner chrome ceiling toward outer window edge so toolbars/rulers
 * are excluded while collapsed panels or large zoomed artworks are NEVER clipped.
 */
function detectDynamicWorkspaceRoi(
  data: Uint8ClampedArray,
  aw: number,
  ah: number,
  winX1: number,
  winY1: number,
  winX2: number,
  winY2: number,
  appId: DesignAppId,
  appDetectionEnabled: boolean
): { roiX1: number; roiY1: number; roiX2: number; roiY2: number } {
  const winW = winX2 - winX1;
  const winH = winY2 - winY1;

  if (!appDetectionEnabled) {
    return { roiX1: winX1, roiY1: winY1, roiX2: winX2, roiY2: winY2 };
  }

  const minM = MIN_APP_MARGINS[appId] || MIN_APP_MARGINS.custom;
  const maxM = MAX_APP_MARGINS[appId] || MAX_APP_MARGINS.custom;

  const rowBusy = new Float32Array(ah);
  const colBusy = new Float32Array(aw);

  const midX1 = winX1 + Math.floor(winW * 0.16);
  const midX2 = winX2 - Math.floor(winW * 0.19);
  for (let y = winY1 + 1; y < winY2 - 1; y++) {
    let busyCount = 0;
    let samples = 0;
    for (let x = midX1; x < midX2; x += 2) {
      const idx = (y * aw + x) * 4;
      const idxR = (y * aw + (x + 1)) * 4;
      const idxD = ((y + 1) * aw + x) * 4;
      const diffR =
        Math.abs(data[idxR] - data[idx]) +
        Math.abs(data[idxR + 1] - data[idx + 1]) +
        Math.abs(data[idxR + 2] - data[idx + 2]);
      const diffD =
        Math.abs(data[idxD] - data[idx]) +
        Math.abs(data[idxD + 1] - data[idx + 1]) +
        Math.abs(data[idxD + 2] - data[idx + 2]);
      if (Math.max(diffR, diffD) > 18) busyCount++;
      samples++;
    }
    rowBusy[y] = samples > 0 ? busyCount / samples : 0;
  }

  const midY1 = winY1 + Math.floor(winH * 0.16);
  const midY2 = winY2 - Math.floor(winH * 0.12);
  for (let x = winX1 + 1; x < winX2 - 1; x++) {
    let busyCount = 0;
    let samples = 0;
    for (let y = midY1; y < midY2; y += 2) {
      const idx = (y * aw + x) * 4;
      const idxR = (y * aw + (x + 1)) * 4;
      const idxD = ((y + 1) * aw + x) * 4;
      const diffR =
        Math.abs(data[idxR] - data[idx]) +
        Math.abs(data[idxR + 1] - data[idx + 1]) +
        Math.abs(data[idxR + 2] - data[idx + 2]);
      const diffD =
        Math.abs(data[idxD] - data[idx]) +
        Math.abs(data[idxD + 1] - data[idx + 1]) +
        Math.abs(data[idxD + 2] - data[idx + 2]);
      if (Math.max(diffR, diffD) > 18) busyCount++;
      samples++;
    }
    colBusy[x] = samples > 0 ? busyCount / samples : 0;
  }

  const sampleBandColor = (pos: number, isRow: boolean): [number, number, number] => {
    let sr = 0, sg = 0, sb = 0, cnt = 0;
    if (isRow) {
      for (let x = midX1; x < midX2; x += 6) {
        const idx = (pos * aw + x) * 4;
        sr += data[idx]; sg += data[idx + 1]; sb += data[idx + 2]; cnt++;
      }
    } else {
      for (let y = midY1; y < midY2; y += 6) {
        const idx = (y * aw + pos) * 4;
        sr += data[idx]; sg += data[idx + 1]; sb += data[idx + 2]; cnt++;
      }
    }
    return cnt > 0 ? [sr / cnt, sg / cnt, sb / cnt] : [0, 0, 0];
  };

  // Sample quiet bands across [minM..maxM] on all 4 sides and pick the dominant cluster
  // so zoomed artworks touching 1-2 maxM margins never poison the pasteboard estimate.
  const outerQuietSamples: [number, number, number][] = [];
  const collectQuietBandSamples = (
    outer: number,
    inner: number,
    profile: Float32Array,
    isRow: boolean
  ) => {
    const delta = outer - inner;
    for (let i = 0; i <= 5; i++) {
      const p = Math.round(inner + delta * (i * 0.1));
      if ((profile[p] ?? 1) < 0.05) {
        outerQuietSamples.push(sampleBandColor(p, isRow));
      }
    }
  };
  collectQuietBandSamples(
    Math.floor(winX1 + winW * minM.left),
    Math.floor(winX1 + winW * maxM.left),
    colBusy,
    false
  );
  collectQuietBandSamples(
    Math.ceil(winX2 - winW * minM.right),
    Math.ceil(winX2 - winW * maxM.right),
    colBusy,
    false
  );
  collectQuietBandSamples(
    Math.floor(winY1 + winH * minM.top),
    Math.floor(winY1 + winH * maxM.top),
    rowBusy,
    true
  );
  collectQuietBandSamples(
    Math.ceil(winY2 - winH * minM.bottom),
    Math.ceil(winY2 - winH * maxM.bottom),
    rowBusy,
    true
  );

  if (outerQuietSamples.length === 0) {
    outerQuietSamples.push(
      sampleBandColor(Math.floor(winX1 + winW * maxM.left), false),
      sampleBandColor(Math.ceil(winX2 - winW * maxM.right), false),
      sampleBandColor(Math.floor(winY1 + winH * maxM.top), true),
      sampleBandColor(Math.ceil(winY2 - winH * maxM.bottom), true)
    );
  }
  const [pbGuessR, pbGuessG, pbGuessB] = pickDominantColorCluster(outerQuietSamples, 14);

  // Scan OUTWARD from `inner` toward `outer` to locate the outermost quiet pasteboard adjacent to chrome.
  // If we hit a thin 1-6px artwork border followed immediately by quiet pasteboard matching workspace bg,
  // continue stepping outward so an artwork inside [minM..maxM] is NEVER clipped at its own border.
  const findChromeBoundaryOutward = (
    outer: number,
    inner: number,
    profile: Float32Array,
    isRow: boolean
  ): number => {
    const dir = outer < inner ? -1 : 1; // direction from inner -> outer
    const dist = Math.abs(inner - outer);
    if (dist < 4) return outer;

    const minRun = Math.max(4, Math.min(8, Math.floor(dist * 0.18)));
    let quietRun = 0;
    let foundQuiet = false;
    let lastQuiet = inner;

    const minOuterQuiet = Math.max(6, Math.round(aw * 0.006));
    const hasOuterQuietPasteboard = (startPos: number): number => {
      // Allow up to 6px of thin artwork border / drop-shadow (including multi-row strokes),
      // then check if a continuous quiet pasteboard run of length `minOuterQuiet` follows
      let run = 0;
      let runStart = -1;
      for (let k = 1; k <= minOuterQuiet + 6; k++) {
        const pos = startPos + dir * k;
        if (dir < 0 ? pos < outer : pos > outer) break;
        if ((profile[pos] ?? 1) < 0.05) {
          if (run === 0) runStart = pos;
          run++;
          if (run >= minOuterQuiet) {
            const outerPos = Math.round((runStart + pos) / 2);
            const [or, og, ob] = sampleBandColor(outerPos, isRow);
            const pbDist = Math.hypot(or - pbGuessR, og - pbGuessG, ob - pbGuessB);
            return pbDist <= 14 ? runStart : -1;
          }
        } else {
          run = 0;
          runStart = -1;
        }
      }
      return -1;
    };

    for (let p = inner; dir < 0 ? p >= outer : p <= outer; p += dir) {
      const val = profile[p] ?? 1;
      if (val < 0.05) {
        quietRun++;
        lastQuiet = p;
        if (quietRun >= minRun) {
          foundQuiet = true;
        }
      } else {
        if (foundQuiet) {
          const pastThinBorder = hasOuterQuietPasteboard(p);
          if (pastThinBorder !== -1) {
            p = pastThinBorder;
            lastQuiet = pastThinBorder;
            quietRun = 1;
            continue;
          }
          // Reached real UI chrome divider; step 1px back into pasteboard
          return lastQuiet - dir;
        }
        quietRun = 0;
      }
    }
    return outer;
  };

  const roiX1 = findChromeBoundaryOutward(
    Math.floor(winX1 + winW * minM.left),
    Math.floor(winX1 + winW * maxM.left),
    colBusy,
    false
  );
  const roiX2 = findChromeBoundaryOutward(
    Math.ceil(winX2 - winW * minM.right),
    Math.ceil(winX2 - winW * maxM.right),
    colBusy,
    false
  );
  const roiY1 = findChromeBoundaryOutward(
    Math.floor(winY1 + winH * minM.top),
    Math.floor(winY1 + winH * maxM.top),
    rowBusy,
    true
  );
  const roiY2 = findChromeBoundaryOutward(
    Math.ceil(winY2 - winH * minM.bottom),
    Math.ceil(winY2 - winH * maxM.bottom),
    rowBusy,
    true
  );

  if (roiX2 - roiX1 < 80 || roiY2 - roiY1 < 80) {
    return { roiX1: winX1, roiY1: winY1, roiX2: winX2, roiY2: winY2 };
  }
  return { roiX1, roiY1, roiX2, roiY2 };
}

/**
 * Estimates the pasteboard background color by dividing the ROI perimeter into small patches,
 * filtering to the flattest (lowest-variance) patches so artwork touching one edge never skews it.
 */
function estimatePasteboardColor(
  data: Uint8ClampedArray,
  aw: number,
  roiX1: number,
  roiY1: number,
  roiX2: number,
  roiY2: number
): { bgR: number; bgG: number; bgB: number } {
  const roiW = roiX2 - roiX1;
  const roiH = roiY2 - roiY1;
  const strip = Math.max(4, Math.round(Math.min(roiW, roiH) * 0.015));

  interface PatchStat {
    r: number;
    g: number;
    b: number;
    spread: number;
  }

  const patches: PatchStat[] = [];
  const samplePatch = (px1: number, py1: number, px2: number, py2: number) => {
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (let y = py1; y < py2; y++) {
      for (let x = px1; x < px2; x++) {
        const idx = (y * aw + x) * 4;
        rs.push(data[idx]);
        gs.push(data[idx + 1]);
        bs.push(data[idx + 2]);
      }
    }
    if (rs.length === 0) return;
    const mr = median(rs);
    const mg = median(gs);
    const mb = median(bs);
    let dev = 0;
    for (let i = 0; i < rs.length; i++) {
      dev += Math.abs(rs[i] - mr) + Math.abs(gs[i] - mg) + Math.abs(bs[i] - mb);
    }
    patches.push({ r: mr, g: mg, b: mb, spread: dev / rs.length });
  };

  // Sample 4 segments along each of the 4 interior edges
  for (let s = 0; s < 4; s++) {
    const sx1 = roiX1 + Math.floor((roiW * s) / 4);
    const sx2 = roiX1 + Math.floor((roiW * (s + 1)) / 4);
    samplePatch(sx1, roiY1, sx2, roiY1 + strip);
    samplePatch(sx1, roiY2 - strip, sx2, roiY2);

    const sy1 = roiY1 + Math.floor((roiH * s) / 4);
    const sy2 = roiY1 + Math.floor((roiH * (s + 1)) / 4);
    samplePatch(roiX1, sy1, roiX1 + strip, sy2);
    samplePatch(roiX2 - strip, sy1, roiX2, sy2);
  }

  if (patches.length === 0) return { bgR: 40, bgG: 40, bgB: 40 };

  // Keep the flattest perimeter patches and choose their dominant color cluster
  patches.sort((a, b) => a.spread - b.spread);
  const flat = patches.slice(0, Math.max(4, Math.floor(patches.length * 0.6)));
  const [bgR, bgG, bgB] = pickDominantColorCluster(
    flat.map((p) => [p.r, p.g, p.b]),
    16
  );

  return { bgR, bgG, bgB };
}

/**
 * Real pixel-level computer vision artwork boundary detector running on Canvas ImageData.
 * Coordinates returned are ALWAYS in exact physical pixel coordinates of `sourceCanvas`.
 */
export function detectArtworkRegions(
  sourceCanvas: HTMLCanvasElement,
  options: {
    appId: DesignAppId;
    sensitivity: number; // 10..100
    multiArtboard: boolean;
    padding: number;
    appDetectionEnabled: boolean;
    windowLocalRect?: { x: number; y: number; width: number; height: number } | null;
  }
): DetectedBox[] {
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  if (srcW < 40 || srcH < 40) return [];

  // High-resolution analysis buffer (up to 1100px wide) so thin page borders & text never vanish
  const scale = Math.min(1, 1100 / srcW);
  const aw = Math.max(40, Math.round(srcW * scale));
  const ah = Math.max(40, Math.round(srcH * scale));

  const work = document.createElement('canvas');
  work.width = aw;
  work.height = ah;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  if (!wctx) return [];
  wctx.drawImage(sourceCanvas, 0, 0, aw, ah);
  const { data } = wctx.getImageData(0, 0, aw, ah);

  // Restrict to active window bounds if known (mapped into analysis buffer)
  let winX1 = 0;
  let winY1 = 0;
  let winX2 = aw;
  let winY2 = ah;
  if (
    options.windowLocalRect &&
    options.windowLocalRect.width > 120 &&
    options.windowLocalRect.height > 120
  ) {
    winX1 = Math.max(0, Math.floor(options.windowLocalRect.x * scale));
    winY1 = Math.max(0, Math.floor(options.windowLocalRect.y * scale));
    winX2 = Math.min(aw, Math.ceil((options.windowLocalRect.x + options.windowLocalRect.width) * scale));
    winY2 = Math.min(ah, Math.ceil((options.windowLocalRect.y + options.windowLocalRect.height) * scale));
  }

  const { roiX1, roiY1, roiX2, roiY2 } = detectDynamicWorkspaceRoi(
    data,
    aw,
    ah,
    winX1,
    winY1,
    winX2,
    winY2,
    options.appId,
    options.appDetectionEnabled
  );

  const roiW = roiX2 - roiX1;
  const roiH = roiY2 - roiY1;
  if (roiW < 24 || roiH < 24) return [];

  const { bgR, bgG, bgB } = estimatePasteboardColor(data, aw, roiX1, roiY1, roiX2, roiY2);

  // Foreground mask combining pasteboard color distance + local Sobel/difference edge energy
  const colorThresh = Math.max(6, 36 - options.sensitivity * 0.30);
  const edgeThresh = Math.max(8, 38 - options.sensitivity * 0.28);
  const mask = new Uint8Array(roiW * roiH);

  for (let ry = 0; ry < roiH; ry++) {
    const y = roiY1 + ry;
    for (let rx = 0; rx < roiW; rx++) {
      const x = roiX1 + rx;
      const idx = (y * aw + x) * 4;
      const dr = data[idx] - bgR;
      const dg = data[idx + 1] - bgG;
      const db = data[idx + 2] - bgB;
      const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);

      let grad = 0;
      if (rx > 0 && ry > 0 && rx < roiW - 1 && ry < roiH - 1) {
        const idxR = (y * aw + (x + 1)) * 4;
        const idxD = ((y + 1) * aw + x) * 4;
        grad =
          Math.abs(data[idxR] - data[idx]) +
          Math.abs(data[idxR + 1] - data[idx + 1]) +
          Math.abs(data[idxD] - data[idx]) +
          Math.abs(data[idxD + 2] - data[idx + 2]);
      }

      if (colorDist > colorThresh || grad > edgeThresh * 1.25) {
        mask[ry * roiW + rx] = 1;
      }
    }
  }

  // Bridge small gaps inside multi-element artwork (logos, headlines, borders) cleanly
  const dilateRadius = options.multiArtboard
    ? Math.max(2, Math.round(roiW * 0.003))
    : Math.max(4, Math.round(roiW * 0.007));
  const erodeRadius = Math.max(1, Math.floor(dilateRadius * 0.55));

  const dilated = morphDilate(mask, roiW, roiH, dilateRadius);
  const closed = morphErode(dilated, roiW, roiH, erodeRadius);

  // Connected component extraction via BFS
  const visited = new Uint8Array(roiW * roiH);
  const components: ComponentBox[] = [];
  const queue = new Int32Array(roiW * roiH);
  const roiArea = roiW * roiH;

  for (let i = 0; i < roiArea; i++) {
    if (closed[i] === 0 || visited[i] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    visited[i] = 1;

    let minX = roiW;
    let minY = roiH;
    let maxX = 0;
    let maxY = 0;
    let count = 0;

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % roiW;
      const cy = (curr - cx) / roiW;
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      count++;

      const neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < roiW - 1 ? curr + 1 : -1,
        cy > 0 ? curr - roiW : -1,
        cy < roiH - 1 ? curr + roiW : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && closed[n] === 1 && visited[n] === 0) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const boxArea = bw * bh;

    // Filter tiny dust specks & ultra-thin 1D toolbar slivers glued to ROI outer edge
    const touchesEdge = minX <= 2 || minY <= 2 || maxX >= roiW - 3 || maxY >= roiH - 3;
    const aspect = bw / Math.max(1, bh);
    const isEdgeSliver = touchesEdge && (aspect > 16 || aspect < 1 / 16) && boxArea < roiArea * 0.04;

    if (!isEdgeSliver && bw >= 12 && bh >= 12 && boxArea >= roiArea * 0.0012) {
      components.push({ minX, minY, maxX, maxY, pixelCount: count });
    }
  }

  // Helper to convert ROI-space box -> physical sourceCanvas pixel coordinates (floor/ceil to prevent edge clipping)
  const toPhysicalBox = (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    confidence: number,
    label: string,
    strategy: string,
    id: string,
    safetyPx: number
  ): DetectedBox => {
    const padPhys = options.padding + safetyPx;
    const fullX = Math.max(0, Math.floor((minX + roiX1) / scale) - padPhys);
    const fullY = Math.max(0, Math.floor((minY + roiY1) / scale) - padPhys);
    const fullRight = Math.min(srcW, Math.ceil((maxX + 1 + roiX1) / scale) + padPhys);
    const fullBottom = Math.min(srcH, Math.ceil((maxY + 1 + roiY1) / scale) + padPhys);

    return {
      id,
      x: fullX,
      y: fullY,
      width: Math.max(1, fullRight - fullX),
      height: Math.max(1, fullBottom - fullY),
      confidence,
      label,
      strategy,
    };
  };

  if (components.length === 0) {
    // Low-confidence safe fallback: capture complete workspace viewport rather than cutting off artwork
    return [
      toPhysicalBox(
        0,
        0,
        roiW - 1,
        roiH - 1,
        0.55,
        'Workspace Canvas (Safe Fallback)',
        'workspace-fallback',
        'roi-fallback',
        0
      ),
    ];
  }

  // Multi-Artboard Mode (Mode 4): return distinct non-overlapping artboards
  if (options.multiArtboard) {
    const multiBoxes: DetectedBox[] = [];
    for (let idx = 0; idx < components.length; idx++) {
      const c = components[idx];
      const bw = c.maxX - c.minX + 1;
      const bh = c.maxY - c.minY + 1;
      if (bw * bh < roiArea * 0.015) continue;
      const fillRatio = c.pixelCount / Math.max(1, bw * bh);
      const areaScore = Math.min(1, ((bw * bh) / roiArea) * 2.1);
      const conf = Math.min(0.99, 0.45 * fillRatio + 0.35 * areaScore + 0.2);
      multiBoxes.push(
        toPhysicalBox(
          c.minX,
          c.minY,
          c.maxX,
          c.maxY,
          conf,
          `Artboard ${idx + 1}`,
          'pasteboard-contrast',
          `cv-${idx + 1}`,
          4
        )
      );
    }

    multiBoxes.sort((a, b) => b.confidence - a.confidence);
    const distinct: DetectedBox[] = [];
    for (const box of multiBoxes) {
      if (distinct.every((d) => iou(d, box) < 0.2)) {
        distinct.push(box);
      }
    }
    distinct.sort((a, b) => {
      const rowDiff = Math.floor(a.y / Math.max(60, Math.round(srcH * 0.14))) -
        Math.floor(b.y / Math.max(60, Math.round(srcH * 0.14)));
      return rowDiff !== 0 ? rowDiff : a.x - b.x;
    });

    if (distinct.length > 0) {
      return distinct.slice(0, 8).map((b, i) => ({
        ...b,
        id: `artboard-${i + 1}`,
        label: `Artboard ${i + 1}`,
      }));
    }
  }

  // Mode 1 / Mode 3 (Single Artwork / Page Capture):
  // Rank components by size + centrality so a corner scrollbar/badge never wins as anchor
  const roiCx = roiW / 2;
  const roiCy = roiH / 2;
  const scored = components.map((c) => {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const cx = (c.minX + c.maxX) / 2;
    const cy = (c.minY + c.maxY) / 2;
    const distNorm =
      Math.hypot(cx - roiCx, cy - roiCy) / Math.max(1, Math.hypot(roiCx, roiCy));
    const areaFrac = (bw * bh) / roiArea;
    const score = areaFrac * (1.25 - 0.55 * distNorm);
    return { c, score, areaFrac };
  });
  scored.sort((a, b) => b.score - a.score);

  const anchor = scored[0].c;
  let uMinX = anchor.minX;
  let uMinY = anchor.minY;
  let uMaxX = anchor.maxX;
  let uMaxY = anchor.maxY;
  let unionPixels = anchor.pixelCount;

  // Iteratively merge all nearby/related artwork elements (logos, headlines, borders, captions)
  // so multi-part designs are NEVER split or partially cropped!
  const mergeGapX = Math.max(24, Math.round(roiW * 0.14));
  const mergeGapY = Math.max(24, Math.round(roiH * 0.14));

  let changed = true;
  const mergedSet = new Set<ComponentBox>([anchor]);
  while (changed) {
    changed = false;
    for (const item of scored) {
      const c = item.c;
      if (mergedSet.has(c)) continue;

      // Ignore tiny isolated corner UI fragments far from the design
      const cArea = (c.maxX - c.minX + 1) * (c.maxY - c.minY + 1);
      const nearCorner =
        (c.minX < 8 || c.maxX > roiW - 9) && (c.minY < 8 || c.maxY > roiH - 9);
      if (nearCorner && cArea < roiArea * 0.02) continue;

      // Check proximity to current artwork union envelope
      const gapX = Math.max(0, c.minX - uMaxX, uMinX - c.maxX);
      const gapY = Math.max(0, c.minY - uMaxY, uMinY - c.maxY);

      // Merge if within design composition gap OR substantial interior component (>= 1.2% of ROI)
      const isSubstantialInterior =
        cArea >= roiArea * 0.012 &&
        c.minX > 4 &&
        c.minY > 4 &&
        c.maxX < roiW - 5 &&
        c.maxY < roiH - 5;

      if ((gapX <= mergeGapX && gapY <= mergeGapY) || isSubstantialInterior) {
        uMinX = Math.min(uMinX, c.minX);
        uMinY = Math.min(uMinY, c.minY);
        uMaxX = Math.max(uMaxX, c.maxX);
        uMaxY = Math.max(uMaxY, c.maxY);
        unionPixels += c.pixelCount;
        mergedSet.add(c);
        changed = true;
      }
    }
  }

  const uW = uMaxX - uMinX + 1;
  const uH = uMaxY - uMinY + 1;
  const uAreaFrac = (uW * uH) / roiArea;
  const fillRatio = Math.min(1, unionPixels / Math.max(1, uW * uH));
  const confidence = Math.min(0.99, 0.45 * fillRatio + 0.35 * Math.min(1, uAreaFrac * 2.0) + 0.2);

  // Requirement #9: If confidence is low OR detected region is suspiciously tiny compared to
  // the workspace canvas, safely expand rather than cutting off artwork!
  if (confidence < 0.60 || (uAreaFrac < 0.09 && components.length > 2)) {
    const safeMinX = Math.max(0, Math.min(uMinX, Math.floor(roiW * 0.06)));
    const safeMinY = Math.max(0, Math.min(uMinY, Math.floor(roiH * 0.06)));
    const safeMaxX = Math.min(roiW - 1, Math.max(uMaxX, Math.ceil(roiW * 0.94)));
    const safeMaxY = Math.min(roiH - 1, Math.max(uMaxY, Math.ceil(roiH * 0.94)));
    return [
      toPhysicalBox(
        safeMinX,
        safeMinY,
        safeMaxX,
        safeMaxY,
        confidence,
        'Primary Artwork (Safe Expanded)',
        'low-confidence-expand',
        'primary-safe',
        6
      ),
    ];
  }

  // Edge-preservation safety buffer (+4 physical px) ensures strokes/text/borders at edges are intact
  return [
    toPhysicalBox(
      uMinX,
      uMinY,
      uMaxX,
      uMaxY,
      confidence,
      'Primary Artwork',
      'workspace-union',
      'primary-artwork',
      4
    ),
  ];
}

function morphDilate(src: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(w - 1, x + radius);
      let hit = 0;
      for (let ny = y1; ny <= y2 && !hit; ny++) {
        const rowOff = ny * w;
        for (let nx = x1; nx <= x2; nx++) {
          if (src[rowOff + nx] === 1) {
            hit = 1;
            break;
          }
        }
      }
      out[y * w + x] = hit;
    }
  }
  return out;
}

function morphErode(src: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(w - 1, x + radius);
      let keep = 1;
      for (let ny = y1; ny <= y2 && keep; ny++) {
        const rowOff = ny * w;
        for (let nx = x1; nx <= x2; nx++) {
          if (src[rowOff + nx] === 0) {
            keep = 0;
            break;
          }
        }
      }
      out[y * w + x] = keep;
    }
  }
  return out;
}
