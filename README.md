# Plants vs. Zombies — HTML/Canvas

A playable browser version built on top of the extracted game assets already in
this folder (`images/`, `reanim/`, `sounds/`, `properties/`). The engine is
written from scratch in plain JavaScript — no libraries, no build step.

## Running it

A local web server is required. The game fetches `resources.xml`, `.reanim`
files and `assets.json`, and browsers block `fetch()` on `file://` URLs, so
double-clicking `index.html` will not work.

```bash
node serve.js
```

Then open <http://localhost:8080>. Pass a port if 8080 is taken: `node serve.js 3000`.

## How to play

The title screen is the original selector screen. **Adventure** resumes at your
furthest level (a fresh save shows **Start Adventure** instead); the hanging
"if this is not you" sign restarts from 1-1, with a second click to confirm.
From there pick your seeds, hit **Let's Rock!**, then click a seed packet and
click a lawn tile to plant. Click falling sun to collect it. `Esc` on the
chooser goes back to the title, and the pause menu has a **Main Menu** button.

| Key | Action |
| --- | --- |
| `1`–`9` | select seed packet |
| `Esc` / right-click | cancel selection (`Esc` on the chooser returns to the title) |
| `P` | pause (opens the menu) |
| `M` | mute |
| `R` | restart level |
| `N` | next level (after a win) |

Progress is saved to `localStorage`, so the next visit resumes at your furthest
level. Clear it with `localStorage.removeItem('pvz.level')` in the console.

## What's in it

- **18 plants** — Sunflower, Peashooter, Repeater, Snow Pea, Threepeater,
  Puff-shroom, Wall-nut, Tall-nut, Potato Mine, Chomper, Squash, Cherry Bomb,
  Jalapeno, Ice-shroom, Torchwood, Starfruit, Cabbage-pult, Melon-pult.
- **10 zombies** — regular, Flag, Conehead, Buckethead, Screen Door, Newspaper,
  Pole Vaulting, Football, Gargantuar and the Imp it throws.
- 10 levels with escalating waves, flag waves, a progress meter and lawnmowers.
- The original animated selector screen as the title: tombstone signs, hanging
  wooden signs, drifting clouds, swaying grass and flowers, all driven by
  `SelectorScreen.reanim`.
- Sun economy, seed recharge, the shovel, plant damage states (wall-nuts crack),
  chilling, freezing, splash damage, and peas that ignite through Torchwood.

### Title screen

The title is `SelectorScreen.reanim` — the original selector screen — not a
static picture. Its intro (`anim_open` then `anim_sign`, frames 0–40) plays
once; after that, frame 40 is held as a static pose while the sign sway,
grass, three flower and six cloud ranges loop on top of it. The hold matters:
at frame 41 every button and background track flips to `f=-1`, so playing
`anim_idle` alone would show the sign swaying over an empty sky. Held layers
are a `hold: true` spec in `Reanim.playLayers`; they sit on their last frame
and don't count toward `onEnd`, so loops can run above a finished intro.

Both sign variants ship, as in the original: `Adventure_button` for a returning
player and `StartAdventure_Button1` for a fresh save, each with a highlight for
hover. The level number in the sign's carved "LEVEL –" slot is drawn from
`SelectorScreen_LevelNumbers.png`, a strip of ten 12×17 digit cells; the dash
is part of the stone. Survival, Mini-Games and Vasebreaker are rendered but
locked — clicking one says so. Options and Help sit under the tombstone's foot,
with Options opening the same dialog the pause menu uses.

Hit-testing is by the art's alpha, not its rectangle. Each slab's PNG carries
transparent margin, so the rectangles overlap — ADVENTURE's runs 35px down over
SURVIVAL, and a rectangle test let the upper sign swallow clicks meant for the
lower one.

Building this exposed a pipeline bug worth knowing about. PopCap stores some
art as an opaque `X.jpg` with an `X_.png` alpha mask, and the manifest's name
normalisation strips underscores, so both files mapped to one key and the mask
— sorting after the jpg — always won. Sixteen reanim images were affected,
including this screen's three background layers, which rendered as white
silhouettes. `build-manifest.js` now keeps masks out of the main index and
records them as partners, and the loader composites a pair on load.

### Mustache Mode

Pause (`P`, or the Menu button) and tick **Mustache Mode** to give every zombie
a mustache. The choice is saved in `localStorage` and applies to zombies already
on the lawn as well as new ones.

Only `Zombie.reanim` ships a mustache track, so the five variants built on it
(regular, Flag, Conehead, Buckethead, Screen Door) get theirs as a proper
animation layer. The other five reanims have none, so a mustache is pinned to
their `anim_head1` track's transform instead — it inherits the head's position,
rotation and scale, and rides along with the animation. Placement within head
space is per-zombie (`mustacheOffset` in `data.js`).

That pinned mustache is painted from inside the reanim's track loop, straight
after the head, rather than over the finished sprite. Order matters: a football
helmet is track 23 and the head is track 18, so painting afterwards left the
mustache sitting on top of the helmet instead of behind its face guard. The
`onTrack` hook on `Reanim.draw` exists for exactly this.

### Crazy Dave

The pause menu also has a **Talk to Crazy Dave** button — clicking it plays one
of his twelve voice clips at random, never the same one twice running.

His clips are long, so they are not pooled or preloaded like the sound effects.
`Sound.voice()` keeps a single audio element: a new line cuts off the previous
one rather than stacking, and closing the menu stops him mid-sentence. The head
on the button is composed from six pieces of `CrazyDave.reanim`, with their
placement lifted from its idle frame into `DAVE_HEAD` — the reanim itself is
411KB across 48 images, far too much to load for one icon.

### Tuning

Health scale: a plain zombie is 100hp, a cone adds 50, a bucket adds 100, and a
pea does 20 — so five peas kill a zombie, eight a conehead, ten a buckethead.
Other zombies are scaled to keep their old standing relative to a plain one.
Sky sun lands every 4.5-7.5s; sunflowers still produce every 24s.

The knobs live in `game/js/data.js` (`ZOMBIES` health, `PLANTS` damage) and
`game/js/game.js` (`sunTimer` for sun rate, `waveBudget` for wave size).

## Layout

```
index.html            page shell
serve.js              static server (no-store, so edits show on reload)
game/
  style.css
  assets.json         generated asset index
  build-manifest.js   regenerates assets.json
  js/
    reanim.js         PopCap .reanim parser + player
    loader.js         image / reanim / manifest loading
    audio.js          pooled sound effects
    font.js           PopCap bitmap font parser + renderer
    data.js           board geometry, plant + zombie + level tables
    entities.js       Plant, Zombie, Projectile, Sun, LawnMower, effects
    game.js           board state, waves, input, draw order
    ui.js             seed chooser, seed bank, HUD, end screens
    main.js           boot, preload, main loop
```

`assets.json` maps every `IMAGE_REANIM_*` id referenced by a `.reanim` to a real
file on disk (1617 of them, all resolving), plus the 20 bitmap fonts and their
22 atlases. Regenerate it if the asset folders
change:

```bash
node game/build-manifest.js
```

## Calibration

Board geometry is measured from a screenshot of the original rather than guessed.
Correlating a sprite-free strip of that screenshot against `images/background1.jpg`
locates the backdrop at `x = -220, y = 0` (mean squared error 0.3 — the residual is
just JPEG noise). Fitting a square wave to the lawn's checkerboard then gives cells
of `81.75 x 100.75` starting at `(28.5, 70)`. The seed bank sits flush in the
corner, and edge-detecting the gutters between its packets gives a slot pitch of
exactly 59px starting at `x = 84`.

## Fonts

Text is drawn with the game's own bitmap fonts from `data/`, not a web font.
Each `data/<Name>.txt` declares parallel `CharList` / `WidthList` / `RectList` /
`OffsetList` blocks plus one or more layers binding those lists to an atlas
image; multi-layer fonts stack an outline beneath the fill. Kerning pairs are
honoured where a font defines them.

Two things the format demands:

- The descriptors are Windows-1252 and `CharList` runs past ASCII into accented
  characters, so they must be decoded byte-for-byte. Reading them as UTF-8
  collapses the high bytes and knocks `CharList` out of alignment with the width
  and rect lists, shifting every glyph.
- Atlases come in two flavours. Most carry a real alpha channel; the BrianneTod
  set ships fully opaque with light glyphs on a dark ground, where brightness
  *is* the alpha. Those are keyed to alpha once at load — otherwise tinting them
  fills each glyph cell with a solid block.

`game/js/font.js` also renders a colour-replaced copy of an atlas per tint
(cached), so one white atlas serves every colour the HUD needs. The pre-coloured
faces — `DwarvenTodcraft18Yellow`, `DwarvenTodcraft36GreenInset` — are drawn
untinted so their inset shading survives.

## Notes on the assets

- Sprites are positioned by measuring each animation's bounding box once at load
  and anchoring it to the lawn, rather than a hand-tuned offset per plant.
  Zombies additionally anchor horizontally on their torso track, so a pole
  vaulter's pole doesn't drag the body sideways.
- Many reanims fade their parts in over the first frames of a range, and a few
  (Sunflower, Tall-nut) define no named ranges at all. The loader trims each
  range to the frames that actually draw, otherwise those sprites blink out.
- `anim_head2` in `Zombie.reanim` draws `Zombie_jaw` — the lower jaw, not a
  damaged-head state as the name suggests. It stays visible while a zombie is
  alive and is hidden on death, when the head comes off.
- The Repeater's eyebrows live on a `PeaShooter_eyebrow` track that the plain
  Peashooter hides (`hideTracks` in `data.js`); `PeaShooterSingle.reanim` has no
  such track at all, which is the giveaway.
- Seed packets are composited at runtime: the blank packet from `images/seeds.png`
  with the plant's own reanim posed on top.
- The Repeater uses the Peashooter animation, as in the original; it just fires
  two peas per volley.
- In-game music is only present as `.mo3` tracker files, which browsers can't
  decode — sound effects and the win/lose stings work, background music doesn't.

The art and audio here are PopCap/EA's. This is a personal, local reimplementation
of the game logic; keep it local rather than redistributing it.
