"""Entry point and background workflow controller for Smart Artwork Screenshot."""

from __future__ import annotations

import ctypes
import sys
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PySide6.QtCore import QObject, QRect, Qt, QTimer, Signal
from PySide6.QtGui import QAction, QIcon
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from core.ai_detector import AIArtworkDetector
from core.artwork_detector import ArtworkDetector, DetectedRegion
from core.clipboard_manager import ClipboardManager
from core.file_manager import FileManager
from core.history_manager import HistoryManager
from core.hotkey_manager import HotkeyManager
from core.screen_capture import ScreenCaptureEngine
from core.settings_manager import AppSettings, SettingsManager
from core.window_detector import ActiveAppInfo, WindowDetector
from ui.artboard_picker import ArtboardPickerDialog
from ui.main_window import MainWindow
from ui.manual_overlay import ManualSelectionOverlay
from ui.preview_window import PreviewWindow
from ui.theme import DARK_STYLESHEET
from ui.toast_notification import CaptureToastNotification


def enable_windows_dpi_awareness() -> None:
    if sys.platform != "win32":
        return
    try:
        # Per-Monitor DPI Aware v2
        ctypes.windll.user32.SetProcessDpiAwarenessContext(-4)
    except Exception:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass


class AppController(QObject):
    """Bridges background Win32 hotkeys to the Qt UI thread safely."""

    trigger_smart = Signal()
    trigger_manual = Signal()
    trigger_active_window = Signal()
    trigger_multi_artboard = Signal()
    trigger_quick_save = Signal()
    trigger_open_folder = Signal()

    def __init__(self, app: QApplication) -> None:
        super().__init__()
        self.app = app
        self.settings_mgr = SettingsManager()
        self.window_detector = WindowDetector()
        self.screen_capture = ScreenCaptureEngine()
        self.artwork_detector = ArtworkDetector()
        self.ai_detector = AIArtworkDetector()
        self.clipboard_mgr = ClipboardManager()
        self.file_mgr = FileManager()
        self.history_mgr = HistoryManager()
        self.hotkey_mgr = HotkeyManager()

        self.toast = CaptureToastNotification()
        monitors = self.screen_capture.list_monitors()
        self.main_win = MainWindow(self.settings_mgr.settings, monitors)
        self.main_win.refresh_history(self.history_mgr.list_entries())

        self._last_bgr: Optional[np.ndarray] = None
        self._last_cropped_bgr: Optional[np.ndarray] = None
        self._last_app_name: str = "Desktop"
        self._overlay: Optional[ManualSelectionOverlay] = None

        self._wire_signals()
        self._register_hotkeys()
        self._setup_tray()

        # Poll active design app every 1.2s with minimal CPU overhead
        self._poll_timer = QTimer(self)
        self._poll_timer.timeout.connect(self._poll_active_window)
        self._poll_timer.start(1200)

    def _wire_signals(self) -> None:
        self.trigger_smart.connect(self.run_smart_capture)
        self.trigger_manual.connect(self.run_manual_capture)
        self.trigger_active_window.connect(self.run_active_window_capture)
        self.trigger_multi_artboard.connect(self.run_multi_artboard_capture)
        self.trigger_quick_save.connect(self.run_quick_save)
        self.trigger_open_folder.connect(self.open_output_folder)

        self.main_win.smart_capture_clicked.connect(self.run_smart_capture)
        self.main_win.manual_capture_clicked.connect(self.run_manual_capture)
        self.main_win.active_window_clicked.connect(self.run_active_window_capture)
        self.main_win.multi_artboard_clicked.connect(self.run_multi_artboard_capture)
        self.main_win.open_folder_clicked.connect(self.open_output_folder)
        self.main_win.settings_changed.connect(self._on_settings_updated)
        self.main_win.history_copy_requested.connect(self._copy_from_history)
        self.main_win.history_delete_requested.connect(self._delete_from_history)
        self.main_win.history_recapture_requested.connect(self.run_smart_capture)

    def _register_hotkeys(self) -> None:
        hk = self.settings_mgr.settings.hotkeys
        self.hotkey_mgr.register(
            {
                hk.get("smart_capture", "<ctrl>+<shift>+s"): self.trigger_smart.emit,
                hk.get("manual_capture", "<ctrl>+<shift>+m"): self.trigger_manual.emit,
                hk.get("active_window", "<ctrl>+<shift>+w"): self.trigger_active_window.emit,
                hk.get("selected_artwork", "<ctrl>+<shift>+a"): self.trigger_multi_artboard.emit,
                hk.get("quick_save", "<ctrl>+<shift>+q"): self.trigger_quick_save.emit,
                hk.get("open_folder", "<ctrl>+<shift>+o"): self.trigger_open_folder.emit,
            }
        )

    def _setup_tray(self) -> None:
        self.tray = QSystemTrayIcon(self.app)
        self.tray.setIcon(self.app.style().standardIcon(self.app.style().StandardPixmap.SP_DesktopIcon))
        self.tray.setToolTip("Smart Artwork Screenshot — Press Ctrl+Shift+S")
        menu = QMenu()

        act_show = QAction("Open Dashboard", self)
        act_smart = QAction("Smart Capture (Ctrl+Shift+S)", self)
        act_manual = QAction("Manual Capture (Ctrl+Shift+M)", self)
        act_folder = QAction("Open Output Folder", self)
        act_quit = QAction("Exit", self)

        act_show.triggered.connect(self.main_win.showNormal)
        act_smart.triggered.connect(self.run_smart_capture)
        act_manual.triggered.connect(self.run_manual_capture)
        act_folder.triggered.connect(self.open_output_folder)
        act_quit.triggered.connect(self.app.quit)

        for a in (act_show, act_smart, act_manual, act_folder, act_quit):
            menu.addAction(a)
        self.tray.setContextMenu(menu)
        self.tray.show()

    def _poll_active_window(self) -> None:
        if not self.settings_mgr.settings.app_detection_enabled:
            return
        info = self.window_detector.detect_active()
        if info and info.app_name != "Smart Artwork Screenshot":
            status = "Ready" if info.is_design_app else "Monitoring Active Window"
            self.main_win.update_detected_app(info.app_name, status)

    def _capture_target_screen(self) -> tuple[np.ndarray, Optional[ActiveAppInfo], int, int]:
        app_info = self.window_detector.detect_active()
        mode = self.settings_mgr.settings.monitor_mode
        if mode == "all":
            bgr, mon = self.screen_capture.capture_virtual_screen()
        elif mode.isdigit():
            bgr, mon = self.screen_capture.capture_monitor(int(mode))
        else:
            mon_idx = app_info.monitor_index if app_info else 0
            bgr, mon = self.screen_capture.capture_monitor(mon_idx)
        return bgr, app_info, mon.left, mon.top

    def run_smart_capture(self) -> None:
        s = self.settings_mgr.settings
        bgr, app_info, _, _ = self._capture_target_screen()
        self._last_bgr = bgr
        app_name = app_info.app_name if app_info else "Design Workspace"
        self._last_app_name = app_name

        regions = []
        if s.ai_detection_enabled and self.ai_detector.is_available():
            regions = self.ai_detector.detect(bgr)
        if not regions:
            regions = self.artwork_detector.detect_artworks(
                bgr,
                app_info=app_info,
                sensitivity=s.detection_sensitivity,
                multi_artboard=False,
                padding=s.smart_crop_padding,
            )

        best = regions[0]
        cropped = self.screen_capture.crop_bgr(bgr, best.x, best.y, best.width, best.height)
        self._finalize_capture(cropped, app_name, "Smart Auto", initial_rect=QRect(best.x, best.y, best.width, best.height))

    def run_active_window_capture(self) -> None:
        app_info = self.window_detector.detect_active()
        if app_info:
            l, t, r, b = app_info.rect
            bgr = self.screen_capture.capture_region(l, t, r - l, b - t)
            app_name = app_info.app_name
        else:
            bgr, _, _, _ = self._capture_target_screen()
            app_name = "Active Window"
        self._last_bgr = bgr
        self._last_app_name = app_name
        self._finalize_capture(bgr, app_name, "Active Window")

    def run_multi_artboard_capture(self) -> None:
        s = self.settings_mgr.settings
        bgr, app_info, _, _ = self._capture_target_screen()
        self._last_bgr = bgr
        app_name = app_info.app_name if app_info else "Multi-Artboard"
        self._last_app_name = app_name

        regions = self.artwork_detector.detect_artworks(
            bgr,
            app_info=app_info,
            sensitivity=s.detection_sensitivity,
            multi_artboard=True,
            padding=s.smart_crop_padding,
        )
        if len(regions) <= 1:
            r = regions[0]
            cropped = self.screen_capture.crop_bgr(bgr, r.x, r.y, r.width, r.height)
            self._finalize_capture(cropped, app_name, "Page / Artboard")
            return

        picker = ArtboardPickerDialog(bgr, regions, self.main_win)
        picker.capture_single.connect(
            lambda idx: self._finalize_capture(
                self.screen_capture.crop_bgr(
                    bgr, regions[idx].x, regions[idx].y, regions[idx].width, regions[idx].height
                ),
                app_name,
                f"Artboard {idx + 1}",
            )
        )
        picker.capture_all_batch.connect(lambda: self._batch_save_artboards(bgr, regions, app_name))
        picker.exec()

    def _batch_save_artboards(
        self, bgr: np.ndarray, regions: list[DetectedRegion], app_name: str
    ) -> None:
        s = self.settings_mgr.settings
        for idx, reg in enumerate(regions, start=1):
            crop = self.screen_capture.crop_bgr(bgr, reg.x, reg.y, reg.width, reg.height)
            fname = self.file_mgr.generate_filename(
                f"{s.filename_template}_Page{idx}", s.default_format, app_name
            )
            dest = Path(s.output_folder) / fname
            self.file_mgr.save_bgr_image(crop, dest, s.default_format, s.jpg_quality)
            self.history_mgr.add_entry(crop, fname, str(dest), app_name, "Batch Artboard", False)
        self.main_win.refresh_history(self.history_mgr.list_entries())
        if s.show_notification and not s.capture_without_notification:
            self.toast.show_message(
                f"✓ Captured {len(regions)} Artboards",
                f"Saved to {s.output_folder}",
            )

    def run_manual_capture(self, initial_rect: Optional[QRect] = None) -> None:
        bgr, app_info, mon_l, mon_t = self._capture_target_screen()
        self._last_bgr = bgr
        self._last_app_name = app_info.app_name if app_info else "Manual Selection"
        h, w = bgr.shape[:2]

        self._overlay = ManualSelectionOverlay(
            bgr, QRect(mon_l, mon_t, w, h), initial_rect=initial_rect
        )
        self._overlay.region_selected.connect(
            lambda rect: self._finalize_capture(
                self.screen_capture.crop_bgr(bgr, rect.x(), rect.y(), rect.width(), rect.height()),
                self._last_app_name,
                "Manual Selection",
                initial_rect=rect,
            )
        )
        self._overlay.show()

    def _finalize_capture(
        self,
        cropped_bgr: np.ndarray,
        app_name: str,
        mode: str,
        initial_rect: Optional[QRect] = None,
    ) -> None:
        s = self.settings_mgr.settings
        self._last_cropped_bgr = cropped_bgr

        # MANDATORY CORE FEATURE: Immediate native CF_DIB Clipboard Copy
        copied = False
        if s.auto_copy_clipboard:
            copied = self.clipboard_mgr.copy_bgr_image(cropped_bgr)

        saved_path = ""
        filename = self.file_mgr.generate_filename(s.filename_template, s.default_format, app_name)
        if s.auto_save:
            dest = Path(s.output_folder) / filename
            self.file_mgr.save_bgr_image(cropped_bgr, dest, s.default_format, s.jpg_quality)
            saved_path = str(dest)
            self.history_mgr.add_entry(cropped_bgr, filename, saved_path, app_name, mode, copied)
            self.main_win.refresh_history(self.history_mgr.list_entries())

        h, w = cropped_bgr.shape[:2]
        if s.show_notification and not s.capture_without_notification:
            self.toast.show_message(
                "✓ Artwork Captured",
                "✓ Copied to Clipboard" if copied else "Ready to Save",
                f"{app_name} · {w}×{h} px",
            )

        if s.preview_after_capture:
            dlg = PreviewWindow(
                cropped_bgr,
                filename,
                s.default_format,
                app_name,
                copied_already=copied,
                parent=self.main_win,
            )
            dlg.save_requested.connect(
                lambda fn, fmt: self._save_from_preview(cropped_bgr, Path(s.output_folder) / fn, fmt, app_name, mode, copied)
            )
            dlg.save_as_requested.connect(
                lambda full_path, fmt: self._save_from_preview(cropped_bgr, Path(full_path), fmt, app_name, mode, copied)
            )
            dlg.copy_requested.connect(lambda: self._copy_and_toast(cropped_bgr, app_name))
            dlg.recapture_requested.connect(self.run_smart_capture)
            dlg.adjust_crop_requested.connect(lambda: self.run_manual_capture(initial_rect))
            dlg.open_folder_requested.connect(self.open_output_folder)
            dlg.exec()

    def _save_from_preview(
        self,
        bgr: np.ndarray,
        dest: Path,
        fmt: str,
        app_name: str,
        mode: str,
        copied: bool,
    ) -> None:
        s = self.settings_mgr.settings
        saved = self.file_mgr.save_bgr_image(bgr, dest, fmt, s.jpg_quality)
        self.history_mgr.add_entry(bgr, saved.name, str(saved), app_name, mode, copied)
        self.main_win.refresh_history(self.history_mgr.list_entries())
        if s.show_notification and not s.capture_without_notification:
            self.toast.show_message("✓ Saved Artwork", saved.name, str(saved.parent))

    def _copy_and_toast(self, bgr: np.ndarray, app_name: str) -> None:
        ok = self.clipboard_mgr.copy_bgr_image(bgr)
        if ok:
            self.toast.show_message("✓ Copied to Clipboard", "Ready to paste with Ctrl+V", app_name)

    def run_quick_save(self) -> None:
        if self._last_cropped_bgr is None:
            self.run_smart_capture()
            return
        s = self.settings_mgr.settings
        fname = self.file_mgr.generate_filename(s.filename_template, s.default_format, self._last_app_name)
        self._save_from_preview(
            self._last_cropped_bgr,
            Path(s.output_folder) / fname,
            s.default_format,
            self._last_app_name,
            "Quick Save",
            True,
        )

    def open_output_folder(self) -> None:
        self.file_mgr.open_folder(self.settings_mgr.settings.output_folder)

    def _on_settings_updated(self, new_settings: AppSettings) -> None:
        self.settings_mgr.save(new_settings)
        self._register_hotkeys()

    def _copy_from_history(self, file_path: str) -> None:
        if file_path and Path(file_path).exists():
            bgr = cv2.imread(file_path)
            if bgr is not None:
                self._copy_and_toast(bgr, "History")

    def _delete_from_history(self, entry_id: str) -> None:
        self.history_mgr.delete_entry(entry_id, delete_file=False)
        self.main_win.refresh_history(self.history_mgr.list_entries())


def main() -> int:
    enable_windows_dpi_awareness()
    app = QApplication(sys.argv)
    app.setApplicationName("Smart Artwork Screenshot")
    app.setStyleSheet(DARK_STYLESHEET)

    controller = AppController(app)
    controller.main_win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
