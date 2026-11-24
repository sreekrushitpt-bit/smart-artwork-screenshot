"""Non-intrusive corner toast notification for instant clipboard feedback."""

from __future__ import annotations

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import QFrame, QHBoxLayout, QLabel, QVBoxLayout, QWidget


class CaptureToastNotification(QWidget):
    """
    Compact frameless corner toast that never steals focus from CorelDRAW,
    Photoshop, Illustrator, or other active software.
    """

    def __init__(self) -> None:
        super().__init__(
            None,
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
            | Qt.WindowType.WindowDoesNotAcceptFocus,
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)

        card = QFrame(self)
        card.setStyleSheet(
            """
            QFrame {
                background-color: #111622;
                border: 1px solid #334155;
                border-radius: 12px;
            }
            """
        )
        layout = QVBoxLayout(card)
        layout.setContentsMargins(16, 12, 18, 12)
        layout.setSpacing(4)

        self.title_label = QLabel("✓ Artwork Captured")
        self.title_label.setStyleSheet(
            "color: #F8FAFC; font-weight: 700; font-size: 13px; border: none;"
        )
        self.sub_label = QLabel("✓ Copied to Clipboard — Ready for Ctrl+V")
        self.sub_label.setStyleSheet(
            "color: #818CF8; font-weight: 600; font-size: 12px; border: none;"
        )
        self.meta_label = QLabel("")
        self.meta_label.setStyleSheet(
            "color: #94A3B8; font-size: 11px; border: none;"
        )

        layout.addWidget(self.title_label)
        layout.addWidget(self.sub_label)
        layout.addWidget(self.meta_label)

        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.addWidget(card)

        self._timer = QTimer(self)
        self._timer.setSingleShot(True)
        self._timer.timeout.connect(self.hide)

    def show_message(
        self,
        title: str = "✓ Artwork Captured",
        subtitle: str = "✓ Copied to Clipboard",
        meta: str = "",
        duration_ms: int = 2600,
    ) -> None:
        self.title_label.setText(title)
        self.sub_label.setText(subtitle)
        self.meta_label.setText(meta)
        self.meta_label.setVisible(bool(meta))
        self.adjustSize()

        screen = QGuiApplication.primaryScreen()
        if screen:
            geo = screen.availableGeometry()
            x = geo.right() - self.width() - 24
            y = geo.bottom() - self.height() - 24
            self.move(x, y)

        self.show()
        self._timer.start(duration_ms)
