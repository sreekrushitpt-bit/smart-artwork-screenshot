"""Windows API active design application and monitor detector."""

from __future__ import annotations

import sys
from dataclasses import dataclass
from typing import Dict, Optional, Tuple


@dataclass
class ChromeMargins:
    """Typical UI chrome ratios (top, right, bottom, left) for design apps."""

    top: float
    right: float
    bottom: float
    left: float


@dataclass
class ActiveAppInfo:
    hwnd: int
    process_name: str
    app_name: str
    window_title: str
    rect: Tuple[int, int, int, int]  # (left, top, right, bottom)
    monitor_index: int
    is_design_app: bool
    chrome_margins: ChromeMargins


DESIGN_APPS: Dict[str, Tuple[str, ChromeMargins]] = {
    "coreldrw.exe": ("CorelDRAW", ChromeMargins(0.145, 0.14, 0.045, 0.045)),
    "photoshop.exe": ("Adobe Photoshop", ChromeMargins(0.105, 0.17, 0.035, 0.042)),
    "illustrator.exe": ("Adobe Illustrator", ChromeMargins(0.105, 0.16, 0.035, 0.042)),
    "indesign.exe": ("Adobe InDesign", ChromeMargins(0.10, 0.16, 0.035, 0.042)),
    "canva.exe": ("Canva Desktop", ChromeMargins(0.11, 0.04, 0.05, 0.16)),
    "designer.exe": ("Affinity Designer", ChromeMargins(0.10, 0.16, 0.035, 0.045)),
    "photo.exe": ("Affinity Photo", ChromeMargins(0.10, 0.16, 0.035, 0.045)),
    "figma.exe": ("Figma", ChromeMargins(0.095, 0.15, 0.02, 0.15)),
    "inkscape.exe": ("Inkscape", ChromeMargins(0.12, 0.14, 0.05, 0.04)),
    "gimp-2.10.exe": ("GIMP", ChromeMargins(0.09, 0.16, 0.035, 0.12)),
}

DEFAULT_MARGINS = ChromeMargins(0.08, 0.06, 0.05, 0.04)


class WindowDetector:
    """Queries Win32 foreground window, process executable, and host monitor."""

    def detect_active(self) -> Optional[ActiveAppInfo]:
        if sys.platform != "win32":
            return None
        try:
            import psutil
            import win32api
            import win32gui
            import win32process

            hwnd = win32gui.GetForegroundWindow()
            if not hwnd:
                return None

            title = win32gui.GetWindowText(hwnd) or ""
            rect = win32gui.GetWindowRect(hwnd)
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            proc_name = ""
            try:
                proc_name = psutil.Process(pid).name()
            except Exception:
                proc_name = "unknown.exe"

            proc_key = proc_name.lower()
            if proc_key in DESIGN_APPS:
                friendly, margins = DESIGN_APPS[proc_key]
                is_design = True
            else:
                friendly, margins = self._infer_from_title(title, proc_name)
                is_design = friendly != proc_name

            monitor_index = 0
            try:
                hmon = win32api.MonitorFromWindow(hwnd, 2)  # MONITOR_DEFAULTTONEAREST
                monitors = win32api.EnumDisplayMonitors()
                for idx, (mon_handle, _, _) in enumerate(monitors):
                    if int(mon_handle) == int(hmon):
                        monitor_index = idx
                        break
            except Exception:
                monitor_index = 0

            return ActiveAppInfo(
                hwnd=hwnd,
                process_name=proc_name,
                app_name=friendly,
                window_title=title,
                rect=rect,
                monitor_index=monitor_index,
                is_design_app=is_design,
                chrome_margins=margins,
            )
        except Exception:
            return None

    @staticmethod
    def _infer_from_title(title: str, proc_name: str) -> Tuple[str, ChromeMargins]:
        lower = title.lower()
        checks = [
            ("coreldraw", "coreldrw.exe"),
            ("photoshop", "photoshop.exe"),
            ("illustrator", "illustrator.exe"),
            ("indesign", "indesign.exe"),
            ("canva", "canva.exe"),
            ("affinity designer", "designer.exe"),
            ("figma", "figma.exe"),
        ]
        for token, key in checks:
            if token in lower:
                return DESIGN_APPS[key]
        clean = proc_name.replace(".exe", "").replace(".EXE", "")
        return (clean or "Desktop Window", DEFAULT_MARGINS)
