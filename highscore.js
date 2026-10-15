/* RRE Blast high score.

   The best score lives in its own localStorage entry, apart from the saved game and the settings.
   That keeps it safe when the game changes between deploys, when a new game starts, or when a
   saved game is cleared.

   To carry a score across a deploy (for example to set a number to beat), raise SEED below.
   The best score shown is never lower than SEED. */
const HighScore = (function () {
  const KEY = 'rre-blast.highscore.v1';
  const LEGACY_KEYS = ['softlanding.v1']; // earlier build of this game, read once
  const SEED = 0;

  let cache = null;

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function clean(n) {
    n = Number(n);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function write(best) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, best: best, at: new Date().toISOString() })); } catch (e) { /* storage is optional */ }
  }
  function load() {
    if (cache !== null) return cache;
    const own = readJSON(KEY);
    let best = own ? clean(own.best) : 0;
    if (!own) {
      for (const k of LEGACY_KEYS) {
        const old = readJSON(k);
        if (old) best = Math.max(best, clean(old.best));
      }
      if (best > 0) write(best);
    }
    cache = Math.max(best, clean(SEED));
    return cache;
  }

  return {
    // the best score so far
    get: load,
    // record a score; returns true when it is a new best
    submit: function (score) {
      score = clean(score);
      if (score > load()) { cache = score; write(score); return true; }
      return false;
    },
    SEED: SEED,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = HighScore;
