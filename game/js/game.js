// Core game: board state, wave scheduling, input and the draw order.

class Game {
  constructor(canvas, levelIndex = 0) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.levelIndex = levelIndex;
    this.level = LEVELS[Math.min(levelIndex, LEVELS.length - 1)];
    this.reset();
  }

  reset() {
    this.state = 'chooser';          // chooser -> ready -> playing -> won|lost
    this.sun = this.level.startSun;
    this.plants = [];
    this.zombies = [];
    this.projectiles = [];
    this.suns = [];
    this.effects = [];
    this.mowers = Array.from({ length: GRID.rows }, (_, r) => new LawnMower(this, r));
    this.timers = [];
    this.cells = Array.from({ length: GRID.rows }, () => new Array(GRID.cols).fill(null));

    this.wave = 0;
    this.waveTimer = 18;
    this.waveSpawned = false;
    this.sunTimer = 3;
    this.shakeAmt = 0;
    this.flash = null;
    this.time = 0;
    this.bigWaveText = 0;

    this.selected = null;            // seed slot index being placed
    this.shovel = false;
    this.mouse = { x: 0, y: 0, over: null };
    this.message = null;
    this.messageTimer = 0;
  }

  // ------------------------------------------------------------ helpers
  after(delay, fn) { this.timers.push({ t: delay, fn }); }

  shake(n) { this.shakeAmt = Math.max(this.shakeAmt, n); }

  flashScreen(color) { this.flash = { color, t: 0.5, max: 0.5 }; }

  puff(x, y, color) { this.effects.push(new Puff(x, y, color)); }

  say(text, secs = 2.2) { this.message = text; this.messageTimer = secs; }

  addSun(n) {
    this.sun += n;
    this.effects.push(new FloatText(60, 60, '+' + n, '#ffe14d'));
  }

  spawnSun(x, y, opts) { this.suns.push(new SunToken(this, x, y, opts)); }

  dropHead(z) {
    if (z.def.reanim === 'Zombie') this.effects.push(new ZombieHead(z.x, z.y - 90));
  }

  spawnImp(gar) {
    const imp = new Zombie(this, 'imp', gar.row, gar.x - 60);
    imp.state = 'walk';
    this.zombies.push(imp);
    Sound.play('imp');
  }

  // ------------------------------------------------------------- damage
  explode(x, y, radiusCells, damage, onlyRow) {
    const rad = radiusCells * GRID.cw;
    for (const z of this.zombies) {
      if (z.dying) continue;
      if (onlyRow !== null && onlyRow !== undefined && Math.abs(z.row - onlyRow) > 1) continue;
      if (Math.hypot(z.x - x, GRID.cy(z.row) - y) < rad) z.hit(damage, { fire: true });
    }
    this.effects.push(new Puff(x, y - 30, '#ffd070'));
    Sound.play('explosion', { volume: 0.5 });
  }

  splashDamage(x, row, damage, exclude) {
    for (const z of this.zombies) {
      if (z === exclude || z.dying) continue;
      if (Math.abs(z.row - row) > 1) continue;
      if (Math.abs(z.x - x) < GRID.cw * 0.8) z.hit(damage);
    }
  }

  burnLane(row, damage) {
    for (const z of this.zombies) {
      if (!z.dying && z.row === row) z.hit(damage, { fire: true });
    }
    this.effects.push(new Puff(W / 2, GRID.cy(row), '#ff7a20'));
    this.flashScreen('rgba(255,150,40,0.5)');
  }

  freezeAll() {
    for (const z of this.zombies) {
      if (z.dying) continue;
      z.frozen = 4;
      z.chill = 12;
      z.hit(20);
    }
  }

  // -------------------------------------------------------------- board
  plantAt(col, row) { return this.cells[row] && this.cells[row][col]; }

  canPlant(key, col, row) {
    if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return false;
    return !this.plantAt(col, row);
  }

  place(key, col, row) {
    const p = new Plant(this, key, col, row);
    this.plants.push(p);
    this.cells[row][col] = p;
    Sound.playOne(['plant', 'plant2']);
    return p;
  }

  onPlantRemoved(p) {
    if (this.cells[p.row][p.col] === p) this.cells[p.row][p.col] = null;
  }

  zombieReachedHouse(z) {
    const mower = this.mowers.find(m => m.row === z.row && !m.running && !m.dead);
    if (mower) { mower.trigger(); return; }
    if (this.state === 'playing') this.lose();
  }

  // -------------------------------------------------------------- waves
  get totalWaves() { return this.level.waves; }
  get isFlagWave() { return this.wave > 0 && this.wave % 10 === 0; }
  get isFinalWave() { return this.wave >= this.totalWaves; }

  // Budget in "spawn points" (see ZOMBIE_WEIGHT). Level 1-1 works out to
  // roughly 27 zombies across its ten waves, with the last one the big push.
  waveBudget(n) {
    let b = 0.6 + n * 0.3 + this.levelIndex * 0.5;
    if (n >= this.totalWaves) b *= 2.4;        // final wave
    else if (n % 10 === 0) b *= 1.8;           // flag wave
    return b;
  }

  spawnWave() {
    this.wave++;
    const budget = this.waveBudget(this.wave);
    const pool = this.level.pool.filter(k => {
      // heavier zombies only start showing up once the wave can afford them
      return ZOMBIE_WEIGHT[k] <= Math.max(1, budget * 0.55);
    });
    let left = budget;
    const picks = [];
    let guard = 0;
    while (left > 0.8 && guard++ < 60) {
      const affordable = pool.filter(k => ZOMBIE_WEIGHT[k] <= left);
      if (!affordable.length) break;
      const k = affordable[(Math.random() * affordable.length) | 0];
      picks.push(k);
      left -= ZOMBIE_WEIGHT[k];
    }
    if (!picks.length) picks.push('normal');

    if (this.isFlagWave || this.isFinalWave) {
      picks.unshift('flag');
      Sound.play('hugewave');
      this.say(this.isFinalWave ? 'FINAL WAVE' : 'A huge wave of zombies is approaching!', 3);
      this.bigWaveText = 3;
    }

    // spread the wave out over a few seconds and across the rows
    picks.forEach((k, i) => {
      this.after(Math.random() * 2.4 + i * 0.12, () => {
        const row = (Math.random() * GRID.rows) | 0;
        this.zombies.push(new Zombie(this, k, row));
      });
    });

    if (this.isFlagWave) Sound.play('siren', { volume: 0.5 });
    // A zombie needs ~40s to cross the lawn, so waves must not pile up.
    this.waveTimer = this.isFlagWave ? 34 : 26 - Math.min(6, this.levelIndex);
  }

  updateWaves(dt) {
    if (this.isFinalWave) {
      // level ends once the last wave is cleared
      if (!this.zombies.length && !this.timers.length) this.win();
      return;
    }
    this.waveTimer -= dt;
    const alive = this.zombies.filter(z => !z.dying).length;
    // Send the next wave early only once the lawn is nearly clear.
    if (this.waveTimer <= 0 || (alive === 0 && this.waveTimer < 14) ||
        (alive <= 2 && this.waveTimer < 6)) this.spawnWave();
  }

  // ------------------------------------------------------------ outcome
  win() {
    if (this.state !== 'playing') return;
    this.state = 'won';
    Sound.stopMusic();
    Sound.play('winmusic');
    const best = +(localStorage.getItem('pvz.level') || 0);
    if (this.levelIndex + 1 > best) localStorage.setItem('pvz.level', this.levelIndex + 1);
  }

  lose() {
    if (this.state !== 'playing') return;
    this.state = 'lost';
    Sound.stopMusic();
    Sound.play('losemusic');
    Sound.play('scream');
  }

  // ------------------------------------------------------------- update
  update(dt) {
    this.time += dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { t.fn(); this.timers.splice(i, 1); }
    }

    if (this.messageTimer > 0) this.messageTimer -= dt;
    if (this.bigWaveText > 0) this.bigWaveText -= dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 26);
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }

    if (this.state !== 'playing') {
      for (const e of this.effects) e.update(dt);
      this.effects = this.effects.filter(e => !e.dead);
      for (const z of this.zombies) z.r.update(dt);
      return;
    }

    // sun falls from the sky
    this.sunTimer -= dt;
    if (this.sunTimer <= 0) {
      this.sunTimer = 4.5 + Math.random() * 3;
      this.spawnSun(GRID.x + 40 + Math.random() * (GRID.right - GRID.x - 80), -40);
    }

    for (const p of this.plants) p.update(dt);
    for (const z of this.zombies) z.update(dt);
    for (const p of this.projectiles) p.update(dt);
    for (const s of this.suns) s.update(dt);
    for (const m of this.mowers) m.update(dt);
    for (const e of this.effects) e.update(dt);

    this.plants = this.plants.filter(p => !p.dead);
    this.zombies = this.zombies.filter(z => !z.dead);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.suns = this.suns.filter(s => !s.dead);
    this.mowers = this.mowers.filter(m => !m.dead);
    this.effects = this.effects.filter(e => !e.dead);

    this.updateWaves(dt);
  }

  // --------------------------------------------------------------- draw
  draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shakeAmt > 0.2) {
      ctx.translate((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
    }

    const bg = Assets.image('images/background1.jpg');
    if (bg && bg.width) ctx.drawImage(bg, -GRID.bgOffset, 0);

    for (const m of this.mowers) m.draw(ctx);

    // planting preview
    if (this.selected !== null && this.mouse.over) {
      const { col, row } = this.mouse.over;
      const key = UI.slots[this.selected] && UI.slots[this.selected].key;
      if (key && this.canPlant(key, col, row)) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        const a = reanimAnchor(PLANTS[key].reanim, PLANTS[key].idle);
        const ghost = UI.ghost(key);
        if (ghost) ctx.drawImage(ghost, GRID.cx(col) - ghost.width / 2, GRID.rowY(row) + GRID.rh * 0.86 - ghost.height);
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(GRID.colX(col) + 2, GRID.rowY(row) + 2, GRID.cw - 4, GRID.rh - 4);
        ctx.restore();
      }
    }

    // lawn actors, painted back row first so nearer rows overlap correctly
    const actors = [...this.plants, ...this.zombies];
    actors.sort((a, b) => (a.row - b.row) || (a.y - b.y) || (a.x - b.x));
    for (const a of actors) a.draw(ctx);

    for (const p of this.projectiles) p.draw(ctx);
    for (const e of this.effects) e.draw(ctx);
    for (const s of this.suns) s.draw(ctx);

    ctx.restore();

    if (this.flash) {
      ctx.save();
      ctx.globalAlpha = (this.flash.t / this.flash.max) * 0.85;
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // -------------------------------------------------------------- input
  cellAt(x, y) {
    const col = GRID.colAt(x), row = GRID.rowAt(y);
    if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
    return { col, row };
  }

  onMove(x, y) {
    this.mouse.x = x; this.mouse.y = y;
    this.mouse.over = this.cellAt(x, y);
  }

  onClick(x, y) {
    // sun first — it sits on top of everything
    for (let i = this.suns.length - 1; i >= 0; i--) {
      const s = this.suns[i];
      if (!s.collecting && Math.hypot(s.x - x, s.y - y) < s.radius) { s.collect(); return; }
    }
    if (this.state !== 'playing') return;

    if (UI.handleClick(this, x, y)) return;

    const cell = this.cellAt(x, y);
    if (!cell) { this.selected = null; this.shovel = false; return; }

    if (this.shovel) {
      const p = this.plantAt(cell.col, cell.row);
      if (p) { p.die(); Sound.play('shovel'); }
      this.shovel = false;
      return;
    }

    if (this.selected !== null) {
      const slot = UI.slots[this.selected];
      if (!slot) return;
      if (slot.cooldown > 0) { Sound.play('buzzer'); return; }
      if (this.sun < PLANTS[slot.key].cost) { Sound.play('buzzer'); this.say('Not enough sun!'); return; }
      if (!this.canPlant(slot.key, cell.col, cell.row)) { Sound.play('buzzer'); return; }
      this.sun -= PLANTS[slot.key].cost;
      slot.cooldown = PLANTS[slot.key].recharge;
      this.place(slot.key, cell.col, cell.row);
      this.selected = null;
    }
  }
}
