"""Cropped artwork preview window with Save, Save As, Copy, Recapture, and Adjust Crop."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QImage, QPixmap
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
)


class PreviewWindow(QDialog):
    save_requested = Signal(str, str)  # filename, format
    save_as_requested = Signal(str, str)  # full_path, format
    copy_requested = Signal()
    recapture_requested = Signal()
    adjust_crop_requested = Signal()
    open_folder_requested = Signal()

    def __init__(
        self,
        cropped_bgr: np.ndarray,
        default_filename: str,
        default_format: str,
        app_name: str,
        copied_already: bool,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self.setWindowTitle("Artwork Preview — Smart Artwork Screenshot")
        self.resize(860, 640)
        self._bgr = cropped_bgr
        h, w = cropped_bgr.shape[:2]

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 16)
        root.setSpacing(12)

        # Header metadata
        header = QHBoxLayout()
        status_text = (
            f"Detected Source: {app_name}  ·  {w} × {h} px"
            + ("  ·  ✓ Copied to Clipboard" if copied_already else "")
        )
        info_lbl = QLabel(status_text)
        info_lbl.setStyleSheet("color: #94A3B8; font-size: 12px; font-weight: 600;")
        header.addWidget(info_lbl)
        header.addStretch()
        root.addLayout(header)

        # Cropped Artwork Viewport (shows ONLY the cropped artwork)
        self.image_label = QLabel()
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.setStyleSheet(
            "background-color: #07090E; border: 1px solid #1E2638; border-radius: 10px; padding: 12px;"
        )
        rgb = cropped_bgr[:, :, ::-1].copy()
        qimg = QImage(rgb.data, w, h, w * 3, QImage.Format.Format_RGB888)
        self._pixmap = QPixmap.fromImage(qimg)
        self.image_label.setPixmap(
            self._pixmap.scaled(
                780,
                420,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
        )
        root.addWidget(self.image_label, stretch=1)

        # Custom filename & format row
        name_row = QHBoxLayout()
        name_lbl = QLabel("Filename:")
        name_lbl.setStyleSheet("color: #94A3B8;")
        self.filename_input = QLineEdit(Path(default_filename).stem)
        self.format_combo = QComboBox()
        self.format_combo.addItems(["PNG", "JPG", "BMP"])
        idx = self.format_combo.findText(default_format.upper())
        if idx >= 0:
            self.format_combo.setCurrentIndex(idx)

        name_row.addWidget(name_lbl)
        name_row.addWidget(self.filename_input, stretch=1)
        name_row.addWidget(self.format_combo)
        root.addLayout(name_row)

        # Action Buttons
        btn_row = QHBoxLayout()
        btn_save = QPushButton("Save")
        btn_save.setObjectName("PrimaryButton")
        btn_save_as = QPushButton("Save As")
        btn_copy = QPushButton("Copy to Clipboard")
        btn_recapture = QPushButton("Recapture")
        btn_adjust = QPushButton("Adjust Crop")
        btn_folder = QPushButton("Open Folder")
        btn_cancel = QPushButton("Cancel")

        btn_save.clicked.connect(self._on_save)
        btn_save_as.clicked.connect(self._on_save_as)
        btn_copy.clicked.connect(self.copy_requested.emit)
        btn_recapture.clicked.connect(self._on_recapture)
        btn_adjust.clicked.connect(self._on_adjust)
        btn_folder.clicked.connect(self.open_folder_requested.emit)
        btn_cancel.clicked.connect(self.reject)

        for b in (
            btn_save,
            btn_save_as,
            btn_copy,
            btn_recapture,
            btn_adjust,
            btn_folder,
            btn_cancel,
        ):
            btn_row.addWidget(b)
        root.addLayout(btn_row)

    def _on_save(self) -> None:
        fmt = self.format_combo.currentText()
        stem = self.filename_input.text().strip() or "Artwork"
        self.save_requested.emit(f"{stem}.{fmt.lower()}", fmt)
        self.accept()

    def _on_save_as(self) -> None:
        fmt = self.format_combo.currentText()
        stem = self.filename_input.text().strip() or "Artwork"
        path, _ = QFileDialog.getSaveFileName(
            self,
            "Save Artwork Screenshot As",
            f"{stem}.{fmt.lower()}",
            "PNG Image (*.png);;JPEG Image (*.jpg);;Bitmap Image (*.bmp)",
        )
        if path:
            chosen_fmt = Path(path).suffix.lstrip(".").upper() or fmt
            self.save_as_requested.emit(path, chosen_fmt)
            self.accept()

    def _on_recapture(self) -> None:
        self.reject()
        self.recapture_requested.emit()

    def _on_adjust(self) -> None:
        self.reject()
        self.adjust_crop_requested.emit()
