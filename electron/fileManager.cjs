const fs = require('fs');
const path = require('path');
const { app, dialog, shell } = require('electron');

function getUserDataDir() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDefaultOutputFolder() {
  const pictures = app.getPath('pictures');
  const folder = path.join(pictures, 'SmartArtworkScreenshots');
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

function getSettingsPath() {
  return path.join(getUserDataDir(), 'settings.json');
}

function getHistoryPath() {
  return path.join(getUserDataDir(), 'history.json');
}

function loadSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch {
    // ignore corrupt settings
  }
  return null;
}

function saveSettings(settings) {
  const p = getSettingsPath();
  fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8');
  if (settings && settings.saveFolderLabel) {
    try {
      fs.mkdirSync(settings.saveFolderLabel, { recursive: true });
    } catch {
      // ignore invalid path preview
    }
  }
  return true;
}

function loadHistory() {
  try {
    const p = getHistoryPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(items) {
  const p = getHistoryPath();
  fs.writeFileSync(p, JSON.stringify(items.slice(0, 60), null, 2), 'utf-8');
  return true;
}

function decodeBase64Buffer(base64OrDataUrl) {
  const clean = String(base64OrDataUrl || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(clean, 'base64');
}

function saveScreenshotToFolder({ base64Data, filename, folderPath }) {
  const destDir = folderPath && folderPath.trim() ? folderPath.trim() : getDefaultOutputFolder();
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, filename);
  fs.writeFileSync(destPath, decodeBase64Buffer(base64Data));
  return { ok: true, filePath: destPath, folderPath: destDir };
}

async function saveScreenshotAs({ parentWindow, base64Data, defaultFilename, format, defaultFolder }) {
  const dir = defaultFolder && fs.existsSync(defaultFolder) ? defaultFolder : getDefaultOutputFolder();
  const ext = String(format || 'PNG').toLowerCase();
  const filters =
    ext === 'jpg' || ext === 'jpeg'
      ? [{ name: 'JPEG Image', extensions: ['jpg', 'jpeg'] }]
      : ext === 'bmp'
      ? [{ name: 'Bitmap Image', extensions: ['bmp'] }]
      : [{ name: 'PNG Image', extensions: ['png'] }];

  const result = await dialog.showSaveDialog(parentWindow, {
    title: 'Save Artwork Screenshot As',
    defaultPath: path.join(dir, defaultFilename),
    filters: [...filters, { name: 'All Images', extensions: ['png', 'jpg', 'bmp'] }],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  fs.writeFileSync(result.filePath, decodeBase64Buffer(base64Data));
  return {
    canceled: false,
    ok: true,
    filePath: result.filePath,
    filename: path.basename(result.filePath),
    folderPath: path.dirname(result.filePath),
  };
}

async function chooseOutputFolder(parentWindow, currentFolder) {
  const result = await dialog.showOpenDialog(parentWindow, {
    title: 'Select Screenshot Output Folder',
    defaultPath: currentFolder || getDefaultOutputFolder(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
}

async function openOutputFolder(folderPath) {
  const target = folderPath && folderPath.trim() ? folderPath.trim() : getDefaultOutputFolder();
  fs.mkdirSync(target, { recursive: true });
  await shell.openPath(target);
  return target;
}

module.exports = {
  getDefaultOutputFolder,
  loadSettings,
  saveSettings,
  loadHistory,
  saveHistory,
  saveScreenshotToFolder,
  saveScreenshotAs,
  chooseOutputFolder,
  openOutputFolder,
};
