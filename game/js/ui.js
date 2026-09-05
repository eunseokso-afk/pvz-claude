// Seed chooser, seed bank, HUD and end-of-level overlays.
// Seed packets are composited at runtime: the blank packet from images/seeds.png
// with the plant's own reanim posed on top.
//
// Bank layout is measured from a screenshot of the original: the panel sits
// flush in the top-left corner, and edge-detecting the gutters between packets
// gives a slot pitch of exactly 59px starting at x=84.

const PACKET_W = 53, PACKET_H = 71;
const BANK = { x: 0, y: 0, h: 87, slotX: 84, slotY: 8, pitch: 59, capL: 78, capR: 36 };
const MENU_RECT = [694, 2, 98, 28];

const UI = {
  slots: [],          // [{ key, cooldown }]
  chosen: [],
  available: Object.keys(PLANTS),
  maxSlots: 6,
  _ghosts: {},
  _packets: {},
  chooser: { x: 96, y: 46 },

  reset(level) {
    this.slots = [];
    this.chosen = [];
    this.maxSlots = Math.min(8, level.slots);
  },

  slotRect(i) {
    return [BANK.x + BANK.slotX + i * BANK.pitch, BANK.y + BANK.slotY, PACKET_W, PACKET_H];
  },

  hits(x, y, [rx, ry, rw, rh]) {
    return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
  },

  // ------------------------------------------------- sprite compositing
  ghost(key, box = 46) {
    const cacheKey = key + ':' + box;
    if (this._ghosts[cacheKey]) return this._ghosts[cacheKey];
    const def = PLANTS[key];
    const rd = Assets.reanims[def.reanim];
    if (!rd || !rd.drawTracks.length) return null;

    const r = new Reanim(rd);
    r.play(def.idle, { loop: true });
    // Pose the plant on the frame where the most of it is showing — several
    // reanims fade parts in over the first frames of a range.
    const [s, e] = r.range;
    let bestPos = s, bestN = -1;
    for (let i = s; i <= e; i++) {
      let n = 0;
      for (const t of rd.drawTracks) {
        const f = t.frames[Math.min(i, t.frames.length - 1)];
        const img = f && f.i && Assets.images[f.i];
        if (f && f.f >= 0 && img && img.width) n++;
      }
      if (n > bestN) { bestN = n; bestPos = i; }
    }
    r.pos = bestPos;
    const a = reanimAnchor(def.reanim, def.idle);
    const scale = Math.min(box / Math.max(1, a.w), box / Math.max(1, a.h), 1.6);

    const c = document.createElement('canvas');
    c.width = Math.max(4, Math.ceil(a.w * scale) + 4);
    c.height = Math.max(4, Math.ceil(a.h * scale) + 4);
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height - 2);
    ctx.scale(scale, scale);
    ctx.translate(a.ox, a.oy);
    r.draw(ctx, Assets.images);
    return (this._ghosts[cacheKey] = c);
  },

  packet(key) {
    if (this._packets[key]) return this._packets[key];
    const def = PLANTS[key];
    const c = document.createElement('canvas');
    c.width = PACKET_W; c.height = PACKET_H;
    const ctx = c.getContext('2d');

    const sheet = Assets.image('images/seeds.png');
    if (sheet && sheet.width) ctx.drawImage(sheet, 0, 0, 50, 70, 0, 0, PACKET_W, PACKET_H);

    const g = this.ghost(key, 40);
    if (g) ctx.drawImage(g, (PACKET_W - g.width) / 2, 9 + (42 - g.height) / 2);

    Fonts.draw(ctx, 'DwarvenTodcraft12', def.cost, PACKET_W / 2 + 8, PACKET_H - 4,
               { align: 'center', color: '#000' });
    return (this._packets[key] = c);
  },

  drawPacket(ctx, key, x, y, w, h, { cooldown = 0, recharge = 1, dim = false, selected = false } = {}) {
    const p = this.packet(key);
    ctx.save();
    if (dim) ctx.globalAlpha = 0.55;
    ctx.drawImage(p, x, y, w, h);
    if (cooldown > 0) {
      const frac = Math.min(1, cooldown / recharge);
      ctx.fillStyle = 'rgba(20,20,30,.62)';
      ctx.fillRect(x, y, w, h * frac);
    }
    if (selected) {
      ctx.strokeStyle = '#ffe14d';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
    ctx.restore();
  },

  // ---------------------------------------------------------- seed bank
  bankWidth() { return BANK.slotX + Math.max(6, this.maxSlots) * BANK.pitch + 26; },

  drawBank(ctx, game) {
    const img = Assets.image('images/SeedBank.png');
    const bw = this.bankWidth(), bh = BANK.h;
    const bx = BANK.x, by = BANK.y;

    if (img && img.width) {
      // 3-slice horizontally so the bank can hold any number of slots
      const { capL, capR } = BANK;
      ctx.drawImage(img, 0, 0, capL, bh, bx, by, capL, bh);
      ctx.drawImage(img, capL, 0, img.width - capL - capR, bh,
                    bx + capL, by, bw - capL - capR, bh);
      ctx.drawImage(img, img.width - capR, 0, capR, bh, bx + bw - capR, by, capR, bh);
    } else {
      ctx.fillStyle = '#6b4b23'; ctx.fillRect(bx, by, bw, bh);
    }

    Fonts.draw(ctx, 'DwarvenTodcraft15', game.sun, bx + 39, by + 78,
               { align: 'center', color: '#000' });

    this.slots.forEach((slot, i) => {
      const [x, y, w, h] = this.slotRect(i);
      this.drawPacket(ctx, slot.key, x, y, w, h, {
        cooldown: slot.cooldown,
        recharge: PLANTS[slot.key].recharge,
        dim: game.sun < PLANTS[slot.key].cost,
        selected: game.selected === i,
      });
    });

    // shovel, in its own panel to the right of the bank
    const sb = Assets.image('images/ShovelBank.png');
    const sx = bx + bw + 6, sy = by + 2;
    if (sb && sb.width) ctx.drawImage(sb, sx, sy);
    const sh = Assets.image('images/Shovel.png');
    if (sh && sh.width) {
      ctx.save();
      if (game.shovel) ctx.globalAlpha = 0.4;
      ctx.drawImage(sh, sx + 2, sy + 2, 64, 64);
      ctx.restore();
    }
    this._shovelRect = [sx, sy, 70, 72];
  },

  drawMenuButton(ctx) {
    const [x, y, w, h] = MENU_RECT;
    ctx.save();
    ctx.fillStyle = '#4a7d16';
    ctx.strokeStyle = '#2c4d0c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 7); else ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();
    Fonts.draw(ctx, 'DwarvenTodcraft18', 'Menu', x + w / 2, y + h - 6,
               { align: 'center', color: '#c8f25a' });
    ctx.restore();
  },

  // ------------------------------------------------------- progress bar
  // FlagMeter.png is a two-state sheet: the empty bar sits above the filled one.
  // Progress fills from the right and the marker walks leftward, as in the original.
  drawProgress(ctx, game) {
    const meter = Assets.image('images/FlagMeter.png');
    if (!meter || !meter.width) return;
    const mw = meter.width, mh = meter.height / 2;
    const x = W - mw - 22, y = H - mh - 14;
    const frac = Math.max(0, Math.min(1, game.wave / game.totalWaves));

    ctx.drawImage(meter, 0, 0, mw, mh, x, y, mw, mh);
    const fw = Math.round((mw - 8) * frac);
    if (fw > 0) {
      ctx.drawImage(meter, mw - 4 - fw, mh, fw, mh, x + mw - 4 - fw, y, fw, mh);
    }

    const parts = Assets.image('images/FlagMeterParts.png');
    if (parts && parts.width) {
      ctx.drawImage(parts, 0, 0, 25, 25, x + mw - 4 - fw - 12, y + mh / 2 - 13, 25, 25);
    }

    Fonts.draw(ctx, 'BrianneTod16', LEVELS[game.levelIndex].name, x - 8, y + mh - 3,
               { align: 'right', color: '#fff', shadow: 'rgba(0,0,0,.8)' });
    const sub = `wave ${Math.min(game.wave, game.totalWaves)} / ${game.totalWaves}`;
    Fonts.draw(ctx, 'BrianneTod12', sub, x + mw / 2, y - 4,
               { align: 'center', color: '#fff', shadow: 'rgba(0,0,0,.8)' });
  },

  // ------------------------------------------------------- seed chooser
  chooserLayout() {
    const bgImg = Assets.image('images/SeedChooser_Background.png');
    const cw = (bgImg && bgImg.width) || 465, ch = (bgImg && bgImg.height) || 513;
    const x = this.chooser.x, y = this.chooser.y;
    return { x, y, w: cw, h: ch, gridX: x + 20, gridY: y + 88, cols: 8, cellW: 55, cellH: 75 };
  },

  drawChooser(ctx, game) {
    const L = this.chooserLayout();
    const bgImg = Assets.image('images/SeedChooser_Background.png');
    if (bgImg && bgImg.width) ctx.drawImage(bgImg, L.x, L.y);

    // Sits below the seed bank, which is painted over the top of this panel.
    Fonts.draw(ctx, 'BrianneTod16', 'Choose your plants', L.x + L.w / 2, BANK.h + 22,
               { align: 'center', color: '#e8dcb8', shadow: 'rgba(0,0,0,.7)' });

    this.available.forEach((key, i) => {
      const col = i % L.cols, row = (i / L.cols) | 0;
      const x = L.gridX + col * L.cellW, y = L.gridY + row * L.cellH;
      const taken = this.chosen.includes(key);
      this.drawPacket(ctx, key, x, y, PACKET_W, PACKET_H, { dim: taken });
      if (taken) {
        ctx.save();
        ctx.fillStyle = 'rgba(30,30,40,.45)';
        ctx.fillRect(x, y, PACKET_W, PACKET_H);
        ctx.restore();
      }
    });

    const btn = Assets.image(this.chosen.length ? 'images/SeedChooser_Button.png' : 'images/SeedChooser_Button_Disabled.png');
    const bw = (btn && btn.width) || 156, bh = (btn && btn.height) || 42;
    const bx = L.x + (L.w - bw) / 2, by = L.y + L.h - bh - 22;
    if (btn && btn.width) ctx.drawImage(btn, bx, by);
    Fonts.draw(ctx, 'BrianneTod16', "Let's Rock!", bx + bw / 2, by + 28,
               { align: 'center', color: this.chosen.length ? '#2f1d06' : '#77706a' });
    this._rockRect = [bx, by, bw, bh];

    this.drawBank(ctx, game);

    Fonts.draw(ctx, 'BrianneTod12',
               `${this.chosen.length} / ${this.maxSlots} chosen - click a packet to pick it, click it in the bank to put it back`,
               W / 2, L.y + L.h + 22, { align: 'center', color: '#efe6c9' });
  },

  chooserClick(game, x, y) {
    const L = this.chooserLayout();

    for (let i = 0; i < this.slots.length; i++) {
      if (this.hits(x, y, this.slotRect(i))) {
        const key = this.slots[i].key;
        this.chosen = this.chosen.filter(k => k !== key);
        this.slots.splice(i, 1);
        Sound.play('tap');
        return true;
      }
    }

    for (let i = 0; i < this.available.length; i++) {
      const col = i % L.cols, row = (i / L.cols) | 0;
      const px = L.gridX + col * L.cellW, py = L.gridY + row * L.cellH;
      if (this.hits(x, y, [px, py, PACKET_W, PACKET_H])) {
        const key = this.available[i];
        if (this.chosen.includes(key)) return true;
        if (this.chosen.length >= this.maxSlots) { Sound.play('buzzer'); return true; }
        this.chosen.push(key);
        this.slots.push({ key, cooldown: 0 });
        Sound.play('seedlift');
        return true;
      }
    }

    if (this.chosen.length && this.hits(x, y, this._rockRect || [0, 0, 0, 0])) {
      Sound.play('buttonclick');
      startLevel(game);
      return true;
    }
    return false;
  },

  // --------------------------------------------------------- in-game UI
  update(dt) {
    for (const s of this.slots) if (s.cooldown > 0) s.cooldown = Math.max(0, s.cooldown - dt);
  },

  handleClick(game, x, y) {
    if (this.hits(x, y, MENU_RECT)) { togglePause(); return true; }

    for (let i = 0; i < this.slots.length; i++) {
      if (this.hits(x, y, this.slotRect(i))) {
        const slot = this.slots[i];
        if (slot.cooldown > 0 || game.sun < PLANTS[slot.key].cost) { Sound.play('buzzer'); return true; }
        game.selected = game.selected === i ? null : i;
        game.shovel = false;
        Sound.play('seedlift');
        return true;
      }
    }
    if (this.hits(x, y, this._shovelRect || [0, 0, 0, 0])) {
      game.shovel = !game.shovel;
      game.selected = null;
      Sound.play('shovel');
      return true;
    }
    return false;
  },

  drawHUD(ctx, game) {
    this.drawBank(ctx, game);
    this.drawMenuButton(ctx);
    this.drawProgress(ctx, game);

    if (game.messageTimer > 0 && game.message) {
      ctx.save();
      Fonts.draw(ctx, 'DwarvenTodcraft18Yellow', game.message, W / 2, 150,
                 { align: 'center', alpha: Math.min(1, game.messageTimer),
                   shadow: 'rgba(0,0,0,.8)' });
      ctx.restore();
    }

    if (game.selected !== null || game.shovel) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      if (game.shovel) {
        const sh = Assets.image('images/Shovel.png');
        if (sh && sh.width) ctx.drawImage(sh, game.mouse.x - 20, game.mouse.y - 46, 56, 56);
      } else {
        const key = this.slots[game.selected] && this.slots[game.selected].key;
        if (key) ctx.drawImage(this.packet(key), game.mouse.x - 26, game.mouse.y - 34, PACKET_W, PACKET_H);
      }
      ctx.restore();
    }
  },

  // Compose Crazy Dave's head from its reanim pieces, scaled to fit a box.
  daveIcon(box = 74) {
    if (this._daveIcon) return this._daveIcon;
    const D = Math.PI / 180;
    const parts = [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of DAVE_HEAD) {
      const img = Assets.image(p.img);
      if (!img || !img.width) continue;
      const a = p.sx * Math.cos(p.kx * D), b = p.sx * Math.sin(p.kx * D);
      const c = -p.sy * Math.sin(p.kx * D), d = p.sy * Math.cos(p.kx * D);
      parts.push({ img, m: [a, b, c, d, p.x, p.y] });
      for (const [px, py] of [[0, 0], [img.width, 0], [0, img.height], [img.width, img.height]]) {
        const X = a * px + c * py + p.x, Y = b * px + d * py + p.y;
        if (X < x0) x0 = X; if (X > x1) x1 = X;
        if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
    }
    if (!parts.length) return null;

    const w = x1 - x0, h = y1 - y0;
    const sc = Math.min(box / w, box / h);
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * sc); c.height = Math.ceil(h * sc);
    const ctx = c.getContext('2d');
    ctx.scale(sc, sc);
    ctx.translate(-x0, -y0);
    for (const p of parts) {
      ctx.save();
      ctx.transform(...p.m);
      ctx.drawImage(p.img, 0, 0);
      ctx.restore();
    }
    return (this._daveIcon = c);
  },

  // -------------------------------------------------------- main menu
  // The original selector screen, driven by SelectorScreen.reanim. Its intro
  // (anim_open + anim_sign, frames 0-40) plays once; frame 40 is then held as
  // a pose underneath the sign sway, grass, flower and cloud loops. At frame 41
  // every button and background track goes f=-1, which is why the hold matters.
  menuButtons: {
    adventure:   { track: 'SelectorScreen_Adventure_button', shadow: 'SelectorScreen_Adventure_shadow',
                   art: 'reanim/SelectorScreen_Adventure_button.png',
                   shadowArt: 'reanim/SelectorScreen_Shadow_Adventure.png',
                   hi: 'reanim/SelectorScreen_Adventure_highlight.png' },
    start:       { track: 'SelectorScreen_StartAdventure_button', shadow: 'SelectorScreen_StartAdventure_shadow',
                   hi: 'reanim/SelectorScreen_StartAdventure_Highlight.png' },
    survival:    { track: 'SelectorScreen_Survival_button',   hi: 'reanim/SelectorScreen_Survival_highlight.png',   locked: 'Survival' },
    challenges:  { track: 'SelectorScreen_Challenges_button', hi: 'reanim/SelectorScreen_Challenges_highlight.png', locked: 'Mini-Games' },
    vasebreaker: { track: 'SelectorScreen_ZenGarden_button',  hi: 'reanim/SelectorScreen_vasebreaker_highlight.png', locked: 'Vasebreaker' },
    // the hanging signs: "if this is not you" was the profile switch, so it
    // becomes the restart-adventure control here; Zombatar is decoration
    switchUser:  { track: 'woodsign2', hi: 'reanim/SelectorScreen_WoodSign2_press.png' },
    zombatar:    { track: 'woodsign3', hi: 'reanim/SelectorScreen_WoodSign3_press.png', locked: 'Zombatar' },
  },
  // bottom-right corner, tucked under the tombstone's foot beside the pots
  menuBottom: {
    options: { rect: [641, 567, 81, 31], art: 'images/SelectorScreen_Options1.png', hi: 'images/SelectorScreen_Options2.png' },
    help:    { rect: [732, 573, 48, 22], art: 'images/SelectorScreen_Help1.png',    hi: 'images/SelectorScreen_Help2.png' },
  },
  // where the level number sits in the ADVENTURE sign's carved "LEVEL –" slot,
  // relative to the sign's top-left: stage digits end left of the dash, level
  // digits start right of it
  levelSlot: { stageRight: 168, levelLeft: 176, top: 22 },
  menu: null,

  savedLevel() {
    try { return Math.min(LEVELS.length - 1, +(localStorage.getItem('pvz.level') || 0)); }
    catch (e) { return 0; }
  },

  enterMenu() {
    this.menu = { r: null, phase: 'intro', hover: null, help: false, toast: null, resetArmed: 0, base: {} };
    const def = Assets.reanims.SelectorScreen;
    if (!def || !def.drawTracks.length) return;
    def.ranges.anim_intro = [0, 40];             // anim_open then anim_sign, back to back
    const r = this.menu.r = new Reanim(def);
    this.applyMenuSave();
    r.play('anim_intro', { loop: false });
    r.onEnd = () => this.startMenuLoops();
  },

  // Returning players get the "Adventure" sign, a fresh save "Start Adventure".
  // Both tracks share a position; only the unwanted one is hidden, so the
  // wanted one keeps its authored fade-in during the intro.
  applyMenuSave() {
    const m = this.menu, r = m.r, B = this.menuButtons;
    const saved = this.savedLevel() > 0;
    for (const k of ['adventure', 'start']) { r.resetTrack(B[k].track); r.resetTrack(B[k].shadow); }
    const off = saved ? B.start : B.adventure;
    r.setTrack(off.track, false); r.setTrack(off.shadow, false);
    m.base = saved ? { [B.adventure.track]: B.adventure.art, [B.adventure.shadow]: B.adventure.shadowArt } : {};
    m.active = saved ? 'adventure' : 'start';
  },

  startMenuLoops() {
    const m = this.menu;
    if (!m || !m.r) return;
    m.r.playLayers([
      { anim: 'anim_idle' }, { anim: 'anim_grass' },
      { anim: 'anim_flower1' }, { anim: 'anim_flower2' }, { anim: 'anim_flower3' },
      { anim: 'anim_cloud1' }, { anim: 'anim_cloud7' }, { anim: 'anim_cloud2' },
      { anim: 'anim_cloud6' }, { anim: 'anim_cloud5' }, { anim: 'anim_cloud4' },
      { anim: 'anim_sign', hold: true },
    ], { restart: true });
    m.phase = 'idle';
  },

  updateMenu(dt) {
    const m = this.menu;
    if (!m) return;
    if (m.r) m.r.update(dt);
    if (m.toast && (m.toast.t -= dt) <= 0) m.toast = null;
    if (m.resetArmed > 0) m.resetArmed -= dt;
  },

  // On-screen rectangle of a button track, from its live transform and art.
  menuRect(key) {
    const m = this.menu, b = this.menuButtons[key];
    if (!m || !m.r || m.r.hidden.has(b.track)) return null;
    const fr = m.r.trackFrame(b.track);
    if (!fr || fr.f < 0 || !fr.i) return null;
    const img = Assets.image(m.base[b.track] || fr.i);
    if (!img || !img.width) return null;
    return [fr.x, fr.y, img.width * fr.sx, img.height * fr.sy];
  },

  // SelectorScreen_LevelNumbers.png: digits 0-9 in 12x17 cells.
  drawLevelDigits(ctx, str, x, y, align = 'left') {
    const strip = Assets.image('images/SelectorScreen_LevelNumbers.png');
    if (!strip || !strip.width) return;
    const cw = strip.width / 10, ch = strip.height;
    let px = align === 'right' ? x - str.length * cw : x;
    for (const ch0 of str) {
      const d = ch0.charCodeAt(0) - 48;
      if (d >= 0 && d <= 9) ctx.drawImage(strip, d * cw, 0, cw, ch, px, y, cw, ch);
      px += cw;
    }
  },

  // Each slab's PNG carries transparent margin, so the signs' rectangles
  // overlap their neighbours — ADVENTURE's runs 35px down over SURVIVAL. A
  // rectangle test lets the upper sign swallow clicks meant for the one
  // below, so the hit is decided by the art's alpha at the point instead.
  _alphaCache: {},
  alphaAt(key, img, u, v) {
    let data = this._alphaCache[key];
    if (data === undefined) {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      try { data = x.getImageData(0, 0, c.width, c.height).data; } catch (e) { data = null; }
      this._alphaCache[key] = data;
    }
    if (!data) return 255;                          // unreadable; treat as solid
    const px = Math.floor(u), py = Math.floor(v);
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) return 0;
    return data[(py * img.width + px) * 4 + 3];
  },

  menuHit(key, x, y) {
    const m = this.menu, b = this.menuButtons[key];
    const rc = this.menuRect(key);
    if (!rc || !this.hits(x, y, rc)) return false;
    const fr = m.r.trackFrame(b.track);
    const imgKey = m.base[b.track] || fr.i;
    const img = Assets.image(imgKey);
    if (!img || !img.width) return false;
    return this.alphaAt(imgKey, img, (x - rc[0]) / (fr.sx || 1), (y - rc[1]) / (fr.sy || 1)) > 80;
  },

  menuMove(x, y) {
    const m = this.menu;
    if (!m) return;
    let hover = null;
    for (const key of Object.keys(this.menuButtons)) {
      if (this.menuHit(key, x, y)) { hover = key; break; }
    }
    for (const [key, b] of Object.entries(this.menuBottom)) if (this.hits(x, y, b.rect)) hover = key;
    m.hover = hover;
  },

  drawMainMenu(ctx, game) {
    const m = this.menu;
    ctx.fillStyle = '#7cc0ef';
    ctx.fillRect(0, 0, W, H);
    if (!m || !m.r) {
      const bg = Assets.image('images/titlescreen.jpg');
      if (bg && bg.width) ctx.drawImage(bg, 0, 0, W, H);
      return;
    }

    // hover swaps the sign for its lit version
    const over = {};
    const hb = this.menuButtons[m.hover];
    if (hb && hb.hi && !m.help) over[hb.track] = hb.hi;
    m.r.imgOverride = { ...m.base, ...over };
    m.r.draw(ctx, Assets.images, {});

    // level number in the sign's carved slot, e.g. "1" – "10"
    if (m.phase === 'idle' && m.active === 'adventure') {
      const rc = this.menuRect('adventure');
      const [stage, lvl] = LEVELS[this.savedLevel()].name.replace('Level ', '').split('-');
      if (rc && stage && lvl) {
        const S = this.levelSlot;
        this.drawLevelDigits(ctx, stage, rc[0] + S.stageRight, rc[1] + S.top, 'right');
        this.drawLevelDigits(ctx, lvl,   rc[0] + S.levelLeft,  rc[1] + S.top, 'left');
      }
    }

    for (const [key, b] of Object.entries(this.menuBottom)) {
      const img = Assets.image(m.hover === key && !m.help ? b.hi : b.art);
      const [x, y, w, h] = b.rect;
      if (img && img.width) ctx.drawImage(img, x, y);
      else Fonts.draw(ctx, 'BrianneTod12', key, x, y + h, { color: '#fff' });
    }

    if (m.toast) {
      Fonts.draw(ctx, 'DwarvenTodcraft18Yellow', m.toast.text, W / 2, 548,
                 { align: 'center', alpha: Math.min(1, m.toast.t), shadow: 'rgba(0,0,0,.85)' });
    }

    if (m.help) this.drawHelp(ctx);
  },

  drawHelp(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(0, 0, W, H);
    const x = 150, y = 96, w = 500, h = 400;
    ctx.fillStyle = '#2a2320';
    ctx.strokeStyle = '#c9b487';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 14); else ctx.rect(x, y, w, h);
    ctx.fill(); ctx.stroke();
    Fonts.draw(ctx, 'DwarvenTodcraft18Yellow', 'How to Play', W / 2, y + 46, { align: 'center', shadow: 'rgba(0,0,0,.8)' });
    const lines = [
      'Pick seeds, then click a packet and a lawn tile to plant.',
      'Click falling sun to collect it. Keep the zombies off the house.',
      '',
      '1-9  select a seed packet          Esc / right-click  cancel',
      'P  pause                            M  mute',
      'R  restart level                    N  next level after a win',
      '',
      'Lawnmowers guard each lane once. Wall-nuts crack as they take hits.',
    ];
    lines.forEach((t, i) => Fonts.draw(ctx, 'BrianneTod12', t, x + 32, y + 92 + i * 26, { color: '#efe6c9' }));
    Fonts.draw(ctx, 'BrianneTod12', 'click anywhere to close', W / 2, y + h - 18, { align: 'center', color: '#a9a2bd' });
    ctx.restore();
  },

  menuClick(game, x, y) {
    const m = this.menu;
    if (!m) return false;
    if (m.help) { m.help = false; Sound.play('tap'); return true; }
    this.menuMove(x, y);
    const h = m.hover;
    if (!h) return false;

    if (h === 'adventure' || h === 'start') {
      Sound.play('buttonclick');
      startAdventure(this.savedLevel());
      return true;
    }
    if (h === 'options') { Sound.play('buttonclick'); togglePause(); return true; }
    if (h === 'help')    { Sound.play('buttonclick'); m.help = true; return true; }
    if (h === 'switchUser') {
      if (this.savedLevel() === 0) {
        Sound.play('tap');
        m.toast = { text: 'No saved adventure yet', t: 2 };
      } else if (m.resetArmed > 0) {
        try { localStorage.removeItem('pvz.level'); } catch (e) {}
        Sound.play('buttonclick');
        m.resetArmed = 0;
        this.applyMenuSave();
        m.toast = { text: 'Adventure reset to 1-1', t: 2.2 };
      } else {
        Sound.play('tap');
        m.resetArmed = 3;
        m.toast = { text: 'Click the sign again to restart from 1-1', t: 3 };
      }
      return true;
    }
    const b = this.menuButtons[h];
    if (b && b.locked) {
      Sound.play('buzzer');
      m.toast = { text: b.locked + ' is not in this build', t: 2.2 };
      return true;
    }
    return false;
  },

  // ------------------------------------------------------- pause menu
  // The dialog is a tombstone whose header already reads MENU, so the content
  // sits in the dark slate panel and the button rests on the base slab.
  pauseArt() {
    return Assets.masked('images/options_menuback.jpg', 'images/options_menuback_.png');
  },

  pauseLayout() {
    const img = this.pauseArt();
    const w = (img && img.width) || 423, h = (img && img.height) || 498;
    return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
  },

  drawPauseMenu(ctx, game) {
    const fromMenu = !!(game && game.state === 'menu');
    const L = this.pauseLayout();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.fillRect(0, 0, W, H);

    const back = this.pauseArt();
    if (back && back.width) ctx.drawImage(back, L.x, L.y);
    else { ctx.fillStyle = '#4a4759'; ctx.fillRect(L.x, L.y, L.w, L.h); }

    Fonts.draw(ctx, 'DwarvenTodcraft18', fromMenu ? 'Options' : 'Paused', L.x + L.w / 2, L.y + 150,
               { align: 'center', color: '#d8d2e8', shadow: 'rgba(0,0,0,.8)' });

    // Mustache Mode toggle
    const box = Assets.image(Settings.mustache ? 'images/options_checkbox1.png'
                                               : 'images/options_checkbox0.png');
    const bw = (box && box.width) || 42, bh = (box && box.height) || 39;
    const bx = L.x + 62, by = L.y + 196;
    if (box && box.width) ctx.drawImage(box, bx, by);
    else {
      ctx.strokeStyle = '#d8d2e8'; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      if (Settings.mustache) { ctx.fillStyle = '#8ee23f'; ctx.fillRect(bx + 7, by + 7, bw - 14, bh - 14); }
    }
    Fonts.draw(ctx, 'BrianneTod16', 'Mustache Mode', bx + bw + 14, by + 27,
               { color: '#e6e1f2', shadow: 'rgba(0,0,0,.8)' });
    Fonts.draw(ctx, 'BrianneTod12', 'Gives every zombie a fine mustache.',
               bx + 2, by + 56, { color: '#a9a2bd' });
    this._mustacheRect = [bx, by, L.w - 128, bh];

    // Crazy Dave: click him for a line
    const icon = this.daveIcon(74);
    const dx = L.x + 58, dy = L.y + 286, dh2 = 82;
    ctx.save();
    ctx.fillStyle = 'rgba(20,16,34,.35)';
    ctx.strokeStyle = 'rgba(220,210,245,.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(dx, dy, L.w - 116, dh2, 10);
    else ctx.rect(dx, dy, L.w - 116, dh2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    if (icon) ctx.drawImage(icon, dx + 10, dy + (dh2 - icon.height) / 2);
    Fonts.draw(ctx, 'BrianneTod16', 'Talk to Crazy Dave', dx + 96, dy + 38,
               { color: '#e6e1f2', shadow: 'rgba(0,0,0,.8)' });
    Fonts.draw(ctx, 'BrianneTod12', 'He has a lot to say.', dx + 96, dy + 60,
               { color: '#a9a2bd' });
    this._daveRect = [dx, dy, L.w - 116, dh2];

    // Buttons on the base slab: two in-game, a single Back from the title screen
    const btn = Assets.image('images/options_backtogamebutton0.png');
    const dh = 64, gap = 14;
    const dw = fromMenu ? 250 : 176;
    const labels = fromMenu ? ['Back'] : ['Main Menu', 'Back to Game'];
    const ry = L.y + L.h - dh - 26;
    const rx = L.x + (L.w - (dw * labels.length + gap * (labels.length - 1))) / 2;
    labels.forEach((label, i) => {
      const bx = rx + i * (dw + gap);
      if (btn && btn.width) ctx.drawImage(btn, bx, ry, dw, dh);
      else { ctx.fillStyle = '#4a7d16'; ctx.fillRect(bx, ry, dw, dh); }
      Fonts.draw(ctx, 'BrianneTod16', label, bx + dw / 2, ry + dh / 2 + 6,
                 { align: 'center', color: '#2f1d06' });
    });
    this._mainMenuRect = fromMenu ? [0, 0, 0, 0] : [rx, ry, dw, dh];
    this._resumeRect = fromMenu ? [rx, ry, dw, dh] : [rx + dw + gap, ry, dw, dh];

    ctx.restore();
  },

  pauseClick(x, y) {
    if (this.hits(x, y, this._mustacheRect || [0, 0, 0, 0])) { toggleMustache(); return true; }
    if (this.hits(x, y, this._daveRect || [0, 0, 0, 0])) { playCrazyDave(); return true; }
    if (this.hits(x, y, this._mainMenuRect || [0, 0, 0, 0])) { returnToMainMenu(); return true; }
    if (this.hits(x, y, this._resumeRect || [0, 0, 0, 0])) { togglePause(); return true; }
    return false;
  },

  drawEnd(ctx, game) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    const won = game.state === 'won';

    if (won) {
      Fonts.draw(ctx, 'DwarvenTodcraft36GreenInset', 'Level Complete!', W / 2, 250,
                 { align: 'center', shadow: 'rgba(0,0,0,.8)' });
    } else {
      const line = 'THE ZOMBIES ATE YOUR BRAINS!';
      const scale = Math.min(1, (W - 60) / Fonts.measure('HouseofTerror28', line));
      Fonts.draw(ctx, 'HouseofTerror28', line, W / 2, 250,
                 { align: 'center', color: '#c81f1a', scale, shadow: 'rgba(0,0,0,.8)' });
    }

    const sub = won
      ? (game.levelIndex + 1 < LEVELS.length ? 'Press N for the next level, or R to replay' : 'You finished every level! Press R to play again')
      : 'Press R to try again';
    Fonts.draw(ctx, 'BrianneTod16', sub, W / 2, 300, { align: 'center', color: '#fff' });
    ctx.restore();
  },
};
