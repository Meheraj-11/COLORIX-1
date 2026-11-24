import express from 'express';
import fs from 'fs';
import http, { type IncomingMessage, type ServerResponse } from 'http';
import path from 'path';

const ROOT_DIR = import.meta.dirname;
const PORT = Number(process.env.PORT) || 3000;
const AUDIO_RANGE_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB per 206 chunk (contiguous for 5.8 MB track, safely below 32 MiB proxy caps)

function resolveAudioAssetPath(reqUrl: string, isProduction: boolean): string | null {
  const pathname = reqUrl.split('?')[0];
  if (!pathname.startsWith('/assets/audio/') || !pathname.endsWith('.mp3')) {
    return null;
  }
  const relName = pathname.slice('/assets/audio/'.length);
  if (!relName || relName.includes('..') || relName.includes('\\') || relName.includes('/')) {
    return null;
  }

  const candidates = isProduction
    ? [
        path.resolve(ROOT_DIR, 'dist/assets/audio', relName),
        path.resolve(ROOT_DIR, 'public/assets/audio', relName),
        path.resolve(ROOT_DIR, 'assets/audio', relName),
      ]
    : [
        path.resolve(ROOT_DIR, 'public/assets/audio', relName),
        path.resolve(ROOT_DIR, 'assets/audio', relName),
        path.resolve(ROOT_DIR, 'dist/assets/audio', relName),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function createChunkedAudioMiddleware(isProduction: boolean) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const method = req.method?.toUpperCase();
    if ((method !== 'GET' && method !== 'HEAD') || !req.url) {
      next();
      return;
    }

    const filePath = resolveAudioAssetPath(req.url, isProduction);
    if (!filePath) {
      next();
      return;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      next();
      return;
    }

    const fileSize = stat.size;
    const baseHeaders: Record<string, string | number> = {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
      'Last-Modified': stat.mtime.toUTCString(),
    };

    if (method === 'HEAD') {
      res.writeHead(200, {
        ...baseHeaders,
        'Content-Length': fileSize,
      });
      res.end();
      return;
    }

    const rangeHeader = req.headers.range;
    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const firstRange = rangeHeader.slice('bytes='.length).split(',')[0].trim();
      const [rawStart, rawEnd] = firstRange.split('-');
      let start: number;
      let requestedEnd: number;

      if (rawStart === '' && rawEnd) {
        const suffixLength = Number.parseInt(rawEnd, 10);
        if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
          res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
          res.end();
          return;
        }
        start = Math.max(0, fileSize - suffixLength);
        requestedEnd = fileSize - 1;
      } else {
        start = Number.parseInt(rawStart, 10);
        requestedEnd = rawEnd ? Number.parseInt(rawEnd, 10) : fileSize - 1;
      }

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(requestedEnd) ||
        start < 0 ||
        start >= fileSize ||
        requestedEnd < start
      ) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }

      const end = Math.min(requestedEnd, start + AUDIO_RANGE_CHUNK_BYTES - 1, fileSize - 1);
      const chunkLength = end - start + 1;

      res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkLength,
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      res.on('close', () => {
        stream.destroy();
      });
      stream.pipe(res);
      return;
    }

    // Standard non-Range GET fallback
    res.writeHead(200, {
      ...baseHeaders,
      'Content-Length': fileSize,
    });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    res.on('close', () => {
      stream.destroy();
    });
    stream.pipe(res);
  };
}

async function startServer(): Promise<void> {
  const app = express();
  const httpServer = http.createServer(app);
  const distDir = path.resolve(ROOT_DIR, 'dist');
  const distIndex = path.resolve(distDir, 'index.html');
  const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(distIndex);

  // Serve MP3 background music in RFC 7233 Range chunks in BOTH dev and production deploy
  app.use(createChunkedAudioMiddleware(!isDev));

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        // Attach Vite's WebSocket server to Express's HTTP server instead of
        // spawning an unreachable standalone WebSocket port (24678) behind proxies.
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir, { maxAge: '1h', index: 'index.html' }));
    app.use((_req, res) => {
      res.sendFile(distIndex);
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`COLORIX server running on http://0.0.0.0:${PORT} (${isDev ? 'development' : 'production'})`);
  });
}

void startServer();
