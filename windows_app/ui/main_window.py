"""Main PySide6 desktop dashboard for Smart Artwork Screenshot."""

from __future__ import annotations

from pathlib import Path
from typing import List

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QSlider,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from core.history_manager import HistoryEntry
from core.screen_capture import MonitorInfo
from core.settings_manager import AppSettings


class MainWindow(QMainWindow):
    smart_capture_clicked = Signal()
    manual_capture_clicked = Signal()
    active_window_clicked = Signal()
    multi_artboard_clicked = Signal()
    open_folder_clicked = Signal()
    settings_changed = Signal(object)
    history_copy_requested = Signal(str)
    history_delete_requested = Signal(str)
    history_recapture_requested = Signal()

    def __init__(self, settings: AppSettings, monitors: List[MonitorInfo]) -> None:
        super().__init__()
        self.setWindowTitle("Smart Artwork Screenshot")
        self.resize(1120, 740)
        self._settings = settings
        self._monitors = monitors

        central = QWidget()
        self.setCentralWidget(central)
        root = QHBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Left Sidebar
        sidebar = QFrame()
        sidebar.setObjectName("Sidebar")
        sidebar.setFixedWidth(240)
        sb_layout = QVBoxLayout(sidebar)
        sb_layout.setContentsMargins(16, 20, 16, 20)
        sb_layout.setSpacing(8)

        brand = QLabel("Smart Artwork Screenshot")
        brand.setStyleSheet("font-size: 15px; font-weight: 700; color: #F8FAFC;")
        brand.setWordWrap(True)
        sb_layout.addWidget(brand)
        sb_layout.addSpacing(14)

        self.nav_buttons: List[QPushButton] = []
        for idx, label in enumerate(
            ["Capture Studio", "Screenshot History", "Settings", "Output Folder"]
        ):
            if label == "Output Folder":
                sb_layout.addStretch()
                btn = QPushButton("Open Output Folder")
                btn.clicked.connect(self.open_folder_clicked.emit)
                sb_layout.addWidget(btn)
                continue
            btn = QPushButton(label)
            btn.setObjectName("NavButton")
            btn.setProperty("active", idx == 0)
            btn.clicked.connect(lambda _=False, i=idx: self._switch_tab(i))
            sb_layout.addWidget(btn)
            self.nav_buttons.append(btn)

        root.addWidget(sidebar)

        # Right Main Content
        content_wrap = QWidget()
        content_layout = QVBoxLayout(content_wrap)
        content_layout.setContentsMargins(24, 20, 24, 20)
        content_layout.setSpacing(16)

        # Top Status Strip
        status_card = QFrame()
        status_card.setObjectName("StatusBarCard")
        sc_layout = QHBoxLayout(status_card)
        sc_layout.setContentsMargins(16, 12, 16, 12)

        self.detected_app_lbl = QLabel("Detected Application: CorelDRAW")
        self.detected_app_lbl.setStyleSheet("font-weight: 700; color: #F8FAFC;")
        self.detection_status_lbl = QLabel("Artwork Detection: Ready")
        self.detection_status_lbl.setStyleSheet("font-weight: 600; color: #818CF8;")

        sc_layout.addWidget(self.detected_app_lbl)
        sc_layout.addSpacing(24)
        sc_layout.addWidget(self.detection_status_lbl)
        sc_layout.addStretch()

        quick_btn = QPushButton(f"Smart Capture ({settings.hotkeys.get('smart_capture', 'Ctrl+Shift+S')})")
        quick_btn.setObjectName("PrimaryButton")
        quick_btn.clicked.connect(self.smart_capture_clicked.emit)
        sc_layout.addWidget(quick_btn)
        content_layout.addWidget(status_card)

        self.pages = QStackedWidget()
        self.pages.addWidget(self._build_dashboard_page())
        self.pages.addWidget(self._build_history_page())
        self.pages.addWidget(self._build_settings_page())
        content_layout.addWidget(self.pages, stretch=1)

        root.addWidget(content_wrap, stretch=1)

    def _switch_tab(self, index: int) -> None:
        self.pages.setCurrentIndex(index)
        for i, btn in enumerate(self.nav_buttons):
            btn.setProperty("active", i == index)
            btn.style().unpolish(btn)
            btn.style().polish(btn)

    def _build_dashboard_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)

        grid = QGridLayout()
        grid.setSpacing(14)

        modes = [
            (
                "Mode 1 · Smart Auto Capture",
                "Detects the active design app, removes menus, toolbars, rulers, and taskbars, crops the artwork, and copies bitmap pixels to Clipboard.",
                "Run Smart Capture",
                self.smart_capture_clicked,
                True,
            ),
            (
                "Mode 2 · Manual Artwork Selection",
                "Transparent multi-monitor overlay with drag, resize handles, pixel arrow-key nudging, Enter to capture, and Escape to cancel.",
                "Start Manual Selection",
                self.manual_capture_clicked,
                False,
            ),
            (
                "Mode 3 · Active Window / Page Detection",
                "Targets CorelDRAW page frames, Illustrator artboards, Photoshop canvas, or InDesign pages cleanly.",
                "Capture Active Page",
                self.active_window_clicked,
                False,
            ),
            (
                "Mode 4 · Multiple Artboards / Pages",
                "Detects multiple visible artboards or pages simultaneously and lets you pick one or batch-capture all individually.",
                "Detect All Artboards",
                self.multi_artboard_clicked,
                False,
            ),
        ]

        for idx, (title, desc, btn_text, sig, primary) in enumerate(modes):
            card = QFrame()
            card.setObjectName("Card")
            cl = QVBoxLayout(card)
            cl.setContentsMargins(18, 16, 18, 16)
            cl.setSpacing(10)

            t = QLabel(title)
            t.setStyleSheet("font-size: 14px; font-weight: 700; color: #F8FAFC; border: none;")
            d = QLabel(desc)
            d.setWordWrap(True)
            d.setStyleSheet("color: #94A3B8; font-size: 12px; border: none;")
            b = QPushButton(btn_text)
            if primary:
                b.setObjectName("PrimaryButton")
            b.clicked.connect(sig.emit)

            cl.addWidget(t)
            cl.addWidget(d, stretch=1)
            cl.addWidget(b, alignment=Qt.AlignmentFlag.AlignLeft)
            grid.addWidget(card, idx // 2, idx % 2)

        layout.addLayout(grid)

        # Quick Workflow Options Card
        wf_card = QFrame()
        wf_card.setObjectName("Card")
        wfl = QVBoxLayout(wf_card)
        wfl.setContentsMargins(18, 16, 18, 16)
        wfl.setSpacing(8)
        wf_title = QLabel("Capture & Automatic Clipboard Workflow")
        wf_title.setStyleSheet("font-weight: 700; font-size: 14px; border: none;")
        wfl.addWidget(wf_title)

        self.cb_dash_autocopy = QCheckBox("Automatically copy screenshot to clipboard (CF_DIB bitmap for Ctrl+V)")
        self.cb_dash_autocopy.setChecked(self._settings.auto_copy_clipboard)
        self.cb_dash_preview = QCheckBox("Preview after capture")
        self.cb_dash_preview.setChecked(self._settings.preview_after_capture)
        self.cb_dash_autosave = QCheckBox("Automatically save screenshot")
        self.cb_dash_autosave.setChecked(self._settings.auto_save)
        self.cb_dash_toast = QCheckBox("Show capture notification")
        self.cb_dash_toast.setChecked(self._settings.show_notification)

        for cb in (
            self.cb_dash_autocopy,
            self.cb_dash_preview,
            self.cb_dash_autosave,
            self.cb_dash_toast,
        ):
            cb.toggled.connect(self._sync_quick_toggles)
            wfl.addWidget(cb)

        layout.addWidget(wf_card)
        layout.addStretch()
        return page

    def _build_history_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        header = QLabel("Screenshot History")
        header.setObjectName("SectionTitle")
        layout.addWidget(header)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        self.history_container = QWidget()
        self.history_grid = QGridLayout(self.history_container)
        self.history_grid.setSpacing(12)
        scroll.setWidget(self.history_container)
        layout.addWidget(scroll, stretch=1)
        return page

    def refresh_history(self, entries: List[HistoryEntry]) -> None:
        while self.history_grid.count():
            item = self.history_grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        if not entries:
            empty = QLabel("No screenshots captured yet. Press Ctrl+Shift+S inside any design application.")
            empty.setStyleSheet("color: #94A3B8; padding: 24px;")
            self.history_grid.addWidget(empty, 0, 0)
            return

        for idx, entry in enumerate(entries):
            card = QFrame()
            card.setObjectName("Card")
            cl = QVBoxLayout(card)
            cl.setContentsMargins(12, 12, 12, 12)
            cl.setSpacing(6)

            thumb = QLabel()
            thumb.setAlignment(Qt.AlignmentFlag.AlignCenter)
            if entry.thumbnail_path and Path(entry.thumbnail_path).exists():
                thumb.setPixmap(
                    QPixmap(entry.thumbnail_path).scaled(
                        240, 140, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation
                    )
                )
            name = QLabel(entry.filename)
            name.setStyleSheet("font-weight: 700; border: none;")
            meta = QLabel(f"{entry.width}×{entry.height} · {entry.app_name} · {entry.created_at}")
            meta.setStyleSheet("color: #94A3B8; font-size: 11px; border: none;")

            row = QHBoxLayout()
            btn_copy = QPushButton("Copy")
            btn_copy.clicked.connect(lambda _=False, p=entry.file_path: self.history_copy_requested.emit(p))
            btn_recap = QPushButton("Recapture")
            btn_recap.clicked.connect(self.history_recapture_requested.emit)
            btn_del = QPushButton("Delete")
            btn_del.clicked.connect(lambda _=False, eid=entry.id: self.history_delete_requested.emit(eid))
            row.addWidget(btn_copy)
            row.addWidget(btn_recap)
            row.addWidget(btn_del)

            cl.addWidget(thumb)
            cl.addWidget(name)
            cl.addWidget(meta)
            cl.addLayout(row)
            self.history_grid.addWidget(card, idx // 3, idx % 3)

    def _build_settings_page(self) -> QWidget:
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        wrap = QWidget()
        layout = QVBoxLayout(wrap)
        layout.setContentsMargins(0, 0, 8, 0)
        layout.setSpacing(14)

        title = QLabel("Settings & Preferences")
        title.setObjectName("SectionTitle")
        layout.addWidget(title)

        card = QFrame()
        card.setObjectName("Card")
        form = QGridLayout(card)
        form.setContentsMargins(18, 16, 18, 16)
        form.setSpacing(12)

        # Output folder
        form.addWidget(QLabel("Save Folder"), 0, 0)
        self.ed_folder = QLineEdit(self._settings.output_folder)
        btn_browse = QPushButton("Browse")
        btn_browse.clicked.connect(self._browse_folder)
        form.addWidget(self.ed_folder, 0, 1)
        form.addWidget(btn_browse, 0, 2)

        # Format & quality
        form.addWidget(QLabel("Default Format"), 1, 0)
        self.cb_format = QComboBox()
        self.cb_format.addItems(["PNG", "JPG", "BMP"])
        self.cb_format.setCurrentText(self._settings.default_format)
        form.addWidget(self.cb_format, 1, 1)

        form.addWidget(QLabel("JPG Quality"), 2, 0)
        self.sp_quality = QSpinBox()
        self.sp_quality.setRange(50, 100)
        self.sp_quality.setValue(self._settings.jpg_quality)
        form.addWidget(self.sp_quality, 2, 1)

        # Sensitivity & padding
        form.addWidget(QLabel("Detection Sensitivity"), 3, 0)
        self.sl_sensitivity = QSlider(Qt.Orientation.Horizontal)
        self.sl_sensitivity.setRange(10, 100)
        self.sl_sensitivity.setValue(self._settings.detection_sensitivity)
        form.addWidget(self.sl_sensitivity, 3, 1)

        form.addWidget(QLabel("Smart Crop Padding (px)"), 4, 0)
        self.sp_padding = QSpinBox()
        self.sp_padding.setRange(-20, 40)
        self.sp_padding.setValue(self._settings.smart_crop_padding)
        form.addWidget(self.sp_padding, 4, 1)

        # Filename template
        form.addWidget(QLabel("Filename Format"), 5, 0)
        self.ed_template = QLineEdit(self._settings.filename_template)
        form.addWidget(self.ed_template, 5, 1)

        # Monitor
        form.addWidget(QLabel("Monitor Target"), 6, 0)
        self.cb_monitor = QComboBox()
        self.cb_monitor.addItem("Active Window Monitor", "active")
        self.cb_monitor.addItem("All Monitors (Virtual Desktop)", "all")
        for m in self._monitors:
            self.cb_monitor.addItem(m.label, str(m.index))
        idx = self.cb_monitor.findData(self._settings.monitor_mode)
        if idx >= 0:
            self.cb_monitor.setCurrentIndex(idx)
        form.addWidget(self.cb_monitor, 6, 1)

        # Hotkey
        form.addWidget(QLabel("Smart Capture Hotkey"), 7, 0)
        self.ed_hotkey = QLineEdit(self._settings.hotkeys.get("smart_capture", "<ctrl>+<shift>+s"))
        form.addWidget(self.ed_hotkey, 7, 1)

        # Checkboxes
        self.cb_set_startup = QCheckBox("Start with Windows")
        self.cb_set_startup.setChecked(self._settings.start_with_windows)
        self.cb_set_appdet = QCheckBox("Enable Active Application Detection")
        self.cb_set_appdet.setChecked(self._settings.app_detection_enabled)
        self.cb_set_ai = QCheckBox("Enable Optional Gemini AI Artwork Boundary Detection")
        self.cb_set_ai.setChecked(self._settings.ai_detection_enabled)
        self.cb_set_silent = QCheckBox("Capture without notification")
        self.cb_set_silent.setChecked(self._settings.capture_without_notification)

        form.addWidget(self.cb_set_startup, 8, 1)
        form.addWidget(self.cb_set_appdet, 9, 1)
        form.addWidget(self.cb_set_ai, 10, 1)
        form.addWidget(self.cb_set_silent, 11, 1)

        btn_save_settings = QPushButton("Save Settings")
        btn_save_settings.setObjectName("PrimaryButton")
        btn_save_settings.clicked.connect(self._emit_settings_save)
        form.addWidget(btn_save_settings, 12, 1, alignment=Qt.AlignmentFlag.AlignLeft)

        layout.addWidget(card)
        layout.addStretch()
        scroll.setWidget(wrap)
        return scroll

    def _browse_folder(self) -> None:
        folder = QFileDialog.getExistingDirectory(self, "Select Output Folder", self.ed_folder.text())
        if folder:
            self.ed_folder.setText(folder)

    def _sync_quick_toggles(self) -> None:
        self._settings.auto_copy_clipboard = self.cb_dash_autocopy.isChecked()
        self._settings.preview_after_capture = self.cb_dash_preview.isChecked()
        self._settings.auto_save = self.cb_dash_autosave.isChecked()
        self._settings.show_notification = self.cb_dash_toast.isChecked()
        self.settings_changed.emit(self._settings)

    def _emit_settings_save(self) -> None:
        self._settings.output_folder = self.ed_folder.text().strip() or self._settings.output_folder
        self._settings.default_format = self.cb_format.currentText()
        self._settings.jpg_quality = self.sp_quality.value()
        self._settings.detection_sensitivity = self.sl_sensitivity.value()
        self._settings.smart_crop_padding = self.sp_padding.value()
        self._settings.filename_template = self.ed_template.text().strip() or "Artwork_{date}_{time}"
        self._settings.monitor_mode = str(self.cb_monitor.currentData())
        self._settings.hotkeys["smart_capture"] = self.ed_hotkey.text().strip() or "<ctrl>+<shift>+s"
        self._settings.start_with_windows = self.cb_set_startup.isChecked()
        self._settings.app_detection_enabled = self.cb_set_appdet.isChecked()
        self._settings.ai_detection_enabled = self.cb_set_ai.isChecked()
        self._settings.capture_without_notification = self.cb_set_silent.isChecked()
        self.settings_changed.emit(self._settings)

    def update_detected_app(self, app_name: str, status_text: str) -> None:
        self.detected_app_lbl.setText(f"Detected Application: {app_name}")
        self.detection_status_lbl.setText(f"Artwork Detection: {status_text}")
