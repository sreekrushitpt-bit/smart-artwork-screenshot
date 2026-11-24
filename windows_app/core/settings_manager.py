"""Persistent application settings and Windows startup registry integration."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict

APP_NAME = "SmartArtworkScreenshot"


def default_output_folder() -> str:
    pictures = Path.home() / "Pictures" / "SmartArtworkScreenshots"
    pictures.mkdir(parents=True, exist_ok=True)
    return str(pictures)


@dataclass
class HotkeyConfig:
    smart_capture: str = "<ctrl>+<shift>+s"
    manual_capture: str = "<ctrl>+<shift>+m"
    active_window: str = "<ctrl>+<shift>+w"
    selected_artwork: str = "<ctrl>+<shift>+a"
    quick_save: str = "<ctrl>+<shift>+q"
    open_folder: str = "<ctrl>+<shift>+o"


@dataclass
class AppSettings:
    auto_copy_clipboard: bool = True
    preview_after_capture: bool = True
    auto_save: bool = False
    show_notification: bool = True
    capture_without_notification: bool = False
    default_format: str = "PNG"  # PNG | JPG | BMP
    jpg_quality: int = 95
    output_folder: str = field(default_factory=default_output_folder)
    filename_template: str = "Artwork_{date}_{time}"
    detection_sensitivity: int = 75  # 10..100
    smart_crop_padding: int = 0  # pixels around detected artwork (-20..40)
    app_detection_enabled: bool = True
    ai_detection_enabled: bool = False
    monitor_mode: str = "active"  # "active" | "all" | "0" | "1" ...
    start_with_windows: bool = False
    hotkeys: Dict[str, str] = field(default_factory=lambda: asdict(HotkeyConfig()))


class SettingsManager:
    def __init__(self) -> None:
        appdata = os.environ.get("APPDATA") or str(Path.home())
        self.config_dir = Path(appdata) / APP_NAME
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.config_path = self.config_dir / "settings.json"
        self.settings = self.load()

    def load(self) -> AppSettings:
        if not self.config_path.exists():
            cfg = AppSettings()
            self.save(cfg)
            return cfg
        try:
            raw = json.loads(self.config_path.read_text(encoding="utf-8"))
            defaults = asdict(AppSettings())
            defaults.update(raw)
            if isinstance(raw.get("hotkeys"), dict):
                hk = asdict(HotkeyConfig())
                hk.update(raw["hotkeys"])
                defaults["hotkeys"] = hk
            return AppSettings(**defaults)
        except Exception:
            return AppSettings()

    def save(self, settings: AppSettings | None = None) -> None:
        if settings is not None:
            self.settings = settings
        Path(self.settings.output_folder).mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(
            json.dumps(asdict(self.settings), indent=2), encoding="utf-8"
        )
        self._sync_windows_startup(self.settings.start_with_windows)

    def _sync_windows_startup(self, enable: bool) -> None:
        if sys.platform != "win32":
            return
        try:
            import winreg

            run_key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, run_key_path, 0, winreg.KEY_SET_VALUE
            ) as key:
                if enable:
                    exe_path = (
                        f'"{sys.executable}"'
                        if getattr(sys, "frozen", False)
                        else f'"{sys.executable}" "{Path(__file__).resolve().parent.parent / "main.py"}"'
                    )
                    winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, exe_path)
                else:
                    try:
                        winreg.DeleteValue(key, APP_NAME)
                    except FileNotFoundError:
                        pass
        except Exception:
            pass
