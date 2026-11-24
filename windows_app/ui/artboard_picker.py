"""Mode 4: Multi-Artboard / Multi-Page selector and batch capture dialog."""

from __future__ import annotations

from typing import List

import numpy as np
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QImage, QPixmap
from PySide6.QtWidgets import (
    QDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from core.artwork_detector import DetectedRegion


class ArtboardPickerDialog(QDialog):
    capture_single = Signal(int)
    capture_all_batch = Signal()

    def __init__(
        self, full_bgr: np.ndarray, regions: List[DetectedRegion], parent=None
    ) -> None:
        super().__init__(parent)
        self.setWindowTitle("Multiple Artboards / Pages Detected")
        self.resize(820, 560)

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 16)
        root.setSpacing(12)

        top = QHBoxLayout()
        title = QLabel(f"Detected {len(regions)} Artboards / Pages")
        title.setObjectName("SectionTitle")
        btn_all = QPushButton("Batch Capture All Pages")
        btn_all.setObjectName("PrimaryButton")
        btn_all.clicked.connect(self._on_batch)
        top.addWidget(title)
        top.addStretch()
        top.addWidget(btn_all)
        root.addLayout(top)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        container = QWidget()
        grid = QGridLayout(container)
        grid.setSpacing(12)

        for idx, reg in enumerate(regions):
            crop = full_bgr[reg.y : reg.y + reg.height, reg.x : reg.x + reg.width]
            rgb = crop[:, :, ::-1].copy()
            h, w = rgb.shape[:2]
            qimg = QImage(rgb.data, w, h, w * 3, QImage.Format.Format_RGB888)
            pix = QPixmap.fromImage(qimg).scaled(
                240,
                160,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )

            card = QFrame()
            card.setObjectName("Card")
            cl = QVBoxLayout(card)
            cl.setContentsMargins(12, 12, 12, 12)
            thumb = QLabel()
            thumb.setAlignment(Qt.AlignmentFlag.AlignCenter)
            thumb.setPixmap(pix)
            meta = QLabel(f"{reg.label} · {reg.width}×{reg.height} px")
            meta.setAlignment(Qt.AlignmentFlag.AlignCenter)
            btn = QPushButton("Capture & Copy")
            btn.clicked.connect(lambda _=False, i=idx: self._on_pick(i))

            cl.addWidget(thumb)
            cl.addWidget(meta)
            cl.addWidget(btn)
            grid.addWidget(card, idx // 3, idx % 3)

        scroll.setWidget(container)
        root.addWidget(scroll, stretch=1)

    def _on_pick(self, idx: int) -> None:
        self.capture_single.emit(idx)
        self.accept()

    def _on_batch(self) -> None:
        self.capture_all_batch.emit()
        self.accept()
