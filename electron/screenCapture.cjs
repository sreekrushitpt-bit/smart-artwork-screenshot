const { desktopCapturer, screen } = require('electron');

function getDisplayPhysicalRect(display) {
  if (typeof screen.dipToScreenRect === 'function') {
    try {
      return screen.dipToScreenRect(null, display.bounds);
    } catch {
      // Fallback below
    }
  }
  const sf = display.scaleFactor || 1;
  return {
    x: Math.round(display.bounds.x * sf),
    y: Math.round(display.bounds.y * sf),
    width: Math.round(display.size.width * sf),
    height: Math.round(display.size.height * sf),
  };
}

function listDisplays() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, index) => {
    const phys = getDisplayPhysicalRect(d);
    const scaleFactor = d.scaleFactor || 1;
    const dpi = Math.round(scaleFactor * 96);
    return {
      index,
      id: String(d.id),
      isPrimary: d.id === primaryId,
      bounds: d.bounds,
      workArea: d.workArea,
      physicalBounds: phys,
      scaleFactor,
      dpi,
      physicalWidth: phys.width,
      physicalHeight: phys.height,
      label: `Monitor ${index + 1} · ${phys.width}×${phys.height} (${Math.round(
        scaleFactor * 100
      )}%)${d.id === primaryId ? ' (Primary)' : ''}`,
    };
  });
}

function computeWindowLocalRect(appInfo, targetDisplay, captureWidth, captureHeight) {
  if (!appInfo || !appInfo.rect || appInfo.rect.width < 100 || appInfo.rect.height < 100) {
    return null;
  }

  // Prefer Win32 physical monitor origin when available; otherwise use Electron physical bounds
  const monOriginX = appInfo.monitorPhysicalBounds
    ? appInfo.monitorPhysicalBounds.left
    : targetDisplay.physicalBounds.x;
  const monOriginY = appInfo.monitorPhysicalBounds
    ? appInfo.monitorPhysicalBounds.top
    : targetDisplay.physicalBounds.y;
  const monPhysW = appInfo.monitorPhysicalBounds
    ? appInfo.monitorPhysicalBounds.width
    : targetDisplay.physicalWidth;
  const monPhysH = appInfo.monitorPhysicalBounds
    ? appInfo.monitorPhysicalBounds.height
    : targetDisplay.physicalHeight;

  // Map from physical virtual-desktop coordinates into the actual captured bitmap coordinates
  const scaleX = monPhysW > 0 ? captureWidth / monPhysW : 1;
  const scaleY = monPhysH > 0 ? captureHeight / monPhysH : 1;

  const rawLeft = (appInfo.rect.left - monOriginX) * scaleX;
  const rawTop = (appInfo.rect.top - monOriginY) * scaleY;
  const rawRight = (appInfo.rect.right - monOriginX) * scaleX;
  const rawBottom = (appInfo.rect.bottom - monOriginY) * scaleY;

  const x = Math.max(0, Math.min(captureWidth - 1, Math.floor(rawLeft)));
  const y = Math.max(0, Math.min(captureHeight - 1, Math.floor(rawTop)));
  const right = Math.max(x + 1, Math.min(captureWidth, Math.ceil(rawRight)));
  const bottom = Math.max(y + 1, Math.min(captureHeight, Math.ceil(rawBottom)));

  // Clamp bottom to work area (exclude Windows taskbar if taskbar is inside the same monitor)
  let workBottom = bottom;
  if (appInfo.workPhysicalBounds) {
    const wb = Math.ceil((appInfo.workPhysicalBounds.bottom - monOriginY) * scaleY);
    if (wb > y + 80 && wb < workBottom) {
      workBottom = wb;
    }
  }

  return {
    x,
    y,
    width: right - x,
    height: workBottom - y,
  };
}

async function captureDisplay(monitorIndex = 0, appInfo = null) {
  const displays = listDisplays();
  const target = displays[monitorIndex] || displays[0];
  if (!target) {
    throw new Error('No active display found.');
  }

  // Request exact physical monitor resolution without forcing minimum width distortion
  const thumbW = Math.max(1, target.physicalWidth);
  const thumbH = Math.max(1, target.physicalHeight);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: thumbW, height: thumbH },
    fetchWindowIcons: false,
  });

  if (!sources.length) {
    throw new Error('Windows screen capture permission returned no display sources.');
  }

  // Match by display_id first, then fall back to index
  let matched = sources.find((s) => String(s.display_id) === target.id);
  if (!matched) {
    matched = sources[monitorIndex] || sources[0];
  }

  const size = matched.thumbnail.getSize();
  const windowLocalRect = computeWindowLocalRect(appInfo, target, size.width, size.height);

  const diagnostics = {
    monitorIndex: target.index,
    monitorResolutionLogical: `${target.bounds.width}×${target.bounds.height}`,
    monitorResolutionPhysical: `${target.physicalWidth}×${target.physicalHeight}`,
    monitorOriginLogical: `${target.bounds.x},${target.bounds.y}`,
    monitorOriginPhysical: `${target.physicalBounds.x},${target.physicalBounds.y}`,
    scaleFactor: target.scaleFactor,
    windowsDpi: (appInfo && appInfo.dpi) || target.dpi,
    captureBitmapDimensions: `${size.width}×${size.height}`,
    windowRectPhysical: appInfo && appInfo.rect ? appInfo.rect : null,
    windowLocalRect,
  };

  console.info('[SmartCapture Diagnostics] Screen captured:', JSON.stringify(diagnostics));

  return {
    dataUrl: matched.thumbnail.toDataURL(),
    width: size.width,
    height: size.height,
    monitorIndex: target.index,
    displayId: target.id,
    bounds: target.bounds,
    physicalBounds: target.physicalBounds,
    scaleFactor: target.scaleFactor,
    dpi: (appInfo && appInfo.dpi) || target.dpi,
    windowLocalRect,
    diagnostics,
  };
}

async function captureWindowByInfo(appInfo) {
  const displays = listDisplays();
  const monIdx = appInfo && typeof appInfo.monitorIndex === 'number' ? appInfo.monitorIndex : 0;
  const targetDisplay = displays[monIdx] || displays[0];

  if (appInfo && appInfo.windowTitle) {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: {
        width: targetDisplay ? targetDisplay.physicalWidth : 1920,
        height: targetDisplay ? targetDisplay.physicalHeight : 1080,
      },
      fetchWindowIcons: false,
    });

    const titleNeedle = appInfo.windowTitle.toLowerCase();
    const matched =
      sources.find((s) => s.name.toLowerCase() === titleNeedle) ||
      sources.find((s) => s.name.toLowerCase().includes(titleNeedle.slice(0, 24)));

    if (matched && !matched.thumbnail.isEmpty()) {
      const size = matched.thumbnail.getSize();
      return {
        dataUrl: matched.thumbnail.toDataURL(),
        width: size.width,
        height: size.height,
        monitorIndex: monIdx,
        scaleFactor: targetDisplay ? targetDisplay.scaleFactor : 1,
        dpi: (appInfo && appInfo.dpi) || (targetDisplay ? targetDisplay.dpi : 96),
        windowTitle: matched.name,
        windowLocalRect: { x: 0, y: 0, width: size.width, height: size.height },
      };
    }
  }

  // Fallback to monitor capture
  return captureDisplay(monIdx, appInfo);
}

module.exports = {
  listDisplays,
  captureDisplay,
  captureWindowByInfo,
};
