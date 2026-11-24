# Smart Artwork Screenshot — Windows Desktop Software

A native Windows 10/11 desktop screenshot utility built for graphic designers working in **CorelDRAW, Adobe Photoshop, Adobe Illustrator, Adobe InDesign, Canva Desktop, Affinity Designer, and Figma**.

## Core Capabilities

- **Mode 1 — Smart Auto Capture (`Ctrl + Shift + S`)**: Identifies the active design application via Win32 APIs, strips toolbars, menus, rulers, property bars, dockers, and Windows taskbars, detects the artwork/canvas boundaries using multi-strategy OpenCV vision (LAB pasteboard separation + Canny rectangle scoring + Sobel projection), crops cleanly, and immediately copies raw bitmap pixels to the Windows Clipboard.
- **Mode 2 — Manual Artwork Selection (`Ctrl + Shift + M`)**: Transparent multi-monitor overlay with drag-to-select, 8 resize handles, drag-to-move, 1px/10px arrow-key nudging, live pixel dimensions HUD, `Enter` to capture, and `Escape` to cancel.
- **Mode 3 — Active Window / Page Detection (`Ctrl + Shift + W`)**: Isolates CorelDRAW pages, Illustrator artboards, Photoshop canvases, and InDesign spreads.
- **Mode 4 — Multiple Artboards / Pages (`Ctrl + Shift + A`)**: Detects multiple visible artboards side-by-side and supports individual capture or batch multi-page export.
- **Mandatory Auto Clipboard Copy (`CF_DIB`)**: Converts the cropped artwork to `CF_DIB` pixel data (NOT a file path) so `Ctrl + V` pastes directly into PowerPoint, Word, Excel, CorelDRAW, Photoshop, Illustrator, WhatsApp Desktop, Telegram, Outlook, and Paint.

## Running from Source on Windows 10 / 11

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

*(Optional)* To enable Gemini AI boundary refinement, set `GEMINI_API_KEY` in your Windows environment variables and enable AI detection in Settings.

## Building a Standalone Windows `.exe`

Double-click `build_windows_exe.bat` or run:

```powershell
pyinstaller --noconfirm --clean build_exe.spec
```

The standalone executable will be generated at `dist\SmartArtworkScreenshot.exe`.
