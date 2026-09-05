// Asset loading: manifest lookup, image/audio caching, reanim fetch+parse.

// Combine an opaque colour image with its alpha mask. The mask carries its
// shape either in its own alpha channel or — when it ships fully opaque — in
// brightness; both conventions appear in this asset set.
function compositeMask(color, mask) {
  if (!color || !color.width) return color;
  if (!mask || !mask.width) return color;
  const c = document.createElement('canvas');
  c.width = color.width; c.height = color.height;
  const x = c.getContext('2d');
  x.drawImage(color, 0, 0);

  const mc = document.createElement('canvas');
  mc.width = c.width; mc.height = c.height;
  mc.getContext('2d').drawImage(mask, 0, 0, c.width, c.height);

  try {
    const dst = x.getImageData(0, 0, c.width, c.height);
    const src = mc.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const d = dst.data;
    let hasAlpha = false;
    for (let i = 3; i < src.length; i += 4) if (src[i] < 250) { hasAlpha = true; break; }
    for (let i = 0; i < d.length; i += 4) {
      d[i + 3] = hasAlpha ? src[i + 3]
                          : src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
    }
    x.putImageData(dst, 0, 0);
  } catch (e) { return color; }   // tainted canvas; leave unmasked
  return c;
}

const Assets = {
  manifest: null,
  images: {},      // reanim image id OR path -> HTMLImageElement
  reanims: {},     // name -> parsed def
  _pending: {},
  loaded: 0,
  total: 0,

  async init() {
    this.manifest = await fetch('game/assets.json').then(r => r.json());
  },

  path(id) {
    const m = this.manifest;
    return m.reanimImages[id] || m.images[id] || id;
  },

  image(idOrPath) {
    return this.images[idOrPath] || null;
  },

  // srcOverride lets a caller cache an image under its own key (font atlases
  // are keyed "FONT:<name>", which the manifest lookup wouldn't resolve).
  // A reanim image id whose file has an X_.png partner is composited on load.
  maskFor(id) {
    const m = this.manifest;
    return (m && m.reanimMasks && m.reanimMasks[id]) || null;
  },

  loadImage(idOrPath, srcOverride) {
    if (this.images[idOrPath]) return Promise.resolve(this.images[idOrPath]);
    if (this._pending[idOrPath]) return this._pending[idOrPath];
    this.total++;
    const src = srcOverride || this.path(idOrPath);
    const maskSrc = srcOverride ? null : this.maskFor(idOrPath);
    const p = new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        if (!maskSrc) { this.images[idOrPath] = img; this.loaded++; resolve(img); return; }
        this.loadImage('MASK:' + idOrPath, maskSrc).then(mask => {
          const out = compositeMask(img, mask);
          this.images[idOrPath] = out; this.loaded++; resolve(out);
        });
      };
      img.onerror = () => {
        console.warn('missing image:', idOrPath, '->', src);
        const blank = new Image(); blank.width = blank.height = 0;
        this.images[idOrPath] = blank; this.loaded++; resolve(blank);
      };
      img.src = encodeURI(src);
    });
    this._pending[idOrPath] = p;
    return p;
  },

  // Some art ships as an opaque .jpg plus a separate "_.png" alpha mask.
  // Composite the pair once and cache the result.
  masked(colorKey, maskKey) {
    const k = 'MASKED:' + colorKey;
    if (this.images[k]) return this.images[k];
    const color = this.image(colorKey), mask = this.image(maskKey);
    if (!color || !color.width) return null;
    if (!mask || !mask.width) return color;
    return (this.images[k] = compositeMask(color, mask));
  },

  async loadImages(list) {
    await Promise.all(list.map(i => this.loadImage(i)));
  },

  // Fetch + parse a .reanim, then pull in every image it references.
  async loadReanim(name) {
    if (this.reanims[name]) return this.reanims[name];
    if (this._pending['R:' + name]) return this._pending['R:' + name];
    this.total++;
    const p = (async () => {
      const res = await fetch(`reanim/${name}.reanim`);
      if (!res.ok) {
        console.warn('missing reanim:', name, res.status);
        this.loaded++;
        return (this.reanims[name] = { fps: 12, tracks: [], drawTracks: [], anims: {}, length: 1 });
      }
      const def = parseReanim(await res.text());
      const ids = new Set();
      for (const t of def.drawTracks) for (const f of t.frames) if (f.i) ids.add(f.i);
      await this.loadImages([...ids]);
      computeRanges(def, this.images);
      this.reanims[name] = def;
      this.loaded++;
      return def;
    })();
    this._pending['R:' + name] = p;
    return p;
  },

  async loadReanims(names) {
    await Promise.all(names.map(n => this.loadReanim(n)));
  },

  get progress() {
    return this.total ? this.loaded / this.total : 0;
  },
};
