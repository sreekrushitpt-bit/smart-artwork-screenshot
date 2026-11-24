import { DesignAppId } from '../types/screenshot';

export interface WorkspacePreset {
  id: DesignAppId;
  appName: string;
  documentTitle: string;
  description: string;
  imageUrl?: string;
}

export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {
    id: 'coreldraw',
    appName: 'CorelDRAW',
    documentTitle: 'Summer_Sunrise_Banner_18x10ft.cdr — CorelDRAW 2025',
    description: 'Banner print design surrounded by menus, property bar, rulers, toolbox, and color docker.',
    imageUrl: './src/assets/images/sample_coreldraw_banner_1795410277318.jpg',
  },
  {
    id: 'photoshop',
    appName: 'Adobe Photoshop',
    documentTitle: 'Aura_Legacy_Poster_CMYK.psd @ 66.7% — Adobe Photoshop',
    description: 'Dark studio product poster inside a dark Photoshop workspace to test non-white artwork detection.',
    imageUrl: './src/assets/images/sample_photoshop_poster_1795410277620.jpg',
  },
  {
    id: 'illustrator',
    appName: 'Adobe Illustrator',
    documentTitle: 'Architectural_Exhibition_Set.ai — Adobe Illustrator',
    description: 'Multiple artboards (Flyer + Visiting Card) positioned side by side on a neutral canvas.',
    imageUrl: './src/assets/images/sample_illustrator_card_1795410277396.jpg',
  },
  {
    id: 'indesign',
    appName: 'Adobe InDesign',
    documentTitle: 'Annual_Architecture_Monograph.indd — Adobe InDesign',
    description: 'Two-page editorial spread with margin guides and studio panels.',
  },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawRulers(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dark: boolean
) {
  ctx.fillStyle = dark ? '#2A2D34' : '#E2E4E9';
  ctx.fillRect(x, y, w, 18);
  ctx.fillRect(x, y, 18, h);

  ctx.strokeStyle = dark ? '#555A66' : '#9499A6';
  ctx.fillStyle = dark ? '#9AA0AE' : '#4E5461';
  ctx.font = '9px monospace';
  ctx.lineWidth = 1;

  for (let rx = x + 24; rx < x + w; rx += 16) {
    const major = (rx - x) % 64 === 0;
    ctx.beginPath();
    ctx.moveTo(rx, y + (major ? 4 : 11));
    ctx.lineTo(rx, y + 18);
    ctx.stroke();
    if (major) {
      ctx.fillText(String(rx - x), rx + 2, y + 10);
    }
  }
  for (let ry = y + 24; ry < y + h; ry += 16) {
    const major = (ry - y) % 64 === 0;
    ctx.beginPath();
    ctx.moveTo(x + (major ? 4 : 11), ry);
    ctx.lineTo(x + 18, ry);
    ctx.stroke();
  }
}

function drawWindowsTaskbar(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const tbY = h - 42;
  ctx.fillStyle = '#11151E';
  ctx.fillRect(0, tbY, w, 42);
  ctx.fillStyle = '#252D3D';
  ctx.fillRect(0, tbY, w, 1);

  // Centered Windows 11 style icons
  const cx = w / 2 - 90;
  const colors = ['#38BDF8', '#F59E0B', '#6366F1', '#10B981', '#EC4899', '#94A3B8'];
  colors.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(cx + i * 32, tbY + 11, 20, 20, 4);
    ctx.fill();
  });

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '11px sans-serif';
  ctx.fillText('10:30 AM', w - 74, tbY + 18);
  ctx.fillText('11/23/2026', w - 78, tbY + 32);
}

/**
 * Renders an authentic 1440x860 Windows desktop monitor running the selected graphic design
 * software with toolbars, menus, rulers, dockers, pasteboard, and real artwork inside.
 */
export async function renderDesignWorkspaceScene(
  presetId: DesignAppId
): Promise<HTMLCanvasElement> {
  const W = 1440;
  const H = 860;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const preset = WORKSPACE_PRESETS.find((p) => p.id === presetId) || WORKSPACE_PRESETS[0];

  if (presetId === 'coreldraw') {
    // Light-neutral CorelDRAW 2025 UI chrome + pasteboard
    ctx.fillStyle = '#ECEEF2';
    ctx.fillRect(0, 0, W, H);

    // Title Bar
    ctx.fillStyle = '#21252E';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '600 12px sans-serif';
    ctx.fillText(preset.documentTitle, 44, 19);
    ctx.fillStyle = '#22C55E';
    ctx.fillRect(14, 7, 16, 16);

    // Menu Bar
    ctx.fillStyle = '#F3F4F6';
    ctx.fillRect(0, 30, W, 26);
    ctx.fillStyle = '#374151';
    ctx.font = '12px sans-serif';
    ['File', 'Edit', 'View', 'Layout', 'Object', 'Effects', 'Bitmaps', 'Text', 'Table', 'Tools', 'Window', 'Help'].forEach(
      (m, idx) => ctx.fillText(m, 14 + idx * 54, 47)
    );

    // Standard Toolbar + Property Bar
    ctx.fillStyle = '#E5E7EB';
    ctx.fillRect(0, 56, W, 32);
    ctx.fillRect(0, 88, W, 30);
    ctx.fillStyle = '#CBD5E1';
    for (let i = 0; i < 24; i++) {
      ctx.fillRect(14 + i * 32, 63, 18, 18);
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(14, 93, 95, 20);
    ctx.fillRect(120, 93, 95, 20);
    ctx.fillRect(230, 93, 120, 20);
    ctx.fillStyle = '#475569';
    ctx.font = '11px monospace';
    ctx.fillText('18.0 × 10.0 in', 18, 107);
    ctx.fillText('300 dpi CMYK', 124, 107);

    // Left Toolbox
    ctx.fillStyle = '#E5E7EB';
    ctx.fillRect(0, 118, 46, H - 160);
    for (let t = 0; t < 16; t++) {
      ctx.fillStyle = t === 0 ? '#93C5FD' : '#CBD5E1';
      ctx.fillRect(11, 132 + t * 34, 24, 24);
    }

    // Right Object Properties + Color Swatch Docker
    ctx.fillStyle = '#E5E7EB';
    ctx.fillRect(W - 210, 118, 210, H - 160);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(W - 200, 128, 160, 280);
    ctx.fillStyle = '#334155';
    ctx.font = '600 11px sans-serif';
    ctx.fillText('Object Properties', W - 190, 148);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(W - 190, 164, 140, 14);
    ctx.fillRect(W - 190, 190, 140, 14);
    ctx.fillRect(W - 190, 216, 140, 14);

    // Color Swatch Strip on far right
    const swatches = ['#0F172A', '#DC2626', '#EA580C', '#F59E0B', '#16A34A', '#0284C7', '#4F46E5', '#9333EA', '#EC4899', '#FFFFFF'];
    swatches.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(W - 28, 128 + i * 24, 18, 20);
    });

    // Pasteboard & Rulers
    ctx.fillStyle = '#D5D8E0';
    ctx.fillRect(46, 118, W - 256, H - 160);
    drawRulers(ctx, 46, 118, W - 256, H - 160, false);

    // Artwork Page Shadow + Crisp Banner Artwork
    const artX = 165;
    const artY = 195;
    const artW = 940;
    const artH = 528;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(artX + 6, artY + 6, artW, artH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(artX, artY, artW, artH);

    if (preset.imageUrl) {
      try {
        const img = await loadImage(preset.imageUrl);
        ctx.drawImage(img, artX, artY, artW, artH);
      } catch {
        ctx.fillStyle = '#EA580C';
        ctx.fillRect(artX, artY, artW, artH);
      }
    }
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1;
    ctx.strokeRect(artX, artY, artW, artH);
  } else if (presetId === 'photoshop') {
    // Dark Adobe Photoshop Workspace
    ctx.fillStyle = '#262626';
    ctx.fillRect(0, 0, W, H);

    // Title & Menu Bar
    ctx.fillStyle = '#1E1E1E';
    ctx.fillRect(0, 0, W, 32);
    ctx.fillStyle = '#001E36';
    ctx.fillRect(10, 6, 20, 20);
    ctx.fillStyle = '#31A8FF';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Ps', 14, 20);
    ctx.fillStyle = '#D4D4D8';
    ctx.font = '12px sans-serif';
    ['File', 'Edit', 'Image', 'Layer', 'Type', 'Select', 'Filter', '3D', 'View', 'Window'].forEach(
      (m, i) => ctx.fillText(m, 44 + i * 50, 20)
    );

    // Options bar + document tab
    ctx.fillStyle = '#323232';
    ctx.fillRect(0, 32, W, 32);
    ctx.fillStyle = '#2B2B2B';
    ctx.fillRect(0, 64, W, 26);
    ctx.fillStyle = '#3A3A3A';
    ctx.fillRect(46, 66, 300, 24);
    ctx.fillStyle = '#E4E4E7';
    ctx.font = '11px sans-serif';
    ctx.fillText(preset.documentTitle, 58, 82);

    // Left Tool Rail
    ctx.fillStyle = '#2C2C2C';
    ctx.fillRect(0, 64, 46, H - 106);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i === 1 ? '#4B5563' : '#3F3F46';
      ctx.fillRect(11, 100 + i * 32, 24, 22);
    }

    // Right Layers / Properties Panels
    ctx.fillStyle = '#2C2C2C';
    ctx.fillRect(W - 255, 64, 255, H - 106);
    ctx.fillStyle = '#383838';
    ctx.fillRect(W - 245, 76, 235, 220);
    ctx.fillRect(W - 245, 310, 235, 360);
    ctx.fillStyle = '#D4D4D8';
    ctx.font = '600 11px sans-serif';
    ctx.fillText('Properties', W - 234, 96);
    ctx.fillText('Layers', W - 234, 330);
    for (let l = 0; l < 5; l++) {
      ctx.fillStyle = l === 0 ? '#4B5563' : '#2E2E2E';
      ctx.fillRect(W - 235, 344 + l * 38, 215, 32);
    }

    // Dark Pasteboard
    ctx.fillStyle = '#1C1C1C';
    ctx.fillRect(46, 90, W - 301, H - 132);
    drawRulers(ctx, 46, 90, W - 301, H - 132, true);

    // Portrait Poster Artwork (dark poster inside dark Photoshop pasteboard)
    const artW = 450;
    const artH = 600;
    const artX = 46 + Math.round((W - 301 - artW) / 2);
    const artY = 128;

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(artX - 1, artY - 1, artW + 2, artH + 2);
    if (preset.imageUrl) {
      try {
        const img = await loadImage(preset.imageUrl);
        ctx.drawImage(img, artX, artY, artW, artH);
      } catch {
        ctx.fillStyle = '#111827';
        ctx.fillRect(artX, artY, artW, artH);
      }
    }
  } else if (presetId === 'illustrator') {
    // Dark-Gray Adobe Illustrator Workspace with TWO distinct artboards
    ctx.fillStyle = '#2B2B2B';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#1F1F1F';
    ctx.fillRect(0, 0, W, 32);
    ctx.fillStyle = '#330000';
    ctx.fillRect(10, 6, 20, 20);
    ctx.fillStyle = '#FF9A00';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Ai', 15, 20);
    ctx.fillStyle = '#E5E7EB';
    ctx.font = '12px sans-serif';
    ctx.fillText(preset.documentTitle, 44, 20);

    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 32, W, 30);
    ctx.fillRect(0, 62, W, 28);

    // Left Toolbar & Right Artboards Panel
    ctx.fillStyle = '#2E2E2E';
    ctx.fillRect(0, 90, 46, H - 132);
    ctx.fillRect(W - 245, 90, 245, H - 132);
    ctx.fillStyle = '#3A3A3A';
    ctx.fillRect(W - 235, 102, 225, 290);
    ctx.fillStyle = '#E4E4E7';
    ctx.font = '600 11px sans-serif';
    ctx.fillText('Artboards (2)', W - 224, 122);
    ctx.fillStyle = '#4B5563';
    ctx.fillRect(W - 224, 136, 204, 28);
    ctx.fillStyle = '#303030';
    ctx.fillRect(W - 224, 170, 204, 28);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '11px sans-serif';
    ctx.fillText('01 · Exhibition Flyer', W - 214, 154);
    ctx.fillText('02 · Visiting Card', W - 214, 188);

    // Neutral Artboard Canvas
    ctx.fillStyle = '#404040';
    ctx.fillRect(46, 90, W - 291, H - 132);
    drawRulers(ctx, 46, 90, W - 291, H - 132, true);

    // Draw the generated multi-artboard image nicely centered OR two crisp artboards
    const cW = 920;
    const cH = 630;
    const cX = 46 + Math.round((W - 291 - cW) / 2);
    const cY = 126;

    if (preset.imageUrl) {
      try {
        const img = await loadImage(preset.imageUrl);
        // Extract left flyer and right business card as two crisp separated artboards on dark pasteboard
        // Artboard 1 (Left Flyer)
        const ab1X = cX + 20;
        const ab1Y = cY + 18;
        const ab1W = 430;
        const ab1H = 585;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ab1X, ab1Y, ab1W, ab1H);
        ctx.drawImage(img, img.width * 0.08, img.height * 0.09, img.width * 0.45, img.height * 0.82, ab1X, ab1Y, ab1W, ab1H);
        ctx.strokeStyle = '#60A5FA';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ab1X, ab1Y, ab1W, ab1H);

        // Artboard 2 (Right Visiting Card)
        const ab2X = ab1X + ab1W + 70;
        const ab2Y = cY + 165;
        const ab2W = 370;
        const ab2H = 225;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ab2X, ab2Y, ab2W, ab2H);
        ctx.drawImage(img, img.width * 0.56, img.height * 0.34, img.width * 0.36, img.height * 0.31, ab2X, ab2Y, ab2W, ab2H);
        ctx.strokeRect(ab2X, ab2Y, ab2W, ab2H);
      } catch {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cX + 40, cY + 30, 380, 520);
        ctx.fillRect(cX + 480, cY + 150, 340, 210);
      }
    }
  } else {
    // Adobe InDesign Facing Spread
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1E1E1E';
    ctx.fillRect(0, 0, W, 32);
    ctx.fillStyle = '#49021F';
    ctx.fillRect(10, 6, 20, 20);
    ctx.fillStyle = '#FF3366';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('Id', 15, 20);
    ctx.fillStyle = '#E5E7EB';
    ctx.font = '12px sans-serif';
    ctx.fillText(preset.documentTitle, 44, 20);

    ctx.fillStyle = '#2B2B2B';
    ctx.fillRect(0, 32, W, 56);
    ctx.fillRect(0, 88, 46, H - 130);
    ctx.fillRect(W - 245, 88, 245, H - 130);

    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(46, 88, W - 291, H - 130);
    drawRulers(ctx, 46, 88, W - 291, H - 130, true);

    // Two-page editorial spread
    const spX = 165;
    const spY = 148;
    const spW = 900;
    const spH = 560;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(spX + 8, spY + 8, spW, spH);
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(spX, spY, spW, spH);

    // Center fold
    ctx.strokeStyle = '#D4D4D8';
    ctx.beginPath();
    ctx.moveTo(spX + spW / 2, spY);
    ctx.lineTo(spX + spW / 2, spY + spH);
    ctx.stroke();

    // Editorial design content inside spread
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('MODERN', spX + 44, spY + 95);
    ctx.fillText('STRUCTURES', spX + 44, spY + 142);
    ctx.fillStyle = '#4F46E5';
    ctx.fillRect(spX + 44, spY + 168, 120, 6);
    ctx.fillStyle = '#334155';
    ctx.font = '13px sans-serif';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect(spX + 44, spY + 210 + i * 24, 340 - (i % 3) * 40, 10);
    }

    // Right page visual layout
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(spX + spW / 2 + 36, spY + 42, 378, 300);
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(spX + spW / 2 + 225, spY + 192, 85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E293B';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('MONOGRAPH 2026 — ISSUE 04', spX + spW / 2 + 36, spY + 382);
    ctx.fillStyle = '#64748B';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(spX + spW / 2 + 36, spY + 408 + i * 22, 340 - i * 30, 9);
    }
  }

  drawWindowsTaskbar(ctx, W, H);
  return canvas;
}
