"""Persistent screenshot history log with thumbnail generation."""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import List

import numpy as np
from PIL import Image


@dataclass
class HistoryEntry:
    id: str
    filename: str
    file_path: str
    thumbnail_path: str
    width: int
    height: int
    app_name: str
    mode: str
    created_at: str
    copied_to_clipboard: bool


class HistoryManager:
    def __init__(self) -> None:
        appdata = os.environ.get("APPDATA") or str(Path.home())
        self.base_dir = Path(appdata) / "SmartArtworkScreenshot"
        self.thumb_dir = self.base_dir / "thumbnails"
        self.thumb_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.base_dir / "history.json"

    def list_entries(self) -> List[HistoryEntry]:
        if not self.db_path.exists():
            return []
        try:
            raw = json.loads(self.db_path.read_text(encoding="utf-8"))
            return [HistoryEntry(**item) for item in raw]
        except Exception:
            return []

    def add_entry(
        self,
        bgr_image: np.ndarray,
        filename: str,
        file_path: str,
        app_name: str,
        mode: str,
        copied_to_clipboard: bool,
    ) -> HistoryEntry:
        entry_id = uuid.uuid4().hex[:12]
        h, w = bgr_image.shape[:2]
        thumb_path = self.thumb_dir / f"{entry_id}.png"

        rgb = bgr_image[:, :, ::-1]
        pil_img = Image.fromarray(rgb, mode="RGB")
        pil_img.thumbnail((320, 220))
        pil_img.save(thumb_path, format="PNG")

        entry = HistoryEntry(
            id=entry_id,
            filename=filename,
            file_path=str(file_path),
            thumbnail_path=str(thumb_path),
            width=w,
            height=h,
            app_name=app_name,
            mode=mode,
            created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            copied_to_clipboard=copied_to_clipboard,
        )

        entries = self.list_entries()
        entries.insert(0, entry)
        self._write(entries[:200])
        return entry

    def delete_entry(self, entry_id: str, delete_file: bool = False) -> None:
        entries = self.list_entries()
        kept: List[HistoryEntry] = []
        for e in entries:
            if e.id == entry_id:
                try:
                    Path(e.thumbnail_path).unlink(missing_ok=True)
                except Exception:
                    pass
                if delete_file and e.file_path:
                    try:
                        Path(e.file_path).unlink(missing_ok=True)
                    except Exception:
                        pass
            else:
                kept.append(e)
        self._write(kept)

    def _write(self, entries: List[HistoryEntry]) -> None:
        self.db_path.write_text(
            json.dumps([asdict(e) for e in entries], indent=2), encoding="utf-8"
        )
