// PopCap .reanim player.
// A .reanim is a list of tracks; each track is a list of <t> frames whose
// attributes persist forward until overridden. Tracks that never name an image
// (<i>) are range markers: the span where f===0 delimits a named animation.

const REANIM_ATTRS = ['x', 'y', 'kx', 'ky', 'sx', 'sy', 'f', 'a'];

function parseReanim(text) {
  const fps = parseFloat((text.match(/<fps>([^<]*)<\/fps>/) || [])[1]) || 12;
  const tracks = [];

  for (const tm of text.matchAll(/<track>([\s\S]*?)<\/track>/g)) {
    const body = tm[1];
    const name = ((body.match(/<name>([^<]*)<\/name>/) || [])[1] || '').trim();
    const frames = [];
    // Running state: unspecified attributes inherit from the previous frame.
    let cur = { x: 0, y: 0, kx: 0, ky: 0, sx: 1, sy: 1, f: 0, a: 1, i: null };
    let hasImage = false;

    for (const fm of body.matchAll(/<t>([\s\S]*?)<\/t>/g)) {
      const chunk = fm[1];
      if (chunk) {
        for (const a of REANIM_ATTRS) {
          const v = chunk.match(new RegExp(`<${a}>([^<]*)</${a}>`));
          if (v) cur[a] = parseFloat(v[1]);
        }
        const img = chunk.match(/<i>([^<]*)<\/i>/);
        if (img) { cur.i = img[1].trim(); hasImage = true; }
      }
      frames.push({ ...cur });
    }
    if (name) tracks.push({ name, frames, hasImage });
  }

  // Range-marker tracks define the named animations.
  const anims = {};
  for (const t of tracks) {
    if (t.hasImage || !t.name.startsWith('anim_')) continue;
    let start = -1, end = -1;
    t.frames.forEach((f, i) => {
      if (f.f === 0) { if (start < 0) start = i; end = i; }
    });
    if (start >= 0) anims[t.name] = [start, end];
  }

  const length = tracks.reduce((m, t) => Math.max(m, t.frames.length), 0);
  const drawTracks = tracks.filter(t => t.hasImage);
  return { fps, tracks, drawTracks, anims, length };
}

// Many reanims fade their parts in over the first frames of a range, and some
// have no named ranges at all — playing those raw makes the sprite blink out.
// Once the images are known, trim each range to the frames that actually draw.
function computeRanges(def, images) {
  const visible = i => def.drawTracks.some(t => {
    const f = t.frames[Math.min(i, t.frames.length - 1)];
    if (!f || !f.i || f.f < 0) return false;
    const img = images[f.i];
    return img && img.width;
  });

  const trim = ([s, e]) => {
    while (s < e && !visible(s)) s++;
    while (e > s && !visible(e)) e--;
    return [s, e];
  };

  def.ranges = {};
  for (const name of Object.keys(def.anims)) def.ranges[name] = trim(def.anims[name]);
  def.ranges['*'] = trim([0, Math.max(0, def.length - 1)]);
  return def;
}

// Some characters are split across ranges that run at the same time: a
// Peashooter's stalk animates on anim_idle while its head runs anim_head_idle
// or anim_shooting, and anim_shooting alone contains no stalk at all. Assign
// each drawing track to the first layer whose range actually shows it.
function layerAssignment(def, layers) {
  const key = layers.map(l => l.anim).join('+');
  def._layerMaps = def._layerMaps || {};
  if (def._layerMaps[key]) return def._layerMaps[key];

  const map = {};
  for (const t of def.drawTracks) {
    for (let li = 0; li < layers.length; li++) {
      const [s, e] = layers[li].range;
      let visible = false;
      for (let i = s; i <= e; i++) {
        const f = t.frames[Math.min(i, t.frames.length - 1)];
        if (f && f.i && f.f >= 0) { visible = true; break; }
      }
      if (visible) { map[t.name] = li; break; }
    }
  }
  return (def._layerMaps[key] = map);
}

const lerp = (a, b, t) => a + (b - a) * t;

function sampleTrack(track, pos) {
  const n = track.frames.length;
  if (!n) return null;
  const i0 = Math.max(0, Math.min(n - 1, Math.floor(pos)));
  const i1 = Math.max(0, Math.min(n - 1, i0 + 1));
  const f0 = track.frames[i0], f1 = track.frames[i1];
  const t = pos - i0;
  if (t <= 0 || i0 === i1 || f1.i !== f0.i) return f0;
  return {
    x: lerp(f0.x, f1.x, t), y: lerp(f0.y, f1.y, t),
    kx: lerp(f0.kx, f1.kx, t), ky: lerp(f0.ky, f1.ky, t),
    sx: lerp(f0.sx, f1.sx, t), sy: lerp(f0.sy, f1.sy, t),
    a: lerp(f0.a, f1.a, t), f: f0.f, i: f0.i,
  };
}

const D2R = Math.PI / 180;

// A playing instance of a parsed reanim.
class Reanim {
  constructor(def) {
    this.def = def;
    this.anim = null;         // [start, end] or null for the whole timeline
    this.animName = null;
    this.pos = 0;             // absolute frame position
    this.rate = 1;
    this.loop = true;
    this.done = false;
    this.hidden = new Set();  // track names forced off
    this.shown = new Set();   // track names forced on (overrides f<0)
    this.imgOverride = null;  // track name -> image id, for damage states
    this.layers = null;       // simultaneous ranges, see playLayers
    this.onEnd = null;
    this.play(Object.keys(def.anims)[0] || null);
  }

  play(name, { loop = true, rate = 1, restart = true } = {}) {
    if (name && this.animName === name && !this.layers && !restart) return this;
    this.layers = null;
    this.layerKey = null;
    this.animName = name;
    this.anim = this.lookupRange(name);
    this.loop = loop;
    this.rate = rate;
    this.done = false;
    this.pos = this.anim[0];
    return this;
  }

  // Run several ranges at once, each driving the tracks it owns.
  // specs: [{ anim, loop, hold }] — earlier entries claim a track first.
  // A held layer is a static pose: it sits on its range's last frame and never
  // counts toward onEnd, so loops can run on top of a finished intro.
  playLayers(specs, { rate = 1, restart = false } = {}) {
    const key = specs.map(s => s.anim + (s.hold ? '=' : s.loop === false ? '!' : '')).join('+');
    if (this.layerKey === key && !restart) return this;
    this.layerKey = key;
    this.animName = specs[0].anim;
    this.anim = null;
    this.rate = rate;
    this.done = false;
    this.layers = specs.map(sp => {
      const range = this.lookupRange(sp.anim);
      if (sp.hold) return { anim: sp.anim, range, pos: range[1], loop: false, hold: true, done: true };
      return { anim: sp.anim, range, pos: range[0], loop: sp.loop !== false, hold: false, done: false };
    });
    this.trackLayer = layerAssignment(this.def, this.layers);
    return this;
  }

  // Put a track back to its authored visibility.
  resetTrack(name) {
    this.hidden.delete(name); this.shown.delete(name);
  }

  // Prefer the trimmed range the loader computed; fall back to the raw one.
  lookupRange(name) {
    const r = this.def.ranges;
    if (name && r && r[name]) return r[name];
    if (name && this.def.anims[name]) return this.def.anims[name];
    if (r && r['*']) return r['*'];
    return [0, Math.max(0, this.def.length - 1)];
  }

  get range() {
    return this.anim || this.lookupRange(this.animName);
  }

  setTrack(name, visible) {
    this.hidden.delete(name); this.shown.delete(name);
    (visible ? this.shown : this.hidden).add(name);
  }

  update(dt) {
    if (this.done) return;

    if (this.layers) {
      for (const L of this.layers) {
        if (L.done) continue;
        const [s, e] = L.range;
        const span = Math.max(1e-6, e - s);
        L.pos += dt * this.def.fps * this.rate;
        if (L.pos >= e) {
          if (L.loop) L.pos = s + ((L.pos - s) % span);
          else { L.pos = e; L.done = true; }
        }
      }
      const oneShots = this.layers.filter(L => !L.loop && !L.hold);
      if (oneShots.length && oneShots.every(L => L.done)) {
        this.done = true;
        if (this.onEnd) this.onEnd();
      }
      return;
    }

    const [s, e] = this.range;
    const span = Math.max(1e-6, e - s);
    this.pos += dt * this.def.fps * this.rate;
    if (this.pos >= e) {
      if (this.loop) {
        this.pos = s + ((this.pos - s) % span);
      } else {
        this.pos = e;
        this.done = true;
        if (this.onEnd) this.onEnd();
      }
    } else if (this.pos < s) {
      this.pos = s;
    }
  }

  // Progress through the current animation, 0..1.
  get progress() {
    const [s, e] = this.range;
    return e > s ? (this.pos - s) / (e - s) : 0;
  }

  // The track's current frame, sampled on whichever layer owns it.
  trackFrame(name) {
    const t = this.def.tracks.find(t => t.name === name);
    if (!t) return null;
    let pos = this.pos;
    if (this.layers) {
      const li = this.trackLayer[name];
      if (li === undefined) return null;
      pos = this.layers[li].pos;
    }
    return sampleTrack(t, pos);
  }

  // onTrack(name, frame) fires straight after each track is painted, so a
  // caller can slot extra art into the correct place in the stacking order.
  draw(ctx, images, opts = {}) {
    const { scale = 1, flip = false, alpha = 1, tint = null, overlay = null, onTrack = null } = opts;
    ctx.save();
    if (scale !== 1) ctx.scale(scale, scale);
    if (flip) ctx.scale(-1, 1);
    ctx.globalAlpha *= alpha;

    for (const track of this.def.drawTracks) {
      if (this.hidden.has(track.name)) continue;
      let pos = this.pos;
      if (this.layers) {
        const li = this.trackLayer[track.name];
        if (li === undefined) continue;   // track belongs to no active layer
        pos = this.layers[li].pos;
      }
      const fr = sampleTrack(track, pos);
      if (!fr || !fr.i) continue;
      if (fr.f < 0 && !this.shown.has(track.name)) continue;
      const id = (this.imgOverride && this.imgOverride[track.name]) || fr.i;
      const img = images[id];
      if (!img || !img.width) continue;

      const a = fr.sx * Math.cos(fr.kx * D2R);
      const b = fr.sx * Math.sin(fr.kx * D2R);
      const c = -fr.sy * Math.sin(fr.ky * D2R);
      const d = fr.sy * Math.cos(fr.ky * D2R);

      ctx.save();
      ctx.globalAlpha *= Math.max(0, Math.min(1, fr.a));
      ctx.transform(a, b, c, d, fr.x, fr.y);
      ctx.drawImage(img, 0, 0);
      if (tint) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, img.width, img.height);
      }
      ctx.restore();
      if (onTrack) onTrack(track.name, fr);
    }

    if (overlay) overlay(ctx);
    ctx.restore();
  }
}
