// PopCap bitmap fonts (data/*.txt).
//
// A descriptor declares parallel lists — CharList, WidthList, RectList,
// OffsetList — then one or more layers that bind those lists to an atlas
// image. Multi-layer fonts stack an outline under the fill; both share glyph
// metrics and differ only in which atlas they sample.
//
// The files are Windows-1252, and CharList runs past ASCII into accented
// characters. They must be decoded byte-for-byte or the lists lose alignment
// with WidthList and RectList.

function parseFontDescriptor(text) {
  const defs = {};
  for (const m of text.matchAll(/Define\s+(\w+)\s*\(([\s\S]*?)\)\s*;/g)) defs[m[1]] = m[2];

  const chars = raw => {
    const out = [];
    for (const m of (raw || '').matchAll(/'(.)'|"(.)"/g)) out.push(m[1] !== undefined ? m[1] : m[2]);
    return out;
  };
  const nums = raw => [...(raw || '').matchAll(/-?\d+/g)].map(m => +m[0]);
  const tuples = (raw, n) => {
    const flat = nums(raw), out = [];
    for (let i = 0; i + n <= flat.length; i += n) out.push(flat.slice(i, i + n));
    return out;
  };
  const strings = raw => [...(raw || '').matchAll(/"([^"]*)"/g)].map(m => m[1]);

  // kerning: parallel pair/value lists
  const kerning = {};
  if (defs.KerningPairs && defs.KerningValues) {
    const pairs = strings(defs.KerningPairs), vals = nums(defs.KerningValues);
    pairs.forEach((p, i) => { if (p.length === 2 && vals[i] !== undefined) kerning[p] = vals[i]; });
  }

  // Strip the Define blocks so the remaining statements can be split on ';'.
  const body = text.replace(/Define\s+\w+\s*\([\s\S]*?\)\s*;/g, '');
  const layers = [];
  const byName = n => layers.find(l => l.name === n);

  for (const raw of body.split(';')) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const sp = stmt.indexOf(' ');
    const cmd = sp < 0 ? stmt : stmt.slice(0, sp);
    const rest = sp < 0 ? '' : stmt.slice(sp + 1).trim();

    if (cmd === 'CreateLayer') {
      layers.push({ name: rest, image: null, ascent: 0, widths: {}, rects: {}, offsets: {},
                    pointSize: 0, lineSpacing: 0, ascentPadding: 0 });
      continue;
    }
    if (!cmd.startsWith('Layer')) continue;

    const nm = rest.match(/^(\w+)\s*([\s\S]*)$/);
    if (!nm) continue;
    const layer = byName(nm[1]);
    if (!layer) continue;
    const args = nm[2].trim();

    switch (cmd) {
      case 'LayerSetImage':   layer.image = (args.match(/'([^']+)'/) || [])[1] || null; break;
      case 'LayerSetAscent':  layer.ascent = parseInt(args, 10) || 0; break;
      case 'LayerSetPointSize': layer.pointSize = parseInt(args, 10) || 0; break;
      case 'LayerSetLineSpacingOffset': layer.lineSpacing = parseInt(args, 10) || 0; break;
      case 'LayerSetAscentPadding': layer.ascentPadding = parseInt(args, 10) || 0; break;

      case 'LayerSetCharWidths': {
        const [cs, ws] = pairArgs(args, defs);
        chars(cs).forEach((c, i) => { const v = nums(ws)[i]; if (v !== undefined) layer.widths[c] = v; });
        break;
      }
      case 'LayerSetImageMap': {
        const [cs, rs] = pairArgs(args, defs);
        const rects = tuples(rs, 4);
        chars(cs).forEach((c, i) => { if (rects[i]) layer.rects[c] = rects[i]; });
        break;
      }
      case 'LayerSetCharOffsets': {
        const [cs, os] = pairArgs(args, defs);
        const offs = tuples(os, 2);
        chars(cs).forEach((c, i) => { if (offs[i]) layer.offsets[c] = offs[i]; });
        break;
      }
    }
  }

  return { layers: layers.filter(l => l.image), kerning };
}

// Arguments are either two Define names or two inline parenthesised lists.
function pairArgs(args, defs) {
  const ids = args.match(/^(\w+)\s+(\w+)$/);
  if (ids) return [defs[ids[1]] || '', defs[ids[2]] || ''];
  const inline = args.match(/\(([\s\S]*?)\)\s*\(([\s\S]*?)\)/);
  return inline ? [inline[1], inline[2]] : ['', ''];
}

// Atlases come in two flavours. Most carry a real alpha channel; the
// BrianneTod set ships fully opaque with light glyphs on a dark ground, where
// brightness is the alpha. Convert that second kind once, at load.
function normalizeAtlas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);

  let data;
  try {
    data = x.getImageData(0, 0, c.width, c.height);
  } catch (e) {
    return img;                       // tainted canvas; use as-is
  }
  const d = data.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < 250) return img;       // already has transparency
  }
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = lum;
  }
  x.putImageData(data, 0, 0);
  return c;
}

class BitmapFont {
  constructor(name, desc) {
    this.name = name;
    this.layers = desc.layers;
    this.kerning = desc.kerning;
    const main = this.layers[this.layers.length - 1] || { ascent: 12, lineSpacing: 0, widths: {}, rects: {} };
    this.main = main;
    this.ascent = main.ascent;
    this.lineHeight = main.ascent + main.lineSpacing + 4;
    this._tinted = {};
  }

  charWidth(c) {
    const w = this.main.widths[c];
    return w !== undefined ? w : (this.main.widths[' '] !== undefined ? this.main.widths[' '] : 6);
  }

  measure(str, scale = 1) {
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      w += this.charWidth(str[i]);
      const k = this.kerning[str[i] + str[i + 1]];
      if (k) w += k;
    }
    return w * scale;
  }

  // A colour-replaced copy of an atlas, cached per colour.
  tintedAtlas(name, img, color) {
    const key = name + '|' + color;
    if (this._tinted[key]) return this._tinted[key];
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return (this._tinted[key] = c);
  }

  // x, y is the left end of the baseline, matching ctx.fillText.
  draw(ctx, str, x, y, { align = 'left', color = null, scale = 1, alpha = 1 } = {}) {
    if (!this.layers.length) return;
    const total = this.measure(str, scale);
    let penX = x - (align === 'center' ? total / 2 : align === 'right' ? total : 0);

    ctx.save();
    ctx.globalAlpha *= alpha;
    for (const layer of this.layers) {
      const atlas = layer.atlas;
      if (!atlas || !atlas.width) continue;
      const src = color ? this.tintedAtlas(layer.image, atlas, color) : atlas;

      let px = penX;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const rect = layer.rects[ch];
        if (rect) {
          const [ox, oy] = layer.offsets[ch] || [0, 0];
          const [sx, sy, sw, sh] = rect;
          ctx.drawImage(src, sx, sy, sw, sh,
                        px + ox * scale, y - layer.ascent * scale + oy * scale,
                        sw * scale, sh * scale);
        }
        px += this.charWidth(ch) * scale;
        const k = this.kerning[ch + str[i + 1]];
        if (k) px += k * scale;
      }
    }
    ctx.restore();
  }
}

const Fonts = {
  loaded: {},

  async load(names) {
    await Promise.all(names.map(async name => {
      if (this.loaded[name]) return;
      const path = (Assets.manifest.fonts || {})[name];
      if (!path) { console.warn('unknown font:', name); return; }
      const buf = await fetch(encodeURI(path)).then(r => r.arrayBuffer());
      const text = new TextDecoder('windows-1252').decode(buf);
      const desc = parseFontDescriptor(text);
      await Promise.all(desc.layers.map(async l => {
        const src = (Assets.manifest.fontImages || {})[l.image];
        if (!src) return;
        const img = await Assets.loadImage('FONT:' + l.image, src);
        l.atlas = img && img.width ? normalizeAtlas(img) : null;
      }));
      desc.layers = desc.layers.filter(l => l.atlas);
      this.loaded[name] = new BitmapFont(name, desc);
    }));
  },

  get(name) { return this.loaded[name] || null; },

  // Falls back to a canvas font if the bitmap font is unavailable.
  // `shadow` draws an offset copy underneath, standing in for an outline.
  draw(ctx, name, str, x, y, opts = {}) {
    const f = this.get(name);
    if (f) {
      if (opts.shadow) {
        f.draw(ctx, String(str), x + 1, y + 1, { ...opts, color: opts.shadow });
      }
      return f.draw(ctx, String(str), x, y, opts);
    }
    ctx.save();
    ctx.font = (opts.fallback || 'bold 16px Georgia, serif');
    ctx.textAlign = opts.align || 'left';
    ctx.fillStyle = opts.color || '#fff';
    ctx.fillText(String(str), x, y);
    ctx.restore();
  },

  measure(name, str, scale = 1) {
    const f = this.get(name);
    return f ? f.measure(String(str), scale) : String(str).length * 8 * scale;
  },
};
