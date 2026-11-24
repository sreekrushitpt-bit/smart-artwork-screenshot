"""Native Windows Image Clipboard manager using CF_DIB pixel data."""

from __future__ import annotations

import io
import sys
import time
import numpy as np
from PIL import Image


class ClipboardManager:
    """
    Copies cropped artwork directly to the Windows Clipboard as raw bitmap image
    pixels (CF_DIB). Windows automatically synthesizes CF_BITMAP and CF_DIBV5 from
    CF_DIB so Ctrl+V works seamlessly in PowerPoint, Word, Excel, CorelDRAW,
    Photoshop, Illustrator, WhatsApp Desktop, Telegram, Outlook, and Paint.
    """

    @staticmethod
    def copy_bgr_image(bgr_image: np.ndarray) -> bool:
        rgb = bgr_image[:, :, ::-1]
        pil_img = Image.fromarray(rgb, mode="RGB")
        return ClipboardManager.copy_pil_image(pil_img)

    @staticmethod
    def copy_pil_image(pil_image: Image.Image) -> bool:
        if pil_image.mode != "RGB":
            pil_image = pil_image.convert("RGB")

        if sys.platform == "win32":
            return ClipboardManager._copy_win32_dib(pil_image)

        # Fallback for non-Windows environments using Qt clipboard
        try:
            from PySide6.QtGui import QGuiApplication, QImage

            buf = io.BytesIO()
            pil_image.save(buf, format="PNG")
            qimg = QImage.fromData(buf.getvalue(), "PNG")
            QGuiApplication.clipboard().setImage(qimg)
            return True
        except Exception:
            return False

    @staticmethod
    def _copy_win32_dib(pil_image: Image.Image) -> bool:
        import win32clipboard

        output = io.BytesIO()
        pil_image.save(output, format="BMP")
        # Strip the 14-byte BITMAPFILEHEADER; CF_DIB starts at BITMAPINFOHEADER
        dib_data = output.getvalue()[14:]
        output.close()

        # Retry briefly in case another app temporarily holds the clipboard lock
        for _ in range(5):
            try:
                win32clipboard.OpenClipboard()
                try:
                    win32clipboard.EmptyClipboard()
                    win32clipboard.SetClipboardData(win32clipboard.CF_DIB, dib_data)
                finally:
                    win32clipboard.CloseClipboard()
                return True
            except Exception:
                time.sleep(0.03)
        return False
