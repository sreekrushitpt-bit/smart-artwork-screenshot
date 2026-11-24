"""Lossless screenshot saving, naming templates, and output folder utilities."""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image


class FileManager:
    @staticmethod
    def generate_filename(
        template: str = "Artwork_{date}_{time}",
        ext: str = "PNG",
        app_name: str = "Design",
    ) -> str:
        now = datetime.now()
        safe_app = "".join(c for c in app_name if c.isalnum() or c in "-_").strip() or "Design"
        stem = (
            template.replace("{date}", now.strftime("%Y-%m-%d"))
            .replace("{time}", now.strftime("%H-%M-%S"))
            .replace("{app}", safe_app)
        )
        clean_ext = ext.lower().lstrip(".")
        if clean_ext == "jpeg":
            clean_ext = "jpg"
        return f"{stem}.{clean_ext}"

    @staticmethod
    def save_bgr_image(
        bgr_image: np.ndarray,
        dest_path: str | Path,
        fmt: str = "PNG",
        jpg_quality: int = 95,
    ) -> Path:
        path = Path(dest_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        rgb = bgr_image[:, :, ::-1]
        pil_img = Image.fromarray(rgb, mode="RGB")

        fmt_upper = fmt.upper()
        if fmt_upper in {"JPG", "JPEG"}:
            pil_img.save(path, format="JPEG", quality=int(jpg_quality), subsampling=0)
        elif fmt_upper == "BMP":
            pil_img.save(path, format="BMP")
        else:
            # Lossless PNG with fast compression (zero visual artifacts)
            pil_img.save(path, format="PNG", compress_level=1, optimize=False)
        return path

    @staticmethod
    def open_folder(folder_path: str | Path) -> None:
        path = Path(folder_path)
        path.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(str(path))
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)])
