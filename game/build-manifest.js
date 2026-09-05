// Scans the extracted asset folders and emits game/assets.json.
// Run once:  node game/build-manifest.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const norm = s => s.replace(/[_\s]/g, '').toLowerCase();

// PopCap ships some art as an opaque X.jpg plus an X_.png alpha mask. The
// trailing underscore vanishes under norm(), so masks are kept out of the main
// index (or they'd shadow the colour image) and recorded as partners instead.
function indexDir(dir) {
  const out = {}, masks = {};
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (!/\.(png|jpe?g|gif)$/i.test(f)) continue;
    const base = f.replace(/\.(png|jpe?g|gif)$/i, '');
    if (base.endsWith('_') && /\.png$/i.test(f)) {
      masks[norm(base.slice(0, -1))] = dir + '/' + f;
      continue;
    }
    out[norm(base)] = dir + '/' + f;
  }
  return { out, masks };
}

const reanimDir = indexDir('reanim');
const imagesDir = indexDir('images');

// Every IMAGE_REANIM_* id referenced by any .reanim, resolved to a real file.
const reanimImages = {}, reanimMasks = {};
const unresolved = [];
for (const f of fs.readdirSync(path.join(ROOT, 'reanim'))) {
  if (!f.endsWith('.reanim')) continue;
  const text = fs.readFileSync(path.join(ROOT, 'reanim', f), 'utf8');
  for (const m of text.matchAll(/<i>([^<]+)<\/i>/g)) {
    const id = m[1].trim();
    if (reanimImages[id]) continue;
    const key = norm(id.replace(/^IMAGE_REANIM_/, ''));
    const hit = reanimDir.out[key] || imagesDir.out[key];
    if (!hit) { unresolved.push(id); continue; }
    reanimImages[id] = hit;
    const mask = reanimDir.masks[key] || imagesDir.masks[key];
    if (mask) reanimMasks[id] = mask;
  }
}

// resources.xml: <SetDefaults path=.. idprefix=..> then <Image>/<Sound> entries.
const xml = fs.readFileSync(path.join(ROOT, 'properties', 'resources.xml'), 'utf8');
const images = {}, sounds = {};
let curPath = 'images', curPrefix = 'IMAGE_';
for (const m of xml.matchAll(/<(SetDefaults|Image|Sound)\b([^>]*)\/?>/g)) {
  const [, tag, attrs] = m;
  const attr = n => (attrs.match(new RegExp(n + '="([^"]*)"')) || [])[1];
  if (tag === 'SetDefaults') {
    curPath = attr('path') || curPath;
    curPrefix = attr('idprefix') ?? curPrefix;
    continue;
  }
  const id = attr('id'), p = attr('path');
  if (!id || !p) continue;
  const full = curPrefix + id;
  if (tag === 'Image') {
    const hit = indexDir(curPath).out[norm(p.replace(/\.[a-z]+$/i, ''))];
    if (hit) images[full] = hit;
  } else {
    sounds[full] = curPath + '/' + p.replace(/\.[a-z]+$/i, '') + '.ogg';
  }
}

// Bitmap fonts: each data/<Name>.txt describes glyph rects into an atlas whose
// file is sometimes prefixed with an underscore and may be .png or .gif.
const dataDir = indexDir('data').out;
const fonts = {}, fontImages = {};
for (const f of fs.readdirSync(path.join(ROOT, 'data'))) {
  if (!f.endsWith('.txt')) continue;
  const name = f.replace(/\.txt$/, '');
  const text = fs.readFileSync(path.join(ROOT, 'data', f), 'latin1');
  fonts[name] = 'data/' + f;
  for (const m of text.matchAll(/LayerSetImage\s+\w+\s+'([^']+)'/g)) {
    const img = m[1];
    if (fontImages[img]) continue;
    const hit = dataDir[norm(img)] || dataDir[norm('_' + img)];
    if (hit) fontImages[img] = hit;
  }
}

const manifest = { reanimImages, reanimMasks, images, sounds, fonts, fontImages };
fs.writeFileSync(path.join(__dirname, 'assets.json'), JSON.stringify(manifest));
console.log('reanim images :', Object.keys(reanimImages).length, '(unresolved', unresolved.length + ')',
            '/ masked pairs', Object.keys(reanimMasks).length);
console.log('images        :', Object.keys(images).length);
console.log('sounds        :', Object.keys(sounds).length);
console.log('fonts         :', Object.keys(fonts).length,
            '/ atlases', Object.keys(fontImages).length);
