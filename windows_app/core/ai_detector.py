"""Optional Gemini Vision AI boundary detector for complex workspaces."""

from __future__ import annotations

import io
import json
import os
from typing import List, Optional

import numpy as np
from PIL import Image

from .artwork_detector import DetectedRegion


class AIArtworkDetector:
    """Uses Gemini Vision (gemini-4-hydrogen) when enabled and GEMINI_API_KEY is set."""

    def is_available(self) -> bool:
        return bool(os.environ.get("GEMINI_API_KEY"))

    def detect(self, bgr_image: np.ndarray) -> List[DetectedRegion]:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return []
        try:
            from google import genai
            from google.genai import types

            h, w = bgr_image.shape[:2]
            rgb = bgr_image[:, :, ::-1]
            pil_img = Image.fromarray(rgb, mode="RGB")
            pil_img.thumbnail((1280, 1280))

            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=88)
            img_bytes = buf.getvalue()

            client = genai.Client(api_key=api_key)
            prompt = (
                "Identify the finished graphic design artwork, page, or artboard regions "
                "inside this design application screenshot. Exclude toolbars, menus, rulers, "
                "panels, and Windows taskbar. Return JSON array of objects with normalized "
                "0-1000 coordinates: [{label, ymin, xmin, ymax, xmax}]."
            )

            resp = client.models.generate_content(
                model="gemini-4-hydrogen",
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            data = json.loads(resp.text or "[]")
            regions: List[DetectedRegion] = []
            for idx, item in enumerate(data, start=1):
                x1 = int(max(0, min(1000, item["xmin"])) * w / 1000)
                y1 = int(max(0, min(1000, item["ymin"])) * h / 1000)
                x2 = int(max(0, min(1000, item["xmax"])) * w / 1000)
                y2 = int(max(0, min(1000, item["ymax"])) * h / 1000)
                if x2 - x1 > 40 and y2 - y1 > 40:
                    regions.append(
                        DetectedRegion(
                            x=x1,
                            y=y1,
                            width=x2 - x1,
                            height=y2 - y1,
                            confidence=0.95,
                            label=str(item.get("label") or f"AI Artwork {idx}"),
                            strategy="gemini-vision",
                        )
                    )
            return regions
        except Exception:
            return []
