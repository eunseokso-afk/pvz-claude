// Game entities. Sprites are positioned by measuring the bounding box of a
// reanim's animation range once, then anchoring that box's bottom-centre to a
// point on the lawn — no hand-tuned offset table per plant.

const _anchorCache = {};

// anchorTrack, when given, supplies the horizontal centre. A pole vaulter's
// pole or a Gargantuar's telephone pole otherwise drags the whole sprite
// sideways, because they widen the bounding box far past the body.
function reanimAnchor(reanimName, animName, anchorTrack) {
  const key = reanimName + '|' + animName + '|' + (anchorTrack || '');
  if (_anchorCache[key]) return _anchorCache[key];
  const def = Assets.reanims[reanimName];
  if (!def || !def.drawTracks.length) return (_anchorCache[key] = { ox: 0, oy: 0, w: 40, h: 40 });

  const ranges = def.ranges || {};
  const range = (animName && (ranges[animName] || def.anims[animName])) || ranges['*']
                || [0, Math.max(0, def.length - 1)];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
  for (let fi = range[0]; fi <= range[1]; fi++) {
    for (const t of def.drawTracks) {
      const f = t.frames[Math.min(fi, t.frames.length - 1)];
      if (!f || !f.i || f.f < 0) continue;
      const img = Assets.images[f.i];
      if (!img || !img.width) continue;
      const D = Math.PI / 180;
      const a = f.sx * Math.cos(f.kx * D), b = f.sx * Math.sin(f.kx * D);
      const c = -f.sy * Math.sin(f.ky * D), d = f.sy * Math.cos(f.ky * D);
      for (const [px, py] of [[0, 0], [img.width, 0], [0, img.height], [img.width, img.height]]) {
        const X = a * px + c * py + f.x, Y = b * px + d * py + f.y;
        if (X < x0) x0 = X; if (X > x1) x1 = X;
        if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
        n++;
      }
    }
  }
  if (!n) return (_anchorCache[key] = { ox: 0, oy: 0, w: 40, h: 40 });

  // Horizontal centre: the torso track if it exists, otherwise the full box.
  let cx = x0 + (x1 - x0) / 2;
  if (anchorTrack) {
    const track = def.drawTracks.find(t => t.name === anchorTrack);
    if (track) {
      let bx0 = 1e9, bx1 = -1e9, m = 0;
      for (let fi = range[0]; fi <= range[1]; fi++) {
        const f = track.frames[Math.min(fi, track.frames.length - 1)];
        if (!f || !f.i || f.f < 0) continue;
        const img = Assets.images[f.i];
        if (!img || !img.width) continue;
        const D = Math.PI / 180;
        const a = f.sx * Math.cos(f.kx * D), c = -f.sy * Math.sin(f.ky * D);
        for (const [px, py] of [[0, 0], [img.width, 0], [0, img.height], [img.width, img.height]]) {
          const X = a * px + c * py + f.x;
          if (X < bx0) bx0 = X; if (X > bx1) bx1 = X;
          m++;
        }
      }
      if (m) cx = bx0 + (bx1 - bx0) / 2;
    }
  }
  return (_anchorCache[key] = { ox: -cx, oy: -y1, w: x1 - x0, h: y1 - y0 });
}

function drawShadow(ctx, x, y, w, alpha = 0.45) {
  const img = Assets.image('images/plantshadow.png');
  if (!img || !img.width) return;
  const s = w / img.width;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - img.width * s / 2, y - img.height * s / 2, img.width * s, img.height * s);
  ctx.restore();
}

// ------------------------------------------------------------------ Plant
class Plant {
  constructor(game, key, col, row) {
    this.game = game;
    this.key = key;
    this.def = PLANTS[key];
    this.col = col; this.row = row;
    this.x = GRID.cx(col);
    this.y = GRID.rowY(row) + GRID.rh * 0.86;
    this.hp = this.maxHp = this.def.hp;
    this.dead = false;
    this.state = 'idle';
    this.timer = 0;
    this.age = 0;
    this.flash = 0;
    this.eaters = 0;

    const def = Assets.reanims[this.def.reanim];
    this.r = new Reanim(def);
    for (const t of this.def.hideTracks || []) this.r.setTrack(t, false);
    this.idleAnim = this.def.idle;
    this.playIdle();
    // stagger identical plants so a row of them doesn't pulse in lockstep
    if (this.r.layers) for (const L of this.r.layers) L.pos += Math.random() * 4;
    else this.r.pos += Math.random() * 4;

    if (this.def.kind === 'sun') this.timer = this.def.firstSun;
    if (this.def.kind === 'shooter' || this.def.kind === 'lobber' || this.def.kind === 'star') {
      this.timer = Math.random() * 0.6;
    }
    if (this.def.kind === 'mine') { this.state = 'arming'; this.timer = this.def.armTime; }
    if (this.def.kind === 'instant') { this.state = 'fusing'; this.timer = this.def.fuse; }
  }

  get anchor() {
    return reanimAnchor(this.def.reanim, this.def.anchorAnim || this.r.animName);
  }

  // Plants whose stalk and head animate on separate ranges have to run both.
  playIdle() {
    const d = this.def;
    if (d.bodyAnim) this.r.playLayers([{ anim: d.bodyAnim }, { anim: d.headIdle }]);
    else this.r.play(this.idleAnim, { loop: true });
  }

  playAttack() {
    const d = this.def;
    if (d.bodyAnim) {
      this.r.playLayers([{ anim: d.bodyAnim }, { anim: d.headShoot, loop: false }], { restart: true });
      this.r.onEnd = () => this.playIdle();
    } else if (d.attack) {
      this.r.play(d.attack, { loop: false });
      this.r.onEnd = () => this.playIdle();
    }
  }

  takeDamage(n) {
    this.hp -= n;
    this.flash = 0.12;
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.game.onPlantRemoved(this);
  }

  // The nearest zombie ahead of this plant in the given lane, if any.
  targetIn(row, maxCols = 99) {
    let best = null;
    for (const z of this.game.zombies) {
      if (z.row !== row || z.dying || z.x < this.x - GRID.cw * 0.4) continue;
      if (z.x > this.x + maxCols * GRID.cw) continue;
      if (!best || z.x < best.x) best = z;
    }
    return best;
  }

  update(dt) {
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.r.update(dt);
    const d = this.def;

    switch (d.kind) {
      case 'sun': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = d.sunEvery;
          this.game.spawnSun(this.x, this.y - 40, { fromPlant: true });
        }
        break;
      }
      case 'shooter': {
        const lanes = d.lanes || [0];
        const hasTarget = lanes.some(l => this.targetIn(this.row + l, d.range || 99));
        this.timer -= dt;
        if (hasTarget && this.timer <= 0) {
          this.timer = d.interval;
          this.fire(lanes);
        }
        break;
      }
      case 'lobber': {
        this.timer -= dt;
        if (this.targetIn(this.row) && this.timer <= 0) { this.timer = d.interval; this.fire([0]); }
        break;
      }
      case 'star': {
        this.timer -= dt;
        const any = this.game.zombies.some(z => !z.dying && (z.row === this.row || Math.abs(z.row - this.row) <= 1));
        if (any && this.timer <= 0) { this.timer = d.interval; this.fireStar(); }
        break;
      }
      case 'melee': {
        if (this.state === 'idle') {
          const t = this.targetIn(this.row, d.reach);
          if (t) {
            this.state = 'biting';
            this.r.play(d.attack, { loop: false });
            this.r.onEnd = () => {
              t.devour();
              Sound.play(d.sound);
              this.state = 'chewing';
              this.timer = d.chewTime;
              this.r.play(d.chew, { loop: true });
            };
          }
        } else if (this.state === 'chewing') {
          this.timer -= dt;
          if (this.timer <= 0) { this.state = 'idle'; this.playIdle(); }
        }
        break;
      }
      case 'mine': {
        if (this.state === 'arming') {
          this.timer -= dt;
          if (this.timer <= 0) {
            this.state = 'armed';
            this.r.play(d.rise || d.armed, { loop: false });
            this.r.onEnd = () => this.r.play(d.armed, { loop: true });
            Sound.play('dirt_rise', { volume: 0.6 });
          }
        } else if (this.state === 'armed') {
          const t = this.targetIn(this.row, 0.9);
          if (t) {
            Sound.play(d.sound);
            this.game.explode(this.x, this.y, 0.9, d.damage, this.row);
            this.die();
          }
        }
        break;
      }
      case 'squash': {
        if (this.state === 'idle') {
          const t = this.targetIn(this.row, 1.2);
          if (t) { this.state = 'jumping'; this.target = t; this.timer = 0; Sound.play(d.sound); this.r.play(d.up, { loop: false }); }
        } else if (this.state === 'jumping') {
          this.timer += dt;
          if (this.timer > 0.75) {
            this.state = 'falling';
            this.landX = this.target && !this.target.dead ? this.target.x : this.x + GRID.cw;
            this.r.play(d.down, { loop: false });
            this.timer = 0;
          }
        } else if (this.state === 'falling') {
          this.timer += dt;
          if (this.timer > 0.35) {
            Sound.play('squash_hmm2');
            this.game.explode(this.landX, this.y, 0.55, d.damage, this.row);
            this.game.shake(6);
            this.die();
          }
        }
        break;
      }
      case 'instant': {
        this.timer -= dt;
        if (this.state === 'fusing' && this.timer <= 0) {
          this.state = 'boom';
          Sound.play(d.sound);
          this.r.play(d.attack, { loop: false });
          if (d.freezeAll) {
            this.game.freezeAll();
            this.game.flashScreen('rgba(180,230,255,0.75)');
          } else if (d.wholeLane) {
            this.game.burnLane(this.row, d.damage);
            this.game.shake(8);
          } else {
            this.game.explode(this.x, this.y, d.radius, d.damage, null);
            this.game.shake(10);
          }
          this.timer = 0.8;
        } else if (this.state === 'boom' && this.timer <= 0) {
          this.die();
        }
        break;
      }
    }

    // wall plants crack as they take damage
    if (d.damageImages && d.bodyTrack) {
      const frac = this.hp / this.maxHp;
      const stage = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
      this.r.imgOverride = { [d.bodyTrack]: d.damageImages[stage] };
    }
  }

  fire(lanes) {
    const d = this.def;
    const [mx, my] = d.muzzle || [36, -40];
    const shots = d.burst || 1;
    for (const lane of lanes) {
      const row = this.row + lane;
      if (row < 0 || row >= GRID.rows) continue;
      for (let i = 0; i < shots; i++) {
        this.game.after(i * 0.12, () => {
          if (this.dead) return;
          this.game.projectiles.push(new Projectile(this.game, {
            x: this.x + mx, y: this.y + my, row,
            type: d.shot, damage: d.damage, chill: d.chill, splash: d.splash,
            arc: PROJECTILES[d.shot].arc, range: d.range,
          }));
        });
      }
    }
    this.playAttack();
    Sound.play(d.sound || (d.chill ? 'firepea' : 'throw'), { volume: 0.35 });
  }

  fireStar() {
    const d = this.def;
    // right, straight up, straight down, and two back-diagonals
    const dirs = [[1, 0], [0, -1], [0, 1], [-0.85, -0.5], [-0.85, 0.5]];
    for (const [dx, dy] of dirs) {
      this.game.projectiles.push(new Projectile(this.game, {
        x: this.x, y: this.y - 30, row: this.row, type: 'star',
        damage: d.damage, dir: [dx, dy], free: true,
      }));
    }
    this.playAttack();
    Sound.play('throw', { volume: 0.3 });
  }

  draw(ctx) {
    const a = this.anchor;
    let bobY = 0;
    if (this.state === 'jumping') bobY = -40 * Math.sin(Math.min(1, this.timer / 0.75) * Math.PI);
    ctx.save();
    drawShadow(ctx, this.x, this.y - 4, Math.min(78, a.w * 0.95));
    ctx.translate(this.x + a.ox, this.y + a.oy + bobY);
    if (this.state === 'falling') ctx.translate(this.landX - this.x, 0);
    this.r.draw(ctx, Assets.images, { tint: this.flash > 0 ? 'rgba(255,90,90,0.55)' : null });
    ctx.restore();
  }
}

// ----------------------------------------------------------------- Zombie
class Zombie {
  constructor(game, key, row, x) {
    this.game = game;
    this.key = key;
    this.def = ZOMBIES[key];
    this.row = row;
    this.x = x !== undefined ? x : W + 40 + Math.random() * 60;
    this.y = GRID.rowY(row) + GRID.rh * 0.9;
    this.hp = this.def.hp;
    this.shield = this.def.shield || 0;
    this.maxShield = this.shield;
    this.speed = this.def.speed * (0.9 + Math.random() * 0.2);
    this.state = 'walk';
    this.dying = false;
    this.dead = false;
    this.flash = 0;
    this.chill = 0;        // slow timer
    this.frozen = 0;       // hard freeze timer
    this.biteTimer = 0;
    this.eating = null;
    this.enraged = false;
    this.vaulted = !this.def.vaults;
    this.groanTimer = 4 + Math.random() * 8;

    this.r = new Reanim(Assets.reanims[this.def.reanim]);
    for (const t of ZOMBIE_BASE_HIDE) this.r.setTrack(t, false);
    for (const t of this.def.hide || []) this.r.setTrack(t, false);
    for (const t of this.def.show || []) this.r.setTrack(t, true);
    this.walkAnim = this.def.walk[(Math.random() * this.def.walk.length) | 0];
    this.r.play(this.walkAnim, { loop: true });
    this.r.pos += Math.random() * 10;

    if (this.def.carriesImp) this.hasImp = true;
    if (Settings.mustache) this.setMustache(true);

    // The flag is a separate reanim, authored in the zombie's own space.
    if (this.def.flag && Assets.reanims.Zombie_flagpole) {
      this.flagR = new Reanim(Assets.reanims.Zombie_flagpole);
      this.flagR.pos = this.r.pos;
    }
  }

  get anchor() { return reanimAnchor(this.def.reanim, this.r.animName, this.def.anchorTrack); }

  // Only Zombie.reanim ships a mustache track. The other zombie reanims get one
  // pinned to their head track instead, so it rides along with the animation.
  setMustache(on) {
    if (this.r.def.drawTracks.some(t => t.name === 'Zombie_mustache')) {
      this.r.setTrack('Zombie_mustache', on);
      this.wearsMustache = false;
    } else {
      this.wearsMustache = on;
    }
  }

  // Painted from inside the reanim's track loop, right after the head, so that
  // anything drawn later — a football helmet, a newspaper, a hand — still
  // covers it, the way the native mustache track behaves on Zombie.reanim.
  drawMustache(ctx, fr) {
    if (!fr || fr.f < 0) return;
    const img = Assets.image('IMAGE_REANIM_ZOMBIE_MUSTACHE1');
    if (!img || !img.width) return;
    const [dx, dy] = this.def.mustacheOffset || [12, 36];
    const D = Math.PI / 180;
    const a = fr.sx * Math.cos(fr.kx * D), b = fr.sx * Math.sin(fr.kx * D);
    const c = -fr.sy * Math.sin(fr.ky * D), d = fr.sy * Math.cos(fr.ky * D);
    ctx.save();
    ctx.transform(a, b, c, d, fr.x, fr.y);
    ctx.drawImage(img, dx, dy);
    ctx.restore();
  }
  get mouthX() { return this.x - (this.def.big ? 34 : 16); }
  get speedNow() {
    if (this.frozen > 0) return 0;
    let s = this.enraged && this.def.enraged ? this.def.enraged.speed : this.speed;
    if (this.chill > 0) s *= 0.5;
    return s;
  }

  hit(dmg, { chill = false, fire = false } = {}) {
    if (this.dying) return;
    this.flash = 0.09;
    if (chill && !this.def.metal) this.chill = 10;
    if (fire) { this.chill = 0; this.frozen = 0; }

    if (this.shield > 0) {
      this.shield -= dmg;
      Sound.play(this.def.metal ? 'shieldhit' : 'plastichit', { volume: 0.3 });
      if (this.shield <= 0) {
        dmg = -this.shield;
        this.shield = 0;
        this.onShieldGone();
      } else {
        this.updateShieldImage();
        return;
      }
    }
    this.hp -= dmg;
    if (this.hp <= 0) this.die();
  }

  onShieldGone() {
    const d = this.def;
    if (d.shieldTrack) this.r.setTrack(d.shieldTrack, false);
    if (d.enraged && !this.enraged) {
      this.enraged = true;
      Sound.play(d.rageSound);
      this.walkAnim = d.enraged.walk;
      this.r.play(this.state === 'eat' ? d.enraged.eat : this.walkAnim, { loop: true });
    }
  }

  updateShieldImage() {
    const d = this.def;
    if (!d.shieldImages || !d.shieldTrack) return;
    const frac = this.shield / this.maxShield;
    const stage = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    this.r.imgOverride = Object.assign({}, this.r.imgOverride, { [d.shieldTrack]: d.shieldImages[stage] });
  }

  // eaten whole by a Chomper
  devour() { this.dead = true; this.dying = true; }

  die({ silent = false } = {}) {
    if (this.dying) return;
    this.dying = true;
    this.state = 'die';
    if (!silent) Sound.playOne(['limbs_pop', 'groan']);
    const anim = this.def.death[(Math.random() * this.def.death.length) | 0];
    this.r.setTrack('anim_head1', false);
    this.r.setTrack('anim_head2', false);   // jaw leaves with the head
    this.r.play(anim, { loop: false });
    this.r.onEnd = () => { this.dead = true; };
    this.game.dropHead(this);
    if (this.hasImp) { this.hasImp = false; this.game.spawnImp(this); }
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.chill = Math.max(0, this.chill - dt);
    this.frozen = Math.max(0, this.frozen - dt);
    this.r.rate = this.frozen > 0 ? 0 : (this.chill > 0 ? 0.5 : 1);
    this.r.update(dt);
    if (this.flagR) { this.flagR.rate = this.r.rate; this.flagR.update(dt); }

    if (this.dying) return;

    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 8 + Math.random() * 12;
      if (this.x < W) Sound.playOne(ZOMBIE_GROANS, { volume: 0.25 });
    }

    // vaulting zombies leap the first plant they meet
    if (this.def.vaults && !this.vaulted && this.state === 'walk') {
      const p = this.plantAhead(GRID.cw * 0.55);
      if (p && !(p.def.tall)) {
        this.state = 'vault';
        this.vaultT = 0;
        this.vaultFrom = this.x;
        this.vaultTo = p.x - GRID.cw * 0.75;
        Sound.play('polevault');
        this.r.play(this.def.vault, { loop: false });
        return;
      } else if (p && p.def.tall) {
        this.vaulted = true;   // tall-nut cannot be vaulted
      }
    }
    if (this.state === 'vault') {
      this.vaultT += dt;
      const t = Math.min(1, this.vaultT / 0.75);
      this.x = this.vaultFrom + (this.vaultTo - this.vaultFrom) * t;
      if (t >= 1) {
        this.vaulted = true;
        this.state = 'walk';
        this.walkAnim = this.def.afterVault || this.def.walk[0];
        this.speed = 20;
        this.r.play(this.walkAnim, { loop: true });
      }
      return;
    }

    const target = this.plantAhead(0);
    if (target) {
      if (this.state !== 'eat') {
        this.state = 'eat';
        this.eating = target;
        this.biteTimer = 0;
        const eatAnim = this.enraged && this.def.enraged ? this.def.enraged.eat : this.def.eat;
        this.r.play(eatAnim, { loop: true });
      }
      this.biteTimer -= dt;
      if (this.biteTimer <= 0) {
        this.biteTimer = 0.5;
        Sound.playOne(CHOMP_SOUNDS, { volume: 0.4 });
        if (this.def.smash) {
          target.takeDamage(this.def.smashDamage);
          this.game.shake(7);
          this.biteTimer = 2.2;
        } else {
          target.takeDamage(50);
        }
      }
    } else {
      if (this.state === 'eat') {
        this.state = 'walk';
        this.eating = null;
        this.r.play(this.walkAnim, { loop: true });
      }
      this.x -= this.speedNow * dt;
    }

    if (this.x < HOUSE_X) this.game.zombieReachedHouse(this);
  }

  // the plant this zombie's mouth is currently over
  plantAhead(extra) {
    const mx = this.mouthX - extra;
    let best = null;
    for (const p of this.game.plants) {
      if (p.row !== this.row || p.dead) continue;
      if (mx <= GRID.colX(p.col) + GRID.cw * 0.85 && mx >= GRID.colX(p.col) - GRID.cw * 0.15) {
        if (!best || p.col > best.col) best = p;
      }
    }
    return best;
  }

  draw(ctx) {
    const a = this.anchor;
    const scale = this.def.big ? 1.0 : 1;
    ctx.save();
    drawShadow(ctx, this.x, this.y - 2, this.def.big ? 100 : 62, 0.4);
    ctx.translate(this.x + a.ox * scale, this.y + a.oy * scale);
    if (this.state === 'vault') {
      const t = Math.min(1, this.vaultT / 0.75);
      ctx.translate(0, -70 * Math.sin(t * Math.PI));
    }
    const tint = this.flash > 0 ? 'rgba(255,255,255,0.38)'
               : this.frozen > 0 ? 'rgba(120,200,255,0.55)'
               : this.chill > 0 ? 'rgba(120,190,255,0.32)' : null;
    if (this.flagR) this.flagR.draw(ctx, Assets.images, { scale, tint });
    this.r.draw(ctx, Assets.images, {
      scale, tint,
      onTrack: this.wearsMustache
        ? (name, fr) => { if (name === 'anim_head1') this.drawMustache(ctx, fr); }
        : null,
    });
    ctx.restore();
  }
}

// ------------------------------------------------------------- Projectile
class Projectile {
  constructor(game, o) {
    this.game = game;
    Object.assign(this, o);
    const p = PROJECTILES[this.type];
    this.img = p.img;
    this.spin = p.spin ? 0 : null;
    this.fire = p.fire || false;
    this.dead = false;
    this.startX = this.x;
    if (this.free) {
      const [dx, dy] = this.dir;
      const m = Math.hypot(dx, dy);
      this.vx = dx / m * p.speed; this.vy = dy / m * p.speed;
    } else if (this.arc) {
      // Plants face right; zombies come from the right. Shots travel +x.
      this.vx = p.speed * 0.55;
      this.vy = -170;
      this.g = 430;
      this.groundY = GRID.rowY(this.row) + GRID.rh * 0.75;
    } else {
      this.vx = p.speed; this.vy = 0;
      this.y = GRID.rowY(this.row) + GRID.rh * 0.42;
    }
  }

  update(dt) {
    if (this.arc) this.vy += this.g * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.spin !== null) this.spin += dt * 9;

    if (this.x < -40 || this.x > W + 60 || this.y > H + 40 || this.y < -60) { this.dead = true; return; }
    if (this.range && Math.abs(this.startX - this.x) > this.range * GRID.cw) { this.dead = true; return; }

    // a pea passing through a Torchwood becomes a fireball
    if (!this.fire && !this.arc && !this.free) {
      for (const p of this.game.plants) {
        if (p.dead || p.key !== 'torchwood' || p.row !== this.row) continue;
        if (Math.abs(this.x - p.x) < 14) {
          this.fire = true; this.damage += 20; this.type = 'firepea';
          Sound.play('ignite', { volume: 0.35 });
          this.game.puff(this.x, this.y, '#ffb040');
        }
      }
    }

    for (const z of this.game.zombies) {
      if (z.dying || z.dead) continue;
      if (this.free) { if (z.row !== this.row && Math.abs(z.row - this.row) > 1) continue; }
      else if (z.row !== this.row) continue;
      const hitX = z.x - (z.def.big ? 20 : 8);
      const dx = this.x - hitX;
      if (dx > -26 && dx < 26) {
        if (this.arc && this.y < z.y - 70) continue;   // lobbed shots must come down
        z.hit(this.damage, { chill: this.chill, fire: this.fire });
        if (this.splash) this.game.splashDamage(this.x, this.row, this.splash, z);
        if (this.fire) this.game.puff(this.x, this.y, '#ff8830');
        else this.game.puff(this.x, this.y, this.chill ? '#bfe9ff' : '#cfe89a');
        Sound.play(this.arc ? 'melonimpact' : 'splat', { volume: 0.3 });
        this.dead = true;
        return;
      }
    }

    if (this.arc && this.y >= this.groundY) {
      this.game.puff(this.x, this.y, '#9fd06a');
      this.dead = true;
    }
  }

  draw(ctx) {
    const img = Assets.image(this.img);
    if (!img || !img.width) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.spin !== null) ctx.rotate(this.spin);
    if (this.fire) { ctx.shadowColor = '#ff8a20'; ctx.shadowBlur = 12; }
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}

// -------------------------------------------------------------- Sun token
class SunToken {
  constructor(game, x, y, { fromPlant = false, value = 25 } = {}) {
    this.game = game;
    this.x = x; this.y = y;
    this.value = value;
    this.targetY = fromPlant ? y + 22 : GRID.y + 40 + Math.random() * (GRID.rh * 4);
    this.vy = fromPlant ? -70 : 34;
    this.fromPlant = fromPlant;
    this.life = 12;
    this.dead = false;
    this.collecting = false;
    this.scale = fromPlant ? 0.7 : 1;
    this.r = new Reanim(Assets.reanims.Sun);
    this.r.pos = Math.random() * 12;
  }

  get radius() { return 34 * this.scale; }

  collect() {
    if (this.collecting) return;
    this.collecting = true;
    Sound.play('points');
    this.game.addSun(this.value);
  }

  update(dt) {
    this.r.update(dt);
    if (this.collecting) {
      const dx = 40 - this.x, dy = 26 - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 18) { this.dead = true; return; }
      this.x += dx / d * 900 * dt;
      this.y += dy / d * 900 * dt;
      this.scale = Math.max(0.25, this.scale - dt * 1.2);
      return;
    }
    if (this.fromPlant) {
      this.vy += 320 * dt;
      this.y += this.vy * dt;
      if (this.y > this.targetY) { this.y = this.targetY; this.vy = 0; }
    } else if (this.y < this.targetY) {
      this.y += this.vy * dt;
    }
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale * 0.62, this.scale * 0.62);
    if (this.life < 3 && !this.collecting) ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(this.life * 6));
    this.r.draw(ctx, Assets.images);
    ctx.restore();
  }
}

// ------------------------------------------------------------- Lawn mower
class LawnMower {
  constructor(game, row) {
    this.game = game;
    this.row = row;
    this.x = GRID.x - 45;   // sits just off the lawn edge, clipped like the original
    this.y = GRID.rowY(row) + GRID.rh * 0.88;
    this.running = false;
    this.dead = false;
    this.r = new Reanim(Assets.reanims.LawnMower);
    this.r.play('anim_normal', { loop: true });
  }

  trigger() {
    if (this.running) return;
    this.running = true;
    Sound.play('lawnmower');
  }

  update(dt) {
    this.r.update(dt);
    if (!this.running) return;
    this.x += 420 * dt;
    for (const z of this.game.zombies) {
      if (z.row === this.row && !z.dying && Math.abs(z.x - this.x) < 46) {
        z.die({ silent: true });
        Sound.play('lawnmower', { volume: 0.3 });
      }
    }
    if (this.x > W + 60) this.dead = true;
  }

  draw(ctx) {
    const a = reanimAnchor('LawnMower', this.r.animName);
    ctx.save();
    ctx.translate(this.x + a.ox, this.y + a.oy);
    this.r.draw(ctx, Assets.images);
    ctx.restore();
  }
}

// ------------------------------------------------------ small visual bits
class Puff {
  constructor(x, y, color) {
    this.x = x; this.y = y; this.color = color;
    this.life = 0.32; this.max = 0.32; this.dead = false;
    this.parts = Array.from({ length: 5 }, () => ({
      dx: (Math.random() - 0.5) * 46, dy: (Math.random() - 0.5) * 46, r: 3 + Math.random() * 4,
    }));
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) {
    const t = 1 - this.life / this.max;
    ctx.save();
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.fillStyle = this.color;
    for (const p of this.parts) {
      ctx.beginPath();
      ctx.arc(this.x + p.dx * t, this.y + p.dy * t, p.r * (1 - t * 0.5), 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
}

class ZombieHead {
  constructor(x, y, reanimName) {
    this.x = x; this.y = y;
    this.vx = -30 - Math.random() * 40;
    this.vy = -190;
    this.rot = 0;
    this.dead = false;
    this.img = Assets.image('IMAGE_REANIM_ZOMBIE_HEAD') ? 'IMAGE_REANIM_ZOMBIE_HEAD' : null;
  }
  update(dt) {
    this.vy += 700 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.rot += dt * 5;
    if (this.y > H) this.dead = true;
  }
  draw(ctx) {
    const img = this.img && Assets.image(this.img);
    if (!img || !img.width) return;
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}

class FloatText {
  constructor(x, y, text, color = '#fff') {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.life = 1.1; this.dead = false;
  }
  update(dt) { this.y -= 26 * dt; this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.life);
    ctx.font = 'bold 20px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}
