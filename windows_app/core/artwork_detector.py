"""OpenCV computer-vision engine for Smart Artwork & Artboard boundary detection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np

from .window_detector import ActiveAppInfo, ChromeMargins, DEFAULT_MARGINS


@dataclass
class DetectedRegion:
    x: int
    y: int
    width: int
    height: int
    confidence: float
    label: str
    strategy: str

    @property
    def area(self) -> int:
        return self.width * self.height


class ArtworkDetector:
    """
    Detects visible artwork, page, or artboard regions inside design software
    without assuming white-only pages (handles dark, colored, transparent, and
    multi-artboard canvases).
    """

    def detect_artworks(
        self,
        bgr_image: np.ndarray,
        app_info: Optional[ActiveAppInfo] = None,
        sensitivity: int = 75,
        multi_artboard: bool = False,
        padding: int = 0,
    ) -> List[DetectedRegion]:
        h, w = bgr_image.shape[:2]
        margins = app_info.chrome_margins if app_info else DEFAULT_MARGINS

        # 1. Establish workspace search ROI by stripping likely toolbars, rulers, dockers
        roi_x1, roi_y1, roi_x2, roi_y2 = self._compute_workspace_roi(
            w, h, margins, bgr_image
        )
        roi = bgr_image[roi_y1:roi_y2, roi_x1:roi_x2]
        if roi.size == 0:
            return [DetectedRegion(0, 0, w, h, 0.4, "Full Screen", "fallback")]

        # 2. Gather candidate rectangles from three complementary CV pipelines
        candidates: List[DetectedRegion] = []
        candidates.extend(self._detect_by_pasteboard_separation(roi, sensitivity))
        candidates.extend(self._detect_by_canny_rectangles(roi, sensitivity))
        candidates.extend(self._detect_by_gradient_projection(roi, sensitivity))

        # Translate ROI-relative coordinates to full image coordinates
        translated: List[DetectedRegion] = []
        for c in candidates:
            rx = max(0, c.x + roi_x1 - padding)
            ry = max(0, c.y + roi_y1 - padding)
            rw = min(w - rx, c.width + padding * 2)
            rh = min(h - ry, c.height + padding * 2)
            if rw >= 80 and rh >= 80:
                translated.append(
                    DetectedRegion(rx, ry, rw, rh, c.confidence, c.label, c.strategy)
                )

        # 3. Non-maximum suppression / deduplication
        merged = self._deduplicate_regions(translated)
        if not merged:
            # Safe fallback to workspace ROI center
            rw = roi_x2 - roi_x1
            rh = roi_y2 - roi_y1
            return [
                DetectedRegion(
                    roi_x1, roi_y1, rw, rh, 0.55, "Workspace Canvas", "roi-fallback"
                )
            ]

        if multi_artboard:
            # Return distinct non-overlapping artboards sorted top-to-bottom, left-to-right
            distinct = self._filter_distinct_artboards(merged, roi_x2 - roi_x1, roi_y2 - roi_y1)
            distinct.sort(key=lambda r: (r.y // 80, r.x))
            for idx, r in enumerate(distinct, start=1):
                r.label = f"Artboard {idx}"
            return distinct[:8]

        # Single mode: return highest-scoring artwork boundary
        merged.sort(key=lambda r: r.confidence, reverse=True)
        best = merged[0]
        best.label = (
            f"{app_info.app_name} Artwork"
            if app_info and app_info.is_design_app
            else "Detected Artwork"
        )
        return [best]

    def _compute_workspace_roi(
        self, w: int, h: int, margins: ChromeMargins, bgr: np.ndarray
    ) -> Tuple[int, int, int, int]:
        # Start with app-specific safe UI chrome estimates, then refine using flat UI bands
        x1 = int(w * margins.left)
        y1 = int(h * margins.top)
        x2 = int(w * (1.0 - margins.right))
        y2 = int(h * (1.0 - margins.bottom))

        # Also check bottom Windows taskbar (~48px)
        y2 = min(y2, h - 40)

        # Ensure valid ROI
        if x2 - x1 < 200 or y2 - y1 < 200:
            return (0, 0, w, h)
        return (x1, y1, x2, y2)

    def _detect_by_pasteboard_separation(
        self, roi: np.ndarray, sensitivity: int
    ) -> List[DetectedRegion]:
        """Samples the outer perimeter of the workspace ROI to identify the pasteboard
        color (whether dark gray, mid gray, or light gray) and finds contrasting
        rectangular canvas/artwork islands."""
        rh, rw = roi.shape[:2]
        lab = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB)

        # Sample perimeter strips (8px thick inside ROI) to estimate pasteboard median color
        border_pixels = np.concatenate(
            [
                lab[:8, :, :].reshape(-1, 3),
                lab[-8:, :, :].reshape(-1, 3),
                lab[:, :8, :].reshape(-1, 3),
                lab[:, -8:, :].reshape(-1, 3),
            ],
            axis=0,
        )
        bg_med = np.median(border_pixels, axis=0)

        # Color distance in LAB space from pasteboard color
        diff = np.linalg.norm(lab.astype(np.float32) - bg_med.astype(np.float32), axis=2)
        # Higher sensitivity -> lower threshold so even subtle canvas contrast is detected
        thresh = max(6.0, 28.0 - (sensitivity * 0.2))
        mask = (diff > thresh).astype(np.uint8) * 255

        # Morphological cleanup to fill interior artwork details and connect canvas edges
        k_close = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        k_open = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k_close)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k_open)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        regions: List[DetectedRegion] = []
        roi_area = float(rw * rh)

        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            box_area = cw * ch
            if box_area < roi_area * 0.03 or box_area > roi_area * 0.96:
                continue
            rect_fill = cv2.contourArea(cnt) / max(1.0, float(box_area))
            if rect_fill < 0.52:
                continue
            # Score balances rectangularity, reasonable size, and centrality
            area_score = min(1.0, (box_area / roi_area) * 2.2)
            conf = 0.45 * rect_fill + 0.35 * area_score + 0.20
            regions.append(
                DetectedRegion(x, y, cw, ch, min(0.99, conf), "Canvas", "pasteboard-lab")
            )
        return regions

    def _detect_by_canny_rectangles(
        self, roi: np.ndarray, sensitivity: int
    ) -> List[DetectedRegion]:
        """Finds sharp rectangular artwork borders and page frames via Canny edges."""
        rh, rw = roi.shape[:2]
        roi_area = float(rw * rh)
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        low = max(12, int(60 - sensitivity * 0.45))
        high = max(40, low * 2.5)
        edges = cv2.Canny(blurred, low, high)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        regions: List[DetectedRegion] = []

        for cnt in contours:
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
            x, y, cw, ch = cv2.boundingRect(cnt)
            box_area = cw * ch
            if box_area < roi_area * 0.04 or box_area > roi_area * 0.96:
                continue
            is_quad = 4 <= len(approx) <= 8
            rect_fill = cv2.contourArea(cnt) / max(1.0, float(box_area))
            if rect_fill < 0.55 and not is_quad:
                continue
            conf = 0.55 + (0.2 if is_quad else 0.0) + min(0.2, (box_area / roi_area) * 0.4)
            regions.append(
                DetectedRegion(x, y, cw, ch, min(0.96, conf), "Page Frame", "canny-rect")
            )
        return regions

    def _detect_by_gradient_projection(
        self, roi: np.ndarray, sensitivity: int
    ) -> List[DetectedRegion]:
        """Detects straight page/artboard edges by projecting row/column gradient energy."""
        rh, rw = roi.shape[:2]
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gx = np.abs(cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3))
        gy = np.abs(cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3))

        col_energy = np.mean(gx, axis=0)
        row_energy = np.mean(gy, axis=1)

        c_thresh = np.percentile(col_energy, max(60, 92 - sensitivity * 0.25))
        r_thresh = np.percentile(row_energy, max(60, 92 - sensitivity * 0.25))

        cols = np.where(col_energy > c_thresh)[0]
        rows = np.where(row_energy > r_thresh)[0]
        if len(cols) < 2 or len(rows) < 2:
            return []

        x1, x2 = int(cols[0]), int(cols[-1])
        y1, y2 = int(rows[0]), int(rows[-1])
        cw, ch = x2 - x1, y2 - y1
        if cw < rw * 0.15 or ch < rh * 0.15:
            return []

        return [
            DetectedRegion(x1, y1, cw, ch, 0.72, "Projected Page", "gradient-proj")
        ]

    @staticmethod
    def _iou(a: DetectedRegion, b: DetectedRegion) -> float:
        ix1 = max(a.x, b.x)
        iy1 = max(a.y, b.y)
        ix2 = min(a.x + a.width, b.x + b.width)
        iy2 = min(a.y + a.height, b.y + b.height)
        iw = max(0, ix2 - ix1)
        ih = max(0, iy2 - iy1)
        inter = iw * ih
        union = a.area + b.area - inter
        return inter / union if union > 0 else 0.0

    def _deduplicate_regions(self, regions: List[DetectedRegion]) -> List[DetectedRegion]:
        sorted_regs = sorted(regions, key=lambda r: r.confidence, reverse=True)
        kept: List[DetectedRegion] = []
        for reg in sorted_regs:
            if all(self._iou(reg, k) < 0.72 for k in kept):
                kept.append(reg)
        return kept

    def _filter_distinct_artboards(
        self, regions: List[DetectedRegion], roi_w: int, roi_h: int
    ) -> List[DetectedRegion]:
        # Remove enclosing container boxes if smaller distinct artboards sit inside them
        roi_area = roi_w * roi_h
        candidates = [r for r in regions if r.area < roi_area * 0.85]
        if not candidates:
            return regions[:1]

        distinct: List[DetectedRegion] = []
        for reg in candidates:
            overlaps = any(self._iou(reg, d) > 0.25 for d in distinct)
            if not overlaps:
                distinct.append(reg)
        return distinct or regions[:1]
