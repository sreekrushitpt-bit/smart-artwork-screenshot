"""Global Windows hotkey listener using pynput without interfering with design apps."""

from __future__ import annotations

from typing import Callable, Dict, Optional

from pynput import keyboard


class HotkeyManager:
    def __init__(self) -> None:
        self._listener: Optional[keyboard.GlobalHotKeys] = None

    def register(self, bindings: Dict[str, Callable[[], None]]) -> None:
        self.stop()
        clean_map: Dict[str, Callable[[], None]] = {}
        for combo, handler in bindings.items():
            normalized = self._normalize_combo(combo)
            if normalized:
                clean_map[normalized] = handler
        if not clean_map:
            return
        self._listener = keyboard.GlobalHotKeys(clean_map)
        self._listener.daemon = True
        self._listener.start()

    def stop(self) -> None:
        if self._listener is not None:
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None

    @staticmethod
    def _normalize_combo(combo: str) -> str:
        # Accepts either "<ctrl>+<shift>+s" or "Ctrl+Shift+S"
        parts = [p.strip().lower() for p in combo.split("+") if p.strip()]
        mapped = []
        for p in parts:
            p_clean = p.strip("<>")
            if p_clean in {"ctrl", "control", "alt", "shift", "cmd", "win", "super"}:
                mapped.append(f"<{ 'cmd' if p_clean == 'win' else p_clean }>")
            elif len(p_clean) > 1 and p_clean.startswith("f") and p_clean[1:].isdigit():
                mapped.append(f"<{p_clean}>")
            else:
                mapped.append(p_clean)
        return "+".join(mapped)
