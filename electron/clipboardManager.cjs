const { clipboard, nativeImage } = require('electron');

/**
 * Writes raw bitmap pixel data directly onto the Windows Clipboard (CF_DIB / CF_BITMAP)
 * using Electron's nativeImage + clipboard.writeImage().
 * Compatible with PowerPoint, Word, Excel, CorelDRAW, Photoshop, Illustrator,
 * WhatsApp Desktop, Telegram Desktop, Outlook, Canva, and Paint.
 */
function copyPngDataUrlToClipboard(pngDataUrl) {
  if (!pngDataUrl || typeof pngDataUrl !== 'string') {
    return { ok: false, error: 'Missing image data URL' };
  }
  try {
    const img = nativeImage.createFromDataURL(pngDataUrl);
    if (img.isEmpty()) {
      return { ok: false, error: 'Image buffer was empty' };
    }
    clipboard.writeImage(img);
    const verified = clipboard.readImage();
    const size = verified.getSize();
    return {
      ok: !verified.isEmpty(),
      width: size.width,
      height: size.height,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Clipboard write failed',
    };
  }
}

module.exports = {
  copyPngDataUrlToClipboard,
};
