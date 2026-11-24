# Smart Artwork Screenshot — Electron Windows Desktop App

Standalone Windows 10 & Windows 11 desktop application built with **Electron + React + Vite + Tailwind CSS + Electron Builder**.

## Native Windows Capabilities

- **Main Process & Secure Preload (`electron/main.cjs`, `electron/preload.cjs`)**: Context-isolated IPC bridge with single-instance lock and Windows `AppUserModelId`.
- **Real Windows Screen Capture (`electron/screenCapture.cjs`)**: Uses `desktopCapturer` and `screen.getAllDisplays()` to capture physical high-DPI monitors and active design windows without browser prompts.
- **Foreground Design Software Detection (`electron/windowDetector.cjs`)**: Queries Win32 `user32.dll` (`GetForegroundWindow`, `GetWindowText`, `GetWindowThreadProcessId`) to identify **CorelDRAW (`CorelDRW.exe`)**, **Adobe Photoshop (`Photoshop.exe`)**, **Adobe Illustrator (`Illustrator.exe`)**, **Adobe InDesign (`InDesign.exe`)**, **Canva Desktop**, **Affinity Designer**, and **Figma**.
- **Global Keyboard Shortcuts (`Ctrl+Shift+S`, `Ctrl+Shift+M`, `Ctrl+Shift+W`, `Ctrl+Shift+A`, `Ctrl+Shift+Q`, `Ctrl+Shift+O`)**: System-wide `globalShortcut` registration active even when minimized to the System Tray.
- **Native Windows Clipboard Bitmap Copying (`electron/clipboardManager.cjs`)**: Writes cropped artwork directly to the Windows Clipboard as raw bitmap pixel data (`clipboard.writeImage` -> `CF_DIB` / `CF_BITMAP`), ready for `Ctrl+V` in PowerPoint, Word, Excel, CorelDRAW, Photoshop, Illustrator, WhatsApp Desktop, Telegram, Outlook, and Paint.
- **Fullscreen Transparent Manual Selection (`electron/overlay.html`)**: Native always-on-top monitor overlay with drag-to-select, 8 resize handles, drag-to-move, 1px arrow-key nudging, `Enter` to capture, and `Esc` to cancel.
- **System Tray & Background Operation**: Closing the main window minimizes to the Windows System Tray; non-focus-stealing corner toast (`electron/toast.html`) confirms capture and clipboard copy.

## Development & Building Windows `.exe` Installer

```bash
npm install
npm run electron:dev
```

To build the standalone Windows 10/11 NSIS installer (`Smart Artwork Screenshot-Setup-1.0.0.exe`) and portable `.exe`:

```bash
npm run dist:win
```

The installer will be generated in `release/`.
