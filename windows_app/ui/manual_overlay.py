"""Mode 2: Fullscreen transparent overlay for precise pixel-level manual artwork selection."""

from __future__ import annotations

from typing import Optional

import numpy as np
from PySide6.QtCore import QPoint, QRect, Qt, Signal
from PySide6.QtGui import QColor, QImage, QKeyEvent, QMouseEvent, QPainter, QPen, QPixmap
from PySide6.QtWidgets import QWidget


HANDLE_SIZE = 10


class ManualSelectionOverlay(QWidget):
    """
    Transparent screen overlay supporting:
    - Drag to create selection
    - Resize from 8 edge/corner handles
    - Drag inside selection to move
    - Arrow keys for 1px precision nudging (Shift+Arrow for 10px)
    - Live width × height pixel HUD
    - Enter to capture, Escape to cancel
    """

    region_selected = Signal(QRect)
    cancelled = Signal()

    def __init__(
        self,
        bgr_backdrop: np.ndarray,
        screen_rect: QRect,
        initial_rect: Optional[QRect] = None,
    ) -> None:
        super().__init__(
            None,
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool,
        )
        self.setGeometry(screen_rect)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setCursor(Qt.CursorShape.CrossCursor)

        rgb = bgr_backdrop[:, :, ::-1].copy()
        h, w, ch = rgb.shape
        qimg = QImage(rgb.data, w, h, ch * w, QImage.Format.Format_RGB888)
        self._pixmap = QPixmap.fromImage(qimg)

        self._selection: QRect = initial_rect or QRect()
        self._mode: str = ""  # "create" | "move" | handle name
        self._drag_origin = QPoint()
        self._rect_origin = QRect()

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self.activateWindow()
        self.setFocus()

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.drawPixmap(self.rect(), self._pixmap)

        # Dimmed mask outside selection
        dim = QColor(8, 11, 18, 155)
        if self._selection.isNull() or self._selection.width() < 2 or self._selection.height() < 2:
            painter.fillRect(self.rect(), dim)
            self._draw_help_banner(painter)
            return

        sel = self._selection.normalized()
        # Four dimming bands around selection
        painter.fillRect(0, 0, self.width(), sel.top(), dim)
        painter.fillRect(0, sel.bottom() + 1, self.width(), self.height() - sel.bottom() - 1, dim)
        painter.fillRect(0, sel.top(), sel.left(), sel.height(), dim)
        painter.fillRect(sel.right() + 1, sel.top(), self.width() - sel.right() - 1, sel.height(), dim)

        # Crisp border
        pen = QPen(QColor("#818CF8"), 2)
        painter.setPen(pen)
        painter.drawRect(sel)

        # 8 resize handles
        painter.setBrush(QColor("#FFFFFF"))
        painter.setPen(QPen(QColor("#4F46E5"), 1.5))
        for _, rect in self._handles(sel).items():
            painter.drawRect(rect)

        # Dimensions HUD
        hud_text = f"{sel.width()} × {sel.height()} px   (Enter: Capture · Esc: Cancel · Arrows: Nudge)"
        hud_w = max(360, len(hud_text) * 7 + 20)
        hud_x = max(12, min(self.width() - hud_w - 12, sel.left()))
        hud_y = sel.top() - 34 if sel.top() > 40 else sel.bottom() + 10
        hud_rect = QRect(hud_x, hud_y, hud_w, 26)
        painter.fillRect(hud_rect, QColor(15, 23, 42, 230))
        painter.setPen(QColor("#E2E8F0"))
        painter.drawText(hud_rect, Qt.AlignmentFlag.AlignCenter, hud_text)

    def _draw_help_banner(self, painter: QPainter) -> None:
        banner = QRect(self.width() // 2 - 240, 24, 480, 34)
        painter.fillRect(banner, QColor(15, 23, 42, 235))
        painter.setPen(QColor("#F8FAFC"))
        painter.drawText(
            banner,
            Qt.AlignmentFlag.AlignCenter,
            "Drag across the artwork area to select · Press Enter to capture · Esc to cancel",
        )

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() != Qt.MouseButton.LeftButton:
            return
        pos = event.position().toPoint()
        sel = self._selection.normalized()

        if not sel.isNull():
            for name, hrect in self._handles(sel).items():
                if hrect.adjusted(-4, -4, 4, 4).contains(pos):
                    self._mode = name
                    self._drag_origin = pos
                    self._rect_origin = QRect(sel)
                    return
            if sel.contains(pos):
                self._mode = "move"
                self._drag_origin = pos
                self._rect_origin = QRect(sel)
                return

        self._mode = "create"
        self._drag_origin = pos
        self._selection = QRect(pos, pos)
        self.update()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        pos = event.position().toPoint()
        if not self._mode:
            self._update_hover_cursor(pos)
            return

        dx = pos.x() - self._drag_origin.x()
        dy = pos.y() - self._drag_origin.y()

        if self._mode == "create":
            self._selection = QRect(self._drag_origin, pos).normalized()
        elif self._mode == "move":
            r = QRect(self._rect_origin)
            r.translate(dx, dy)
            r.moveLeft(max(0, min(self.width() - r.width(), r.left())))
            r.moveTop(max(0, min(self.height() - r.height(), r.top())))
            self._selection = r
        else:
            r = QRect(self._rect_origin)
            if "left" in self._mode:
                r.setLeft(min(r.right() - 10, max(0, r.left() + dx)))
            if "right" in self._mode:
                r.setRight(max(r.left() + 10, min(self.width() - 1, r.right() + dx)))
            if "top" in self._mode:
                r.setTop(min(r.bottom() - 10, max(0, r.top() + dy)))
            if "bottom" in self._mode:
                r.setBottom(max(r.top() + 10, min(self.height() - 1, r.bottom() + dy)))
            self._selection = r.normalized()

        self.update()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._mode = ""
            self._selection = self._selection.normalized()
            self.update()

    def keyPressEvent(self, event: QKeyEvent) -> None:
        key = event.key()
        if key == Qt.Key.Key_Escape:
            self.close()
            self.cancelled.emit()
            return
        if key in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
            sel = self._selection.normalized()
            if sel.width() >= 4 and sel.height() >= 4:
                self.close()
                self.region_selected.emit(sel)
            return

        step = 10 if (event.modifiers() & Qt.KeyboardModifier.ShiftModifier) else 1
        if not self._selection.isNull():
            r = QRect(self._selection.normalized())
            if key == Qt.Key.Key_Left:
                r.translate(-step, 0)
            elif key == Qt.Key.Key_Right:
                r.translate(step, 0)
            elif key == Qt.Key.Key_Up:
                r.translate(0, -step)
            elif key == Qt.Key.Key_Down:
                r.translate(0, step)
            self._selection = r
            self.update()

    def _update_hover_cursor(self, pos: QPoint) -> None:
        sel = self._selection.normalized()
        if sel.isNull():
            self.setCursor(Qt.CursorShape.CrossCursor)
            return
        for name, hrect in self._handles(sel).items():
            if hrect.adjusted(-4, -4, 4, 4).contains(pos):
                if name in ("top_left", "bottom_right"):
                    self.setCursor(Qt.CursorShape.SizeFDiagCursor)
                elif name in ("top_right", "bottom_left"):
                    self.setCursor(Qt.CursorShape.SizeBDiagCursor)
                elif name in ("top", "bottom"):
                    self.setCursor(Qt.CursorShape.SizeVerCursor)
                else:
                    self.setCursor(Qt.CursorShape.SizeHorCursor)
                return
        if sel.contains(pos):
            self.setCursor(Qt.CursorShape.SizeAllCursor)
        else:
            self.setCursor(Qt.CursorShape.CrossCursor)

    @staticmethod
    def _handles(sel: QRect) -> dict[str, QRect]:
        hs = HANDLE_SIZE
        half = hs // 2
        cx = sel.left() + sel.width() // 2
        cy = sel.top() + sel.height() // 2
        return {
            "top_left": QRect(sel.left() - half, sel.top() - half, hs, hs),
            "top": QRect(cx - half, sel.top() - half, hs, hs),
            "top_right": QRect(sel.right() - half, sel.top() - half, hs, hs),
            "right": QRect(sel.right() - half, cy - half, hs, hs),
            "bottom_right": QRect(sel.right() - half, sel.bottom() - half, hs, hs),
            "bottom": QRect(cx - half, sel.bottom() - half, hs, hs),
            "bottom_left": QRect(sel.left() - half, sel.bottom() - half, hs, hs),
            "left": QRect(sel.left() - half, cy - half, hs, hs),
        }
