// Board geometry calibrated against a screenshot of the original game:
// correlating a sprite-free strip of it with images/background1.jpg puts the
// backdrop at x=-220 (y=0), and fitting the lawn's checkerboard gives cells of
// 81.75 x 100.75 starting at (28.5, 70).
const GRID = {
  x: 28.5, y: 70, cols: 9, rows: 5, cw: 81.75, rh: 100.75,
  bgOffset: 220,                  // backdrop is drawn at -bgOffset
  colX: c => GRID.x + c * GRID.cw,
  rowY: r => GRID.y + r * GRID.rh,
  cx: c => GRID.x + c * GRID.cw + GRID.cw / 2,
  cy: r => GRID.y + r * GRID.rh + GRID.rh / 2,
  colAt: px => Math.floor((px - GRID.x) / GRID.cw),
  rowAt: py => Math.floor((py - GRID.y) / GRID.rh),
  get right() { return GRID.x + GRID.cols * GRID.cw; },
  get bottom() { return GRID.y + GRID.rows * GRID.rh; },
};

const W = 800, H = 600;
const HOUSE_X = GRID.x - 22;      // a zombie past this line has reached the house

// ---------------------------------------------------------------- plants
// recharge is in seconds; hp is in damage units. A pea does 20, so a plain
// zombie (100hp) takes five peas, a conehead eight, a buckethead ten.
const PLANTS = {
  sunflower: {
    name: 'Sunflower', cost: 50, recharge: 7.5, hp: 300, kind: 'sun',
    reanim: 'SunFlower', idle: null, sunEvery: 24, firstSun: 7,
    almanac: 'Sunflowers are essential for producing sun.',
  },
  peashooter: {
    name: 'Peashooter', cost: 100, recharge: 7.5, hp: 300, kind: 'shooter',
    reanim: 'PeaShooter', idle: 'anim_full_idle', anchorAnim: 'anim_full_idle',
    bodyAnim: 'anim_idle', headIdle: 'anim_head_idle', headShoot: 'anim_shooting',
    hideTracks: ['PeaShooter_eyebrow'],   // the eyebrows belong to the Repeater
    interval: 1.5, damage: 20, shot: 'pea', muzzle: [40, -46],
    almanac: 'Peashooters fire peas at attacking zombies.',
  },
  cherrybomb: {
    name: 'Cherry Bomb', cost: 150, recharge: 50, hp: 4000, kind: 'instant',
    reanim: 'CherryBomb', idle: 'anim_idle', attack: 'anim_explode',
    fuse: 1.2, damage: 1800, radius: 1.4, sound: 'cherrybomb',
    almanac: 'Cherry bombs blow up all nearby zombies.',
  },
  wallnut: {
    name: 'Wall-nut', cost: 50, recharge: 30, hp: 4000, kind: 'wall',
    reanim: 'Wallnut', idle: 'anim_idle', armor: true, bodyTrack: 'anim_idle',
    damageImages: ['IMAGE_REANIM_WALLNUT_BODY', 'reanim/Wallnut_cracked1.png', 'reanim/Wallnut_cracked2.png'],
    almanac: 'Wall-nuts have hard shells you can use to protect your other plants.',
  },
  potatomine: {
    name: 'Potato Mine', cost: 25, recharge: 30, hp: 300, kind: 'mine',
    reanim: 'PotatoMine', idle: 'anim_idle', armed: 'anim_armed', rise: 'anim_rise',
    armTime: 14, damage: 1800, sound: 'potato_mine',
    almanac: 'Potato mines destroy a zombie, but need time to arm themselves.',
  },
  snowpea: {
    name: 'Snow Pea', cost: 175, recharge: 7.5, hp: 300, kind: 'shooter',
    reanim: 'SnowPea', idle: 'anim_full_idle', anchorAnim: 'anim_full_idle',
    bodyAnim: 'anim_idle', headIdle: 'anim_head_idle', headShoot: 'anim_shooting',
    interval: 1.5, damage: 20, shot: 'snowpea', chill: true, muzzle: [40, -46],
    almanac: 'Snow peas shoot frozen peas that damage and slow zombies.',
  },
  chomper: {
    name: 'Chomper', cost: 150, recharge: 7.5, hp: 300, kind: 'melee',
    reanim: 'Chomper', idle: 'anim_idle', attack: 'anim_bite', chew: 'anim_chew',
    reach: 1.4, chewTime: 42, sound: 'bigchomp',
    almanac: 'Chompers devour a zombie whole, but must chew for a long time.',
  },
  repeater: {
    name: 'Repeater', cost: 200, recharge: 7.5, hp: 300, kind: 'shooter',
    reanim: 'PeaShooter', idle: 'anim_full_idle', anchorAnim: 'anim_full_idle',
    bodyAnim: 'anim_idle', headIdle: 'anim_head_idle', headShoot: 'anim_shooting',
    interval: 1.5, damage: 20, shot: 'pea', burst: 2, muzzle: [40, -46],
    almanac: 'Repeaters fire two peas at a time.',
  },
  puffshroom: {
    name: 'Puff-shroom', cost: 0, recharge: 7.5, hp: 300, kind: 'shooter',
    reanim: 'PuffShroom', idle: 'anim_idle', attack: 'anim_shooting',
    interval: 1.5, damage: 20, shot: 'puff', range: 3.5, muzzle: [26, -26],
    almanac: 'Puff-shrooms are free, but only shoot a short distance.',
  },
  squash: {
    name: 'Squash', cost: 50, recharge: 30, hp: 4000, kind: 'squash',
    reanim: 'Squash', idle: 'anim_idle', up: 'anim_jumpup', down: 'anim_jumpdown',
    damage: 1800, sound: 'squash_hmm',
    almanac: 'Squash smashes the first zombie that comes close.',
  },
  threepeater: {
    name: 'Threepeater', cost: 325, recharge: 7.5, hp: 300, kind: 'shooter',
    reanim: 'Threepeater', idle: 'anim_head1', attack: null,
    interval: 1.5, damage: 20, shot: 'pea', lanes: [-1, 0, 1], muzzle: [44, -48],
    almanac: 'Threepeaters shoot peas in three lanes at once.',
  },
  tallnut: {
    name: 'Tall-nut', cost: 125, recharge: 30, hp: 8000, kind: 'wall',
    reanim: 'Tallnut', idle: null, armor: true, tall: true, bodyTrack: 'anim_idle',
    damageImages: ['IMAGE_REANIM_TALLNUT_BODY', 'reanim/Tallnut_cracked1.png', 'reanim/Tallnut_cracked2.png'],
    almanac: 'Tall-nuts are heavy duty wall plants that cannot be vaulted over.',
  },
  jalapeno: {
    name: 'Jalapeno', cost: 125, recharge: 50, hp: 4000, kind: 'instant',
    reanim: 'Jalapeno', idle: 'anim_idle', attack: 'anim_explode',
    fuse: 1.0, damage: 1800, wholeLane: true, sound: 'jalapeno',
    almanac: 'Jalapenos destroy an entire lane of zombies.',
  },
  torchwood: {
    name: 'Torchwood', cost: 175, recharge: 7.5, hp: 300, kind: 'support',
    reanim: 'Torchwood', idle: 'anim_idle',
    almanac: 'Torchwoods turn peas that pass through them into fireballs.',
  },
  starfruit: {
    name: 'Starfruit', cost: 125, recharge: 7.5, hp: 300, kind: 'star',
    reanim: 'Starfruit', idle: 'anim_idle', attack: 'anim_shoot',
    interval: 1.5, damage: 20, shot: 'star', muzzle: [30, -32],
    almanac: 'Starfruit shoot in five directions at once.',
  },
  cabbagepult: {
    name: 'Cabbage-pult', cost: 100, recharge: 7.5, hp: 300, kind: 'lobber',
    reanim: 'Cabbagepult', idle: 'anim_idle', attack: 'anim_shooting',
    interval: 3.0, damage: 40, shot: 'cabbage', sound: 'kernelpult', muzzle: [36, -54],
    almanac: 'Cabbage-pults lob cabbages over obstacles.',
  },
  melonpult: {
    name: 'Melon-pult', cost: 300, recharge: 7.5, hp: 300, kind: 'lobber',
    reanim: 'Melonpult', idle: 'anim_idle', attack: 'anim_shooting',
    interval: 3.0, damage: 80, splash: 40, shot: 'melon', sound: 'kernelpult', muzzle: [36, -54],
    almanac: 'Melon-pults do heavy splash damage to a group of zombies.',
  },
  iceshroom: {
    name: 'Ice-shroom', cost: 75, recharge: 50, hp: 4000, kind: 'instant',
    reanim: 'IceShroom', idle: 'anim_idle', attack: 'anim_idle',
    fuse: 0.5, damage: 20, freezeAll: true, sound: 'frozen',
    almanac: 'Ice-shrooms briefly freeze every zombie on the screen.',
  },
};

const PROJECTILES = {
  pea:     { img: 'images/ProjectilePea.png', speed: 320 },
  snowpea: { img: 'images/ProjectileSnowPea.png', speed: 320 },
  firepea: { img: 'images/ProjectilePea.png', speed: 320, fire: true },
  puff:    { img: 'IMAGE_REANIM_PUFF_PUFF1', speed: 260, fade: true },
  star:    { img: 'images/Projectile_star.png', speed: 260, spin: true },
  cabbage: { img: 'IMAGE_REANIM_CABBAGEPULT_CABBAGE', speed: 260, arc: true, spin: true },
  melon:   { img: 'IMAGE_REANIM_MELONPULT_MELON', speed: 260, arc: true },
};

// ---------------------------------------------------------------- zombies
// Health scale: a plain zombie is 100hp, a cone adds 50 and a bucket adds 100.
// The rest are scaled to keep their old standing relative to a plain zombie.
// Every part of Zombie.reanim ships visible, so the game hides what it doesn't need.
// anim_head2 draws Zombie_jaw — the lower jaw, not a damage state, so it stays on.
const ZOMBIE_BASE_HIDE = [
  'anim_innerarm2', 'anim_innerarm3', 'anim_tongue', 'anim_hair',
  'anim_cone', 'anim_bucket', 'anim_screendoor', 'Zombie_flaghand',
  'Zombie_innerarm_screendoor', 'Zombie_innerarm_screendoor_hand', 'Zombie_outerarm_screendoor',
  'Zombie_duckytube', 'Zombie_whitewater', 'Zombie_whitewater2', 'Zombie_mustache', '_ground',
];

const ZOMBIES = {
  normal: {
    name: 'Zombie', hp: 100, speed: 20, reanim: 'Zombie', anchorTrack: 'Zombie_body',
    walk: ['anim_walk', 'anim_walk2'], eat: 'anim_eat', death: ['anim_death', 'anim_death2'],
  },
  flag: {
    name: 'Flag Zombie', hp: 100, speed: 27, reanim: 'Zombie', flag: true, anchorTrack: 'Zombie_body',
    show: ['Zombie_flaghand'], walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'],
  },
  conehead: {
    name: 'Conehead Zombie', hp: 100, shield: 50, speed: 20, reanim: 'Zombie', anchorTrack: 'Zombie_body',
    show: ['anim_cone'], shieldTrack: 'anim_cone',
    shieldImages: ['IMAGE_REANIM_ZOMBIE_CONE1', 'IMAGE_REANIM_ZOMBIE_CONE2', 'IMAGE_REANIM_ZOMBIE_CONE3'],
    walk: ['anim_walk', 'anim_walk2'], eat: 'anim_eat', death: ['anim_death', 'anim_death2'],
  },
  buckethead: {
    name: 'Buckethead Zombie', hp: 100, shield: 100, speed: 20, reanim: 'Zombie', metal: true, anchorTrack: 'Zombie_body',
    show: ['anim_bucket'], shieldTrack: 'anim_bucket',
    shieldImages: ['IMAGE_REANIM_ZOMBIE_BUCKET1', 'IMAGE_REANIM_ZOMBIE_BUCKET2', 'IMAGE_REANIM_ZOMBIE_BUCKET3'],
    walk: ['anim_walk', 'anim_walk2'], eat: 'anim_eat', death: ['anim_death', 'anim_death2'],
  },
  screendoor: {
    name: 'Screen Door Zombie', hp: 100, shield: 100, speed: 20, reanim: 'Zombie', anchorTrack: 'Zombie_body',
    metal: true, blocksPeas: true, shieldTrack: 'anim_screendoor',
    show: ['anim_screendoor', 'Zombie_innerarm_screendoor', 'Zombie_innerarm_screendoor_hand', 'Zombie_outerarm_screendoor'],
    hide: ['Zombie_outerarm_upper', 'Zombie_outerarm_lower', 'Zombie_outerarm_hand', 'anim_innerarm1'],
    walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'],
  },
  newspaper: {
    name: 'Newspaper Zombie', mustacheOffset: [14, 40], hp: 100, shield: 25, speed: 20, reanim: 'Zombie_paper', anchorTrack: 'Zombie_paper_body',
    walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'],
    enraged: { walk: 'anim_walk_nopaper', eat: 'anim_eat_nopaper', speed: 60 },
    rageSound: 'newspaper_rarrgh',
  },
  polevaulter: {
    name: 'Pole Vaulting Zombie', mustacheOffset: [10, 34], hp: 185, speed: 45, reanim: 'Zombie_polevaulter', anchorTrack: 'Zombie_polevaulter_body1',
    walk: ['anim_run'], afterVault: 'anim_walk', eat: 'anim_eat', death: ['anim_death'],
    vault: 'anim_jump', vaults: true,
  },
  football: {
    name: 'Football Zombie', mustacheOffset: [16, 34], hp: 100, shield: 125, speed: 52, reanim: 'Zombie_football',
    metal: true, walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'],
  },
  gargantuar: {
    name: 'Gargantuar', mustacheOffset: [26, 66], hp: 1100, speed: 14, reanim: 'Zombie_gargantuar', big: true, anchorTrack: 'Zombie_gargantua_body1',
    walk: ['anim_walk'], eat: 'anim_walk', death: ['anim_death'],
    smash: true, smashDamage: 4000, carriesImp: true,
  },
  imp: {
    name: 'Imp', mustacheOffset: [8, 26], hp: 100, speed: 40, reanim: 'Zombie_imp', small: true, anchorTrack: 'Zombie_imp_body1',
    walk: ['anim_walk'], eat: 'anim_eat', death: ['anim_death'], thrown: 'anim_thrown',
  },
};

// Player-toggled options, persisted in localStorage.
const Settings = {
  mustache: false,
  load() {
    try { this.mustache = localStorage.getItem('pvz.mustache') === '1'; } catch (e) {}
  },
  save() {
    try { localStorage.setItem('pvz.mustache', this.mustache ? '1' : '0'); } catch (e) {}
  },
};

// Crazy Dave's voice clips, and the pieces of his head with their placement
// lifted from CrazyDave.reanim's idle frame (loading the whole 411KB reanim
// just for a button icon isn't worth it).
const DAVE_SOUNDS = [
  'crazydavecrazy', 'crazydavescream', 'crazydavescream2',
  'crazydaveshort1', 'crazydaveshort2', 'crazydaveshort3',
  'crazydavelong1', 'crazydavelong2', 'crazydavelong3',
  'crazydaveextralong1', 'crazydaveextralong2', 'crazydaveextralong3',
];

const DAVE_HEAD = [
  { img: 'reanim/CrazyDave_head.png',     x: 12,    y: 120.3, kx: 0,     sx: 1,     sy: 1 },
  { img: 'reanim/CrazyDave_beard.png',    x: 78.8,  y: 216.6, kx: 0,     sx: 1,     sy: 1 },
  { img: 'reanim/CrazyDave_mouth2.png',   x: 110.4, y: 228.2, kx: 0,     sx: 1,     sy: 1 },
  { img: 'reanim/CrazyDave_eye.png',      x: 141.7, y: 178.4, kx: 357.5, sx: 1,     sy: 1 },
  { img: 'reanim/CrazyDave_eyebrow.png',  x: 143.6, y: 165.3, kx: 357.5, sx: 1,     sy: 1 },
  { img: 'reanim/CrazyDave_pot.png',      x: 3.7,   y: 109,   kx: 357.5, sx: 1.033, sy: 1 },
];

const ZOMBIE_GROANS = ['groan', 'groan2', 'groan3', 'groan4', 'groan5', 'groan6'];
const CHOMP_SOUNDS = ['chomp', 'chomp2'];
const SPLAT_SOUNDS = ['splat', 'splat2', 'splat3'];

// ---------------------------------------------------------------- levels
const LEVELS = [
  { name: 'Level 1-1',  waves: 10, pool: ['normal'], startSun: 150, slots: 6 },
  { name: 'Level 1-2',  waves: 12, pool: ['normal', 'conehead'], startSun: 100, slots: 6 },
  { name: 'Level 1-3',  waves: 14, pool: ['normal', 'conehead', 'polevaulter'], startSun: 75, slots: 7 },
  { name: 'Level 1-4',  waves: 16, pool: ['normal', 'conehead', 'polevaulter', 'buckethead'], startSun: 75, slots: 7 },
  { name: 'Level 1-5',  waves: 18, pool: ['normal', 'conehead', 'polevaulter', 'buckethead', 'newspaper'], startSun: 75, slots: 8 },
  { name: 'Level 1-6',  waves: 20, pool: ['normal', 'conehead', 'polevaulter', 'buckethead', 'newspaper', 'screendoor'], startSun: 50, slots: 8 },
  { name: 'Level 1-7',  waves: 20, pool: ['normal', 'conehead', 'buckethead', 'newspaper', 'screendoor', 'football'], startSun: 50, slots: 8 },
  { name: 'Level 1-8',  waves: 22, pool: ['normal', 'conehead', 'polevaulter', 'buckethead', 'screendoor', 'football'], startSun: 50, slots: 8 },
  { name: 'Level 1-9',  waves: 24, pool: ['normal', 'conehead', 'polevaulter', 'buckethead', 'newspaper', 'screendoor', 'football'], startSun: 50, slots: 8 },
  { name: 'Level 1-10', waves: 26, pool: ['normal', 'conehead', 'polevaulter', 'buckethead', 'newspaper', 'screendoor', 'football', 'gargantuar'], startSun: 50, slots: 8 },
];

// Spawn cost of each zombie type, used to budget a wave.
const ZOMBIE_WEIGHT = {
  normal: 1, flag: 1, conehead: 2, polevaulter: 3, buckethead: 4,
  newspaper: 3, screendoor: 4, football: 7, gargantuar: 10, imp: 1,
};
