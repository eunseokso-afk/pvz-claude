// Sound + music. Sounds are pooled so overlapping plays don't cut each other off.

const Sound = {
  enabled: true,
  musicOn: true,
  volume: 0.55,
  musicVolume: 0.4,
  _pool: {},
  _music: null,
  _musicName: null,

  src(name) {
    const id = 'SOUND_' + name.toUpperCase();
    return (Assets.manifest && Assets.manifest.sounds[id]) || `sounds/${name}.ogg`;
  },

  preload(names) {
    for (const n of names) this._get(n);
  },

  _get(name) {
    if (!this._pool[name]) {
      this._pool[name] = Array.from({ length: 4 }, () => {
        const a = new Audio(encodeURI(this.src(name)));
        a.preload = 'auto';
        return a;
      });
      this._pool[name]._i = 0;
    }
    return this._pool[name];
  },

  play(name, { volume = 1, rate = 1 } = {}) {
    if (!this.enabled || !name) return;
    const pool = this._get(name);
    const a = pool[pool._i = (pool._i + 1) % pool.length];
    try {
      a.currentTime = 0;
      a.volume = Math.max(0, Math.min(1, this.volume * volume));
      a.playbackRate = rate;
      a.play().catch(() => {});
    } catch (e) { /* not ready yet */ }
  },

  // Pick one of several variants at random (zombie groans, chomps, ...).
  playOne(names, opts) {
    this.play(names[(Math.random() * names.length) | 0], opts);
  },

  // A single-instance voice line. Crazy Dave's clips are long and there are a
  // dozen of them, so they are not pooled or preloaded, and a new line cuts off
  // the previous one instead of stacking.
  voice(name, { volume = 1 } = {}) {
    if (!this.enabled || !name) return;
    this.stopVoice();
    const a = new Audio(encodeURI(this.src(name)));
    a.volume = Math.max(0, Math.min(1, this.volume * volume));
    a.play().catch(() => {});
    this._voice = a;
  },

  stopVoice() {
    if (this._voice) {
      try { this._voice.pause(); } catch (e) { /* not started yet */ }
      this._voice = null;
    }
  },

  music(name) {
    if (this._musicName === name) return;
    this._musicName = name;
    if (this._music) { this._music.pause(); this._music = null; }
    if (!name) return;
    const a = new Audio(encodeURI(this.src(name)));
    a.loop = true;
    a.volume = this.musicOn ? this.musicVolume : 0;
    a.play().catch(() => {});
    this._music = a;
  },

  setMusicOn(on) {
    this.musicOn = on;
    if (this._music) this._music.volume = on ? this.musicVolume : 0;
  },

  stopMusic() { this.music(null); },
};
