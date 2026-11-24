"""Multi-monitor high-DPI screen capture engine using mss."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import mss
import numpy as np
from PIL import Image


@dataclass
class MonitorInfo:
    index: int
    left: int
    top: int
    width: int
    height: int

    @property
    def label(self) -> str:
        return f"Monitor {self.index + 1} · {self.width}×{self.height}"


class ScreenCaptureEngine:
    """Captures individual monitors, virtual desktops, or specific window bounds."""

    def list_monitors(self) -> List[MonitorInfo]:
        with mss.mss() as sct:
            # sct.monitors[0] is virtual bounding box of all monitors; [1..] are physical monitors
            return [
                MonitorInfo(
                    index=i - 1,
                    left=m["left"],
                    top=m["top"],
                    width=m["width"],
                    height=m["height"],
                )
                for i, m in enumerate(sct.monitors[1:], start=1)
            ]

    def capture_monitor(self, monitor_index: int = 0) -> Tuple[np.ndarray, MonitorInfo]:
        with mss.mss() as sct:
            idx = max(1, min(monitor_index + 1, len(sct.monitors) - 1))
            mon = sct.monitors[idx]
            shot = sct.grab(mon)
            bgr = np.array(shot, dtype=np.uint8)[:, :, :3]  # BGRA -> BGR
            info = MonitorInfo(
                index=idx - 1,
                left=mon["left"],
                top=mon["top"],
                width=mon["width"],
                height=mon["height"],
            )
            return bgr, info

    def capture_virtual_screen(self) -> Tuple[np.ndarray, MonitorInfo]:
        with mss.mss() as sct:
            mon = sct.monitors[0]
            shot = sct.grab(mon)
            bgr = np.array(shot, dtype=np.uint8)[:, :, :3]
            info = MonitorInfo(
                index=-1,
                left=mon["left"],
                top=mon["top"],
                width=mon["width"],
                height=mon["height"],
            )
            return bgr, info

    def capture_region(self, left: int, top: int, width: int, height: int) -> np.ndarray:
        region = {
            "left": int(left),
            "top": int(top),
            "width": max(1, int(width)),
            "height": max(1, int(height)),
        }
        with mss.mss() as sct:
            shot = sct.grab(region)
            return np.array(shot, dtype=np.uint8)[:, :, :3]

    @staticmethod
    def bgr_to_pil(bgr: np.ndarray) -> Image.Image:
        rgb = bgr[:, :, ::-1]
        return Image.fromarray(rgb, mode="RGB")

    @staticmethod
    def crop_bgr(
        bgr: np.ndarray, x: int, y: int, w: int, h: int, padding: int = 0
    ) -> np.ndarray:
        img_h, img_w = bgr.shape[:2]
        x1 = max(0, int(x - padding))
        y1 = max(0, int(y - padding))
        x2 = min(img_w, int(x + w + padding))
        y2 = min(img_h, int(y + h + padding))
        if x2 <= x1 or y2 <= y1:
            return bgr
        return bgr[y1:y2, x1:x2].copy()
