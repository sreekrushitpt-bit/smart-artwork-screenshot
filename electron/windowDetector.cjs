const { execFile } = require('child_process');
const { screen } = require('electron');

const DESIGN_PROCESSES = {
  coreldrw: { id: 'coreldraw', appName: 'CorelDRAW', isDesignApp: true },
  photoshop: { id: 'photoshop', appName: 'Adobe Photoshop', isDesignApp: true },
  illustrator: { id: 'illustrator', appName: 'Adobe Illustrator', isDesignApp: true },
  indesign: { id: 'indesign', appName: 'Adobe InDesign', isDesignApp: true },
  canva: { id: 'custom', appName: 'Canva Desktop', isDesignApp: true },
  designer: { id: 'custom', appName: 'Affinity Designer', isDesignApp: true },
  photo: { id: 'photoshop', appName: 'Affinity Photo', isDesignApp: true },
  figma: { id: 'custom', appName: 'Figma', isDesignApp: true },
  inkscape: { id: 'illustrator', appName: 'Inkscape', isDesignApp: true },
};

// Per-Monitor DPI Aware v2 Win32 helper so GetWindowRect & GetMonitorInfo return exact
// un-virtualized physical pixels matching desktopCapturer physical framebuffers.
const PS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinApiHelper {
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }
}
"@

# Enable Per-Monitor DPI Aware v2 (-4) before querying any window or monitor metrics
try {
  if (-not [WinApiHelper]::SetProcessDpiAwarenessContext([IntPtr](-4))) {
    [void][WinApiHelper]::SetProcessDPIAware()
  }
} catch {
  try { [void][WinApiHelper]::SetProcessDPIAware() } catch {}
}

$hwnd = [WinApiHelper]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { Write-Output "{}"; exit }

$sb = New-Object System.Text.StringBuilder 512
[void][WinApiHelper]::GetWindowText($hwnd, $sb, $sb.Capacity)
$title = $sb.ToString()
$pidOut = 0
[void][WinApiHelper]::GetWindowThreadProcessId($hwnd, [ref]$pidOut)
$procName = ""
try { $procName = (Get-Process -Id $pidOut -ErrorAction Stop).ProcessName } catch {}

# Prefer DWMWA_EXTENDED_FRAME_BOUNDS (9) to exclude invisible Windows 10/11 drop-shadow margins
$rect = New-Object WinApiHelper+RECT
$dwmRes = -1
try {
  $dwmRes = [WinApiHelper]::DwmGetWindowAttribute($hwnd, 9, [ref]$rect, [System.Runtime.InteropServices.Marshal]::SizeOf([type][WinApiHelper+RECT]))
} catch {}
if ($dwmRes -ne 0) {
  [void][WinApiHelper]::GetWindowRect($hwnd, [ref]$rect)
}

$dpi = 96
try {
  $d = [WinApiHelper]::GetDpiForWindow($hwnd)
  if ($d -gt 0) { $dpi = $d }
} catch {}

$hmon = [WinApiHelper]::MonitorFromWindow($hwnd, 2)
$mi = New-Object WinApiHelper+MONITORINFO
$mi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type][WinApiHelper+MONITORINFO])
[void][WinApiHelper]::GetMonitorInfo($hmon, [ref]$mi)

$obj = @{
  hwnd = $hwnd.ToInt64()
  pid = $pidOut
  processName = $procName
  windowTitle = $title
  dpi = $dpi
  left = $rect.Left
  top = $rect.Top
  right = $rect.Right
  bottom = $rect.Bottom
  monLeft = $mi.rcMonitor.Left
  monTop = $mi.rcMonitor.Top
  monRight = $mi.rcMonitor.Right
  monBottom = $mi.rcMonitor.Bottom
  workLeft = $mi.rcWork.Left
  workTop = $mi.rcWork.Top
  workRight = $mi.rcWork.Right
  workBottom = $mi.rcWork.Bottom
}
$obj | ConvertTo-Json -Compress
`;

let lastNonSelfApp = null;

function mapDesignApp(processName, windowTitle) {
  const procKey = String(processName || '').toLowerCase().replace(/\.exe$/i, '');
  if (DESIGN_PROCESSES[procKey]) {
    return DESIGN_PROCESSES[procKey];
  }
  const titleLower = String(windowTitle || '').toLowerCase();
  if (titleLower.includes('coreldraw')) return DESIGN_PROCESSES.coreldrw;
  if (titleLower.includes('photoshop')) return DESIGN_PROCESSES.photoshop;
  if (titleLower.includes('illustrator')) return DESIGN_PROCESSES.illustrator;
  if (titleLower.includes('indesign')) return DESIGN_PROCESSES.indesign;
  if (titleLower.includes('canva')) return DESIGN_PROCESSES.canva;
  if (titleLower.includes('affinity')) return DESIGN_PROCESSES.designer;
  if (titleLower.includes('figma')) return DESIGN_PROCESSES.figma;
  return {
    id: 'live',
    appName: processName || windowTitle || 'Desktop Window',
    isDesignApp: false,
  };
}

function findMonitorIndexForPhysicalRect(rect, monRect) {
  const displays = screen.getAllDisplays();
  if (displays.length === 0) return 0;

  // First try exact match against Electron display physical bounds via dipToScreenRect
  if (monRect) {
    const monW = monRect.right - monRect.left;
    const monH = monRect.bottom - monRect.top;
    for (let i = 0; i < displays.length; i++) {
      const d = displays[i];
      const phys = typeof screen.dipToScreenRect === 'function'
        ? screen.dipToScreenRect(null, d.bounds)
        : {
            x: Math.round(d.bounds.x * (d.scaleFactor || 1)),
            y: Math.round(d.bounds.y * (d.scaleFactor || 1)),
            width: Math.round(d.bounds.width * (d.scaleFactor || 1)),
            height: Math.round(d.bounds.height * (d.scaleFactor || 1)),
          };
      if (
        Math.abs(phys.x - monRect.left) <= 4 &&
        Math.abs(phys.y - monRect.top) <= 4 &&
        Math.abs(phys.width - monW) <= 8 &&
        Math.abs(phys.height - monH) <= 8
      ) {
        return i;
      }
    }
  }

  if (!rect) return 0;
  const physCx = Math.round((rect.left + rect.right) / 2);
  const physCy = Math.round((rect.top + rect.bottom) / 2);
  const dipPt =
    typeof screen.screenToDipPoint === 'function'
      ? screen.screenToDipPoint({ x: physCx, y: physCy })
      : { x: physCx, y: physCy };
  const nearest = screen.getDisplayNearestPoint(dipPt);
  const idx = displays.findIndex((d) => d.id === nearest.id);
  return idx >= 0 ? idx : 0;
}

function getActiveDesignApp() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(
        lastNonSelfApp || {
          appId: 'live',
          appName: 'Desktop Workspace',
          processName: process.platform,
          windowTitle: 'Active Screen',
          isDesignApp: false,
          monitorIndex: 0,
          dpi: 96,
          rect: null,
          monitorPhysicalBounds: null,
        }
      );
      return;
    }

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_SCRIPT],
      { windowsHide: true, timeout: 1800 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve(lastNonSelfApp || null);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          if (!parsed || !parsed.hwnd) {
            resolve(lastNonSelfApp || null);
            return;
          }

          // Ignore our own Electron window so dashboard clicks target the user's design app
          const ownPid = process.pid;
          const titleLower = String(parsed.windowTitle || '').toLowerCase();
          if (
            parsed.pid === ownPid ||
            titleLower.includes('smart artwork screenshot')
          ) {
            resolve(
              lastNonSelfApp || {
                appId: 'live',
                appName: 'CorelDRAW / Design App Ready',
                processName: parsed.processName || 'electron',
                windowTitle: parsed.windowTitle || '',
                isDesignApp: false,
                monitorIndex: 0,
                dpi: parsed.dpi || 96,
                rect: null,
                monitorPhysicalBounds: null,
              }
            );
            return;
          }

          const mapped = mapDesignApp(parsed.processName, parsed.windowTitle);
          const rect = {
            left: parsed.left,
            top: parsed.top,
            right: parsed.right,
            bottom: parsed.bottom,
            width: Math.max(0, parsed.right - parsed.left),
            height: Math.max(0, parsed.bottom - parsed.top),
          };
          const monPhysicalBounds = {
            left: parsed.monLeft,
            top: parsed.monTop,
            right: parsed.monRight,
            bottom: parsed.monBottom,
            width: Math.max(0, parsed.monRight - parsed.monLeft),
            height: Math.max(0, parsed.monBottom - parsed.monTop),
          };
          const workPhysicalBounds = {
            left: parsed.workLeft,
            top: parsed.workTop,
            right: parsed.workRight,
            bottom: parsed.workBottom,
            width: Math.max(0, parsed.workRight - parsed.workLeft),
            height: Math.max(0, parsed.workBottom - parsed.workTop),
          };

          const result = {
            hwnd: parsed.hwnd,
            pid: parsed.pid,
            processName: parsed.processName,
            windowTitle: parsed.windowTitle,
            appId: mapped.id,
            appName: mapped.appName,
            isDesignApp: mapped.isDesignApp,
            dpi: parsed.dpi || 96,
            rect,
            monitorPhysicalBounds: monPhysicalBounds,
            workPhysicalBounds,
            monitorIndex: findMonitorIndexForPhysicalRect(rect, monPhysicalBounds),
          };
          lastNonSelfApp = result;
          resolve(result);
        } catch {
          resolve(lastNonSelfApp || null);
        }
      }
    );
  });
}

module.exports = {
  getActiveDesignApp,
};
