// Boot, asset preload, main loop and input wiring.

let game = null;
let canvas, ctx;

const UI_IMAGES = [
  'images/background1.jpg', 'images/SeedBank.png', 'images/seeds.png',
  'images/SeedChooser_Background.png', 'images/SeedChooser_Button.png',
  'images/SeedChooser_Button_Disabled.png', 'images/ShovelBank.png', 'images/Shovel.png',
  'images/FlagMeter.png', 'images/FlagMeterParts.png', 'images/plantshadow.png',
  'images/ProjectilePea.png', 'images/ProjectileSnowPea.png', 'images/Projectile_star.png',
  'reanim/Wallnut_cracked1.png', 'reanim/Wallnut_cracked2.png',
  'reanim/Tallnut_cracked1.png', 'reanim/Tallnut_cracked2.png',
  'images/options_menuback.jpg', 'images/options_menuback_.png', 'images/options_checkbox0.png',
  ...DAVE_HEAD.map(p => p.img),
  'images/titlescreen.jpg',
  'reanim/SelectorScreen_Adventure_button.png', 'reanim/SelectorScreen_Adventure_highlight.png',
  'reanim/SelectorScreen_Shadow_Adventure.png', 'reanim/SelectorScreen_StartAdventure_Highlight.png',
  'reanim/SelectorScreen_Survival_highlight.png', 'reanim/SelectorScreen_Challenges_highlight.png',
  'reanim/SelectorScreen_vasebreaker_highlight.png',
  'images/SelectorScreen_Options1.png', 'images/SelectorScreen_Options2.png',
  'images/SelectorScreen_Help1.png', 'images/SelectorScreen_Help2.png',
  'images/SelectorScreen_LevelNumbers.png',
  'reanim/SelectorScreen_WoodSign2_press.png', 'reanim/SelectorScreen_WoodSign3_press.png',
  'images/options_checkbox1.png', 'images/options_backtogamebutton0.png',
];

const CORE_SOUNDS = [
  'plant', 'plant2', 'buttonclick', 'seedlift', 'buzzer', 'points', 'shovel',
  'chomp', 'chomp2', 'splat', 'splat2', 'groan', 'groan2', 'groan3',
  'lawnmower', 'explosion', 'cherrybomb', 'potato_mine', 'squash_hmm', 'squash_hmm2',
  'jalapeno', 'frozen', 'firepea', 'throw', 'shieldhit', 'plastichit', 'limbs_pop',
  'hugewave', 'siren', 'winmusic', 'losemusic', 'scream', 'polevault', 'newspaper_rarrgh',
  'bigchomp', 'melonimpact', 'kernelpult', 'ignite', 'dirt_rise', 'imp', 'tap',
];

// The bitmap fonts the HUD draws with.
const FONTS = [
  'DwarvenTodcraft12', 'DwarvenTodcraft15', 'DwarvenTodcraft18',
  'DwarvenTodcraft18Yellow', 'DwarvenTodcraft36GreenInset',
  'BrianneTod12', 'BrianneTod16', 'HouseofTerror28',
];

function requiredReanims() {
  const set = new Set(['Sun', 'LawnMower', 'Puff', 'Zombie_flagpole', 'SelectorScreen']);
  for (const p of Object.values(PLANTS)) set.add(p.reanim);
  for (const z of Object.values(ZOMBIES)) set.add(z.reanim);
  return [...set];
}

// ------------------------------------------------------------ loading
function drawLoading(frac, label) {
  ctx.fillStyle = '#101a08';
  ctx.fillRect(0, 0, W, H);
  const title = Assets.image('images/PvZ_Logo.jpg');
  if (title && title.width) {
    const s = Math.min(1, 560 / title.width);
    ctx.drawImage(title, (W - title.width * s) / 2, 90, title.width * s, title.height * s);
  }
  const dirt = Assets.image('images/LoadBar_dirt.png');
  const bx = (W - 340) / 2, by = 400;
  if (dirt && dirt.width) ctx.drawImage(dirt, bx, by, 340, 44);
  else { ctx.fillStyle = '#3a2a12'; ctx.fillRect(bx, by, 340, 44); }

  ctx.fillStyle = '#7ad13c';
  ctx.fillRect(bx + 6, by + 8, (340 - 12) * frac, 28);
  const grass = Assets.image('images/LoadBar_grass.png');
  if (grass && grass.width) {
    ctx.drawImage(grass, 0, 0, grass.width, grass.height,
                  bx + 6, by + 4, (340 - 12) * frac, 36);
  }
  Fonts.draw(ctx, 'BrianneTod16', label, W / 2, by + 76, { align: 'center', color: '#dfe9c8' });
}

async function boot() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  drawLoading(0, 'Loading...');
  await Assets.init();
  await Assets.loadImages(['images/PvZ_Logo.jpg', 'images/LoadBar_dirt.png', 'images/LoadBar_grass.png']);

  const reanims = requiredReanims();
  const jobs = [
    Assets.loadImages(UI_IMAGES),
    Assets.loadReanims(reanims),
    Assets.loadImages(['IMAGE_REANIM_ZOMBIE_HEAD']),
    Fonts.load(FONTS),
  ];
  // Paint the loading bar while the jobs run, but never gate completion on
  // requestAnimationFrame — it does not fire in a background tab.
  let done = false;
  const painter = setInterval(() => {
    drawLoading(Assets.progress, done ? 'Ready!' : 'Loading the lawn...');
  }, 100);
  try {
    await Promise.all(jobs);
  } finally {
    done = true;
    clearInterval(painter);
  }
  drawLoading(1, 'Ready!');

  Sound.preload(CORE_SOUNDS);
  Settings.load();

  showMainMenu();
  wireInput();
  requestAnimationFrame(loop);
}

function newGame(levelIndex) {
  game = new Game(canvas, levelIndex);
  UI.reset(game.level);
  game.state = 'chooser';
}

// The title screen is the entry point; Adventure drops into the seed chooser.
function showMainMenu() {
  game = new Game(canvas, 0);
  UI.reset(game.level);
  game.state = 'menu';
  UI.enterMenu();
}

function startAdventure(levelIndex) {
  newGame(levelIndex);
}

function returnToMainMenu() {
  paused = false;
  Sound.stopVoice();
  showMainMenu();
}

function startLevel(g) {
  g.state = 'playing';
  g.wave = 0;
  g.waveTimer = 16;
  Sound.play('readysetplant');
  g.say('Ready... Set... PLANT!', 2);
}

// --------------------------------------------------------------- loop
let lastTime = performance.now();
let paused = false;

function togglePause() {
  paused = !paused;
  if (!paused) Sound.stopVoice();     // cut Dave off when the menu closes
  Sound.play('pause');
}

// Dave has a dozen lines; don't play the same one twice running.
let _lastDave = -1;
function playCrazyDave() {
  let i = _lastDave;
  while (i === _lastDave && DAVE_SOUNDS.length > 1) i = (Math.random() * DAVE_SOUNDS.length) | 0;
  _lastDave = i;
  Sound.voice(DAVE_SOUNDS[i]);
}

function toggleMustache() {
  Settings.mustache = !Settings.mustache;
  Settings.save();
  Sound.play('buttonclick');
  if (game) for (const z of game.zombies) z.setMustache(Settings.mustache);
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (!paused) {
    if (game.state === 'menu') UI.updateMenu(dt);
    if (game.state === 'playing') UI.update(dt, game);
    game.update(dt);
  }

  if (game.state === 'menu') {
    UI.drawMainMenu(ctx, game);
  } else {
    game.draw();
    if (game.state === 'chooser') {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(0, 0, W, H);
      UI.drawChooser(ctx, game);
    } else {
      UI.drawHUD(ctx, game);
      if (game.state === 'won' || game.state === 'lost') UI.drawEnd(ctx, game);
    }
  }
  if (paused) UI.drawPauseMenu(ctx, game);

  requestAnimationFrame(loop);
}

// -------------------------------------------------------------- input
function canvasPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}

function wireInput() {
  canvas.addEventListener('mousemove', e => {
    const p = canvasPos(e);
    if (game.state === 'menu') UI.menuMove(p.x, p.y);
    game.onMove(p.x, p.y);
  });

  canvas.addEventListener('mousedown', e => {
    const p = canvasPos(e);
    if (paused) { UI.pauseClick(p.x, p.y); return; }
    if (e.button === 2) { game.selected = null; game.shovel = false; return; }
    if (game.state === 'menu') { UI.menuClick(game, p.x, p.y); return; }
    if (game.state === 'chooser') { UI.chooserClick(game, p.x, p.y); return; }
    game.onClick(p.x, p.y);
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'r') { if (game.state !== 'menu') newGame(game.levelIndex); }
    else if (k === 'n' && game.state === 'won') { newGame(Math.min(LEVELS.length - 1, game.levelIndex + 1)); }
    else if (k === 'p') { togglePause(); }
    else if (k === 'm') { Sound.enabled = !Sound.enabled; }
    else if (k === 'escape') {
      if (paused) togglePause();
      else if (game.state === 'menu') { if (UI.menu) UI.menu.help = false; }
      else if (game.state === 'chooser') returnToMainMenu();
      else { game.selected = null; game.shovel = false; }
    }
    else if (k >= '1' && k <= '9') {
      const i = +k - 1;
      if (game.state === 'playing' && UI.slots[i]) { game.selected = game.selected === i ? null : i; game.shovel = false; }
    }
  });
}

window.addEventListener('load', boot);
