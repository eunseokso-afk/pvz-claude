// Tiny static server for the game.
//   node serve.js        -> http://localhost:8080
//   node serve.js 3000   -> http://localhost:3000
//
// A server is required: the game fetches resources.xml, .reanim files and
// assets.json, and browsers block fetch() on file:// URLs.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8080;
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.xml': 'text/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.reanim': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';

  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)) {           // no escaping the game folder
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',        // always pick up edits on reload
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Plants vs. Zombies running at http://localhost:${PORT}`);
});
