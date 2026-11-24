import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import JSZip from 'jszip';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

function addDirectoryToZip(zipFolder: JSZip, dirPath: string): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '__pycache__' || entry.name === '.venv' || entry.name === 'dist' || entry.name === 'build') {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = zipFolder.folder(entry.name);
      if (sub) addDirectoryToZip(sub, fullPath);
    } else if (entry.isFile()) {
      zipFolder.file(entry.name, fs.readFileSync(fullPath));
    }
  }
}

app.get('/api/download-windows-app', async (_req, res) => {
  try {
    const winDir = path.resolve(__dirname, 'windows_app');
    if (!fs.existsSync(winDir)) {
      res.status(404).json({ error: 'Windows application source directory not found.' });
      return;
    }

    const zip = new JSZip();
    const root = zip.folder('SmartArtworkScreenshot-Windows');
    if (root) {
      addDirectoryToZip(root, winDir);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="SmartArtworkScreenshot-Windows.zip"'
    );
    res.send(buffer);
  } catch (err) {
    console.error('Failed to package Windows app zip:', err);
    res.status(500).json({ error: 'Failed to package Windows source archive.' });
  }
});

app.get('/api/windows-files', (_req, res) => {
  const winDir = path.resolve(__dirname, 'windows_app');
  if (!fs.existsSync(winDir)) {
    res.json({ files: [] });
    return;
  }
  const files: { path: string; size: number; content: string }[] = [];
  const walk = (dir: string, relBase: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__pycache__' || entry.name === '.venv') continue;
      const full = path.join(dir, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else if (entry.isFile()) {
        const content = fs.readFileSync(full, 'utf-8');
        files.push({ path: rel, size: Buffer.byteLength(content, 'utf-8'), content });
      }
    }
  };
  walk(winDir, '');
  res.json({ files });
});

app.get('/api/download-electron-app', async (_req, res) => {
  try {
    const zip = new JSZip();
    const root = zip.folder('SmartArtworkScreenshot-Electron');
    if (!root) {
      res.status(500).json({ error: 'Failed to create archive root.' });
      return;
    }

    const dirsToInclude = ['electron', 'build', 'src'];
    for (const dirName of dirsToInclude) {
      const fullDir = path.resolve(__dirname, dirName);
      if (fs.existsSync(fullDir)) {
        const sub = root.folder(dirName);
        if (sub) addDirectoryToZip(sub, fullDir);
      }
    }

    const rootFiles = [
      'package.json',
      'index.html',
      'tsconfig.json',
      'vite.config.ts',
      'electron-builder.yml',
      '.env.example',
    ];
    for (const fileName of rootFiles) {
      const fullPath = path.resolve(__dirname, fileName);
      if (fs.existsSync(fullPath)) {
        root.file(fileName, fs.readFileSync(fullPath));
      }
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="SmartArtworkScreenshot-Electron-Windows.zip"'
    );
    res.send(buffer);
  } catch (err) {
    console.error('Failed to package Electron app zip:', err);
    res.status(500).json({ error: 'Failed to package Electron Windows archive.' });
  }
});

app.get('/api/download-windows-exe', (_req, res) => {
  const exeZipPath = path.resolve(
    __dirname,
    'release',
    'Smart Artwork Screenshot-Setup-1.0.0.zip'
  );
  if (!fs.existsSync(exeZipPath)) {
    res.status(404).json({
      error: 'Compiled Windows executable archive not found. Run npm run dist:win first.',
    });
    return;
  }
  res.download(exeZipPath, 'SmartArtworkScreenshot-Win64-Executable.zip');
});

app.get('/api/electron-files', (_req, res) => {
  const files: { path: string; size: number; content: string }[] = [];
  const collectDir = (dirName: string) => {
    const base = path.resolve(__dirname, dirName);
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.isFile() && !entry.name.endsWith('.png') && !entry.name.endsWith('.ico')) {
        const full = path.join(base, entry.name);
        const content = fs.readFileSync(full, 'utf-8');
        files.push({
          path: `${dirName}/${entry.name}`,
          size: Buffer.byteLength(content, 'utf-8'),
          content,
        });
      }
    }
  };
  collectDir('electron');
  for (const rootFile of ['electron-builder.yml', 'package.json']) {
    const full = path.resolve(__dirname, rootFile);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf-8');
      files.push({ path: rootFile, size: Buffer.byteLength(content, 'utf-8'), content });
    }
  }
  res.json({ files });
});

app.post('/api/detect-artwork', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(400).json({
      error: 'GEMINI_API_KEY is not configured in server environment secrets.',
    });
    return;
  }

  const { imageBase64, mimeType = 'image/jpeg', appName = 'Design Software', multiArtboard = false } =
    req.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    res.status(400).json({ error: 'Missing imageBase64 payload.' });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const prompt = multiArtboard
      ? `Analyze this ${appName} workspace screenshot. Detect ALL distinct finished graphic design artworks, pages, or artboards visible on the canvas. Strictly EXCLUDE all application menus, toolbars, rulers, dockers, panels, pasteboard margins, and Windows taskbars. Return normalized 0-1000 bounding boxes [ymin, xmin, ymax, xmax] for each artboard.`
      : `Analyze this ${appName} workspace screenshot. Detect the primary finished graphic design artwork, page, or canvas boundary. Strictly EXCLUDE all application menus, toolbars, rulers, dockers, panels, surrounding workspace pasteboard, and Windows taskbars. Return the exact normalized 0-1000 bounding box [ymin, xmin, ymax, xmax] containing only the artwork.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING, description: 'Short label for the detected artwork or artboard' },
              ymin: { type: Type.NUMBER, description: 'Top coordinate 0..1000' },
              xmin: { type: Type.NUMBER, description: 'Left coordinate 0..1000' },
              ymax: { type: Type.NUMBER, description: 'Bottom coordinate 0..1000' },
              xmax: { type: Type.NUMBER, description: 'Right coordinate 0..1000' },
            },
            required: ['label', 'ymin', 'xmin', 'ymax', 'xmax'],
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '[]').trim());
    res.json({ regions: parsed });
  } catch (err) {
    console.error('Gemini artwork detection error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'AI boundary detection failed.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Smart Artwork Screenshot studio listening on http://localhost:${PORT}`);
  });
}

startServer();
