#!/usr/bin/env node
/*
 * Minimal static file server for the Darkfuscator site (no dependencies).
 * Used by Render (`yarn start`) or anywhere: `node tools/serve.js [port]`.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'site');
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip'
};

function resolveFile(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch (e) {
    return null;
  }
  if (p.endsWith('/')) p += 'index.html';
  const full = path.normalize(path.join(ROOT, p));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null; // traversal
  return full;
}

function tryFiles(candidates) {
  for (const c of candidates) {
    try {
      const st = fs.statSync(c);
      if (st.isFile()) return c;
    } catch (e) { /* next */ }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const requested = resolveFile(req.url || '/');
  if (!requested) {
    res.writeHead(400); res.end('Bad request'); return;
  }
  const file = tryFiles([requested, requested + '.html']);
  if (!file) {
    // no client-side routing: a missing page is a real 404
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found'); return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': (ext === '.css' || ext === '.js') ? 'public, max-age=3600' : 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Darkfuscator serving site/ on http://0.0.0.0:' + PORT);
});
